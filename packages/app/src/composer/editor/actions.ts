import { batch, untrack, type Accessor } from "solid-js"
import type { SetStoreFunction, Store } from "solid-js/store"
import type {
  ComposerAgentPart,
  ComposerFilePart,
  ComposerSkillPart,
  ComposerPersistedState,
  ComposerPrompt,
} from "../types"
import { isAttachment, mentionQuery, promptLength } from "../prompt-parts"

export type ComposerStateStore = [
  Store<ComposerPersistedState> | Accessor<Store<ComposerPersistedState>>,
  SetStoreFunction<ComposerPersistedState>,
]

export type ComposerStateStoreInput = ComposerStateStore | Accessor<ComposerStateStore>

export function createComposerEditorActions(input: ComposerStateStoreInput) {
  const tuple = () => (typeof input === "function" ? input() : input)

  const store = () => {
    const value = tuple()[0]

    return typeof value === "function" ? value() : value
  }

  const setStore = () => tuple()[1]

  const clearRetry = () => {
    if (untrack(() => store().retry) !== undefined) setStore()("retry", undefined)
  }

  return {
    get state() {
      return store()
    },
    setPrompt(prompt: ComposerPrompt, cursor?: number) {
      // Persisted setters encode on every call, even inside a reactive batch.
      batch(() => setStore()({ prompt, ...(cursor !== undefined ? { cursor } : {}), retry: undefined }))
    },
    setCursor(cursor: number) {
      if (untrack(() => store().cursor) === cursor) return
      setStore()("cursor", cursor)
    },
    setMode(mode: "normal" | "shell") {
      if (untrack(() => store().mode === mode && store().retry === undefined)) return
      setStore()({ mode, retry: undefined })
    },
    setText(content: string) {
      batch(() =>
        setStore()((state) => ({
          prompt: [
            { type: "text", content, start: 0, end: content.length },
            ...state.prompt.filter(isAttachment),
          ],
          cursor: content.length,
          retry: undefined,
        })),
      )
    },
    addText(content: string) {
      const cursor = store().cursor ?? promptLength(store().prompt)
      batch(() =>
        setStore()((state) => ({
          prompt: insertText(state.prompt, cursor, content),
          cursor: cursor + content.length,
          retry: undefined,
        })),
      )
    },
    removeContext(key: string) {
      setStore()("context", "items", (items) => items.filter((item) => item.key !== key))
      clearRetry()
    },
    addMention(
      mention: ComposerFilePart | ComposerAgentPart | ComposerSkillPart,
      range?: { start: number; end: number },
    ) {
      const text = store()
        .prompt.map((part) => ("content" in part ? part.content : ""))
        .join("")

      const end = range?.end ?? store().cursor ?? text.length
      const start = range?.start ?? mentionQuery(store().prompt, end)?.start ?? text.slice(0, end).lastIndexOf("@")
      const inserted = insertMention(store().prompt, start < 0 ? end : start, end, mention)
      setStore()("prompt", inserted.prompt)
      setStore()("cursor", inserted.cursor)
      clearRetry()
    },
    removeAttachment(id: string) {
      setStore()("prompt", (parts) => parts.filter((part) => !isAttachment(part) || part.id !== id))
      clearRetry()
    },
  }
}

function insertText(prompt: ComposerPrompt, cursor: number, content: string): ComposerPrompt {
  let position = 0
  let inserted = false

  const parts = prompt.flatMap<ComposerPrompt[number]>((part) => {
    if (isAttachment(part)) return [part]
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
  prompt: ComposerPrompt,
  start: number,
  end: number,
  mention: ComposerFilePart | ComposerAgentPart | ComposerSkillPart,
) {
  if (start === end) return insertMentionAt(prompt, start, mention)

  let position = 0
  let inserted = false
  let cursor = start + mention.content.length

  const parts = prompt.flatMap<ComposerPrompt[number]>((part) => {
    if (isAttachment(part)) return [part]
    const partStart = position
    position += part.content.length

    if (position <= start || partStart >= end) return [part]

    if (inserted) {
      if (part.type !== "text") return []
      const after = part.content.slice(end - partStart)

      return after ? [{ type: "text" as const, content: after, start: 0, end: 0 }] : []
    }

    inserted = true
    const before = part.type === "text" ? part.content.slice(0, start - partStart) : ""
    const after = part.type === "text" ? part.content.slice(Math.max(0, end - partStart)) : ""
    const tail = after ? ` ${after}` : mentionSeparator(mention)

    if (tail) cursor++

    return [
      ...(before ? [{ type: "text" as const, content: before, start: 0, end: 0 }] : []),
      mention,
      ...(tail ? [{ type: "text" as const, content: tail, start: 0, end: 0 }] : []),
    ]
  })

  if (!inserted) return insertMentionAt(prompt, end, mention)

  return { prompt: withOffsets(parts), cursor }
}

function insertMentionAt(
  prompt: ComposerPrompt,
  cursor: number,
  mention: ComposerFilePart | ComposerAgentPart | ComposerSkillPart,
) {
  let position = 0
  let inserted = false
  let next = 0

  const parts = prompt.flatMap<ComposerPrompt[number]>((part) => {
    if (isAttachment(part)) return [part]
    const partStart = position
    position += part.content.length

    if (inserted) return [part]

    if (part.type !== "text") {
      if (cursor > partStart) return [part]
      const tail = mentionSeparator(mention)
      inserted = true
      next = partStart + mention.content.length + (tail ? 1 : 0)

      return [mention, ...(tail ? [{ type: "text" as const, content: tail, start: 0, end: 0 }] : []), part]
    }

    if (cursor < partStart || cursor > position) return [part]

    inserted = true
    const before = part.content.slice(0, cursor - partStart)
    const after = part.content.slice(cursor - partStart)
    const tail = after ? ` ${after}` : mentionSeparator(mention)
    next = cursor + mention.content.length + (tail ? 1 : 0)

    return [
      ...(before ? [{ type: "text" as const, content: before, start: 0, end: 0 }] : []),
      mention,
      ...(tail ? [{ type: "text" as const, content: tail, start: 0, end: 0 }] : []),
    ]
  })

  if (inserted) return { prompt: withOffsets(parts), cursor: next }

  const tail = mentionSeparator(mention)

  return {
    prompt: withOffsets([...parts, mention, ...(tail ? [{ type: "text" as const, content: tail, start: 0, end: 0 }] : [])]),
    cursor: promptLength(parts) + mention.content.length + tail.length,
  }
}

function mentionSeparator(mention: ComposerFilePart | ComposerAgentPart | ComposerSkillPart) {
  if (mention.type === "file" && mention.mime === "application/x-directory") return ""

  return " "
}

function withOffsets(prompt: ComposerPrompt): ComposerPrompt {
  let offset = 0

  return prompt.map((part) => {
    if (isAttachment(part)) return part
    const next = { ...part, start: offset, end: offset + part.content.length }
    offset = next.end

    return next
  })
}
