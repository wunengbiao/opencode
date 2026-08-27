export * as ConfigProxy from "./proxy"

import { Effect } from "effect"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"

export type Input = NonNullable<ConfigV1.Info["proxy"]>

const proxyKeys = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"]
const noProxyKeys = ["NO_PROXY", "no_proxy"]
const envKeys = [...proxyKeys, ...noProxyKeys]
const loopback = ["localhost", "127.0.0.1", "::1"]

let applied: { url: string, no_proxy: string[] } | undefined
let ambient: Record<string, string | undefined> | undefined

/**
 * Applies the configured proxy as the process-global proxy by writing the
 * standard proxy env vars. Bun's fetch, child processes, and npm tooling pick
 * these up, so all outbound requests route through the proxy. Passing
 * undefined restores the env vars captured before the first write.
 */
export const apply = Effect.fn("ConfigProxy.apply")(function* (proxy: Input | undefined) {
  const next = proxy === undefined ? undefined : normalize(proxy)
  // An empty url clears the proxy: the settings UI cannot delete the key
  // through a merged patch, so it writes an empty string instead.
  if (next === undefined || next.url === "") {
    if (applied === undefined) return
    restore()
    yield* Effect.logInfo("proxy disabled")
    return
  }
  if (!validUrl(next.url)) {
    yield* Effect.logWarning("ignoring invalid proxy url", { url: next.url })
    return
  }
  if (applied !== undefined && same(applied, next)) return
  capture()
  for (const key of proxyKeys) process.env[key] = next.url
  const noProxy = [...new Set([...ambientNoProxy(), ...next.no_proxy, ...loopback])]
  for (const key of noProxyKeys) process.env[key] = noProxy.join(",")
  applied = next
  yield* Effect.logInfo("routing network requests through proxy", { url: next.url, no_proxy: noProxy })
})

function normalize(proxy: Input) {
  if (typeof proxy === "string") return { url: proxy.trim(), no_proxy: [] }
  const noProxy = proxy.no_proxy ?? []
  return {
    url: proxy.url.trim(),
    no_proxy: typeof noProxy === "string" ? splitHosts(noProxy) : [...noProxy],
  }
}

function splitHosts(value: string) {
  return value
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host !== "")
}

function validUrl(url: string) {
  try {
    const protocol = new URL(url).protocol
    return protocol === "http:" || protocol === "https:"
  } catch {
    return false
  }
}

function same(current: { url: string, no_proxy: string[] }, next: { url: string, no_proxy: string[] }) {
  if (current.url !== next.url) return false
  const hosts = new Set(current.no_proxy)
  return next.no_proxy.length === hosts.size && next.no_proxy.every((host) => hosts.has(host))
}

function capture() {
  if (ambient !== undefined) return
  ambient = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
}

function ambientNoProxy() {
  const value = ambient?.NO_PROXY ?? ambient?.no_proxy
  return value === undefined ? [] : splitHosts(value)
}

function restore() {
  if (ambient === undefined) return
  for (const [key, value] of Object.entries(ambient)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  applied = undefined
}
