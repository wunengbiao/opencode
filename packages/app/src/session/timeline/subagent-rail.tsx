import { Tooltip } from "@kobalte/core/tooltip"
import { railPillSize } from "@opencode/session-ui/rail-size"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/runtime/i18n/language"
import "./subagent-rail.css"

export type SubagentRailStatus = "pending" | "running" | "completed" | "error"

export type SubagentRailItem = {
  id: string
  status: SubagentRailStatus
  label?: string
  sessionID?: string
}

const statusKeys = {
  pending: "session.subagent.status.pending",
  running: "session.subagent.status.running",
  completed: "session.subagent.status.completed",
  error: "session.subagent.status.error",
} as const

export function SubagentRail(props: {
  items: readonly SubagentRailItem[]
  topOffset: number
  onOpen: (sessionID: string) => void
}) {
  const language = useLanguage()
  const [rail, setRail] = createSignal<HTMLDivElement>()
  const [railHeight, setRailHeight] = createSignal(0)

  createResizeObserver(rail, ({ height }) => setRailHeight(height))

  const size = createMemo(() => railPillSize(railHeight(), props.items.length))

  const padding = createMemo(() => {
    const content = props.items.length * size().height + Math.max(0, props.items.length - 1) * size().gap

    return Math.max(0, (railHeight() - content) / 2)
  })

  let pills: HTMLButtonElement[] = []

  const focusPill = (index: number) => {
    pills[Math.min(props.items.length - 1, Math.max(0, index))]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()

    if (event.key === "Home") return focusPill(0)

    if (event.key === "End") return focusPill(props.items.length - 1)

    const delta = event.key === "ArrowDown" ? 1 : -1
    const index = pills.findIndex((pill) => pill === document.activeElement)

    focusPill(index < 0 ? (delta > 0 ? 0 : props.items.length - 1) : index + delta)
  }

  const status = (item: SubagentRailItem) => language.t(statusKeys[item.status])

  const label = (item: SubagentRailItem) =>
    item.label
      ? language.t("session.subagent.tooltip", { status: status(item), description: item.label })
      : status(item)

  return (
    <Show when={props.items.length > 0}>
      <div
        ref={setRail}
        data-component="session-subagent-rail"
        class="pointer-events-none absolute bottom-0 end-9 z-20 hidden md:block"
        style={{ top: `${props.topOffset}px` }}
      >
        <ul
          data-slot="session-subagent-rail-list"
          role="toolbar"
          aria-orientation="vertical"
          aria-label={language.t("session.subagent.nav")}
          tabindex={0}
          class="pointer-events-auto"
          style={{
            gap: `${size().gap}px`,
            "padding-block": `${padding()}px`,
          }}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            if (event.target !== event.currentTarget) return
            focusPill(0)
          }}
        >
          <For each={props.items}>
            {(item, index) => (
              <li data-slot="session-subagent-rail-item">
                <Tooltip
                  openDelay={120}
                  closeDelay={80}
                  placement={language.direction() === "rtl" ? "right" : "left"}
                  gutter={8}
                >
                  <Tooltip.Trigger
                    ref={(element) => {
                      pills[index()] = element
                    }}
                    type="button"
                    tabindex={-1}
                    data-slot="session-subagent-rail-pill"
                    data-status={item.status}
                    data-openable={item.sessionID ? true : undefined}
                    aria-label={label(item)}
                    style={{ height: `${size().height}px` }}
                    onClick={() => {
                      if (item.sessionID) props.onOpen(item.sessionID)
                    }}
                  />
                  <Tooltip.Portal>
                    <Tooltip.Content data-slot="session-subagent-rail-tooltip">
                      <bdi dir="auto" data-slot="session-subagent-rail-tooltip-content">
                        <p data-slot="session-subagent-rail-tooltip-title">{status(item)}</p>
                        <Show when={item.label}>
                          {(text) => <p data-slot="session-subagent-rail-tooltip-body">{text()}</p>}
                        </Show>
                      </bdi>
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip>
              </li>
            )}
          </For>
        </ul>
      </div>
    </Show>
  )
}
