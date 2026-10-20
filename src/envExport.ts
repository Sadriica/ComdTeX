/**
 * Numbering for math environments in every NON-LaTeX export.
 *
 * The LaTeX export gets numbers from `\newtheorem`. Every other target (the
 * Markdown/Obsidian export, the Pandoc inputs behind DOCX/PDF/Typst/Beamer, and
 * Reveal.js) is text, so the numbers have to be written into the text itself.
 * This pass does that with the preview's own scheme: counters per environment
 * type (`nextEnvNumber`), the preview heading (`envDisplayLabel`) and the
 * preview's reference resolver (`resolveEnvironmentRefs`, in its "text" form).
 * "Teorema 2" in the app is therefore "Teorema 2" in the export, and
 * `@thm:main` becomes the same words the preview link shows.
 *
 * It runs on CMDX source, before `toStorageMd` turns environments into plain
 * callouts (which would lose the numbers).
 */

import {
  ALL_ENVS,
  envDisplayLabel,
  nextEnvNumber,
  resolveEnvironmentRefs,
  type EnvironmentDocResolver,
  type EnvironmentReference,
} from "./environments"
import {
  OBSIDIAN_CALLOUTS,
  maskSpecialBlocks,
  parseCmdxDocument,
  type CmdxNode,
} from "./cmdxFormat"

/**
 * - "callout": Obsidian callout (`> [!abstract] Teorema 2 (Title)`).
 * - "bold": plain blockquote with a bold lead-in, for targets with no callout
 *   syntax (Pandoc, Reveal.js).
 */
export type EnvExportStyle = "callout" | "bold"

const FENCE_RE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm
const INLINE_CODE_RE = /(`+)([^`\n]*?)\1/g

/**
 * Mask fenced code so a `:::theorem` shown inside a code sample is not
 * numbered. The restore re-applies a blockquote prefix to every line of a
 * fence that ended up inside a converted environment.
 */
function maskFences(text: string): { masked: string; restore: (s: string) => string } {
  const slots: string[] = []
  const masked = text.replace(FENCE_RE, (m) => {
    slots.push(m)
    return `\x02FENCE${slots.length - 1}\x03`
  })
  const restore = (s: string): string =>
    s
      .replace(/^((?:[ \t]*>[ \t]?)+)\x02FENCE(\d+)\x03[ \t]*$/gm, (_, prefix: string, n: string) =>
        (slots[Number(n)] ?? "")
          .split("\n")
          .map((l) => prefix + l)
          .join("\n"),
      )
      .replace(/\x02FENCE(\d+)\x03/g, (_, n: string) => slots[Number(n)] ?? "")
  return { masked, restore }
}

function maskInlineCode(text: string): { masked: string; restore: (s: string) => string } {
  const slots: string[] = []
  const masked = text.replace(INLINE_CODE_RE, (m) => {
    slots.push(m)
    return `\x02ICODE${slots.length - 1}\x03`
  })
  return {
    masked,
    restore: (s) => s.replace(/\x02ICODE(\d+)\x03/g, (_, n: string) => slots[Number(n)] ?? ""),
  }
}

interface Walk {
  style: EnvExportStyle
  calloutTypes: Record<string, string>
  counters: Record<string, number>
  labels: Map<string, EnvironmentReference>
}

function quote(lines: string[]): string[] {
  return lines.map((l) => (l.length > 0 ? `> ${l}` : ">"))
}

function renderNodes(nodes: CmdxNode[], walk: Walk): string {
  const out: string[] = []
  for (const node of nodes) {
    if (node.type === "text") {
      out.push(node.content)
      continue
    }
    const info = ALL_ENVS[node.name]
    if (!info) {
      // Not a math/callout environment (e.g. `:::folded`): leave it for the
      // regular conversion, but still walk the children so nested numbered
      // environments get their numbers.
      const title = node.title !== undefined ? `[${node.title}]` : ""
      const label = node.label ? `{#${node.label}}` : ""
      out.push(`:::${node.name}${title}${label}`, renderNodes(node.children, walk), ":::")
      continue
    }
    // Number first, then recurse: document order, like the preview's counters.
    const number = nextEnvNumber(walk.counters, node.name)
    if (node.label && !walk.labels.has(node.label)) {
      walk.labels.set(node.label, { kind: info.es, number, label: node.label })
    }
    const heading = envDisplayLabel(node.name, number, node.title?.trim() ?? "")
    const body = renderNodes(node.children, walk).trim()
    const bodyLines = body ? body.split("\n") : []
    if (walk.style === "callout") {
      const type = walk.calloutTypes[node.name] ?? "note"
      out.push([`> [!${type}] ${heading}`, ...quote(bodyLines)].join("\n"))
    } else {
      // Same full stop rule as the preview header (a proof has none).
      const lead = `**${heading}${node.name === "proof" ? "" : "."}**`
      out.push([`> ${lead}`, ...(bodyLines.length ? [">", ...quote(bodyLines)] : [])].join("\n"))
    }
  }
  return out.join("\n")
}

/**
 * Rewrite every math/callout-style environment of `markdown` into its numbered
 * export form and resolve `@thm:`/`@def:`/... references to the preview's text.
 * `calloutTypes` maps an environment to its callout type (callout style only).
 * Cross-file references resolve through `resolver` when given, else they render
 * the preview's broken-ref wording (`Teorema (?)`).
 */
export function numberEnvironmentsForExport(
  markdown: string,
  style: EnvExportStyle,
  resolver?: EnvironmentDocResolver,
  calloutTypes: Record<string, string> = OBSIDIAN_CALLOUTS,
): string {
  // Cheap exit: nothing to number and no reference to resolve.
  if (!/^:::/m.test(markdown) && !/@[A-Za-z]+:/.test(markdown)) return markdown

  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(markdown)?.[0] ?? ""
  const body = markdown.slice(frontmatter.length)

  const fences = maskFences(body)
  const specials = maskSpecialBlocks(fences.masked)
  const walk: Walk = { style, calloutTypes, counters: {}, labels: new Map() }
  const converted = /^:::/m.test(specials.masked)
    ? renderNodes(parseCmdxDocument(specials.masked), walk)
    : specials.masked

  const inline = maskInlineCode(converted)
  const resolved = resolveEnvironmentRefs(inline.masked, walk.labels, resolver, "text")

  return frontmatter + fences.restore(specials.restore(inline.restore(resolved)))
}
