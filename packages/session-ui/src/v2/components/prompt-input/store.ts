import { batch, type Accessor } from "solid-js"
import type { SetStoreFunction, Store } from "solid-js/store"
import type {
  PromptInputV2AgentPart,
  PromptInputV2Attachment,
  PromptInputV2Comment,
  PromptInputV2FilePart,
  PromptInputV2Model,
  PromptInputV2PersistedState,
  PromptInputV2Prompt,
} from "./types"

export type PromptInputV2StoreTuple = [
  Store<PromptInputV2PersistedState> | Accessor<Store<PromptInputV2PersistedState>>,
  SetStoreFunction<PromptInputV2PersistedState>,
]

export type PromptInputV2StoreInput = PromptInputV2StoreTuple | Accessor<PromptInputV2StoreTuple>

export function createPromptInputV2Store(input: PromptInputV2StoreInput) {
  const tuple = () => (typeof input === "function" ? input() : input)
  const store = () => {
    const value = tuple()[0]
    return typeof value === "function" ? value() : value
  }
  const setStore = () => tuple()[1]

  return {
    get state() {
      return store()
    },
    setPrompt(prompt: PromptInputV2Prompt, cursor?: number) {
      batch(() => {
        setStore()("prompt", prompt)
        if (cursor !== undefined) setStore()("cursor", cursor)
      })
    },
    setCursor(cursor: number) {
      setStore()("cursor", cursor)
    },
    setText(content: string) {
      batch(() => {
        setStore()("prompt", (prompt) => [
          { type: "text", content, start: 0, end: content.length },
          ...prompt.filter((part) => part.type !== "text"),
        ])
        setStore()("cursor", content.length)
      })
    },
    addText(content: string) {
      const cursor = store().cursor ?? promptLength(store().prompt)
      batch(() => {
        setStore()("prompt", (prompt) => insertText(prompt, cursor, content))
        setStore()("cursor", cursor + content.length)
      })
    },
    reset() {
      batch(() => {
        setStore()("prompt", [{ type: "text", content: "", start: 0, end: 0 }])
        setStore()("cursor", 0)
      })
    },
    setModel(model: PromptInputV2Model | undefined) {
      setStore()("model", model)
    },
    setVariant(variant: string | null) {
      if (store().model) setStore()("model", "variant", variant)
    },
    addContext(item: PromptInputV2Comment) {
      if (store().context.items.some((entry) => entry.key === item.key)) return
      setStore()("context", "items", (items) => [...items, item])
    },
    removeContext(key: string) {
      setStore()("context", "items", (items) => items.filter((item) => item.key !== key))
    },
    addMention(mention: PromptInputV2FilePart | PromptInputV2AgentPart) {
      const parts = store().prompt
      const text = parts.map((part) => ("content" in part ? part.content : "")).join("")
      const end = store().cursor ?? text.length
      // The trigger may start at a mention chip's own "@": the chip plus typed path
      // characters form one query, so the replaced range can span whole chips.
      const match = text.slice(0, end).match(/(?:^|\s)@([^\s@]*)$/)
      const start = match ? end - (match[1] ?? "").length - 1 : -1
      const inserted = insertMention(parts, start < 0 ? end : start, end, mention)
      setStore()("prompt", inserted.prompt)
      setStore()("cursor", inserted.cursor)
    },
    addAttachment(attachment: PromptInputV2Attachment) {
      setStore()("prompt", (prompt) => [...prompt, attachment])
    },
    removeAttachment(id: string) {
      setStore()("prompt", (parts) => parts.filter((part) => part.type !== "image" || part.id !== id))
    },
  }
}

export type PromptInputV2Store = ReturnType<typeof createPromptInputV2Store>

function insertText(prompt: PromptInputV2Prompt, cursor: number, content: string): PromptInputV2Prompt {
  let position = 0
  let inserted = false
  const parts = prompt.flatMap<PromptInputV2Prompt[number]>((part) => {
    if (part.type === "image") return [part]
    const start = position
    position += part.content.length
    if (inserted) return [part]
    if (part.type === "text" && cursor >= start && cursor <= position) {
      inserted = true
      const offset = cursor - start
      return [{ ...part, content: part.content.slice(0, offset) + content + part.content.slice(offset) }]
    }
    if (cursor > start) return [part]
    inserted = true
    return [{ type: "text", content, start: 0, end: 0 }, part]
  })
  if (!inserted) parts.push({ type: "text", content, start: 0, end: 0 })
  return withOffsets(parts)
}

function insertMention(
  prompt: PromptInputV2Prompt,
  start: number,
  end: number,
  mention: PromptInputV2FilePart | PromptInputV2AgentPart,
): { prompt: PromptInputV2Prompt; cursor: number } {
  let position = 0
  let inserted = false
  let separator = 0
  const parts = prompt.flatMap<PromptInputV2Prompt[number]>((part) => {
    if (part.type === "image") return [part]
    const partStart = position
    position += part.content.length
    if (end <= partStart || start >= position) return [part]
    const before = part.type === "text" ? part.content.slice(0, Math.max(0, start - partStart)) : ""
    const after = part.type === "text" ? part.content.slice(Math.max(0, end - partStart)) : ""
    if (inserted) return after ? [{ type: "text" as const, content: after, start: 0, end: 0 }] : []
    inserted = true
    const tail = mentionTail(mention, after)
    separator = tail ? 1 : 0
    return [
      ...(before ? [{ type: "text" as const, content: before, start: 0, end: 0 }] : []),
      mention,
      ...(tail ? [{ type: "text" as const, content: tail, start: 0, end: 0 }] : []),
    ]
  })
  if (inserted) return { prompt: withOffsets(parts), cursor: start + mention.content.length + separator }
  // The trigger range was empty (no "@": plain cursor insertion) - insert at the
  // cursor instead so the mention is never dropped.
  const at = insertMentionAt(parts, end, mention)
  return { prompt: withOffsets(at.prompt), cursor: at.cursor }
}

// Directory mentions glue to the caret so "@src" can keep completing into
// "@src/lib"; every other mention (and anything mid-sentence) is followed by a
// separator space.
function mentionTail(mention: PromptInputV2FilePart | PromptInputV2AgentPart, after: string) {
  if (after) return ` ${after}`
  return mention.type === "file" && mention.mime === "application/x-directory" ? "" : " "
}

function insertMentionAt(
  prompt: PromptInputV2Prompt,
  cursor: number,
  mention: PromptInputV2FilePart | PromptInputV2AgentPart,
): { prompt: PromptInputV2Prompt; cursor: number } {
  let position = 0
  let inserted = false
  let separator = 0
  const parts = prompt.flatMap<PromptInputV2Prompt[number]>((part) => {
    if (part.type === "image") return [part]
    const start = position
    position += part.content.length
    if (inserted || part.type !== "text" || cursor < start || cursor > position) return [part]
    inserted = true
    const offset = cursor - start
    const tail = mentionTail(mention, part.content.slice(offset))
    separator = tail ? 1 : 0
    return [
      ...(offset > 0 ? [{ type: "text" as const, content: part.content.slice(0, offset), start: 0, end: 0 }] : []),
      mention,
      ...(tail ? [{ type: "text" as const, content: tail, start: 0, end: 0 }] : []),
    ]
  })
  if (!inserted) {
    const tail = mentionTail(mention, "")
    parts.push(mention, ...(tail ? [{ type: "text" as const, content: tail, start: 0, end: 0 }] : []))
    return { prompt: parts, cursor: promptLength(parts) }
  }
  return { prompt: parts, cursor: cursor + mention.content.length + separator }
}

function withOffsets(prompt: PromptInputV2Prompt): PromptInputV2Prompt {
  let offset = 0
  return prompt.map((part) => {
    if (part.type === "image") return part
    const next = { ...part, start: offset, end: offset + part.content.length }
    offset = next.end
    return next
  })
}

function promptLength(prompt: PromptInputV2Prompt) {
  return prompt.reduce((length, part) => length + ("content" in part ? part.content.length : 0), 0)
}
