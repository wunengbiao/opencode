import { describe, expect, test } from "bun:test"
import type { FilePart, TextPart, UserMessage } from "@opencode-ai/sdk/v2"
import { TimelineRow } from "./timeline-row"
import { railActiveMessageID, railDotSize, userMessageExcerpt, userMessagePreview } from "./user-input-rail"

const textPart = (text: string, id = `text:${text}`): TextPart => ({
  id,
  sessionID: "ses_1",
  messageID: "msg_1",
  type: "text",
  text,
})

const filePart = (filename: string | undefined): FilePart => ({
  id: `file:${filename ?? "anonymous"}`,
  sessionID: "ses_1",
  messageID: "msg_1",
  type: "file",
  mime: "text/plain",
  filename,
  url: `data:text/plain;base64,${filename ?? ""}`,
})

const userMessage = (id: string): UserMessage => ({
  id,
  sessionID: "ses_1",
  role: "user",
  time: { created: 1 },
  agent: "build",
  model: { providerID: "provider", modelID: "model" },
})

describe("railDotSize", () => {
  test("returns 7 when there is at most one user message", () => {
    expect(railDotSize(100, 0)).toBe(7)
    expect(railDotSize(100, 1)).toBe(7)
  })

  test("clamps to 7 when dots have plenty of room", () => {
    expect(railDotSize(100, 2)).toBe(7)
    expect(railDotSize(100, 3)).toBe(7)
  })

  test("clamps to 3 when dots must compress", () => {
    expect(railDotSize(10, 100)).toBe(3)
    expect(railDotSize(100, 1000)).toBe(3)
  })

  test("floors mid-range values", () => {
    expect(railDotSize(100, 11)).toBe(4)
    expect(railDotSize(60, 6)).toBe(5)
    expect(railDotSize(30, 3)).toBe(6)
  })
})

describe("userMessageExcerpt", () => {
  test("returns empty string for empty parts", () => {
    expect(userMessageExcerpt([])).toBe("")
  })

  test("joins text parts", () => {
    expect(userMessageExcerpt([textPart("hello"), textPart(" world")])).toBe("hello world")
  })

  test("collapses whitespace runs to single spaces", () => {
    expect(userMessageExcerpt([textPart("a\n  b\t c")])).toBe("a b c")
  })

  test("truncates to 140 chars and appends ellipsis", () => {
    const long = "x".repeat(200)
    expect(userMessageExcerpt([textPart(long)])).toBe(`${"x".repeat(140)}…`)
  })

  test("falls back to the first file part filename when there is no text", () => {
    expect(userMessageExcerpt([filePart("notes.md")])).toBe("notes.md")
  })

  test("returns empty string when the only file part has no filename", () => {
    expect(userMessageExcerpt([filePart(undefined)])).toBe("")
  })

  test("prefers text over file parts", () => {
    expect(userMessageExcerpt([textPart("hello"), filePart("notes.md")])).toBe("hello")
  })
})

describe("userMessagePreview", () => {
  test("splits first non-empty trimmed line as title and the rest as body", () => {
    expect(userMessagePreview([textPart("first line\nsecond line\nthird line")])).toEqual({
      title: "first line",
      body: "second line\nthird line",
    })
  })

  test("skips leading and trailing blank lines", () => {
    expect(userMessagePreview([textPart("\n\n  title line  \n\n  body line \n\n")])).toEqual({
      title: "title line",
      body: "body line",
    })
  })

  test("preserves raw markdown markers verbatim", () => {
    expect(userMessagePreview([textPart("golang， protobuf 转成 struct，怎么解决默认值？\n# **问题根源** proto3 的标量字段")])).toEqual({
      title: "golang， protobuf 转成 struct，怎么解决默认值？",
      body: "# **问题根源** proto3 的标量字段",
    })
  })

  test("truncates long titles at 48 chars with ellipsis", () => {
    expect(userMessagePreview([textPart("t".repeat(60))])).toEqual({ title: `${"t".repeat(48)}…`, body: "" })
  })

  test("keeps titles up to 48 chars without ellipsis", () => {
    const exact = "t".repeat(48)
    expect(userMessagePreview([textPart(exact)])).toEqual({ title: exact, body: "" })
  })

  test("truncates long bodies at 160 chars with ellipsis", () => {
    expect(userMessagePreview([textPart(`title\n${"b".repeat(200)}`)])).toEqual({
      title: "title",
      body: `${"b".repeat(160)}…`,
    })
  })

  test("joins text parts with newlines preserving line structure", () => {
    expect(userMessagePreview([textPart("one"), textPart("two")])).toEqual({ title: "one", body: "two" })
    expect(userMessagePreview([textPart("one\n"), textPart("two")])).toEqual({ title: "one", body: "two" })
  })

  test("returns empty body for a single-line message", () => {
    expect(userMessagePreview([textPart("only line")])).toEqual({ title: "only line", body: "" })
  })

  test("falls back to the first file part filename when there is no text", () => {
    expect(userMessagePreview([filePart("notes.md")])).toEqual({ title: "notes.md", body: "" })
  })

  test("returns empty title and body for empty parts", () => {
    expect(userMessagePreview([])).toEqual({ title: "", body: "" })
  })
})

describe("railActiveMessageID", () => {
  const userMessages = [userMessage("msg_1"), userMessage("msg_2")]
  const rows: TimelineRow.TimelineRow[] = [
    new TimelineRow.UserMessage({ userMessageID: "msg_1", anchor: false }),
    new TimelineRow.TurnGap({ userMessageID: "msg_2" }),
    new TimelineRow.TurnDivider({ userMessageID: "msg_3", label: "compaction" }),
  ]

  test("returns the last user message id when anchored to bottom", () => {
    expect(railActiveMessageID({ bottom: true, startIndex: 1, rows, userMessages })).toBe("msg_2")
  })

  test("returns undefined when anchored to bottom with no user messages", () => {
    expect(railActiveMessageID({ bottom: true, startIndex: 0, rows, userMessages: [] })).toBeUndefined()
  })

  test("returns the userMessageID of the row at startIndex", () => {
    expect(railActiveMessageID({ bottom: false, startIndex: 2, rows, userMessages })).toBe("msg_3")
  })

  test("returns undefined when startIndex is undefined", () => {
    expect(railActiveMessageID({ bottom: false, startIndex: undefined, rows, userMessages })).toBeUndefined()
  })

  test("returns undefined when startIndex is out of range", () => {
    expect(railActiveMessageID({ bottom: false, startIndex: 5, rows, userMessages })).toBeUndefined()
    expect(railActiveMessageID({ bottom: false, startIndex: -1, rows, userMessages })).toBeUndefined()
  })

  test("returns undefined when not anchored to bottom and rows are empty", () => {
    expect(railActiveMessageID({ bottom: false, startIndex: 0, rows: [], userMessages })).toBeUndefined()
  })
})
