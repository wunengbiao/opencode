import type { ContentPart, ImageAttachmentPart, PathAttachmentPart, Prompt } from "./state"

/** Parts that sit beside the text rather than inside it. */
export function isAttachment(part: ContentPart): part is ImageAttachmentPart | PathAttachmentPart {
  return part.type === "image" || part.type === "path"
}

export function clonePrompt(prompt: Prompt): Prompt {
  return prompt.map((part) =>
    part.type === "file" ? { ...part, selection: part.selection ? { ...part.selection } : undefined } : { ...part },
  )
}

export function promptLength(prompt: Prompt) {
  return prompt.reduce((length, part) => length + ("content" in part ? part.content.length : 0), 0)
}

/**
 * The `@` completion trigger ending at `cursor`. Mentions count as their rendered text, so a
 * mention chip followed immediately by typed path characters completes as one query. An `@`
 * typed right after a mention starts a new query instead of extending it.
 */
export function mentionQuery(prompt: Prompt, cursor?: number) {
  const length = promptLength(prompt)
  const end = Math.max(0, Math.min(cursor ?? length, length))
  const text = prompt.map((part) => ("content" in part ? part.content : "")).join("")
  let position = 0
  let trigger = -1
  let previous: string | undefined
  let abutsMention = false

  for (const part of prompt) {
    if (!("content" in part)) continue

    const mention = part.type !== "text"
    const stop = Math.min(part.content.length, end - position)

    for (let index = 0; index < stop; index++) {
      const char = part.content[index]!
      const boundary =
        index === 0
          ? previous === undefined || /\s/.test(previous) || abutsMention
          : /\s/.test(part.content[index - 1]!)

      if (mention && index === 0) trigger = position

      if (/\s/.test(char)) trigger = -1
      else if (char === "@" && (mention && index === 0 ? true : boundary)) trigger = position + index

      previous = char
    }

    position += part.content.length
    abutsMention = mention

    if (position >= end) break
  }

  if (trigger < 0) return

  return { start: trigger, query: text.slice(trigger + 1, end) }
}

export function appendPrompt(prompt: Prompt, following: Prompt): Prompt {
  const start = promptLength(prompt)
  const offset = start + 2

  return [
    ...clonePrompt(prompt),
    { type: "text", content: "\n\n", start, end: offset },
    ...clonePrompt(following).map((part) =>
      isAttachment(part) ? part : { ...part, start: part.start + offset, end: part.end + offset },
    ),
  ]
}
