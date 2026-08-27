import { afterAll, expect, test } from "bun:test"
import { Effect } from "effect"
import { ConfigProxy } from "@/config/proxy"

const proxyKeys = ["HTTP_PROXY", "http_proxy", "HTTPS_PROXY", "https_proxy"]
const noProxyKeys = ["NO_PROXY", "no_proxy"]
const envKeys = [...proxyKeys, ...noProxyKeys]
const loopback = ["localhost", "127.0.0.1", "::1"]

// ConfigProxy keeps module-level state, so these tests run as one ordered sequence.
const ambient = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]))
afterAll(() => {
  for (const [key, value] of Object.entries(ambient)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const run = (proxy: ConfigProxy.Input | undefined) => Effect.runPromise(ConfigProxy.apply(proxy))

const hosts = () => new Set((process.env.NO_PROXY ?? "").split(","))

test("applies the proxy and preserves pre-existing env as ambient", async () => {
  process.env.HTTP_PROXY = "http://ambient.example.com:8080"
  process.env.NO_PROXY = "ambient.example.com"

  await run("http://127.0.0.1:7890")
  for (const key of proxyKeys) expect(process.env[key]).toBe("http://127.0.0.1:7890")
  expect(hosts()).toEqual(new Set(["ambient.example.com", ...loopback]))

  await run(undefined)
  expect(process.env.HTTP_PROXY).toBe("http://ambient.example.com:8080")
  expect(process.env.NO_PROXY).toBe("ambient.example.com")
})

test("merges configured no_proxy hosts with ambient and loopback", async () => {
  await run({ url: "http://proxy.example.com:3128", no_proxy: "internal.example.com, api.example.com" })
  for (const key of proxyKeys) expect(process.env[key]).toBe("http://proxy.example.com:3128")
  expect(hosts()).toEqual(new Set(["ambient.example.com", "internal.example.com", "api.example.com", ...loopback]))

  await run({ url: "http://proxy.example.com:3128", no_proxy: ["array.example.com"] })
  expect(hosts()).toEqual(new Set(["ambient.example.com", "array.example.com", ...loopback]))
})

test("ignores invalid proxy urls", async () => {
  await run("socks5://127.0.0.1:1080")
  await run("not a url")
  for (const key of proxyKeys) expect(process.env[key]).toBe("http://proxy.example.com:3128")
  expect(hosts()).toEqual(new Set(["ambient.example.com", "array.example.com", ...loopback]))
})

test("re-applies after being cleared", async () => {
  await run(undefined)
  expect(process.env.HTTP_PROXY).toBe("http://ambient.example.com:8080")

  await run("http://re-enabled.example.com:8080")
  expect(process.env.HTTP_PROXY).toBe("http://re-enabled.example.com:8080")

  await run(undefined)
  expect(process.env.HTTP_PROXY).toBe("http://ambient.example.com:8080")
})

test("treats an empty url as disabled", async () => {
  await run("http://cleared.example.com:8080")
  expect(process.env.HTTP_PROXY).toBe("http://cleared.example.com:8080")

  await run("")
  expect(process.env.HTTP_PROXY).toBe("http://ambient.example.com:8080")
  expect(process.env.NO_PROXY).toBe("ambient.example.com")

  await run({ url: "   ", no_proxy: [] })
  expect(process.env.HTTP_PROXY).toBe("http://ambient.example.com:8080")
})
