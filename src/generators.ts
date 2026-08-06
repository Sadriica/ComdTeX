/**
 * Generated folder files: a task list, a calendar or an index built from the
 * notes around them, declared in a folder's `.comdtex-folder.json`.
 *
 * This is the "one file per subject, written class by class" workflow: the notes
 * stay prose, and the cross-cutting views (what is still pending, what happens
 * when) are derived rather than maintained by hand.
 *
 * Pure functions over `{path, content}`; the caller does the I/O. Every
 * generator emits the `comdtex:generated` marker so a regeneration can tell its
 * own output from a file somebody has since taken over by hand.
 */
import { GENERATED_MARKER, type GeneratorType } from "./folderRules"
import { extractFrontmatter } from "./frontmatter"
import { pathBasename } from "./pathUtils"

export interface SourceFile {
  /** Absolute path. */
  path: string
  content: string
}

export interface TaskItem {
  filePath: string
  fileName: string
  /** 1-based line number in the source file. */
  line: number
  text: string
  done: boolean
}

/** `- [ ] text` / `- [x] text`, at any indentation. */
const TASK_RE = /^\s*[-*+]\s*\[([ xX])\]\s+(.+)$/

/**
 * Every task item in `files`, in file then line order.
 *
 * Shared with `TodoPanel` so the panel and the generated list can never
 * disagree about what counts as a task.
 */
export function parseTasks(files: SourceFile[]): TaskItem[] {
  const items: TaskItem[] = []
  for (const file of files) {
    const fileName = pathBasename(file.path)
    file.content.split("\n").forEach((line, i) => {
      const m = TASK_RE.exec(line)
      if (m) {
        items.push({
          filePath: file.path,
          fileName,
          line: i + 1,
          text: m[2].trim(),
          done: m[1].toLowerCase() === "x",
        })
      }
    })
  }
  return items
}

/** Note name for a wikilink: basename without extension. */
function noteName(path: string): string {
  return pathBasename(path).replace(/\.[^.]+$/, "")
}

/** The document's H1, its frontmatter title, or its filename. */
export function documentTitle(file: SourceFile): string {
  const fm = extractFrontmatter(file.content)
  if (fm?.data.title) return String(fm.data.title)
  const body = fm?.content ?? file.content
  const h1 = /^#\s+(.+)$/m.exec(body)
  if (h1) return h1[1].trim()
  return noteName(file.path)
}

/**
 * A date for the file: its frontmatter `date`, else a `YYYY-MM-DD` found at the
 * start of its filename. Null when neither is present: those files are grouped
 * under "sin fecha" rather than dropped, so nothing silently disappears.
 */
export function documentDate(file: SourceFile): string | null {
  const fm = extractFrontmatter(file.content)
  const raw = fm?.data.date
  if (typeof raw === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(raw.trim())
    if (m) return m[1]
  }
  const fromName = /^(\d{4}-\d{2}-\d{2})/.exec(noteName(file.path))
  return fromName ? fromName[1] : null
}

function header(title: string): string[] {
  return [
    GENERATED_MARKER,
    `<!-- Este archivo se regenera automáticamente. Los cambios manuales se perderán. -->`,
    "",
    `# ${title}`,
    "",
  ]
}

/** Pending-first task list, grouped by source file. */
export function generateTasks(files: SourceFile[], title = "Tareas"): string {
  const items = parseTasks(files)
  const lines = header(title)

  if (items.length === 0) {
    lines.push("_No hay tareas._", "")
    return lines.join("\n")
  }

  const pending = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)
  lines.push(`**${pending.length} pendiente${pending.length === 1 ? "" : "s"}** · ${done.length} completada${done.length === 1 ? "" : "s"}`, "")

  const byFile = new Map<string, TaskItem[]>()
  for (const item of items) {
    const list = byFile.get(item.filePath) ?? []
    list.push(item)
    byFile.set(item.filePath, list)
  }

  for (const [filePath, list] of byFile) {
    lines.push(`## [[${noteName(filePath)}]]`, "")
    // Pending first inside each file: the point of the view is what is left.
    for (const item of [...list.filter((i) => !i.done), ...list.filter((i) => i.done)]) {
      lines.push(`- [${item.done ? "x" : " "}] ${item.text}`)
    }
    lines.push("")
  }
  return lines.join("\n")
}

/** Notes grouped by date, newest first. */
export function generateCalendar(files: SourceFile[], title = "Calendario"): string {
  const lines = header(title)
  const dated = files.map((f) => ({ file: f, date: documentDate(f) }))
  const withDate = dated.filter((d) => d.date !== null).sort((a, b) => b.date!.localeCompare(a.date!))
  const withoutDate = dated.filter((d) => d.date === null)

  if (withDate.length === 0 && withoutDate.length === 0) {
    lines.push("_No hay notas._", "")
    return lines.join("\n")
  }

  let currentMonth = ""
  for (const { file, date } of withDate) {
    const month = date!.slice(0, 7)
    if (month !== currentMonth) {
      currentMonth = month
      lines.push(`## ${month}`, "")
    }
    lines.push(`- **${date}**: [[${noteName(file.path)}]] ${documentTitle(file)}`)
  }
  if (withoutDate.length > 0) {
    lines.push("", "## Sin fecha", "")
    for (const { file } of withoutDate) {
      lines.push(`- [[${noteName(file.path)}]] ${documentTitle(file)}`)
    }
  }
  lines.push("")
  return lines.join("\n")
}

/** Plain index of the folder, alphabetical, showing each note's title. */
export function generateIndex(files: SourceFile[], title = "Índice"): string {
  const lines = header(title)
  if (files.length === 0) {
    lines.push("_No hay notas._", "")
    return lines.join("\n")
  }
  const sorted = [...files].sort((a, b) => noteName(a.path).localeCompare(noteName(b.path)))
  for (const file of sorted) {
    const name = noteName(file.path)
    const heading = documentTitle(file)
    lines.push(heading === name ? `- [[${name}]]` : `- [[${name}]]: ${heading}`)
  }
  lines.push("")
  return lines.join("\n")
}

/** Dispatch to the generator named by a `.comdtex-folder.json` rule. */
export function runGenerator(type: GeneratorType, files: SourceFile[], title?: string): string {
  switch (type) {
    case "tasks":    return generateTasks(files, title)
    case "calendar": return generateCalendar(files, title)
    case "index":    return generateIndex(files, title)
  }
}
