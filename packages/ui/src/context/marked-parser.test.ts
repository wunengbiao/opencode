import { expect, test } from "bun:test"
import { createMarkdownParser } from "./marked-parser"

const parser = createMarkdownParser((code, language) => `<pre data-language="${language}">${code}</pre>`)

test("renders links with application attributes", async () => {
  expect(await parser.parse("[OpenCode](https://opencode.ai)")).toBe(
    '<p><a href="https://opencode.ai" class="external-link" target="_blank" rel="noopener noreferrer">OpenCode</a></p>\n',
  )
})

test("renders inline and block math", async () => {
  expect(await parser.parse("\\(x^2\\)")).toContain('<span class="katex">')
  expect(await parser.parse("$$\nx^2\n$$\n")).toContain('<span class="katex-display">')
})

test("renders dollar-delimited inline math", async () => {
  expect(await parser.parse("The value is $x^2$ here")).toContain('<span class="katex">')
})

test("renders single-line dollar display math", async () => {
  expect(await parser.parse("$$x^2$$")).toContain('<span class="katex-display">')
  expect(await parser.parse("The value $$x^2$$ here")).toContain('<span class="katex-display">')
})

test("does not treat currency as math", async () => {
  expect(await parser.parse("The price is $5")).not.toContain("katex")
  expect(await parser.parse("I have $5 and $10")).not.toContain("katex")
})

test("uses the configured code highlighter", async () => {
  expect(await parser.parse("```ts\nconst value = 1\n```\n")).toBe('<pre data-language="ts">const value = 1</pre>\n')
})

test("marks mermaid fences for diagram rendering", async () => {
  expect(await parser.parse("```mermaid\ngraph TD\nA-->B\n```\n")).toBe(
    '<pre class="shiki OpenCode"><code class="language-mermaid">graph TD\nA--&gt;B</code></pre>\n',
  )
})
