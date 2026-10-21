function getNodeLength(node: Node): number {
  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR") return 1

  return (node.textContent ?? "").replace(/\u200B/g, "").length
}

export function getTextLength(node: Node): number {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? "").replace(/\u200B/g, "").length

  if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR") return 1
  let length = 0

  for (const child of Array.from(node.childNodes)) {
    length += getTextLength(child)
  }

  return length
}

export function getCursorPosition(parent: HTMLElement): number {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) return 0
  const range = selection.getRangeAt(0)

  if (!parent.contains(range.startContainer)) return 0
  const preCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(parent)
  preCaretRange.setEnd(range.startContainer, range.startOffset)

  return getTextLength(preCaretRange.cloneContents())
}

/** Keeps a placeable anchor after a trailing pill and replaces a stray empty-editor break. */
export function ensureCaretAnchor(editor: HTMLElement) {
  const last = editor.lastChild

  if (last instanceof HTMLElement && last.dataset.mention) {
    editor.appendChild(document.createTextNode("\u200B"))

    return
  }

  const nodes = Array.from(editor.childNodes)

  if (nodes.length > 0 && !nodes.every(isEmptyCaretNode)) return
  editor.replaceChildren(document.createTextNode("\u200B"))
}

function isEmptyCaretNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return !node.textContent

  return node instanceof HTMLElement && node.tagName === "BR"
}

/**
 * A collapsed caret cannot rest inside or on either edge of an uneditable pill. Snap it into
 * the adjacent text node so the next keystroke lands where the caret is drawn.
 */
export function snapCaret(editor: HTMLElement) {
  const selection = window.getSelection()

  if (!selection || !selection.isCollapsed || selection.rangeCount === 0) return
  const anchor = selection.anchorNode

  if (!anchor || !editor.contains(anchor)) {
    if (document.activeElement !== editor) return
    ensureCaretAnchor(editor)
    setCursorPosition(editor, getTextLength(editor))

    return
  }

  if (anchor === editor) {
    const before = editor.childNodes[selection.anchorOffset - 1]
    const after = editor.childNodes[selection.anchorOffset]

    if (before instanceof HTMLElement && before.dataset.mention) return snapAfterChip(before)

    if (after instanceof HTMLElement && after.dataset.mention) return snapBeforeChip(after)

    if (before instanceof Text && before.length > 0) return placeCaret(before, before.length)

    if (after instanceof Text) return placeCaret(after, 0)

    return
  }

  if (!(anchor instanceof HTMLElement) || !anchor.dataset.mention) return

  // Clicking the final pill usually means "caret at the end". With only whitespace after it,
  // always snap after the pill instead of letting the click's half decide.
  if (selection.anchorOffset <= 0 && !editableContentFollows(anchor)) return snapAfterChip(anchor)

  return selection.anchorOffset <= 0 ? snapBeforeChip(anchor) : snapAfterChip(anchor)
}

function editableContentFollows(chip: HTMLElement) {
  let node: Node | null = chip.nextSibling

  while (node) {
    if (node instanceof HTMLElement) return true

    if (node instanceof Text && (node.textContent ?? "").trim().length > 0) return true
    node = node.nextSibling
  }

  return false
}

function snapAfterChip(chip: HTMLElement) {
  const following = chip.nextSibling

  if (following instanceof Text) return placeCaret(following, 0)
  const anchor = document.createTextNode("\u200B")
  chip.after(anchor)
  placeCaret(anchor, 0)
}

function snapBeforeChip(chip: HTMLElement) {
  const previous = chip.previousSibling

  if (previous instanceof Text) return placeCaret(previous, previous.length)
  const anchor = document.createTextNode("\u200B")
  chip.before(anchor)
  placeCaret(anchor, 1)
}

function placeCaret(node: Node, offset: number) {
  const selection = window.getSelection()

  if (!selection) return
  const range = document.createRange()
  range.setStart(node, offset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function setCursorPosition(parent: HTMLElement, position: number) {
  let remaining = position
  let node = parent.firstChild

  while (node) {
    const length = getNodeLength(node)
    const isText = node.nodeType === Node.TEXT_NODE
    const isPill = node.nodeType === Node.ELEMENT_NODE && !!(node as HTMLElement).dataset.mention
    const isBreak = node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === "BR"

    if (isText && remaining <= length) {
      const range = document.createRange()
      const selection = window.getSelection()
      range.setStart(node, remaining)
      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)

      return
    }

    if ((isPill || isBreak) && remaining <= length) {
      const range = document.createRange()
      const selection = window.getSelection()

      if (remaining === 0) {
        range.setStartBefore(node)
      }

      if (remaining > 0 && isPill) {
        range.setStartAfter(node)
      }

      if (remaining > 0 && isBreak) {
        const next = node.nextSibling

        if (next && next.nodeType === Node.TEXT_NODE) {
          range.setStart(next, 0)
        }

        if (!next || next.nodeType !== Node.TEXT_NODE) {
          range.setStartAfter(node)
        }
      }

      range.collapse(true)
      selection?.removeAllRanges()
      selection?.addRange(range)

      return
    }

    remaining -= length
    node = node.nextSibling
  }

  const fallbackRange = document.createRange()
  const fallbackSelection = window.getSelection()
  const last = parent.lastChild

  if (last && last.nodeType === Node.TEXT_NODE) {
    const len = last.textContent ? last.textContent.length : 0
    fallbackRange.setStart(last, len)
  }

  if (!last || last.nodeType !== Node.TEXT_NODE) {
    fallbackRange.selectNodeContents(parent)
  }

  fallbackRange.collapse(false)
  fallbackSelection?.removeAllRanges()
  fallbackSelection?.addRange(fallbackRange)
}
