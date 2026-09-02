import { For, Show, createUniqueId } from "solid-js"
import { createStore } from "solid-js/store"
import type { Part, UserMessage } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSettings } from "@/context/settings"
import { TimelineRow } from "./timeline-row"

const pillWidth = 20
const pillWidthActive = 28
const pillWidthHover = 32
const railInset = 36
const pillHeightRest = 5
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
    scrollTop: 0,
  })
  let wrapper: HTMLDivElement | undefined
  let strip: HTMLDivElement | undefined
  let dotRefs: HTMLButtonElement[] = []

  const count = () => props.userMessages.length

  const tooltip = () => {
    const index = state.hoverIndex ?? state.focusIndex
    if (index === undefined || index >= count()) return
    const dot = dotRefs[index]
    if (!dot) return
    const rect = dot.getBoundingClientRect()
    const base = wrapper?.getBoundingClientRect()
    if (!base) return
    const preview = props.preview(props.userMessages[index].id)
    return {
      index,
      // Positions come from live rects (immune to offsetParent quirks); the scrollTop read makes this recompute while the rail scrolls.
      scrollTop: state.scrollTop,
      top: rect.top - base.top + rect.height / 2,
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
      <div
        ref={(el) => {
          wrapper = el
        }}
        class="absolute inset-x-0 bottom-0 pointer-events-none"
        style={{ top: `${props.topOffset}px` }}
      >
        <div
          ref={(el) => {
            strip = el
          }}
          role="toolbar"
          aria-orientation="vertical"
          tabindex={0}
          class="absolute bottom-0 top-0 hidden md:flex flex-col pointer-events-auto outline-none overflow-y-auto pe-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ "inset-inline-start": `${railInset}px` }}
          onKeyDown={handleKeyDown}
          onFocusOut={(event) => {
            const next = event.relatedTarget
            if (next instanceof Node && strip?.contains(next)) return
            setState("focusIndex", undefined)
          }}
          onPointerLeave={() => setState("hoverIndex", undefined)}
          onScroll={() => setState("scrollTop", strip?.scrollTop ?? 0)}
        >
          {/* Auto margins on a flex child are the safe-centering pattern: they center the column when it fits and collapse to zero when it overflows, so the strip scrolls from its top instead of clipping either end. */}
          <div class="my-auto flex flex-col" style={{ gap: `${pillGapRest}px` }}>
            <For each={props.userMessages}>
              {(message, index) => {
                const active = () => props.activeMessageID() === message.id
                const hovered = () => state.hoverIndex === index() || state.focusIndex === index()
                // Pills grow by width, not transform: scale would paint past the strip's scroll box and get clipped.
                const width = () => {
                  if (!settings.general.newLayoutDesigns()) return pillWidth
                  if (hovered()) return pillWidthHover
                  if (active()) return pillWidthActive
                  return pillWidth
                }
                return (
                  <button
                    type="button"
                    tabindex={-1}
                    aria-label={language.t("session.messages.jumpToMessage", {
                      index: index() + 1,
                      total: count(),
                    })}
                    aria-describedby={hovered() ? tooltipID : undefined}
                    class="rounded-full cursor-pointer transition-[width] duration-150"
                    classList={{
                      "bg-v2-icon-icon-muted": !active() && settings.general.newLayoutDesigns(),
                      "bg-v2-icon-icon-accent": active() && settings.general.newLayoutDesigns(),
                      "bg-icon-base opacity-50": !active() && !settings.general.newLayoutDesigns(),
                      "bg-icon-base opacity-100": active() && !settings.general.newLayoutDesigns(),
                    }}
                    style={{ width: `${width()}px`, height: `${pillHeightRest}px` }}
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
          </div>
        </div>
        {/* The preview card sits outside the scrollable strip so overflow never clips it. */}
        <Show when={tooltip()}>
          {(tip) => (
            <div
              id={tooltipID}
              role="tooltip"
              class="absolute z-50 flex flex-col rounded-xl bg-v2-background-bg-layer-01 p-3 max-w-[360px] shadow-[var(--v2-elevation-floating)] [font-variation-settings:'slnt'_0] pointer-events-none"
              style={{
                "inset-inline-start": `${railInset + pillWidthHover + 8}px`,
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
