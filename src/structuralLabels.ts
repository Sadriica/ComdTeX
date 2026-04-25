export type StructuralLabelKind = "sec" | "eq" | "fig" | "tbl" | "thm" | "lem" | "cor" | "prop" | "def" | "ex" | "exc"

export interface StructuralLabel {
  id: string
  kind: StructuralLabelKind
  name: string
  filePath: string
  fileName: string
  line: number
  context: string
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
  labels: StructuralLabel[]
  references: StructuralReference[]
  duplicates: Map<string, StructuralLabel[]>
  broken: StructuralReference[]
  unused: StructuralLabel[]
}

const KIND_ALIASES: Record<string, StructuralLabelKind> = {
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

export const LABEL_KIND_TITLES: Record<StructuralLabelKind, string> = {
  sec: "Secciones",
  eq: "Ecuaciones",
  fig: "Figuras",
  tbl: "Tablas",
  thm: "Teoremas",
  lem: "Lemas",
  cor: "Corolarios",
  prop: "Proposiciones",
  def: "Definiciones",
  ex: "Ejemplos",
  exc: "Ejercicios",
}

function normalizeKind(kind: string): StructuralLabelKind | null {
  return KIND_ALIASES[kind] ?? null
}

function pushLabel(labels: StructuralLabel[], rawId: string, filePath: string, fileName: string, line: number, context: string) {
  const [prefix, ...rest] = rawId.split(":")
  const kind = normalizeKind(prefix)
  const name = rest.join(":")
  if (!kind || !name) return
  labels.push({ id: `${kind}:${name}`, kind, name, filePath, fileName, line, context: context.trim() })
}

export function scanStructuralLabels(files: { path: string; name: string; content: string }[]): StructuralLabelIndex {
  const labels: StructuralLabel[] = []
  const references: StructuralReference[] = []

  for (const file of files) {
    const lines = file.content.split("\n")
    lines.forEach((line, index) => {
      const lineNumber = index + 1
      const labelRe = /\{#([a-zA-Z]+:[\w:.-]+)\}/g
      let labelMatch: RegExpExecArray | null
      while ((labelMatch = labelRe.exec(line)) !== null) {
        pushLabel(labels, labelMatch[1], file.path, file.name, lineNumber, line)
      }

      const refRe = /@([a-zA-Z]+):([\w-]+(?:\.[\w-]+)*)/g
      let refMatch: RegExpExecArray | null
      while ((refMatch = refRe.exec(line)) !== null) {
        const kind = normalizeKind(refMatch[1])
        if (!kind) continue
        const id = `${kind}:${refMatch[2]}`
        references.push({ id, kind, filePath: file.path, fileName: file.name, line: lineNumber, context: line.trim() })
      }
    })
  }

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

  return { labels, references, duplicates, broken, unused }
}
