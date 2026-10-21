import { base64Encode } from "@opencode-ai/core/util/encode"
import { expect, test, type Page } from "@playwright/test"
import {
  assistantMessage,
  directory,
  project,
  session,
  sessionID,
  textPart,
  title,
  userMessage,
  type TimelineMessage,
} from "../performance/timeline-stability/fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { installSseTransport } from "../utils/sse-transport"
import { expectSessionTitle } from "../utils/waits"

const file = "src/session/prompt.ts"
const marker = "export const openFilePathMarker = true"

test.use({ viewport: { width: 1440, height: 900 } })

test("opens the file when a detected path in a message is clicked", async ({ page }) => {
  await setup(page, {
    messages: [
      userMessage(),
      assistantMessage([textPart("prt_open_file_path_text", `The guard lives in \`${file}:1069\` for now.`)]),
    ],
    files: [file],
    content: (path) => (path === file ? `${marker}\n` : ""),
  })

  const path = page.locator('code[data-slot="markdown-file-path"]', { hasText: file })
  await expect(path).toBeVisible()

  const panel = page.locator("#review-panel")
  await expect(panel).toHaveCount(0)

  await path.click()

  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-slot="tabs-list"]')).toContainText("prompt.ts")
  await expect(panel.getByText(marker, { exact: false })).toBeVisible()
})

test("lets the user choose when a bare filename matches multiple files", async ({ page }) => {
  const other = "packages/opencode/src/session/prompt.ts"
  const chosen = "packages/app/src/session/prompt.ts"

  await setup(page, {
    messages: [
      userMessage(),
      assistantMessage([textPart("prt_open_file_path_text", "The guard lives in `prompt.ts:1069` for now.")]),
    ],
    files: [other, chosen],
    content: (path) => (path === chosen ? `${marker}\n` : ""),
  })

  const path = page.locator('code[data-slot="markdown-file-path"]', { hasText: "prompt.ts" })
  await expect(path).toBeVisible()

  const panel = page.locator("#review-panel")
  await expect(panel).toHaveCount(0)

  await path.click()

  const dialog = page.locator('[data-slot="dialog-content"]')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('[data-slot="dialog-title"]')).toHaveText("Select file")
  await expect(dialog.locator(`[data-slot="list-item"][data-key="${other}"]`)).toBeVisible()
  await expect(dialog.locator(`[data-slot="list-item"][data-key="${chosen}"]`)).toBeVisible()
  await expect(panel).toHaveCount(0)

  await dialog.locator(`[data-slot="list-item"][data-key="${chosen}"]`).click()

  await expect(dialog).toHaveCount(0)
  await expect(panel).toBeVisible()
  await expect(panel.locator('[data-slot="tabs-list"]')).toContainText("prompt.ts")
  await expect(panel.getByText(marker, { exact: false })).toBeVisible()
})

async function setup(
  page: Page,
  options: { messages: TimelineMessage[]; files: string[]; content: (path: string) => string },
) {
  const transport = await installSseTransport<{ directory: string; payload: Record<string, unknown> }>(page, {
    server: `http://${process.env.PLAYWRIGHT_SERVER_HOST ?? "127.0.0.1"}:${process.env.PLAYWRIGHT_SERVER_PORT ?? "4096"}`,
    retry: 20,
  })
  await mockOpenCodeServer(page, {
    directory,
    project: project(),
    provider: {
      all: [
        {
          id: "opencode",
          name: "OpenCode",
          models: {
            "claude-opus-4-6": {
              id: "claude-opus-4-6",
              name: "Claude Opus 4.6",
              limit: { context: 200_000 },
            },
          },
        },
      ],
      connected: ["opencode"],
      default: { providerID: "opencode", modelID: "claude-opus-4-6" },
    },
    sessions: [session()],
    sessionStatus: { [sessionID]: { type: "idle" } },
    pageMessages: () => ({ items: options.messages }),
    findFiles: () => options.files,
    fileContent: (path) => ({ type: "text", content: options.content(path) }),
  })
  await page.goto(`/${base64Encode(directory)}/session/${sessionID}`)
  await transport.waitForConnection()
  await expectSessionTitle(page, title)
}
