import type { FileDiffInfo, SessionMessageUser } from "@opencode/client/promise"
import { HoverCard } from "@kobalte/core/hover-card"
import { Tooltip } from "@kobalte/core/tooltip"
import { ComponentProps, For, Match, Show, createMemo, createSignal, splitProps, Switch } from "solid-js"
import { useI18n } from "@opencode/ui/context/i18n"
import { railPillSize } from "./rail-size"

export function MessageNav(
  props: ComponentProps<"ul"> & {
    messages: SessionMessageUser[]
    current?: SessionMessageUser
    size: "normal" | "compact" | "rail"
    onMessageSelect: (message: SessionMessageUser) => void
    getLabel?: (message: SessionMessageUser) => string | undefined
    getBody?: (message: SessionMessageUser) => string | undefined
    getChanges?: (message: SessionMessageUser) => FileDiffInfo[] | undefined
    placement?: "left" | "right"
    /** Space available to the rail, from its wrapper. */
    railHeight?: number
  },
) {
  const i18n = useI18n()

  const [local, others] = splitProps(props, [
    "messages",
    "current",
    "size",
    "onMessageSelect",
    "getLabel",
    "getBody",
    "getChanges",
    "class",
    "placement",
    "railHeight",
  ])

  const [hovercardOpen, setHovercardOpen] = createSignal(false)

  const selectMessage = (message: SessionMessageUser) => {
    setHovercardOpen(false)
    local.onMessageSelect(message)
  }

  const railSize = createMemo(() => railPillSize(local.railHeight ?? 0, local.messages.length))

  // Auto padding centers the column when it fits and collapses to zero when it overflows, so the top stays reachable.
  const railPadding = createMemo(() => {
    const content = local.messages.length * railSize().height + Math.max(0, local.messages.length - 1) * railSize().gap

    return Math.max(0, ((local.railHeight ?? 0) - content) / 2)
  })

  let pillRefs: HTMLButtonElement[] = []

  const focusPill = (index: number) => {
    pillRefs[Math.min(local.messages.length - 1, Math.max(0, index))]?.focus()
  }

  const handleRailKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return
    event.preventDefault()

    if (event.key === "Home") return focusPill(0)

    if (event.key === "End") return focusPill(local.messages.length - 1)

    const delta = event.key === "ArrowDown" ? 1 : -1
    const index = pillRefs.findIndex((pill) => pill === document.activeElement)

    focusPill(index < 0 ? (delta > 0 ? 0 : local.messages.length - 1) : index + delta)
  }

  const label = (message: SessionMessageUser) => local.getLabel?.(message) ?? i18n.t("ui.messageNav.newMessage")

  const rail = () => (
    <ul
      {...others}
      role="toolbar"
      aria-orientation="vertical"
      tabindex={0}
      data-component="message-nav"
      data-size="rail"
      class={local.class}
      style={{
        gap: `${railSize().gap}px`,
        "padding-block": `${railPadding()}px`,
      }}
      onKeyDown={handleRailKeyDown}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return
        focusPill(
          Math.max(
            0,
            local.messages.findIndex((message) => message.id === local.current?.id),
          ),
        )
      }}
    >
      <For each={local.messages}>
        {(message, index) => (
          <li data-slot="message-nav-item">
            <Tooltip openDelay={120} closeDelay={80} placement={local.placement ?? "right"} gutter={8}>
              <Tooltip.Trigger
                ref={(element) => {
                  pillRefs[index()] = element
                }}
                type="button"
                tabindex={-1}
                data-slot="message-nav-rail-pill"
                data-active={message.id === local.current?.id || undefined}
                aria-label={i18n.t("ui.messageNav.jumpToMessage", {
                  index: index() + 1,
                  total: local.messages.length,
                })}
                style={{ height: `${railSize().height}px` }}
                onClick={() => selectMessage(message)}
              />
              <Tooltip.Portal>
                <Tooltip.Content data-slot="message-nav-rail-tooltip">
                  <bdi dir="auto" data-slot="message-nav-rail-tooltip-content">
                    <p data-slot="message-nav-rail-tooltip-title">{label(message)}</p>
                    <Show when={local.getBody?.(message)}>
                      {(body) => <p data-slot="message-nav-rail-tooltip-body">{body()}</p>}
                    </Show>
                  </bdi>
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip>
          </li>
        )}
      </For>
    </ul>
  )

  const content = (className?: string) => (
    <ul role="list" data-component="message-nav" data-size={local.size} class={className} {...others}>
      <For each={local.messages}>
        {(message) => {
          const handleClick = () => selectMessage(message)

          const handleKeyPress = (event: KeyboardEvent) => {
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            selectMessage(message)
          }

          return (
            <li data-slot="message-nav-item">
              <Switch>
                <Match when={local.size === "compact"}>
                  <div
                    data-slot="message-nav-tick-button"
                    data-active={message.id === local.current?.id || undefined}
                    role="button"
                    tabindex={0}
                    onClick={handleClick}
                    onKeyDown={handleKeyPress}
                  >
                    <div data-slot="message-nav-tick-line" />
                  </div>
                </Match>
                <Match when={local.size === "normal"}>
                  <button data-slot="message-nav-message-button" onClick={handleClick} onKeyDown={handleKeyPress}>
                    <MessageDiffBars changes={local.getChanges?.(message) ?? []} />
                    <div
                      data-slot="message-nav-title-preview"
                      data-active={message.id === local.current?.id || undefined}
                    >
                      <Show when={local.getLabel?.(message)} fallback={i18n.t("ui.messageNav.newMessage")}>
                        {local.getLabel?.(message)}
                      </Show>
                    </div>
                  </button>
                </Match>
              </Switch>
            </li>
          )
        }}
      </For>
    </ul>
  )

  return (
    <Switch>
      <Match when={local.size === "compact"}>
        <HoverCard
          open={hovercardOpen()}
          onOpenChange={setHovercardOpen}
          openDelay={0}
          closeDelay={120}
          placement="right-start"
          gutter={8}
          overflowPadding={24}
          fitViewport
        >
          <HoverCard.Trigger as="div" data-component="message-nav-hovercard" class={local.class}>
            {content()}
          </HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Content data-slot="message-nav-hovercard-content">
              <MessageNav {...props} size="normal" class="" onMessageSelect={selectMessage} />
            </HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard>
      </Match>
      <Match when={local.size === "normal"}>{content(local.class)}</Match>
      <Match when={local.size === "rail"}>{rail()}</Match>
    </Switch>
  )
}

function MessageDiffBars(props: { changes: { additions: number; deletions: number }[] }) {
  const additions = createMemo(() => props.changes.reduce((total, diff) => total + diff.additions, 0))
  const deletions = createMemo(() => props.changes.reduce((total, diff) => total + diff.deletions, 0))

  const colors = createMemo(() => {
    const added = additions()
    const deleted = deletions()

    if (added === 0 && deleted === 0) return Array(5).fill("var(--icon-weak-base)")

    if (added + deleted < 5) {
      return [
        ...Array(added > 0 ? 1 : 0).fill("var(--icon-diff-add-base)"),
        ...Array(deleted > 0 ? 1 : 0).fill("var(--icon-diff-delete-base)"),
        ...Array(5 - (added > 0 ? 1 : 0) - (deleted > 0 ? 1 : 0)).fill("var(--icon-weak-base)"),
      ]
    }

    const total = added + deleted
    const ratio = added > deleted ? added / deleted : deleted / added
    const colored = total < 20 || ratio < 4 ? 4 : 5
    const addedRaw = (added / total) * colored
    const deletedRaw = (deleted / total) * colored

    const addedBars =
      added === 0 ? 0 : Math.min(added <= 5 ? 1 : added <= 10 ? 2 : colored, Math.max(1, Math.round(addedRaw)))

    const deletedBars =
      deleted === 0 ? 0 : Math.min(deleted <= 5 ? 1 : deleted <= 10 ? 2 : colored, Math.max(1, Math.round(deletedRaw)))

    const overflow = Math.max(0, addedBars + deletedBars - colored)
    const adjustedAdded = overflow > 0 && addedRaw > deletedRaw ? addedBars - overflow : addedBars
    const adjustedDeleted = overflow > 0 && addedRaw <= deletedRaw ? deletedBars - overflow : deletedBars

    return [
      ...Array(adjustedAdded).fill("var(--icon-diff-add-base)"),
      ...Array(adjustedDeleted).fill("var(--icon-diff-delete-base)"),
      ...Array(5 - adjustedAdded - adjustedDeleted).fill("var(--icon-weak-base)"),
    ]
  })

  return (
    <svg data-slot="message-nav-diff-bars" viewBox="0 0 18 14" aria-hidden="true">
      <For each={colors().slice(0, 5)}>
        {(color, index) => <rect x={index() * 4} width="2" height="14" rx="1" fill={color} />}
      </For>
    </svg>
  )
}
