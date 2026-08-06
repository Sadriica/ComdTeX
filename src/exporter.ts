/**
 * Export ComdTeX documents to compilable LaTeX (.tex).
 *
 * Pipeline:
 *  1. Extract :::env blocks → LaTeX environments
 *  2. preprocess() shorthands
 *  3. Parse with markdown-it
 *  4. Convert tokens → LaTeX
 *  5. Wrap in \documentclass template with correct preamble
 */

import MarkdownIt from "markdown-it"
import footnotePlugin from "markdown-it-footnote"
import markPlugin from "markdown-it-mark"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Token = any
import { preprocess } from "./preprocessor"
import { ALL_ENVS, envToLatex, buildTheoremPreamble } from "./environments"
import { extractFrontmatter } from "./frontmatter"
import { preprocessFigureLabels } from "./figures"
import { stripKeepMarks } from "./keepMarks"
import { pickCiteStyle } from "./citeStyles"

interface LatexMacro {
  command: string
  arity: number
  definition: string
}

// `html: true` mirrors renderer.ts: it is what lets `<mark class="hl-…">`
// and `<u>` reach the exporter as html_inline tokens instead of surviving as
// literal, unescaped angle brackets in the .tex body (see the html_inline
// case in inlineToTex, which only special-cases those two tags and drops
// anything else, same as the old html:false behavior did for raw HTML).
// footnotePlugin/markPlugin are the same plugins renderer.ts uses for
// `[^id]` footnotes and `==highlight==`, so a preview that renders them
// correctly now exports correctly too.
const md = new MarkdownIt({ html: true, linkify: false, typographer: false })
  .use(footnotePlugin)
  .use(markPlugin)
  .enable("table")
  .enable("strikethrough")

/** Coloured `<mark class="hl-X">` classes → xcolor color!percent. Unknown
 * classes (or the base `==highlight==`, handled separately via \hl{}) fall
 * back to a plain yellow wash, matching the preview's default highlight. */
const HL_COLORS: Record<string, string> = {
  green: "green!30",
  blue: "blue!20",
  purple: "purple!20",
  orange: "orange!30",
  red: "red!20",
  pink: "pink!40",
}
function hlColorFor(cls: string): string {
  return HL_COLORS[cls] ?? "yellow!40"
}

/** `> [!type] Title` callout kind → tcolorbox accent color. */
const CALLOUT_COLORS: Record<string, string> = {
  note: "blue", info: "blue",
  tip: "teal", hint: "teal",
  warning: "orange", caution: "orange", attention: "orange", important: "orange",
  danger: "red", failure: "red", error: "red",
  success: "green", check: "green", done: "green",
  question: "purple", help: "purple", faq: "purple",
  quote: "gray", cite: "gray",
}
function calloutColorFor(type: string): string {
  return CALLOUT_COLORS[type] ?? "gray"
}

// ── LaTeX escaping ────────────────────────────────────────────────────────────

export function escTex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
}

function refToTex(prefix: string, id: string): string {
  const label = `${prefix}:${id}`
  if (prefix === "eq") return `\\eqref{${label}}`
  if (prefix === "fig") return `Figura~\\ref{${label}}`
  if (prefix === "tbl") return `Tabla~\\ref{${label}}`
  if (prefix === "sec") return `sección~\\ref{${label}}`
  const envNames: Record<string, string> = {
    thm: "Teorema",
    theorem: "Teorema",
    lem: "Lema",
    lemma: "Lema",
    cor: "Corolario",
    prop: "Proposición",
    def: "Definición",
    definition: "Definición",
    ex: "Ejemplo",
    example: "Ejemplo",
    exc: "Ejercicio",
    exercise: "Ejercicio",
  }
  return envNames[prefix] ? `${envNames[prefix]}~\\ref{${label}}` : `@${label}`
}

const ENV_REF_NAMES: Record<string, string> = {
  thm: "Teorema",
  theorem: "Teorema",
  lem: "Lema",
  lemma: "Lema",
  cor: "Corolario",
  prop: "Proposición",
  def: "Definición",
  definition: "Definición",
  ex: "Ejemplo",
  example: "Ejemplo",
  exc: "Ejercicio",
  exercise: "Ejercicio",
}

/**
 * Cross-file ref (`@gp/calendario@def:x`) → LaTeX.
 *
 * A `\ref{def:x}` here would be a DANGLING reference: the target environment
 * lives in another vault document and is not part of this single-file export,
 * so LaTeX would silently typeset "??". We cannot resolve the target's NUMBER
 * either: that is a property of the other file, and this export path is
 * synchronous with no vault resolver threaded through it.
 *
 * So the ref degrades to an honest plain-text mention naming the source
 * document: `Definición~(gp/calendario)`. It compiles, it carries no broken
 * cross-reference, and it tells the reader where the result lives.
 */
function crossRefToTex(docPath: string, prefix: string, id: string): string {
  const name = ENV_REF_NAMES[prefix]
  if (!name) return escTex(`@${docPath}@${prefix}:${id}`)
  return `${name}~(${escTex(docPath)})`
}

// Set while converting a document: tells exportToTex whether to emit the
// bibliography commands. Reset at the start of every export.
let citedInLastPass = false

function textRefsToTex(text: string): string {
  const out: string[] = []
  // Citations first: `[@key]` and `[@key, p. 321]` become real \cite, which
  // is what makes the bibliography work in the PDF. They are matched here,
  // with the other refs, so the surrounding prose still gets escaped exactly
  // once (a separate pass would escape the emitted macro).
  //
  // Cross-file @refs come before local ones, otherwise the local pattern
  // matches the INNER `@def:x` of `@doc@def:x` and emits a dangling
  // `\ref{def:x}` while leaving `@doc` as escaped prose.
  const re = /\[@([\w:.-]+)(?:,\s*([^\]]*))?\]|@(?:\[([^\]\n]+)\]|([A-Za-z0-9_./-]+))@([a-zA-Z]+):([\w.-]+)|@([a-zA-Z]+):([\w-]+(?:\.[\w-]+)*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(escTex(text.slice(last, m.index)))
    if (m[1] !== undefined) {
      // `[@key, p. 321]` becomes \cite[p. 321]{key}: LaTeX's own way of
      // carrying a locator, so every citation style renders it correctly.
      const note = m[2]?.trim()
      out.push(note ? `\\cite[${escTex(note)}]{${m[1]}}` : `\\cite{${m[1]}}`)
      citedInLastPass = true
    } else if (m[5] !== undefined) {
      out.push(crossRefToTex((m[3] ?? m[4] ?? "").trim(), m[5], m[6]))
    } else {
      out.push(refToTex(m[7], m[8]))
    }
    last = m.index + m[0].length
  }
  out.push(escTex(text.slice(last)))
  return out.join("")
}

/** Escape only the non-math parts of a text string. */
function textToTex(text: string): string {
  const parts: string[] = []
  let last = 0
  const re = /\$\$([\s\S]+?)\$\$(?:\s*\{#(eq:[\w:.-]+)\})?|\$([^\$\n]+?)\$/g
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    parts.push(textRefsToTex(text.slice(last, m.index)))
    if (m[1] !== undefined) {
      parts.push(m[2]
        ? `\\begin{equation}\n${m[1].trim()}\n\\label{${m[2]}}\n\\end{equation}`
        : `\\[\n${m[1].trim()}\n\\]`)
    } else {
      parts.push(`$${m[3]}$`)
    }
    last = m.index + m[0].length
  }

  parts.push(textRefsToTex(text.slice(last)))
  return parts.join("")
}

// ── Inline token → LaTeX ──────────────────────────────────────────────────────

// Only these two tags are recognized raw HTML; the toolbar's "Textos" menu is
// the only place that inserts them, so the vocabulary is closed. Anything
// else is dropped, matching the old html:false behavior (which never saw raw
// HTML at all).
const MARK_OPEN_RE = /^<mark\s+class="hl-([\w-]+)"\s*>$/i
const MARK_CLOSE_RE = /^<\/mark>$/i
const U_OPEN_RE = /^<u>$/i
const U_CLOSE_RE = /^<\/u>$/i

function inlineToTex(tokens: Token[], footnotes: Map<number, string> = new Map()): string {
  let out = ""
  for (const tok of tokens) {
    switch (tok.type) {
      case "text":         out += textToTex(tok.content); break
      case "softbreak":    out += "\n"; break
      case "hardbreak":    out += "\\\\\n"; break
      case "code_inline":  out += `\\texttt{${escTex(tok.content)}}`; break
      case "strong_open":  out += "\\textbf{"; break
      case "strong_close": out += "}"; break
      case "em_open":       out += "\\textit{"; break
      case "em_close":      out += "}"; break
      case "s_open":        out += "\\sout{"; break
      case "s_close":       out += "}"; break
      // markdown-it-mark: `==text==` → \hl{} (soul package).
      case "mark_open":     out += "\\hl{"; break
      case "mark_close":    out += "}"; break
      case "link_open":    out += `\\href{${tok.attrGet("href") ?? ""}}{`; break
      case "link_close":   out += "}"; break
      case "image":
        {
          const src = tok.attrGet("src") ?? ""
          const alt = tok.content ?? ""
          const title = tok.attrGet("title") ?? ""
          const label = /^fig-label:(fig:[\w:.-]+)$/.exec(title)?.[1]
          out += [
            "\\begin{figure}[htbp]",
            "\\centering",
            `\\includegraphics[width=0.9\\linewidth]{${escTex(src)}}`,
            alt ? `\\caption{${escTex(alt)}}` : "",
            label ? `\\label{${label}}` : "",
            "\\end{figure}",
          ].filter(Boolean).join("\n")
        }
        break
      // `[^id]` markers become real footnotes; the definition body was
      // extracted into `footnotes` by extractFootnotes() before this ran, so
      // the orphan `[^id]: ...` line never reaches the body as text.
      case "footnote_ref":
        out += `\\footnote{${footnotes.get(tok.meta?.id) ?? ""}}`
        break
      case "html_inline": {
        const raw: string = tok.content
        const markOpen = MARK_OPEN_RE.exec(raw)
        if (markOpen) out += `\\colorbox{${hlColorFor(markOpen[1].toLowerCase())}}{`
        else if (MARK_CLOSE_RE.test(raw)) out += "}"
        else if (U_OPEN_RE.test(raw)) out += "\\underline{"
        else if (U_CLOSE_RE.test(raw)) out += "}"
        // else: skip raw HTML we don't have a LaTeX mapping for
        break
      }
    }
  }
  return out
}

// ── Block tokens → LaTeX ──────────────────────────────────────────────────────

function tokensToTex(tokens: Token[], envSlots: Map<string, string>, footnotes: Map<number, string> = new Map()): string {
  const out: string[] = []
  let i = 0

  // Generic slot restore: env blocks (`ENV0`, …) and callouts (`CALLOUT0`, …)
  // both go through extractEnvBlocks/extractCallouts, which stash rendered
  // LaTeX in envSlots keyed by the placeholder they left in the text.
  const restoreEnv = (text: string) =>
    text.replace(/\x02(\w+)\x03/g, (_, key) => envSlots.get(key) ?? "")

  while (i < tokens.length) {
    const tok = tokens[i]

    switch (tok.type) {
      // ── Headings ──────────────────────────────────────────────────────────
      case "heading_open": {
        const level = parseInt(tok.tag.slice(1))
        const cmds = ["section", "subsection", "subsubsection", "paragraph", "subparagraph"]
        const cmd = cmds[level - 1] ?? "subparagraph"
        const inline = tokens[i + 1]
        const rawText = (inline.children ?? []).map((child: Token) => child.content ?? "").join("")
        const label = /\s*\{#(sec:[\w:.-]+)\}\s*$/.exec(rawText)?.[1]
        const cleanChildren = label
          ? (inline.children ?? []).map((child: Token) =>
              child.type === "text" ? { ...child, content: child.content.replace(/\s*\{#sec:[\w:.-]+\}\s*$/, "") } : child)
          : (inline.children ?? [])
        out.push(`\\${cmd}{${inlineToTex(cleanChildren, footnotes)}}${label ? `\n\\label{${label}}` : ""}\n`)
        i += 2
        break
      }
      case "heading_close": break

      // ── Paragraphs ────────────────────────────────────────────────────────
      case "paragraph_open": break
      case "paragraph_close": out.push(""); break

      case "inline": {
        const content = restoreEnv(inlineToTex(tok.children ?? [], footnotes))
        out.push(content)
        break
      }

      // ── Lists ─────────────────────────────────────────────────────────────
      case "bullet_list_open":   out.push("\\begin{itemize}"); break
      case "bullet_list_close":  out.push("\\end{itemize}\n"); break
      case "ordered_list_open":  out.push("\\begin{enumerate}"); break
      case "ordered_list_close": out.push("\\end{enumerate}\n"); break
      case "list_item_open":     out.push("\\item "); break
      case "list_item_close":    break

      // ── Blockquote ────────────────────────────────────────────────────────
      case "blockquote_open":  out.push("\\begin{quote}"); break
      case "blockquote_close": out.push("\\end{quote}\n"); break

      // ── Code ──────────────────────────────────────────────────────────────
      case "code_block":
        out.push(`\\begin{verbatim}\n${tok.content}\\end{verbatim}\n`)
        break
      case "fence": {
        const lang = tok.info.trim()
        if (lang) {
          out.push(`\\begin{lstlisting}[language=${lang}]\n${tok.content}\\end{lstlisting}\n`)
        } else {
          out.push(`\\begin{lstlisting}\n${tok.content}\\end{lstlisting}\n`)
        }
        break
      }

      // ── HR ────────────────────────────────────────────────────────────────
      case "hr":
        out.push("\\hrulefill\n")
        break

      // ── Tables ────────────────────────────────────────────────────────────
      case "table_open": {
        // Collect all table rows to determine column count
        const rows: string[][] = []
        let j = i + 1

        while (j < tokens.length && tokens[j].type !== "table_close") {
          if (tokens[j].type === "tr_open") {
            const cells: string[] = []
            j++
            while (tokens[j].type !== "tr_close") {
              if (tokens[j].type === "th_open" || tokens[j].type === "td_open") {
                j++
                cells.push(inlineToTex(tokens[j].children ?? [], footnotes))
                j++ // close tag
              }
              j++
            }
            rows.push(cells)
          }
          j++
        }

        if (rows.length > 0) {
          const labelToken = tokens[j + 2]
          const label = labelToken?.type === "inline"
            ? /^\{#(tbl:[\w:.-]+)\}$/.exec(labelToken.content.trim())?.[1]
            : undefined
          const cols = Math.max(...rows.map((r) => r.length))
          const colSpec = Array(cols).fill("l").join(" | ")
          if (label) out.push("\\begin{table}[htbp]\n\\centering")
          out.push(`\\begin{tabular}{| ${colSpec} |}`)
          out.push("\\hline")
          rows.forEach((row, ri) => {
            // Pad short rows with empty cells to avoid invalid LaTeX
            const padded = row.concat(Array(cols - row.length).fill(""))
            out.push(padded.join(" & ") + " \\\\")
            if (ri === 0) out.push("\\hline")
          })
          out.push("\\hline")
          out.push("\\end{tabular}\n")
          if (label) {
            out.push(`\\caption{${escTex(label.replace(/^tbl:/, ""))}}`)
            out.push(`\\label{${label}}`)
            out.push("\\end{table}\n")
            i = j + 3
            break
          }
        }

        i = j
        break
      }
      case "table_close": break

      default: break
    }

    i++
  }

  return out.join("\n")
}

// ── Footnote extraction ───────────────────────────────────────────────────────

/**
 * `[^id]` references + `[^id]: definition` (or inline `^[...]`) footnotes,
 * pulled out of the token stream produced by markdown-it-footnote.
 *
 * The plugin already does the hard part: `footnote_tail` (its core rule)
 * filters the orphan `[^id]: text` definition line OUT of the main token
 * stream and re-attaches its content, rendered, as a trailing
 * footnote_block_open…footnote_block_close run at the very end of the
 * document. That is exactly "drop the orphan definition lines from the
 * body" for free; we only need to (a) capture each definition's LaTeX so
 * the `footnote_ref` inline token can inline it as `\footnote{...}`, and
 * (b) remove the trailing block so it doesn't ALSO print at the end of the
 * document as a second, unwanted copy.
 */
function extractFootnotes(tokens: Token[]): { tokens: Token[]; footnotes: Map<number, string> } {
  const footnotes = new Map<number, string>()
  const openIdx = tokens.findIndex((t) => t.type === "footnote_block_open")
  if (openIdx === -1) return { tokens, footnotes }
  const closeIdx = tokens.findIndex((t) => t.type === "footnote_block_close")
  if (closeIdx === -1) return { tokens, footnotes }

  let i = openIdx
  while (i <= closeIdx) {
    const tok = tokens[i]
    if (tok.type === "footnote_open") {
      const id = tok.meta.id
      const parts: string[] = []
      i++
      while (i <= closeIdx && tokens[i].type !== "footnote_close") {
        if (tokens[i].type === "inline") {
          // A footnote's own content may itself contain nested markup
          // (bold, math, citations); it goes through the same inlineToTex
          // escaping as everything else, just with no nested footnotes.
          parts.push(inlineToTex(tokens[i].children ?? []))
        }
        i++
      }
      footnotes.set(id, parts.join("\n\n").trim())
    }
    i++
  }

  const remaining = tokens.slice(0, openIdx).concat(tokens.slice(closeIdx + 1))
  return { tokens: remaining, footnotes }
}

// ── Callout extraction ────────────────────────────────────────────────────────
//
// `> [!type] Title` blockquotes (renderer.ts preprocessCallouts's syntax)
// become a tcolorbox, extracted BEFORE markdown-it ever sees the lines, the
// same way :::env blocks are: a document-level scan replaces the whole
// callout with a `\x02CALLOUTn\x03` placeholder, and its body is converted
// to LaTeX recursively via mdToTex so nested markup inside still works.
// Left as ordinary blockquotes, `> [!warning] Ojo` would fall through the
// plain "\begin{quote}" case with the "[!warning] Ojo" marker printed as
// literal text.

function extractCallouts(text: string): { text: string; slots: Map<string, string> } {
  const slots = new Map<string, string>()
  const lines = text.split("\n")
  const out: string[] = []
  let n = 0
  let i = 0

  while (i < lines.length) {
    const opener = /^>\s*\[!([\w]+)\](.*)$/.exec(lines[i])
    if (!opener) {
      out.push(lines[i])
      i++
      continue
    }

    const type = opener[1].toLowerCase()
    const titleRest = opener[2].trim()
    const title = titleRest || (type.charAt(0).toUpperCase() + type.slice(1))

    const bodyLines: string[] = []
    i++
    while (i < lines.length && /^>\s?/.test(lines[i])) {
      bodyLines.push(lines[i].replace(/^>\s?/, ""))
      i++
    }

    const innerTex = mdToTex(bodyLines.join("\n").trim())
    const key = `CALLOUT${n++}`
    slots.set(key, [
      `\\begin{tcolorbox}[colback=${calloutColorFor(type)}!10,colframe=${calloutColorFor(type)}!60!black,title=${escTex(title)}]`,
      innerTex,
      "\\end{tcolorbox}",
    ].join("\n"))
    out.push(`\x02${key}\x03`)
  }

  return { text: out.join("\n"), slots }
}

// ── Environment extraction ────────────────────────────────────────────────────

function extractEnvBlocks(text: string): { text: string; slots: Map<string, string> } {
  const slots = new Map<string, string>()
  let n = 0

  const result = text.replace(
    /^:::(?:(?:sm|lg)\s+)?([\w]+)(?:\[([^\]]*)\])?(?:\s*\{#([\w:.-]+)\})?\s*\n([\s\S]*?)^:::\s*$/gm,
    (_, rawName, title, label, content) => {
      const envName = rawName.toLowerCase()
      if (!ALL_ENVS[envName]) return _

      // Convert inner content to LaTeX recursively
      const innerTex = mdToTex(content.trim())
      const latexBlock = envToLatex(envName, title ?? "", innerTex, label ?? undefined)
      const key = `ENV${n++}`
      slots.set(key, latexBlock)
      return `\x02${key}\x03`
    }
  )

  return { text: result, slots }
}

// ── Main conversion ───────────────────────────────────────────────────────────

function mdToTex(raw: string): string {
  const { text: afterEnv, slots: envSlots } = extractEnvBlocks(raw)
  // Callouts run after :::env extraction (so a callout nested inside an env
  // block is handled by that env's own recursive mdToTex call, not here) but
  // before markdown-it ever parses the blockquote lines.
  const { text, slots: calloutSlots } = extractCallouts(afterEnv)
  const slots = new Map([...envSlots, ...calloutSlots])
  const tableSafeText = text.replace(
    /((?:^\s*\|.*\|\s*\n)+)\s*\{#(tbl:[\w:.-]+)\}/gm,
    (_match, tableRows, label) => `${tableRows}\n{#${label}}\n`,
  )
  const preprocessed = preprocess(preprocessFigureLabels(tableSafeText), "tex")
  let tokens
  try {
    tokens = md.parse(preprocessed, {})
  } catch {
    tokens = md.parse(raw, {})
  }
  const { tokens: bodyTokens, footnotes } = extractFootnotes(tokens)
  return tokensToTex(bodyTokens, slots, footnotes)
}

/** Which science packages the generated body actually needs. */
export interface SciPackages {
  units: boolean
  chem: boolean
  tables: boolean
}

export function detectSciPackages(texBody: string): SciPackages {
  return {
    units: /\\(qty|num|unit|SI|si)\{/.test(texBody),
    chem: /\\ce\{/.test(texBody),
    tables: /\\begin\{(longtable|tabular)\}/.test(texBody),
  }
}

/** Which text-feature packages the generated body actually needs. */
export interface FeaturePackages {
  callouts: boolean       // tcolorbox, for `> [!note]` and friends
  soulHighlight: boolean  // soul, for `==highlight==` → \hl{}
  colorHighlight: boolean // xcolor, for `<mark class="hl-…">` → \colorbox{}
}

export function detectFeaturePackages(texBody: string): FeaturePackages {
  return {
    callouts: /\\begin\{tcolorbox\}/.test(texBody),
    soulHighlight: /\\hl\{/.test(texBody),
    colorHighlight: /\\colorbox\{/.test(texBody),
  }
}

/** BibTeX style file matching a citation style. */
function bibStyleFor(style: { id: string }): string {
  switch (style.id) {
    case "vancouver":
    case "ama":
      return "unsrt"
    case "apa":
      return "apalike"
    case "author-year":
      return "plainnat"
    default:
      return "plain"
  }
}

// ── Journal document classes ──────────────────────────────────────────────────
//
// A document may pick its export class via frontmatter: `comdtex.texclass:
// ieeetran | acmart | elsarticle | apa7`. Each class carries its own
// documentclass line, title-block grammar and theorem policy, so the exported
// .tex compiles against the real journal class on Overleaf/TeX Live without
// hand edits. Without the key, the export is byte-identical to the classic
// article preamble below.

export type TexClassId = "ieeetran" | "acmart" | "elsarticle" | "apa7"

interface TexClass {
  documentclass: string
  // acmart loads amsthm and predefines theorem/lemma/etc; redefining them is
  // a hard LaTeX error, so such classes only get the envs they lack.
  theoremPolicy: "full" | "supplement-only"
  titleBlock: (title: string, author: string) => string
  maketitle: boolean
}

const THEOREM_SUPPLEMENT = [
  "\\newtheorem*{exercise}{Ejercicio}",
  "\\newtheorem*{remark}{Observación}",
  "\\newtheorem*{note}{Nota}",
].join("\n")

export const TEX_CLASSES: Record<TexClassId, TexClass> = {
  ieeetran: {
    documentclass: "\\documentclass[conference]{IEEEtran}",
    theoremPolicy: "full",
    titleBlock: (title, author) =>
      `\\title{${escTex(title)}}\n\\author{\\IEEEauthorblockN{${escTex(author) || "Author"}}}\n`,
    maketitle: true,
  },
  acmart: {
    documentclass: "\\documentclass[sigconf]{acmart}",
    theoremPolicy: "supplement-only",
    titleBlock: (title, author) =>
      `\\title{${escTex(title)}}\n\\author{${escTex(author) || "Author"}}\n`,
    maketitle: true,
  },
  elsarticle: {
    documentclass: "\\documentclass[preprint,12pt]{elsarticle}",
    theoremPolicy: "full",
    // elsarticle takes its title and authors inside a frontmatter
    // environment in the document body and has no \maketitle.
    titleBlock: () => "",
    maketitle: false,
  },
  apa7: {
    documentclass: "\\documentclass[man]{apa7}",
    theoremPolicy: "full",
    titleBlock: (title, author) =>
      `\\title{${escTex(title)}}\n\\authorsnames{${escTex(author) || "Author"}}\n\\authorsaffiliations{{~}}\n`,
    maketitle: true,
  },
}

export function pickTexClass(raw: unknown): TexClassId | null {
  if (typeof raw !== "string") return null
  const candidate = raw.trim().toLowerCase()
  return candidate in TEX_CLASSES ? (candidate as TexClassId) : null
}

function buildJournalPreamble(
  classId: TexClassId,
  macros: LatexMacro[],
  hasCode: boolean,
  hasLinks: boolean,
  sci: SciPackages,
  natbib: string | null,
  features: FeaturePackages,
): string {
  const cls = TEX_CLASSES[classId]
  const lines = [
    cls.documentclass,
    // Journal submissions are overwhelmingly in English; babel-spanish is
    // deliberately not loaded here (the classic article export keeps it).
    "\\usepackage[T1]{fontenc}",
    "\\usepackage{amsmath, amssymb, amsfonts}",
    cls.theoremPolicy === "full"
      ? buildTheoremPreamble()
      : THEOREM_SUPPLEMENT,
    "\\usepackage{graphicx}",
    "\\usepackage{float}",
  ]
  if (sci.units) lines.push("\\usepackage{siunitx}")
  if (sci.chem) lines.push("\\usepackage[version=4]{mhchem}")
  if (sci.tables) lines.push("\\usepackage{booktabs}", "\\usepackage{longtable}")
  // acmart and apa7 manage citations themselves; adding natbib on top of
  // them is a documented conflict, so journal classes only get it when the
  // class does not already provide one.
  if (natbib && classId !== "acmart" && classId !== "apa7") {
    lines.push(`\\usepackage[${natbib}]{natbib}`)
  }
  if (features.callouts) lines.push("\\usepackage{tcolorbox}")
  if (features.soulHighlight) lines.push("\\usepackage{soul}")
  // xcolor backs both \colorbox highlights and listings' background color,
  // so it is only added once even when both features are in play.
  if (hasCode || features.colorHighlight) lines.push("\\usepackage{xcolor}")
  if (hasCode) {
    lines.push("\\usepackage{listings}")
  }
  // acmart and apa7 already load hyperref; loading it twice errors.
  if (hasLinks && classId !== "acmart" && classId !== "apa7") {
    lines.push("\\usepackage{hyperref}")
  }
  const macroLines = macros.map(({ command, arity, definition }) =>
    arity > 0
      ? `\\newcommand{${command}}[${arity}]{${definition}}`
      : `\\newcommand{${command}}{${definition}}`,
  )
  if (macroLines.length > 0) {
    lines.push("", "% Macros de usuario", ...macroLines)
  }
  return lines.join("\n")
}

// ── Document template ─────────────────────────────────────────────────────────

function buildPreamble(macros: LatexMacro[], hasCode: boolean, hasLinks: boolean, sci: SciPackages, natbib: string | null, features: FeaturePackages): string {
  const lines = [
    "\\documentclass[12pt,a4paper]{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T1]{fontenc}",
    // es-noquoting: without it babel-spanish treats << / >> as guillemet
    // shorthands backed by an internal `quoting` environment, so literal
    // arrow text like \texttt{->>} emits a stray \end{quoting} and kills the
    // compile. es-noshorthands disables the remaining active-char surprises
    // ("n, "u, …): exported docs use real Unicode, never babel shorthands.
    "\\usepackage[spanish,es-noquoting,es-noshorthands]{babel}",
    "\\usepackage{amsmath, amssymb, amsfonts}",
    buildTheoremPreamble(),
    "\\usepackage{ulem}",   // \sout
    "\\usepackage{graphicx}",
    "\\usepackage{float}",
  ]

  // Science packages load only when the document actually uses them: recent
  // mhchem versions add real compile time, and an unused siunitx is noise in
  // the preamble a user may hand off to a journal.
  if (sci.units) lines.push("\\usepackage{siunitx}")
  if (sci.chem) lines.push("\\usepackage[version=4]{mhchem}")
  if (sci.tables) lines.push("\\usepackage{booktabs}", "\\usepackage{longtable}")
  // The citation style decides natbib's options, so the exported PDF cites
  // the way the preview does (numbers for Vancouver, author-year for APA).
  if (natbib) lines.push(`\\usepackage[${natbib}]{natbib}`)

  // Text-feature packages load only when the body actually uses them, same
  // rationale as the science packages above.
  if (features.callouts) lines.push("\\usepackage{tcolorbox}")
  if (features.soulHighlight) lines.push("\\usepackage{soul}")
  // xcolor backs both \colorbox highlights and listings' background color,
  // so it is only added once even when both features are in play.
  if (hasCode || features.colorHighlight) lines.push("\\usepackage{xcolor}")

  if (hasCode) {
    lines.push("\\usepackage{listings}")
    lines.push([
      "\\lstset{",
      "  basicstyle=\\ttfamily\\small,",
      "  breaklines=true,",
      "  frame=single,",
      "  backgroundcolor=\\color{gray!10}",
      "}",
    ].join("\n"))
  }

  if (hasLinks) {
    lines.push("\\usepackage{hyperref}")
  }

  // User macros
  const macroLines = macros.map(
    ({ command, arity, definition }) =>
      arity > 0
        ? `\\newcommand{${command}}[${arity}]{${definition}}`
        : `\\newcommand{${command}}{${definition}}`
  )
  if (macroLines.length > 0) {
    lines.push("", "% Macros de usuario", ...macroLines)
  }

  return lines.join("\n")
}

/** Allowed Reveal.js themes (per Reveal distribution). */
export const REVEAL_THEMES = [
  "black", "white", "league", "beige", "night", "serif",
  "simple", "solarized", "moon", "dracula", "sky", "blood",
] as const

export type RevealTheme = (typeof REVEAL_THEMES)[number]

function pickRevealTheme(raw: unknown): RevealTheme {
  if (typeof raw !== "string") return "black"
  const candidate = raw.trim().toLowerCase()
  return (REVEAL_THEMES as readonly string[]).includes(candidate)
    ? (candidate as RevealTheme)
    : "black"
}

export function exportReveal(rawMarkdown: string, title: string): string {
  // Keep marks are editor-only: collapse them to plain text so no `^^`
  // ever reaches a slide. See keepMarks.ts.
  const markdown = stripKeepMarks(rawMarkdown)
  // Read theme from frontmatter (`reveal_theme` preferred, `theme` as fallback).
  const parsed = extractFrontmatter(markdown)
  const body = parsed?.content ?? markdown
  const fmTheme = parsed?.data
    ? (parsed.data["reveal_theme"] ?? parsed.data["theme"])
    : undefined
  const theme = pickRevealTheme(fmTheme)

  const slides = body.split(/\n---\n/)

  // Guard against breaking out of the <textarea data-template> wrapper: a literal
  // </textarea> in slide content would end the template early. Reveal's markdown
  // plugin still parses the escaped form correctly.
  const slideHtml = slides.map(slide =>
    `  <section data-markdown>\n    <textarea data-template>\n${slide.trim().replace(/<\/textarea>/gi, "&lt;/textarea>")}\n    </textarea>\n  </section>`
  ).join('\n')

  // `title` is the filename; escape so a crafted name can't inject markup.
  const safeTitle = title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${safeTitle}</title>
  <link rel="stylesheet" href="https://unpkg.com/reveal.js/dist/reveal.css">
  <link rel="stylesheet" href="https://unpkg.com/reveal.js/dist/theme/${theme}.css">
</head>
<body>
  <div class="reveal">
    <div class="slides">
${slideHtml}
    </div>
  </div>
  <script src="https://unpkg.com/reveal.js/dist/reveal.js"></script>
  <script src="https://unpkg.com/reveal.js/plugin/markdown/markdown.js"></script>
  <script src="https://unpkg.com/reveal.js/plugin/highlight/highlight.js"></script>
  <script src="https://unpkg.com/reveal.js/plugin/math/math.js"></script>
  <script>
    Reveal.initialize({
      hash: true,
      plugins: [RevealMarkdown, RevealHighlight, RevealMath.KaTeX]
    });
  </script>
</body>
</html>`
}

export function exportToTex(rawInput: string, macrosText = "", title = "", author = "", frontmatter?: { headerLeft?: string; headerCenter?: string; headerRight?: string; footerLeft?: string; footerCenter?: string; footerRight?: string }): string {
  // Keep marks are editor-only: collapse them to plain text before the LaTeX
  // conversion. `stripKeepMarks` is math-aware, so a doubled caret inside a
  // superscript (`$x^{2^^3}$`) is left alone.
  const raw = stripKeepMarks(rawInput)
  const parsed = extractFrontmatter(raw)
  citedInLastPass = false
  const body = mdToTex(parsed?.content ?? raw)

  const hasCode = /\\begin\{(lstlisting|verbatim)\}/.test(body)
  const hasLinks = /\\href\{/.test(body)
  const sci = detectSciPackages(body)
  const features = detectFeaturePackages(body)
  const citeStyle = pickCiteStyle(parsed?.data?.["comdtex.citestyle"])
  const natbib = citeStyle.natbib

  // Parse user macros for preamble
  const userMacros: LatexMacro[] = []
  const macroRe = /\\newcommand\{(\\[\w@]+)\}(?:\[(\d+)\])?\{((?:[^{}]|\{[^{}]*\})*)\}/g
  let m: RegExpExecArray | null
  while ((m = macroRe.exec(macrosText)) !== null) {
    userMacros.push({
      command: m[1],
      arity: Number(m[2] ?? "0"),
      definition: m[3],
    })
  }

  const classId = pickTexClass(parsed?.data?.["comdtex.texclass"])
  const cls = classId ? TEX_CLASSES[classId] : null

  const preamble = classId
    ? buildJournalPreamble(classId, userMacros, hasCode, hasLinks, sci, natbib, features)
    : buildPreamble(userMacros, hasCode, hasLinks, sci, natbib, features)

  const docTitle = cls
    ? title
      ? cls.titleBlock(title, author)
      : ""
    : title
      ? `\\title{${escTex(title)}}\n\\author{${escTex(author)}}\n\\date{\\today}\n`
      : ""
  const maketitle = title && (cls ? cls.maketitle : true) ? "\\maketitle\n\n" : ""
  // elsarticle declares title and authors inside a frontmatter environment
  // in the body instead of a preamble title block.
  const elsFrontmatter =
    classId === "elsarticle" && title
      ? `\\begin{frontmatter}\n\\title{${escTex(title)}}\n\\author{${escTex(author) || "Author"}}\n\\end{frontmatter}\n\n`
      : ""

  // Custom headers/footers using fancyhdr
  const hasCustomHF = frontmatter && (frontmatter.headerLeft || frontmatter.headerCenter || frontmatter.headerRight || frontmatter.footerLeft || frontmatter.footerCenter || frontmatter.footerRight)
  const hfPreamble = hasCustomHF ? `\n\\usepackage{fancyhdr}\n\\pagestyle{fancy}\n` +
    (frontmatter!.headerLeft ? `\\fancyhead[L]{${escTex(frontmatter.headerLeft)}}\n` : "") +
    (frontmatter!.headerCenter ? `\\fancyhead[C]{${escTex(frontmatter.headerCenter)}}\n` : "") +
    (frontmatter!.headerRight ? `\\fancyhead[R]{${escTex(frontmatter.headerRight)}}\n` : "") +
    (frontmatter!.footerLeft ? `\\fancyfoot[L]{${escTex(frontmatter.footerLeft)}}\n` : "") +
    (frontmatter!.footerCenter ? `\\fancyfoot[C]{${escTex(frontmatter.footerCenter)}}\n` : "") +
    (frontmatter!.footerRight ? `\\fancyfoot[R]{${escTex(frontmatter.footerRight)}}\n` : "")
    : ""

  return [
    preamble,
    hfPreamble,
    "",
    docTitle,
    "\\begin{document}",
    elsFrontmatter + maketitle,
    body,
    // The vault's references.bib is the bibliography database; BibTeX reads
    // it from the same directory as the .tex, which is where every export
    // path writes both.
    citedInLastPass ? `\n\\bibliographystyle{${bibStyleFor(citeStyle)}}\n\\bibliography{references}` : "",
    "\\end{document}",
  ].filter((l) => l !== undefined).join("\n")
}
