import { describe, it, expect } from "vitest"
import {
  parseKeepMarks,
  stripKeepMarks,
  scanVaultKeepMarks,
  groupByCategory,
  categoriesOf,
  formatGlossary,
  blankExclusions,
  UNCATEGORIZED,
} from "./keepMarks"
import { toStorageMd, toStorageTex, toCmdxMd, toCmdxTex } from "./cmdxFormat"
import { renderMarkdown } from "./renderer"
import { exportToTex, exportReveal } from "./exporter"
import { toExportMarkdownContent, toPandocMarkdownInput } from "./exportConversion"
import { exportToObsidianMarkdown } from "./obsidianExport"
import { applyClozeDeletions, extractAnkiCards } from "./ankiExport"
import { processBlockIds } from "./transclusion"

describe("parseKeepMarks", () => {
  it("parses a mark with no category", () => {
    expect(parseKeepMarks("Esto es ^^importante^^ aquí.")).toEqual([
      { category: null, text: "importante", line: 1, index: 8, raw: "^^importante^^" },
    ])
  })

  it("extracts a freeform category from a `word: ` prefix", () => {
    const marks = parseKeepMarks("^^def: un grupo abeliano^^")
    expect(marks).toHaveLength(1)
    expect(marks[0].category).toBe("def")
    expect(marks[0].text).toBe("un grupo abeliano")
  })

  it("accepts user-invented categories, not a fixed enum", () => {
    const marks = parseKeepMarks("^^duda: revisar esto^^\n^^dato: 42^^\n^^keep: x^^")
    expect(marks.map((m) => m.category)).toEqual(["duda", "dato", "keep"])
  })

  it("lower-cases the category so grouping is stable", () => {
    expect(parseKeepMarks("^^Def: x^^")[0].category).toBe("def")
  })

  it("reports 1-based line numbers", () => {
    const marks = parseKeepMarks("uno\ndos ^^a^^\ntres\ncuatro ^^b^^")
    expect(marks.map((m) => m.line)).toEqual([2, 4])
  })

  it("finds several marks on one line, in document order", () => {
    expect(parseKeepMarks("^^a^^ y ^^def: b^^").map((m) => m.text)).toEqual(["a", "b"])
  })

  it("trims surrounding whitespace inside the delimiters", () => {
    expect(parseKeepMarks("^^   hola   ^^")[0].text).toBe("hola")
  })
})

describe("parseKeepMarks — edge cases (re-derived for the symmetric `^^`)", () => {
  // Decision 1 — THE important one for `^^`. A single caret is ordinary prose
  // ("2^10", "x^n"), so the inner text must be allowed to contain one.
  // Forbidding it (`[^^\n]*`) silently drops these marks.
  it("matches a mark whose text contains a caret", () => {
    const mark = parseKeepMarks("^^dato: 2^10 = 1024^^")[0]
    expect(mark.category).toBe("dato")
    expect(mark.text).toBe("2^10 = 1024")
    expect(stripKeepMarks("Vale ^^dato: 2^10 = 1024^^ aqui.")).toBe("Vale 2^10 = 1024 aqui.")
  })

  it("matches an uncategorized mark whose text contains a caret", () => {
    const mark = parseKeepMarks("^^x^n crece rapido^^")[0]
    expect(mark.category).toBeNull()
    expect(mark.text).toBe("x^n crece rapido")
  })

  it("does not false-positive on single carets in prose", () => {
    const src = "Compara x^2 con y^3 y con 2^10 fuera de math."
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  // Decision 2: a mark never spans a newline.
  it("ignores an unclosed `^^`", () => {
    expect(parseKeepMarks("texto ^^ sin cerrar")).toEqual([])
    expect(stripKeepMarks("texto ^^ sin cerrar")).toBe("texto ^^ sin cerrar")
  })

  it("does not let an unclosed `^^` reach a `^^` on a later line", () => {
    expect(parseKeepMarks("abre ^^ aqui\n\notro parrafo ^^ cierra")).toEqual([])
  })

  // Decision 3: symmetric delimiter → LEFTMOST-first pairing, not innermost.
  // This is genuinely different from what a paired `{{`/`}}` would do.
  it("pairs `^^a ^^b^^ c^^` leftmost-first into the marks 'a' and 'c'", () => {
    expect(parseKeepMarks("^^a ^^b^^ c^^").map((m) => m.text)).toEqual(["a", "c"])
    // Each mark's text is trimmed, so the delimiters collapse away entirely.
    expect(stripKeepMarks("^^a ^^b^^ c^^")).toBe("abc")
  })

  it("trims the mark text but leaves the surrounding prose spacing alone", () => {
    expect(stripKeepMarks("a ^^ b ^^ c")).toBe("a b c")
  })

  // Decision 4: nothing to keep.
  it("treats `^^^^` as literal text, not a mark", () => {
    expect(parseKeepMarks("^^^^")).toEqual([])
    expect(stripKeepMarks("^^^^")).toBe("^^^^")
  })

  it("treats an all-whitespace body `^^ ^^` as literal text, not a mark", () => {
    expect(parseKeepMarks("^^ ^^")).toEqual([])
    expect(stripKeepMarks("^^ ^^")).toBe("^^ ^^")
  })

  // Decision 5: a category needs whitespace after its colon.
  it("treats `ver` in `^^ver: esto y aquello^^` as a category", () => {
    const mark = parseKeepMarks("^^ver: esto y aquello^^")[0]
    expect(mark.category).toBe("ver")
    expect(mark.text).toBe("esto y aquello")
  })

  it("does NOT treat a colon with no following space as a category", () => {
    const mark = parseKeepMarks("^^ver:esto^^")[0]
    expect(mark.category).toBeNull()
    expect(mark.text).toBe("ver:esto")
  })

  it("does not invent a category from a URL scheme", () => {
    const mark = parseKeepMarks("^^https://example.com/a^^")[0]
    expect(mark.category).toBeNull()
    expect(mark.text).toBe("https://example.com/a")
  })

  it("keeps later colons in the text once a category is taken", () => {
    const mark = parseKeepMarks("^^nota: a: b^^")[0]
    expect(mark.category).toBe("nota")
    expect(mark.text).toBe("a: b")
  })

  it("allows accented and hyphenated category names", () => {
    expect(parseKeepMarks("^^revisión-final: x^^")[0].category).toBe("revisión-final")
  })
})

// `^` is LaTeX superscript, so math is the exclusion that carries real weight
// for this delimiter. These are the cases that would break if it ever lapsed.
describe("keep marks are never parsed inside math (superscript hazard)", () => {
  it("leaves a nested superscript `$x^{2^^3}$` untouched", () => {
    const src = "Sea $x^{2^^3}$ el valor."
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("leaves the plain typo `$x^^2$` untouched", () => {
    const src = "Sea $x^^2$ un error de tecleo."
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("leaves ordinary superscripts `$x^2$` / `$a^{n+1}$` untouched", () => {
    const src = "Con $x^2$ y $a^{n+1}$ y $e^{i\\pi}$."
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("leaves display math with doubled carets untouched", () => {
    const src = "$$\n\\sum_{i=1}^{n} x_i^{2^^3}\n$$"
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("still finds a real mark in the prose next to a superscript", () => {
    const marks = parseKeepMarks("Sea $x^{2^^3}$ el ^^def: exponente^^.")
    expect(marks).toHaveLength(1)
    expect(marks[0].category).toBe("def")
    expect(marks[0].text).toBe("exponente")
  })

  it("leaves display math untouched", () => {
    const src = "$$\n\\text{^^x^^} + 1\n$$"
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("does not disturb ordinary LaTeX braces (the old `{{` hazard)", () => {
    const src = "Sea $\\frac{{a}}{b}$ el cociente."
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("still finds a real mark in the prose next to math", () => {
    const marks = parseKeepMarks("Sea $\\frac{{a}}{b}$ el ^^def: cociente^^.")
    expect(marks).toHaveLength(1)
    expect(marks[0].category).toBe("def")
    expect(marks[0].text).toBe("cociente")
  })
})

describe("keep marks are never parsed inside code", () => {
  it("leaves an inline-code span `` `^^x^^` `` untouched", () => {
    const src = "Escribe `^^x^^` para marcar."
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("leaves a fenced code block untouched", () => {
    const src = "```python\nxor = a ^^ b\nrun(^^x^^)\n```"
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("leaves LaTeX superscripts in a fenced block untouched", () => {
    const src = "```latex\n$x^{2^^3}$ y $a^{n+1}$\n```"
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("leaves a tilde-fenced block untouched", () => {
    const src = "~~~\n^^no soy una marca^^\n~~~"
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("leaves an indented code block untouched", () => {
    const src = "Ejemplo:\n\n    render(^^name^^)\n\nfin."
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("still detects marks inside indented LIST content (not code)", () => {
    const src = "- item\n\n    - anidado ^^def: importante^^\n"
    expect(parseKeepMarks(src).map((m) => m.text)).toEqual(["importante"])
  })

  it("leaves ComdTeX special blocks (raw DSL bodies) untouched", () => {
    const src = ":::code\nint x = a ^^ b;\nfn(^^y^^)\n:::"
    expect(parseKeepMarks(src)).toEqual([])
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("finds marks after a fenced block closes", () => {
    const src = "```\n^^no^^\n```\n\nprosa ^^si^^"
    expect(parseKeepMarks(src).map((m) => m.text)).toEqual(["si"])
  })

  it("reports correct line numbers after exclusions are blanked", () => {
    const src = "```\n^^no^^\n^^tampoco^^\n```\n\nprosa ^^si^^"
    expect(parseKeepMarks(src)[0].line).toBe(6)
  })
})

// `^myid` at the end of a line is existing ComdTeX block-id syntax, and
// `processBlockIds` runs BEFORE `stripKeepMarks` in renderMarkdown. The two
// must not eat each other. `BLOCK_ID_TRAILING_RE` is /\s*\^([\w-]+)\s*$/, whose
// `[\w-]+` cannot match a `^` — that is what keeps them apart.
describe("keep marks and `^blockid` coexist", () => {
  it("does not mistake a line-ending keep mark for a block id", () => {
    const line = "Un texto ^^importante^^"
    expect(processBlockIds(line)).toBe(line)
    expect(parseKeepMarks(line).map((m) => m.text)).toEqual(["importante"])
  })

  it("does not mistake a categorized line-ending mark for a block id", () => {
    const line = "Un texto ^^def: grupo abeliano^^"
    expect(processBlockIds(line)).toBe(line)
  })

  it("parses both a mark and a trailing block id on one line", () => {
    const line = "^^a^^ ^blockid"
    expect(parseKeepMarks(line).map((m) => m.text)).toEqual(["a"])
    expect(processBlockIds(line)).toBe("^^a^^ <!--block:blockid-->")
  })

  it("keeps the mark intact through processBlockIds, then strips it", () => {
    const line = "Un ^^def: grupo^^ abeliano ^myid"
    const afterIds = processBlockIds(line)
    expect(afterIds).toBe("Un ^^def: grupo^^ abeliano <!--block:myid-->")
    expect(stripKeepMarks(afterIds)).toBe("Un grupo abeliano <!--block:myid-->")
  })

  it("leaves a bare block id alone (no mark)", () => {
    const line = "Un parrafo normal ^key-finding"
    expect(parseKeepMarks(line)).toEqual([])
    expect(stripKeepMarks(line)).toBe(line)
  })

  it("renders a marked paragraph carrying a block id like unmarked prose", () => {
    const marked = renderMarkdown("Un ^^def: grupo^^ abeliano. ^key-finding")
    const plain = renderMarkdown("Un grupo abeliano. ^key-finding")
    expect(marked).toBe(plain)
  })
})

describe("blankExclusions", () => {
  it("preserves length and line structure exactly", () => {
    const src = "a `^^x^^` b\n$$\n\\frac{{a}}{b}\n$$\nfin ^^y^^"
    const blanked = blankExclusions(src)
    expect(blanked).toHaveLength(src.length)
    expect(blanked.split("\n")).toHaveLength(src.split("\n").length)
    expect(blanked).toContain("^^y^^")
    expect(blanked).not.toContain("^^x^^")
  })
})

describe("stripKeepMarks", () => {
  it("removes the delimiters and leaves the text", () => {
    expect(stripKeepMarks("Esto es ^^importante^^ aquí.")).toBe("Esto es importante aquí.")
  })

  it("removes the category prefix too", () => {
    expect(stripKeepMarks("Un ^^def: grupo abeliano^^ es…")).toBe("Un grupo abeliano es…")
  })

  it("is a no-op on text with no marks", () => {
    const src = "# Título\n\nProsa normal con $x^2$ y `código` y 2^10 bytes."
    expect(stripKeepMarks(src)).toBe(src)
  })

  it("never emits delimiters for a stripped mark", () => {
    const out = stripKeepMarks("a ^^x^^ b ^^duda: y^^ c")
    expect(out).toBe("a x b y c")
    expect(out).not.toContain("^^")
  })
})

// ── Hazard: round-trip through save ─────────────────────────────────────────
// Keep marks are inline prose. The storage conversions in cmdxFormat.ts are
// line/block-oriented (`:::env` ↔ callouts) plus `name(` shorthand expansion —
// none of them can see `^^…^^`. So a mark needs NO maskSpecialBlocks handling;
// these tests are the proof, and the regression guard if that ever changes.
describe("round-trip through save (cmdxFormat)", () => {
  const doc = "Un ^^def: grupo abeliano^^ y una ^^duda: revisar^^ y ^^simple^^.\n"

  it("survives a CMDX → .md → CMDX round-trip verbatim", () => {
    expect(toCmdxMd(toStorageMd(doc))).toBe(doc)
  })

  it("survives a CMDX → .tex → CMDX round-trip verbatim", () => {
    expect(toCmdxTex(toStorageTex(doc))).toBe(doc)
  })

  it("survives a round-trip inside an environment body", () => {
    const src = ":::theorem[Cauchy]\nSi ^^dato: f es continua^^ entonces…\n:::"
    expect(toCmdxMd(toStorageMd(src))).toContain("^^dato: f es continua^^")
  })

  it("is not flattened into a callout on save", () => {
    expect(toStorageMd(doc)).toContain("^^def: grupo abeliano^^")
    expect(toStorageMd(doc)).not.toContain("[!note]")
  })

  it("does not corrupt LaTeX braces on a .tex round-trip", () => {
    const src = "Sea $\\frac{{a}}{b}$ el ^^def: cociente^^.\n"
    expect(toCmdxTex(toStorageTex(src))).toContain("\\frac{{a}}{b}")
  })

  it("survives a round-trip with a caret in the text", () => {
    const src = "El ^^dato: 2^10 = 1024^^ importa.\n"
    expect(toCmdxMd(toStorageMd(src))).toBe(src)
  })
})

// ── Hazard: invisibility in the preview ─────────────────────────────────────
describe("render invisibility", () => {
  it("renders a marked fragment exactly like unmarked prose", () => {
    const marked = renderMarkdown("Esto es ^^importante^^ aquí.")
    const plain = renderMarkdown("Esto es importante aquí.")
    expect(marked).toBe(plain)
  })

  it("renders a categorized mark exactly like unmarked prose", () => {
    const marked = renderMarkdown("Un ^^def: grupo abeliano^^ es conmutativo.")
    const plain = renderMarkdown("Un grupo abeliano es conmutativo.")
    expect(marked).toBe(plain)
  })

  it("never leaks delimiters into the preview", () => {
    const html = renderMarkdown("Un ^^duda: revisar esto^^ y ^^otro^^.")
    expect(html).not.toContain("^^")
    expect(html).toContain("revisar esto")
  })

  it("adds no class, span or attribute of its own", () => {
    expect(renderMarkdown("a ^^b^^ c")).not.toMatch(/keep/i)
  })

  it("leaves `$\\frac{{a}}{b}$` rendering as math", () => {
    const marked = renderMarkdown("Sea $\\frac{{a}}{b}$ el ^^def: cociente^^.")
    const plain = renderMarkdown("Sea $\\frac{{a}}{b}$ el cociente.")
    expect(marked).toBe(plain)
  })

  it("leaves `` `^^x^^` `` visible as literal code in the preview", () => {
    expect(renderMarkdown("Escribe `^^x^^` para marcar.")).toContain("^^x^^")
  })

  it("leaves a fenced code sample of the syntax intact", () => {
    expect(renderMarkdown("```\n^^def: ejemplo^^\n```")).toContain("^^def: ejemplo^^")
  })

  it("works inside an environment body", () => {
    const marked = renderMarkdown(":::theorem[T]\nSi ^^dato: f continua^^ entonces…\n:::")
    const plain = renderMarkdown(":::theorem[T]\nSi f continua entonces…\n:::")
    expect(marked).toBe(plain)
  })
})

// ── Hazard: export stripping ────────────────────────────────────────────────
describe("export stripping", () => {
  const doc = "Un ^^def: grupo abeliano^^ y una ^^duda: revisar^^."

  it("strips marks from the LaTeX export", () => {
    const tex = exportToTex(doc)
    expect(tex).toContain("grupo abeliano")
    expect(tex).not.toContain("^^")
  })

  it("strips marks from the Reveal.js export", () => {
    const html = exportReveal(doc, "Demo")
    expect(html).toContain("grupo abeliano")
    expect(html).not.toContain("^^")
  })

  it("strips marks from the Markdown export", () => {
    const md = toExportMarkdownContent(doc)
    expect(md).toContain("grupo abeliano")
    expect(md).not.toContain("^^")
  })

  it("strips marks from the Pandoc input (docx/beamer/typst/pdf)", () => {
    const md = toPandocMarkdownInput(doc)
    expect(md).toContain("grupo abeliano")
    expect(md).not.toContain("^^")
  })

  it("strips marks from the Obsidian export", () => {
    const md = exportToObsidianMarkdown(doc)
    expect(md).toContain("grupo abeliano")
    expect(md).not.toContain("^^")
  })

  it("strips marks from the HTML export path (renderMarkdown)", () => {
    expect(renderMarkdown(doc)).not.toContain("^^")
  })

  it("keeps LaTeX braces in the .tex export", () => {
    expect(exportToTex("Sea $\\frac{{a}}{b}$ el ^^def: cociente^^.")).toContain("\\frac{{a}}{b}")
  })

  it("keeps a code sample of the syntax in the Markdown export", () => {
    expect(toExportMarkdownContent("Escribe `^^x^^` así.")).toContain("^^x^^")
  })
})

// ── Hazard: the Anki cloze collision that motivated the `^^` delimiter ───────
// `{{X}}` inside a :::definition is Anki's cloze syntax. Keep marks used to
// share that delimiter, which meant a mark inside a definition silently became
// a cloze whose answer read "def: …". `^^` makes the two disjoint.
describe("Anki cloze and keep marks are disjoint", () => {
  it("leaves an Anki cloze completely untouched by the keep parser", () => {
    const body = "Un {{grupo abeliano}} es conmutativo."
    expect(parseKeepMarks(body)).toEqual([])
    expect(stripKeepMarks(body)).toBe(body)
  })

  it("still converts `{{X}}` clozes inside a :::definition", () => {
    const cards = extractAnkiCards(":::definition[Grupo]\nUn {{grupo abeliano}} es conmutativo.\n:::")
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe("Cloze")
    expect(cards[0].back).toBe("Un {{c1::grupo abeliano}} es conmutativo.")
  })

  it("does NOT turn a `^^…^^` keep mark inside a definition into a cloze", () => {
    const cards = extractAnkiCards(":::definition[Grupo]\nUn ^^def: grupo abeliano^^ es conmutativo.\n:::")
    expect(cards).toHaveLength(1)
    expect(cards[0].type).toBe("Basic")
    expect(cards[0].back).toBe("Un grupo abeliano es conmutativo.")
  })

  it("never leaks keep-mark delimiters into an exported card", () => {
    const cards = extractAnkiCards(":::theorem[T]\nSi ^^dato: f continua^^ entonces…\n:::")
    expect(cards[0].back).not.toContain("^^")
    expect(cards[0].back).toBe("Si f continua entonces…")
  })

  it("lets a cloze and a keep mark coexist in one definition", () => {
    const cards = extractAnkiCards(":::definition[G]\nUn {{grupo}} ^^duda: revisar^^ abeliano.\n:::")
    expect(cards[0].type).toBe("Cloze")
    expect(cards[0].back).toBe("Un {{c1::grupo}} revisar abeliano.")
  })

  it("keeps applyClozeDeletions itself blind to keep marks", () => {
    expect(applyClozeDeletions("un ^^x^^ y")).toEqual({ body: "un ^^x^^ y", hasCloze: false })
  })
})

describe("scanVaultKeepMarks", () => {
  const files = [
    { path: "/v/a.md", name: "a.md", content: "Un ^^def: grupo^^ aquí.\ny ^^duda: esto?^^" },
    { path: "/v/b.md", name: "b.md", content: "# B\n\n^^def: anillo^^ y ^^suelto^^" },
    { path: "/v/c.md", name: "c.md", content: "sin marcas" },
  ]

  it("collects marks across the whole vault with file + line", () => {
    const entries = scanVaultKeepMarks(files)
    expect(entries).toHaveLength(4)
    expect(entries[0]).toMatchObject({ filePath: "/v/a.md", fileName: "a.md", line: 1, text: "grupo" })
    expect(entries[3]).toMatchObject({ fileName: "b.md", line: 3, text: "suelto", category: null })
  })

  it("groups by category", () => {
    const groups = groupByCategory(scanVaultKeepMarks(files))
    expect(groups.get("def")?.map((e) => e.text)).toEqual(["grupo", "anillo"])
    expect(groups.get("duda")?.map((e) => e.text)).toEqual(["esto?"])
    expect(groups.get(UNCATEGORIZED)?.map((e) => e.text)).toEqual(["suelto"])
  })

  it("lists categories sorted, with uncategorized last", () => {
    expect(categoriesOf(scanVaultKeepMarks(files))).toEqual(["def", "duda", UNCATEGORIZED])
  })

  it("omits uncategorized when every mark has a category", () => {
    expect(categoriesOf(scanVaultKeepMarks([files[0]]))).toEqual(["def", "duda"])
  })

  it("returns nothing for a vault with no marks", () => {
    expect(scanVaultKeepMarks([files[2]])).toEqual([])
  })
})

describe("formatGlossary", () => {
  it("renders a grouped Markdown glossary", () => {
    const entries = scanVaultKeepMarks([
      { path: "/v/a.md", name: "a.md", content: "^^def: grupo^^ y ^^suelto^^" },
    ])
    const md = formatGlossary(entries, { title: "Glosario", uncategorized: "Sin categoría" })
    expect(md).toContain("# Glosario")
    expect(md).toContain("## def")
    expect(md).toContain("- grupo — `a.md:1`")
    expect(md).toContain("## Sin categoría")
    expect(md).toContain("- suelto — `a.md:1`")
    expect(md).not.toContain(UNCATEGORIZED)
  })
})
