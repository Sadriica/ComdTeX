import { describe, expect, it } from "vitest"
import { highlightCode, resolveHighlightLang } from "./syntaxHighlight"

const strip = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")

describe("resolveHighlightLang", () => {
  it("accepts common aliases and info-string suffixes", () => {
    expect(resolveHighlightLang("py")).toBe("python")
    expect(resolveHighlightLang("TypeScript")).toBe("ts")
    expect(resolveHighlightLang("sh title=x")).toBe("bash")
    expect(resolveHighlightLang("tex")).toBe("latex")
  })

  it("returns null for unknown, empty or prototype names", () => {
    expect(resolveHighlightLang("mermaid")).toBeNull()
    expect(resolveHighlightLang("")).toBeNull()
    expect(resolveHighlightLang(undefined)).toBeNull()
    expect(resolveHighlightLang("constructor")).toBeNull()
  })
})

describe("highlightCode", () => {
  it("never changes the text, whatever the language", () => {
    const samples: [string, string][] = [
      ["python", 'def f(x):\n    """doc"""\n    return x < 1 and "a&b"  # c <b>\n'],
      ["ts", "const a: Map<string, number> = new Map() // x\nlet s = `t ${a}`\n"],
      ["rust", 'fn main() { let x: u32 = 0x1F; /* c */ println!("{}", x); }\n'],
      ["bash", "echo \"$HOME\" | grep -c 'x' # c\nif [ $? -eq 0 ]; then :; fi\n"],
      ["json", '{"a": [1, 2.5e3, true, null], "b": "<tag>"}\n'],
      ["yaml", "key: value # c\nlist:\n  - a: 'x'\n"],
      ["sql", "SELECT a, count(*) FROM t WHERE b = 'x' -- c\n"],
      ["latex", "\\begin{align} x &= $y$ % c\n\\end{align}\n"],
      ["julia", "function f(x)\n  x^2 # c\nend\n"],
    ]
    for (const [lang, code] of samples) {
      expect(strip(highlightCode(code, lang) ?? "<none>"), lang).toBe(code)
    }
  })

  it("emits only escaped text and tok-* spans", () => {
    const html = highlightCode('if (a < b && c > "d") return 1 // <script>', "js") ?? ""
    expect(html).not.toContain("<script>")
    expect(html.replace(/<span class="tok-[a-z]+">|<\/span>/g, "")).not.toMatch(/[<>"]/)
  })

  it("classifies keywords, strings, numbers, comments, calls and types", () => {
    const html =
      highlightCode('class Foo:\n    def go(self): return "s" + 42  # c\n', "python") ?? ""
    expect(html).toContain('<span class="tok-kw">class</span>')
    expect(html).toContain('<span class="tok-type">Foo</span>')
    expect(html).toContain('<span class="tok-fn">go</span>')
    expect(html).toContain('<span class="tok-str">&quot;s&quot;</span>')
    expect(html).toContain('<span class="tok-num">42</span>')
    expect(html).toContain('<span class="tok-com"># c</span>')
  })

  it("does not read digits inside identifiers as numbers", () => {
    const html = highlightCode("x1 = a2b3 + 7", "python") ?? ""
    expect(html).toContain('<span class="tok-num">7</span>')
    expect(html.match(/tok-num/g)?.length).toBe(1)
  })

  it("treats a JSON key differently from a JSON string value", () => {
    const html = highlightCode('{"k": "v"}', "json") ?? ""
    expect(html).toContain('<span class="tok-type">&quot;k&quot;</span>')
    expect(html).toContain('<span class="tok-str">&quot;v&quot;</span>')
  })

  it("matches SQL keywords regardless of case", () => {
    const html = highlightCode("select a from t", "sql") ?? ""
    expect(html).toContain('<span class="tok-kw">select</span>')
    expect(html).toContain('<span class="tok-kw">from</span>')
  })

  it("keeps an unterminated string from swallowing the rest of the file", () => {
    const html = highlightCode("x = 'oops\ny = 2\n", "python") ?? ""
    expect(html).toContain('<span class="tok-num">2</span>')
  })

  it("returns null for unknown languages and oversized blocks", () => {
    expect(highlightCode("x", "klingon")).toBeNull()
    expect(highlightCode("x".repeat(40_000), "python")).toBeNull()
  })
})
