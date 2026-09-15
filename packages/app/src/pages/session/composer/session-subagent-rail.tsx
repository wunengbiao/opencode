import { useNavigate } from "@solidjs/router"
import { For, Show, createMemo, createUniqueId } from "solid-js"
import { createStore } from "solid-js/store"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import type { ToolPart } from "@opencode-ai/sdk/v2"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { useSettings } from "@/context/settings"
import { useSync } from "@/context/sync"
import { useSessionKey } from "@/pages/session/session-layout"
import { legacySessionHref, requireServerKey, sessionHref } from "@/utils/session-route"

// Match the left-side user input rail: pills sit in one tight column, gaps compress first (floor 4px), then pill height (floor 4px).
const pillWidth = 20
const pillHeightRest = 5
const pillHeightMin = 4
const pillHeightMax = 6
const pillGapMin = 4
const pillGapRest = 10

type SubagentStatus = ToolPart["state"]["status"]

type SubagentItem = {
  id: string
  status: SubagentStatus
  label: string | undefined
  childID: string | undefined
}

const statusKeys: Record<SubagentStatus, string> = {
  pending: "session.subagent.status.pending",
  running: "session.subagent.status.running",
  completed: "session.subagent.status.completed",
  error: "session.subagent.status.error",
}

const childSessionID = (part: ToolPart) => {
  const metadata = ("metadata" in part.state ? part.state.metadata : undefined) ?? part.metadata
  const id = metadata?.sessionId ?? metadata?.sessionID
  return typeof id === "string" && id ? id : undefined
}

const taskLabel = (part: ToolPart) => {
  const value = part.state.input?.description ?? part.state.input?.prompt
  return typeof value === "string" && value ? value : undefined
}

export function SessionSubagentRail(props: { topOffset: number }) {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()
  const settings = useSettings()
  const navigate = useNavigate()
  const { params } = useSessionKey()
  const tooltipID = createUniqueId()

  const [state, setState] = createStore({
    hoverIndex: undefined as number | undefined,
    focusIndex: undefined as number | undefined,
    stripHeight: 0,
  })
  let barRefs: HTMLButtonElement[] = []
  let strip: HTMLDivElement | undefined

  createResizeObserver(
    () => strip,
    (entry) => setState("stripHeight", entry.height),
  )

  const subagents = createMemo(() => {
    const messages = params.id ? (sync().data.message[params.id] ?? []) : []
    const seen = new Set<string>()
    const items: SubagentItem[] = []
    for (const message of messages) {
      for (const part of sync().data.part[message.id] ?? []) {
        if (part.type !== "tool" || part.tool !== "task") continue
        if (seen.has(part.id)) continue
        seen.add(part.id)
        items.push({
          id: part.id,
          status: part.state.status,
          label: taskLabel(part),
          childID: childSessionID(part),
        })
      }
    }
    return items
  })

  const pillSize = () => {
    const n = subagents().length
    const available = state.stripHeight
    if (available <= 0) return { height: pillHeightRest, gap: pillGapRest }
    const slot = (available - (n - 1) * pillGapMin) / n
    const height = Math.max(pillHeightMin, Math.min(pillHeightMax, slot))
    const gap = n > 1 ? Math.max(pillGapMin, Math.min(pillGapRest, (available - n * height) / (n - 1))) : pillGapRest
    return { height, gap }
  }

  const open = (item: SubagentItem) => {
    if (!item.childID) return
    navigate(
      params.serverKey
        ? sessionHref(requireServerKey(params.serverKey), item.childID)
        : legacySessionHref(sdk().directory, item.childID),
    )
  }

  const focusBar = (index: number) => {
    setState("focusIndex", index)
    barRefs[index]?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    const count = subagents().length
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const delta = event.key === "ArrowDown" ? 1 : -1
      const start = state.focusIndex ?? (delta > 0 ? -1 : count)
      focusBar(Math.min(count - 1, Math.max(0, start + delta)))
      return
    }
    if (event.key === "Home") {
      event.preventDefault()
      focusBar(0)
      return
    }
    if (event.key === "End") {
      event.preventDefault()
      focusBar(count - 1)
      return
    }
    if (event.key !== "Enter" && event.key !== " ") return
    if (event.target !== event.currentTarget) return
    const index = state.focusIndex
    if (index === undefined) return
    const item = subagents()[index]
    if (!item) return
    event.preventDefault()
    open(item)
  }

  const hovered = (index: number) => state.hoverIndex === index || state.focusIndex === index

  const ariaLabel = (item: SubagentItem) => {
    const status = language.t(statusKeys[item.status])
    if (!item.label) return status
    return language.t("session.subagent.tooltip", { status, description: item.label })
  }

  const tooltip = () => {
    const index = state.hoverIndex ?? state.focusIndex
    if (index === undefined || index >= subagents().length) return undefined
    const bar = barRefs[index]
    if (!bar) return undefined
    const item = subagents()[index]
    return {
      top: bar.offsetTop + bar.offsetHeight / 2,
      title: language.t(statusKeys[item.status]),
      body: item.label,
    }
  }

  return (
    <Show when={subagents().length > 0}>
      <div
        class="absolute inset-x-0 pointer-events-none"
        style={{ top: `calc(${props.topOffset}px + 24px)`, bottom: "calc(var(--session-composer-height, 0px) + 24px)" }}
        data-component="session-subagent-rail"
      >
        <div
          ref={strip}
          role="toolbar"
          aria-orientation="vertical"
          tabindex={0}
          class="absolute inset-y-0 hidden md:flex flex-col justify-center pointer-events-auto outline-none"
          style={{ "inset-inline-end": "36px", gap: `${pillSize().gap}px` }}
          onKeyDown={handleKeyDown}
          onFocusOut={(event) => {
            const next = event.relatedTarget
            if (next instanceof Node && strip?.contains(next)) return
            setState("focusIndex", undefined)
          }}
        >
          <For each={subagents()}>
            {(item, index) => (
              <button
                type="button"
                tabindex={-1}
                aria-label={ariaLabel(item)}
                aria-describedby={hovered(index()) ? tooltipID : undefined}
                aria-disabled={!item.childID}
                classList={{
                  "rounded-full": true,
                  "bg-icon-success-base":
                    (item.status === "running" || item.status === "completed") && !settings.general.newLayoutDesigns(),
                  "bg-icon-warning-base": item.status === "pending" && !settings.general.newLayoutDesigns(),
                  "bg-icon-critical-base": item.status === "error" && !settings.general.newLayoutDesigns(),
                  "bg-v2-state-fg-success":
                    (item.status === "running" || item.status === "completed") && settings.general.newLayoutDesigns(),
                  "bg-v2-state-fg-warning": item.status === "pending" && settings.general.newLayoutDesigns(),
                  "bg-v2-state-fg-danger": item.status === "error" && settings.general.newLayoutDesigns(),
                  "opacity-60": item.status === "completed",
                  "animate-[var(--animate-pulse-scale)]": item.status === "running",
                  "motion-reduce:animate-none": item.status === "running",
                  "cursor-pointer": !!item.childID,
                }}
                style={{ width: `${pillWidth}px`, height: `${pillSize().height}px` }}
                ref={(el) => {
                  barRefs[index()] = el
                }}
                onClick={() => open(item)}
                onPointerEnter={() => setState("hoverIndex", index())}
                onPointerLeave={() => setState("hoverIndex", undefined)}
              />
            )}
          </For>
          <Show when={tooltip()} keyed>
            {(tip) => (
              <div
                id={tooltipID}
                role="tooltip"
                class="absolute z-50 flex w-max max-w-[360px] flex-col rounded-xl bg-v2-background-bg-layer-01 p-3 shadow-[var(--v2-elevation-floating)] [font-variation-settings:'slnt'_0] pointer-events-none"
                style={{
                  "inset-inline-end": "calc(100% + 8px)",
                  top: `${tip.top}px`,
                  transform: "translateY(-50%)",
                }}
              >
                <bdi dir="auto" class="flex flex-col gap-1 min-w-0">
                  <p class="truncate text-[13px] font-semibold text-v2-text-text-base">{tip.title}</p>
                  <Show when={tip.body}>
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
