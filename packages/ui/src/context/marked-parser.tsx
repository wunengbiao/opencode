import katex from "katex"
import { Marked, type MarkedExtension, type Tokens } from "marked"
import markedShiki from "marked-shiki"

export function createMarkdownParser(highlight: (code: string, language: string) => string | Promise<string>) {
  return new Marked(
    {
      renderer: {
        link({ href, title, text }) {
          const titleAttr = title ? ` title="${title}"` : ""
          return `<a href="${href}"${titleAttr} class="external-link" target="_blank" rel="noopener noreferrer">${text}</a>`
        },
      },
    },
    katexExtension,
    markedShiki({ highlight }),
    mermaidExtension,
  )
}

const mermaidExtension: MarkedExtension = {
  async walkTokens(token) {
    if (token.type !== "code" || token.lang !== "mermaid") return
    const text = token.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    Object.assign(token, {
      type: "html",
      block: true,
      raw: token.raw,
      pre: true,
      text: `<pre class="shiki OpenCode"><code class="language-mermaid">${text}</code></pre>\n`,
    })
  },
}

const inlineMathRegex = /^\\\(((?:\\.|[^\\\n])*?)\\\)/
const blockMathRegex = /^\$\$\n([\s\S]+?)\n\$\$(?:\n|$)/
const inlineDollarDisplayMathRegex = /^\$\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$\$/
const inlineDollarMathRegex = /^\$(?!\s)((?:\\.|[^$\n])+?)(?<!\s)\$(?!\d)/
const singleLineBlockMathRegex = /^\$\$[ \t]*([^$\n]+?)[ \t]*\$\$(?:\n|$)/

const katexExtension: MarkedExtension = {
  extensions: [
    {
      name: "inlineKatex",
      level: "inline",
      start(src) {
        const index = src.indexOf("\\(")
        if (index === -1) return
        return index
      },
      tokenizer(src) {
        const match = src.match(inlineMathRegex)
        if (!match) return
        return {
          type: "inlineKatex",
          raw: match[0],
          text: match[1].trim(),
          displayMode: false,
        }
      },
      renderer: renderKatexToken,
    },
    {
      name: "dollarKatex",
      level: "inline",
      start(src) {
        const index = src.indexOf("$")
        if (index === -1) return
        return index
      },
      tokenizer(src) {
        const display = src.match(inlineDollarDisplayMathRegex)
        if (display) {
          return {
            type: "dollarKatex",
            raw: display[0],
            text: display[1].trim(),
            displayMode: true,
          }
        }
        const match = src.match(inlineDollarMathRegex)
        if (!match) return
        return {
          type: "dollarKatex",
          raw: match[0],
          text: match[1].trim(),
          displayMode: false,
        }
      },
      renderer: renderKatexToken,
    },
    {
      name: "blockKatex",
      level: "block",
      tokenizer(src) {
        for (const regex of [blockMathRegex, singleLineBlockMathRegex]) {
          const match = src.match(regex)
          if (!match) continue
          return {
            type: "blockKatex",
            raw: match[0],
            text: match[1].trim(),
            displayMode: true,
          }
        }
      },
      renderer: renderKatexToken,
    },
  ],
}

function renderKatexToken(token: Tokens.Generic) {
  return katex.renderToString(typeof token.text === "string" ? token.text : "", {
    displayMode: token.displayMode === true,
    throwOnError: false,
  })
}
