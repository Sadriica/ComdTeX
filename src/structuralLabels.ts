// `data` is deliberately in this list but is NOT a numbered element: a
// dataset is declared to be used (like a macro), never cited as "Data 3".
// It rides here so the Labels panel reports duplicate declarations, broken
// `@data:` references and unused datasets exactly as it does for the rest.
export type StructuralLabelKind =
  "sec" | "eq" | "fig" | "tbl" | "thm" | "lem" | "cor" | "prop" | "def" | "ex" | "exc" | "data"

export interface StructuralLabel {
  id: string
  kind: StructuralLabelKind
  name: string
  filePath: string
  fileName: string
  line: number
  context: string
  /** Environment type for `:::type` labels (`theorem`, `lemma`, ...). */
  envType?: string
  /** Environment title (`:::theorem[Title]`), heading text or figure caption. */
  title?: string
  /** Printed number: Nth theorem, Nth display equation, Nth figure. */
  number?: string
  /** Source preview: the equation source or the first line of an environment body. */
  preview?: string
}

export interface StructuralReference {
  id: string
  kind: StructuralLabelKind
  filePath: string
  fileName: string
  line: number
  context: string
}

export interface StructuralLabelIndex {
  /** Heading texts per file path, for `[[note#heading]]` completion. */
  headings: Map<string, string[]>
  labels: StructuralLabel[]
  references: StructuralReference[]
  duplicates: Map<string, StructuralLabel[]>
  broken: StructuralReference[]
  unused: StructuralLabel[]
}

const KIND_ALIASES: Record<string, StructuralLabelKind> = {
  data: "data",
  dataset: "data",
  sec: "sec",
  eq: "eq",
  fig: "fig",
  tbl: "tbl",
  thm: "thm",
  theorem: "thm",
  lem: "lem",
  lemma: "lem",
  cor: "cor",
  prop: "prop",
  def: "def",
  definition: "def",
  ex: "ex",
  example: "ex",
  exc: "exc",
  exercise: "exc",
}

function normalizeKind(kind: string): StructuralLabelKind | null {
  return KIND_ALIASES[kind] ?? null
}

function pushLabel(
  labels: StructuralLabel[],
  rawId: string,
  filePath: string,
  fileName: string,
  line: number,
  context: string,
  meta?: LabelMeta,
) {
  const [prefix, ...rest] = rawId.split(":")
  const kind = normalizeKind(prefix)
  const name = rest.join(":")
  if (!kind || !name) return
  labels.push({
    id: `${kind}:${name}`,
    kind,
    name,
    filePath,
    fileName,
    line,
    context: context.trim(),
    ...meta,
  })
}

interface LabelMeta {
  envType?: string
  title?: string
  number?: string
  preview?: string
}

export interface FileLabelScan {
  path: string
  labels: StructuralLabel[]
  references: StructuralReference[]
  headings: string[]
}

// Numbered environment types. Mirrors NUMBERED_ENVS in environments.ts; this
// module runs in a worker and must not import the renderer. A test pins the two.
export const NUMBERED_ENV_TYPES: readonly string[] = [
  "theorem",
  "lemma",
  "corollary",
  "proposition",
  "definition",
  "example",
  "exercise",
]
const NUMBERED_ENV_SET = new Set(NUMBERED_ENV_TYPES)

const ENV_OPEN_RE =
  /^:::(?:sm\s+|lg\s+)?([A-Za-z][\w-]*)(?:\[([^\]]*)\])?\s*(?:\{#([\w:.-]+)\})?\s*$/
const FENCE_RE = /^\s*(`{3,}|~{3,})/
const HEADING_RE = /^#{1,6}\s+(.+?)\s*$/
const LABEL_TAIL_RE = /\s*\{#[\w:.-]+\}\s*$/
const PREVIEW_MAX = 240

function clip(text: string): string {
  const t = text.trim().replace(/\s+/g, " ")
  return t.length > PREVIEW_MAX ? t.slice(0, PREVIEW_MAX - 1) + "…" : t
}

/** Pure per-file scan: the unit of work the label worker runs and caches. */
export function scanFileLabels(file: {
  path: string
  name: string
  content: string
}): FileLabelScan {
  const labels: StructuralLabel[] = []
  const references: StructuralReference[] = []
  const headings: string[] = []
  const lines = file.content.split("\n")

  let fence: string | null = null
  const envCounters: Record<string, number> = {}
  let eqCount = 0
  let figCount = 0
  let display: { body: string[] } | null = null

  lines.forEach((line, index) => {
    const lineNumber = index + 1
    let meta: LabelMeta | undefined

    // Code fences hide everything inside them from the numbering and headings.
    const fenceMatch = FENCE_RE.exec(line)
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1][0]
      else if (fenceMatch[1][0] === fence) fence = null
    } else if (fence === null) {
      if (display) {
        const close = line.indexOf("$$")
        if (close >= 0) {
          display.body.push(line.slice(0, close))
          eqCount++
          meta = { number: String(eqCount), preview: clip(display.body.join(" ")) }
          display = null
        } else {
          display.body.push(line)
        }
      } else if (line.includes("$$")) {
        const open = line.indexOf("$$")
        const close = line.indexOf("$$", open + 2)
        if (close >= 0) {
          eqCount++
          meta = { number: String(eqCount), preview: clip(line.slice(open + 2, close)) }
        } else {
          display = { body: [line.slice(open + 2)] }
        }
      } else {
        const env = line.charCodeAt(0) === 58 ? ENV_OPEN_RE.exec(line) : null
        const heading = env ? null : HEADING_RE.exec(line)
        if (env) {
          const type = env[1].toLowerCase()
          let number: string | undefined
          if (NUMBERED_ENV_SET.has(type)) {
            envCounters[type] = (envCounters[type] ?? 0) + 1
            number = String(envCounters[type])
          }
          let preview = ""
          for (let j = index + 1; j < lines.length && j <= index + 6; j++) {
            const next = lines[j].trim()
            if (next === ":::") break
            if (next) {
              preview = clip(next)
              break
            }
          }
          meta = { envType: type, title: env[2]?.trim() || undefined, number, preview }
        } else if (heading) {
          const text = heading[1].replace(LABEL_TAIL_RE, "").trim()
          headings.push(text)
          meta = { title: text }
        } else {
          if (line.includes("![")) {
            let alt: string | undefined
            for (const img of line.matchAll(/!\[([^\]]*)\]\(/g)) {
              figCount++
              alt = img[1].trim() || undefined
            }
            meta = { number: String(figCount), title: alt }
          }
          const inline = /\$([^$\n]+?)\$\s*\{#[\w:.-]+\}/.exec(line)
          if (inline) {
            eqCount++
            meta = { number: String(eqCount), preview: clip(inline[1]) }
          }
        }
      }
    }

    if (!line.includes("{#") && !line.includes("@")) return

    const labelRe = /\{#([a-zA-Z]+:[\w:.-]+)\}/g
    let labelMatch: RegExpExecArray | null
    while ((labelMatch = labelRe.exec(line)) !== null) {
      pushLabel(labels, labelMatch[1], file.path, file.name, lineNumber, line, meta)
    }

    const refRe = /@([a-zA-Z]+):([\w-]+(?:\.[\w-]+)*)/g
    let refMatch: RegExpExecArray | null
    while ((refMatch = refRe.exec(line)) !== null) {
      const kind = normalizeKind(refMatch[1])
      if (!kind) continue
      const id = `${kind}:${refMatch[2]}`
      references.push({
        id,
        kind,
        filePath: file.path,
        fileName: file.name,
        line: lineNumber,
        context: line.trim(),
      })
    }
  })
  return { path: file.path, labels, references, headings }
}

export function scanStructuralLabels(
  files: { path: string; name: string; content: string }[],
): StructuralLabelIndex {
  return buildLabelIndex(files.map(scanFileLabels))
}

/** Combine per-file scans (in file order) into the vault-wide index. */
export function buildLabelIndex(scans: FileLabelScan[]): StructuralLabelIndex {
  const headings = new Map<string, string[]>()
  for (const scan of scans) if (scan.headings.length > 0) headings.set(scan.path, scan.headings)
  const labels = scans.flatMap((scan) => scan.labels)
  const references = scans.flatMap((scan) => scan.references)

  const byId = new Map<string, StructuralLabel[]>()
  for (const label of labels) {
    const bucket = byId.get(label.id) ?? []
    bucket.push(label)
    byId.set(label.id, bucket)
  }
  const referenced = new Set(references.map((ref) => ref.id))
  const duplicates = new Map([...byId.entries()].filter(([, items]) => items.length > 1))
  const broken = references.filter((ref) => !byId.has(ref.id))
  const unused = labels.filter((label) => !referenced.has(label.id))

  return { headings, labels, references, duplicates, broken, unused }
}
