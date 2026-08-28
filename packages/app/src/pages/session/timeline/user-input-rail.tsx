import { For, Show, createUniqueId } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import type { Part, UserMessage } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { TimelineRow } from "./timeline-row"

const pillWidth = 20
const pillHeightRest = 5
const pillHeightMin = 4
const pillHeightMax = 6
const pillGapMin = 4
const pillGapRest = 10

export function UserInputRail(props: {
  userMessages: UserMessage[]
  activeMessageID: () => string | undefined
  flashMessageID: () => string | undefined
  topOffset: number
  preview: (messageID: string) => { title: string; body: string }
  onSelect: (message: UserMessage) => void
}) {
  const language = useLanguage()
  const settings = useSettings()
  const tooltipID = createUniqueId()

  const [state, setState] = createStore({
    hoverIndex: undefined as number | undefined,
    focusIndex: undefined as number | undefined,
    stripHeight: 0,
  })
  let strip: HTMLDivElement | undefined
  let dotRefs: HTMLButtonElement[] = []

  createResizeObserver(
    () => strip,
    (entry) => setState("stripHeight", entry.height),
  )

  const count = () => props.userMessages.length
  // Pills sit in one tight column: gaps compress first (floor 4px), then pill height (floor 4px), so dense rails never overlap.
  const pillSize = () => {
    const n = count()
    const available = state.stripHeight
    if (available <= 0) return { height: pillHeightRest, gap: pillGapRest }
    const slot = (available - (n - 1) * pillGapMin) / n
    const height = Math.max(pillHeightMin, Math.min(pillHeightMax, slot))
    const gap = n > 1 ? Math.max(pillGapMin, Math.min(pillGapRest, (available - n * height) / (n - 1))) : pillGapRest
    return { height, gap }
  }

  const tooltip = () => {
    const index = state.hoverIndex ?? state.focusIndex
    if (index === undefined || index >= count()) return
    const dot = dotRefs[index]
    if (!dot) return
    const preview = props.preview(props.userMessages[index].id)
    return {
      index,
      top: dot.offsetTop + dot.offsetHeight / 2,
      title: preview.title,
      body: preview.body,
    }
  }

  const focusDot = (index: number) => {
    setState("focusIndex", index)
    dotRefs[index]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent & { currentTarget: HTMLDivElement }) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const delta = event.key === "ArrowDown" ? 1 : -1
      const start = state.focusIndex ?? (delta > 0 ? -1 : count())
      focusDot(Math.min(count() - 1, Math.max(0, start + delta)))
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      focusDot(0)
      return
    }
    if (event.key === "End") {
      event.preventDefault()
      focusDot(count() - 1)
      return
    }
    if (event.key !== "Enter" && event.key !== " ") return
    if (event.target !== event.currentTarget) return
    const index = state.focusIndex
    if (index === undefined) return
    event.preventDefault()
    props.onSelect(props.userMessages[index])
  }

  return (
    <Show when={count() >= 2}>
      <div class="absolute inset-x-0 bottom-0 pointer-events-none" style={{ top: `${props.topOffset}px` }}>
        <div
          ref={(el) => {
            strip = el
          }}
          role="toolbar"
          aria-orientation="vertical"
          tabindex={0}
          class="absolute bottom-0 top-0 hidden md:flex flex-col justify-center pointer-events-auto outline-none"
          style={{ "inset-inline-start": "36px", gap: `${pillSize().gap}px` }}
          onKeyDown={handleKeyDown}
          onFocusOut={(event) => {
            const next = event.relatedTarget
            if (next instanceof Node && strip?.contains(next)) return
            setState("focusIndex", undefined)
          }}
          onPointerLeave={() => setState("hoverIndex", undefined)}
        >
          <For each={props.userMessages}>
            {(message, index) => {
              const active = () => props.activeMessageID() === message.id
              const hovered = () => state.hoverIndex === index() || state.focusIndex === index()
              return (
                <button
                  type="button"
                  tabindex={-1}
                  aria-label={language.t("session.messages.jumpToMessage", {
                    index: index() + 1,
                    total: count(),
                  })}
                  aria-describedby={hovered() ? tooltipID : undefined}
                  class="rounded-full cursor-pointer transition-transform duration-150"
                  classList={{
                    "bg-v2-icon-icon-muted": !active() && settings.general.newLayoutDesigns(),
                    "bg-v2-icon-icon-accent scale-140": active() && settings.general.newLayoutDesigns(),
                    "hover:scale-160": settings.general.newLayoutDesigns(),
                    "focus-visible:scale-140": settings.general.newLayoutDesigns(),
                    "bg-icon-base opacity-50": !active() && !settings.general.newLayoutDesigns(),
                    "bg-icon-base opacity-100": active() && !settings.general.newLayoutDesigns(),
                  }}
                  style={{ width: `${pillWidth}px`, height: `${pillSize().height}px` }}
                  ref={(el) => {
                    dotRefs[index()] = el
                  }}
                  onClick={() => {
                    setState("focusIndex", index())
                    props.onSelect(message)
                  }}
                  onPointerEnter={() => setState("hoverIndex", index())}
                  onPointerLeave={() => setState("hoverIndex", undefined)}
                />
              )
            }}
          </For>
          <Show when={tooltip()}>
            {(tip) => (
              <div
                id={tooltipID}
                role="tooltip"
                class="absolute z-50 flex flex-col rounded-xl bg-v2-background-bg-layer-01 p-3 max-w-[360px] shadow-[var(--v2-elevation-floating)] [font-variation-settings:'slnt'_0] pointer-events-none"
                style={{
                  "inset-inline-start": "calc(100% + 8px)",
                  top: `${tip().top}px`,
                  transform: "translateY(-50%)",
                }}
              >
                <bdi dir="auto" class="flex flex-col gap-1 min-w-0">
                  <Show when={tip().title}>
                    <p class="truncate text-[13px] font-semibold text-v2-text-text-base">{tip().title}</p>
                  </Show>
                  <Show when={tip().body}>
                    {(body) => (
                      <p class="line-clamp-3 text-[12px] leading-relaxed text-v2-text-text-muted whitespace-pre-line">
                        {body()}
                      </p>
                    )}
                  </Show>
                </bdi>
              </div>
            )}
          </Show>
        </div>
      </div>
    </Show>
  )
}

export function railDotSize(availableHeight: number, count: number): number {
  if (count <= 1) return 7
  return Math.min(7, Math.max(3, Math.floor((availableHeight / (count - 1)) * 0.45)))
}

export function userMessageExcerpt(parts: Part[]): string {
  const text = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim()
  const fallback = parts.find((part) => part.type === "file")?.filename?.trim() ?? ""
  const excerpt = text || fallback
  if (excerpt.length <= 140) return excerpt
  return `${excerpt.slice(0, 140)}…`
}

export function userMessagePreview(parts: Part[]): { title: string; body: string } {
  const raw = parts
    .filter((part): part is Extract<Part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length === 0) {
    const filename = parts.find((part) => part.type === "file")?.filename?.trim() ?? ""
    return { title: truncatePreview(filename, 48), body: "" }
  }
  const [title, ...rest] = lines
  return { title: truncatePreview(title ?? "", 48), body: truncatePreview(rest.join("\n"), 160) }
}

const truncatePreview = (value: string, limit: number) => (value.length <= limit ? value : `${value.slice(0, limit)}…`)

export function railActiveMessageID(input: {
  bottom: boolean
  startIndex: number | undefined
  rows: TimelineRow.TimelineRow[]
  userMessages: UserMessage[]
}): string | undefined {
  if (input.bottom) return input.userMessages.at(-1)?.id
  const row = input.startIndex === undefined ? undefined : input.rows[input.startIndex]
  return row?.userMessageID
}
