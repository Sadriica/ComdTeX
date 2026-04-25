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
import { extractFrontmatter } from "./frontmatter"
import { preprocessFigureLabels } from "./figures"

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

function textRefsToTex(text: string): string {
  const out: string[] = []
  const re = /@([a-zA-Z]+):([\w-]+(?:\.[\w-]+)*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    out.push(escTex(text.slice(last, m.index)))
    out.push(refToTex(m[1], m[2]))
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
        const rawText = (inline.children ?? []).map((child: Token) => child.content ?? "").join("")
        const label = /\s*\{#(sec:[\w:.-]+)\}\s*$/.exec(rawText)?.[1]
        const cleanChildren = label
          ? (inline.children ?? []).map((child: Token) =>
              child.type === "text" ? { ...child, content: child.content.replace(/\s*\{#sec:[\w:.-]+\}\s*$/, "") } : child)
          : (inline.children ?? [])
        out.push(`\\${cmd}{${inlineToTex(cleanChildren)}}${label ? `\n\\label{${label}}` : ""}\n`)
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
  const { text, slots } = extractEnvBlocks(raw)
  const tableSafeText = text.replace(
    /((?:^\s*\|.*\|\s*\n)+)\s*\{#(tbl:[\w:.-]+)\}/gm,
    (_match, tableRows, label) => `${tableRows}\n{#${label}}\n`,
  )
  const preprocessed = preprocess(preprocessFigureLabels(tableSafeText))
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
    "\\usepackage{float}",
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

export function exportReveal(markdown: string, title: string): string {
  const slides = markdown.split(/\n---\n/)

  const slideHtml = slides.map(slide =>
    `  <section data-markdown>\n    <textarea data-template>\n${slide.trim()}\n    </textarea>\n  </section>`
  ).join('\n')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="stylesheet" href="https://unpkg.com/reveal.js/dist/reveal.css">
  <link rel="stylesheet" href="https://unpkg.com/reveal.js/dist/theme/black.css">
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

export function exportToTex(raw: string, macrosText = "", title = "", author = "", frontmatter?: { headerLeft?: string; headerCenter?: string; headerRight?: string; footerLeft?: string; footerCenter?: string; footerRight?: string }): string {
  const parsed = extractFrontmatter(raw)
  const body = mdToTex(parsed?.content ?? raw)

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
    maketitle,
    body,
    "\\end{document}",
  ].filter((l) => l !== undefined).join("\n")
}
