import type { SessionMessageUser } from "@opencode/client/promise"
import { MessageNav } from "@opencode/session-ui/message-nav"
import { createResizeObserver } from "@solid-primitives/resize-observer"
import { createSignal, Show } from "solid-js"
import { readPromptPresentation } from "@/composer/comment-note"
import { useLanguage } from "@/runtime/i18n/language"

const titleLimit = 48

const bodyLimit = 160

const truncate = (value: string, limit: number) => (value.length <= limit ? value : `${value.slice(0, limit)}…`)

const lines = (message: SessionMessageUser) =>
  (readPromptPresentation(message.metadata)?.displayText ?? message.text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

const attachmentName = (message: SessionMessageUser) =>
  readPromptPresentation(message.metadata)?.attachments[0]?.name ?? message.files?.[0]?.name

const previewTitle = (message: SessionMessageUser) => {
  const [title] = lines(message)

  return truncate(title ?? attachmentName(message) ?? "", titleLimit)
}

const previewBody = (message: SessionMessageUser) => {
  const [, ...rest] = lines(message)

  return truncate(rest.join("\n"), bodyLimit) || undefined
}

export function UserMessageRail(props: {
  messages: SessionMessageUser[]
  currentID?: string
  topOffset: number
  onSelect: (message: SessionMessageUser) => void
}) {
  const language = useLanguage()
  const [rail, setRail] = createSignal<HTMLDivElement>()
  const [railHeight, setRailHeight] = createSignal(0)

  createResizeObserver(rail, ({ height }) => setRailHeight(height))

  return (
    <Show when={props.messages.length >= 2}>
      <div
        ref={setRail}
        data-component="session-user-message-rail"
        class="pointer-events-none absolute bottom-0 start-9 z-20 hidden md:block"
        style={{ top: `${props.topOffset}px` }}
      >
        <MessageNav
          size="rail"
          class="pointer-events-auto"
          messages={props.messages}
          current={props.messages.find((message) => message.id === props.currentID)}
          railHeight={railHeight()}
          placement={language.direction() === "rtl" ? "left" : "right"}
          aria-label={language.t("session.messages.nav")}
          getLabel={previewTitle}
          getBody={previewBody}
          onMessageSelect={props.onSelect}
        />
      </div>
    </Show>
  )
}
