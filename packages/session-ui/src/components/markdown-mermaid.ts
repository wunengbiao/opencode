import type { MarkdownToken } from "./markdown-worker-protocol"

export type MermaidLabels = {
  generating: string
  error: string
}

export type MermaidBlock = {
  key: string
  hash: string
  complete: boolean
  stable: MarkdownToken[]
  unstable: MarkdownToken[]
}

type MermaidModule = typeof import("mermaid")["default"]

type MermaidState = {
  source: string
  complete: boolean
  generation: number
  labels: MermaidLabels
}

const mermaidState = new WeakMap<HTMLElement, MermaidState>()

let mermaidPromise: Promise<MermaidModule> | undefined
let currentTheme: "default" | "dark" | undefined
let renderCounter = 0

function themeName(): "default" | "dark" {
  return document.documentElement.getAttribute("data-theme") === "light" ? "default" : "dark"
}

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => mermaid)
  return mermaidPromise
}

function ensureInitialized(mermaid: MermaidModule, theme: "default" | "dark") {
  if (currentTheme === theme) return
  mermaid.initialize({ startOnLoad: false, securityLevel: "loose", theme })
  currentTheme = theme
}

export function disposeMermaid(root: Element) {
  const hosts = [
    ...(root instanceof HTMLElement && root.getAttribute("data-component") === "markdown-mermaid" ? [root] : []),
    ...Array.from(root.querySelectorAll('[data-component="markdown-mermaid"]')).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    ),
  ]
  hosts.forEach((host) => mermaidState.delete(host))
}

function sourceView(source: string) {
  const pre = document.createElement("pre")
  pre.className = "shiki OpenCode"
  const code = document.createElement("code")
  code.className = "language-mermaid"
  code.textContent = source
  pre.appendChild(code)
  return pre
}

function generatingView(labels: MermaidLabels) {
  const banner = document.createElement("div")
  banner.className = "markdown-mermaid-generating"
  banner.textContent = labels.generating
  return banner
}

function errorView(source: string, labels: MermaidLabels) {
  const banner = document.createElement("div")
  banner.className = "markdown-mermaid-error"
  banner.textContent = labels.error
  const view = document.createElement("div")
  view.appendChild(banner)
  view.appendChild(sourceView(source))
  return view
}

async function renderDiagram(host: HTMLElement, source: string, generation: number) {
  const current = () => {
    const state = mermaidState.get(host)
    return state && state.generation === generation ? state : undefined
  }
  try {
    const mermaid = await loadMermaid()
    if (!current() || !host.isConnected) return
    ensureInitialized(mermaid, themeName())
    const trimmed = source.trim()
    if (!trimmed) return
    const parsed = await mermaid.parse(trimmed)
    if (!current() || !host.isConnected) return
    if (!parsed || "err" in parsed) throw new Error("Invalid mermaid diagram")
    const { svg } = await mermaid.render(`markdown-mermaid-${++renderCounter}`, trimmed)
    if (!current() || !host.isConnected) return
    host.innerHTML = svg.replace(/translate\(undefined, NaN\)/g, "translate(0, 0)")
  } catch (error) {
    const state = current()
    if (!state || !host.isConnected) return
    console.error("Mermaid rendering failed", error)
    host.replaceChildren(errorView(source, state.labels))
  }
}

function renderContent(host: HTMLElement, source: string, complete: boolean, generation: number, labels: MermaidLabels) {
  host.replaceChildren()
  if (!complete) {
    host.appendChild(generatingView(labels))
    host.appendChild(sourceView(source))
    return
  }
  host.appendChild(sourceView(source))
  void renderDiagram(host, source, generation)
}

export function updateMermaidBlock(
  container: HTMLDivElement,
  current: Element | undefined,
  block: MermaidBlock,
  labels: MermaidLabels,
) {
  const existing = current instanceof HTMLDivElement && current.dataset.markdownKey === block.key ? current : undefined
  const next = existing ?? document.createElement("div")
  next.dataset.markdownBlock = ""
  next.dataset.markdownKey = block.key
  next.dataset.markdownHash = block.hash
  next.dataset.markdownComplete = block.complete ? "true" : "false"
  next.style.display = "contents"

  let host = next.querySelector<HTMLElement>('[data-component="markdown-mermaid"]')
  if (!host) {
    host = document.createElement("div")
    host.setAttribute("data-component", "markdown-mermaid")
    next.appendChild(host)
  }

  const source = [...block.stable, ...block.unstable].map((token) => token[0]).join("")
  const previous = mermaidState.get(host)
  if (previous && previous.source === source && previous.complete === block.complete) return
  const generation = (previous?.generation ?? 0) + 1
  mermaidState.set(host, { source, complete: block.complete, generation, labels })
  renderContent(host, source, block.complete, generation, labels)

  if (current && current !== next) {
    disposeMermaid(current)
    current.replaceWith(next)
    return
  }
  if (!(current instanceof HTMLDivElement)) container.appendChild(next)
}

function upgradePre(pre: HTMLPreElement, labels: MermaidLabels) {
  const source = pre.querySelector("code")?.textContent ?? ""
  const host = document.createElement("div")
  host.setAttribute("data-component", "markdown-mermaid")
  pre.replaceWith(host)
  const generation = 1
  mermaidState.set(host, { source, complete: true, generation, labels })
  renderContent(host, source, true, generation, labels)
}

export function upgradeMermaidPres(root: Element, labels: MermaidLabels) {
  const pres = Array.from(root.querySelectorAll("pre")).filter(
    (el): el is HTMLPreElement =>
      el instanceof HTMLPreElement &&
      !!el.querySelector("code.language-mermaid") &&
      !el.closest('[data-component="markdown-mermaid"]'),
  )
  for (const pre of pres) upgradePre(pre, labels)
}
