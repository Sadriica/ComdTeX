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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Token = any
import { preprocess } from "./preprocessor"
import { ALL_ENVS, envToLatex, buildTheoremPreamble } from "./environments"

interface LatexMacro {
  command: string
  arity: number
  definition: string
}

const md = new MarkdownIt({ html: false, linkify: false, typographer: false })
  .enable("table")
  .enable("strikethrough")

// ── LaTeX escaping ────────────────────────────────────────────────────────────

function escTex(text: string): string {
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

/** Escape only the non-math parts of a text string. */
function textToTex(text: string): string {
  const parts: string[] = []
  let last = 0
  const re = /\$\$([\s\S]+?)\$\$|\$([^\$\n]+?)\$/g
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    parts.push(escTex(text.slice(last, m.index)))
    if (m[1] !== undefined) {
      parts.push(`\\[\n${m[1].trim()}\n\\]`)
    } else {
      parts.push(`$${m[2]}$`)
    }
    last = m.index + m[0].length
  }

  parts.push(escTex(text.slice(last)))
  return parts.join("")
}

// ── Inline token → LaTeX ──────────────────────────────────────────────────────

function inlineToTex(tokens: Token[]): string {
  let out = ""
  for (const tok of tokens) {
    switch (tok.type) {
      case "text":         out += textToTex(tok.content); break
      case "softbreak":    out += "\n"; break
      case "hardbreak":    out += "\\\\\n"; break
      case "code_inline":  out += `\\texttt{${escTex(tok.content)}}`; break
      case "strong_open":  out += "\\textbf{"; break
      case "strong_close": out += "}"; break
      case "em_open":      out += "\\textit{"; break
      case "em_close":     out += "}"; break
      case "s_open":       out += "\\sout{"; break
      case "s_close":      out += "}"; break
      case "link_open":    out += `\\href{${tok.attrGet("href") ?? ""}}{`; break
      case "link_close":   out += "}"; break
      case "image":
        out += `\\includegraphics{${tok.attrGet("src") ?? ""}}`
        break
      case "html_inline":  break // skip raw HTML
    }
  }
  return out
}

// ── Block tokens → LaTeX ──────────────────────────────────────────────────────

function tokensToTex(tokens: Token[], envSlots: Map<string, string>): string {
  const out: string[] = []
  let i = 0

  const restoreEnv = (text: string) =>
    text.replace(/\x02ENV(\d+)\x03/g, (_, n) => envSlots.get(`ENV${n}`) ?? "")

  while (i < tokens.length) {
    const tok = tokens[i]

    switch (tok.type) {
      // ── Headings ──────────────────────────────────────────────────────────
      case "heading_open": {
        const level = parseInt(tok.tag.slice(1))
        const cmds = ["section", "subsection", "subsubsection", "paragraph", "subparagraph"]
        const cmd = cmds[level - 1] ?? "subparagraph"
        const inline = tokens[i + 1]
        out.push(`\\${cmd}{${inlineToTex(inline.children ?? [])}}\n`)
        i += 2
        break
      }
      case "heading_close": break

      // ── Paragraphs ────────────────────────────────────────────────────────
      case "paragraph_open": break
      case "paragraph_close": out.push(""); break

      case "inline": {
        const content = restoreEnv(inlineToTex(tok.children ?? []))
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
                cells.push(inlineToTex(tokens[j].children ?? []))
                j++ // close tag
              }
              j++
            }
            rows.push(cells)
          }
          j++
        }

        if (rows.length > 0) {
          const cols = Math.max(...rows.map((r) => r.length))
          const colSpec = Array(cols).fill("l").join(" | ")
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

// ── Environment extraction ────────────────────────────────────────────────────

function extractEnvBlocks(text: string): { text: string; slots: Map<string, string> } {
  const slots = new Map<string, string>()
  let n = 0

  const result = text.replace(
    /^:::([\w]+)(?:\[([^\]]*)\])?\s*\n([\s\S]*?)^:::\s*$/gm,
    (_, rawName, title, content) => {
      const envName = rawName.toLowerCase()
      if (!ALL_ENVS[envName]) return _

      // Convert inner content to LaTeX recursively
      const innerTex = mdToTex(content.trim())
      const latexBlock = envToLatex(envName, title ?? "", innerTex)
      const key = `ENV${n++}`
      slots.set(key, latexBlock)
      return `\x02${key}\x03`
    }
  )

  return { text: result, slots }
}

// ── Main conversion ───────────────────────────────────────────────────────────

function mdToTex(raw: string): string {
  const { text, slots } = extractEnvBlocks(raw)
  const preprocessed = preprocess(text)
  let tokens
  try {
    tokens = md.parse(preprocessed, {})
  } catch {
    tokens = md.parse(raw, {})
  }
  return tokensToTex(tokens, slots)
}

// ── Document template ─────────────────────────────────────────────────────────

function buildPreamble(macros: LatexMacro[], hasCode: boolean, hasLinks: boolean): string {
  const lines = [
    "\\documentclass[12pt,a4paper]{article}",
    "\\usepackage[utf8]{inputenc}",
    "\\usepackage[T1]{fontenc}",
    "\\usepackage[spanish]{babel}",
    "\\usepackage{amsmath, amssymb, amsfonts}",
    buildTheoremPreamble(),
    "\\usepackage{ulem}",   // \sout
    "\\usepackage{graphicx}",
  ]

  if (hasCode) {
    lines.push("\\usepackage{listings}")
    lines.push("\\usepackage{xcolor}")
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

export function exportToTex(raw: string, macrosText = "", title = "", author = ""): string {
  const body = mdToTex(raw)

  const hasCode = /\\begin\{(lstlisting|verbatim)\}/.test(body)
  const hasLinks = /\\href\{/.test(body)

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

  const preamble = buildPreamble(userMacros, hasCode, hasLinks)

  const docTitle = title ? `\\title{${escTex(title)}}\n\\author{${escTex(author)}}\n\\date{\\today}\n` : ""
  const maketitle = title ? "\\maketitle\n\n" : ""

  return [
    preamble,
    "",
    docTitle,
    "\\begin{document}",
    maketitle,
    body,
    "\\end{document}",
  ].filter((l) => l !== undefined).join("\n")
}
