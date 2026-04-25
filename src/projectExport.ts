import { extractFrontmatter } from "./frontmatter"
import { resolveTransclusions } from "./transclusion"

export interface ProjectFile {
  path: string
  name: string
  content: string
}

export interface ProjectPlan {
  main: ProjectFile | null
  included: ProjectFile[]
  missingEmbeds: string[]
}

function isMainDocument(file: ProjectFile): boolean {
  const fm = extractFrontmatter(file.content)
  const raw = fm?.data ?? {}
  return raw["comdtex.main"] === true || raw["comdtex.main"] === "true" || raw.main === true || raw.main === "true"
}

function scoreMainCandidate(file: ProjectFile): number {
  const name = file.name.toLowerCase()
  let score = 0
  if (isMainDocument(file)) score += 100
  if (/^(main|index|paper|thesis|tesis|book)\.md$/.test(name)) score += 20
  if (/^#\s+/.test(file.content)) score += 5
  score += (file.content.match(/!\[\[/g) ?? []).length
  return score
}

function findTarget(files: ProjectFile[], target: string): ProjectFile | null {
  const clean = target.split("#")[0].replace(/\.[^.]+$/, "").toLowerCase()
  return files.find((file) =>
    file.name.replace(/\.[^.]+$/, "").toLowerCase() === clean ||
    file.name.toLowerCase() === target.toLowerCase() ||
    file.path.toLowerCase().endsWith(`/${target.toLowerCase()}`)) ?? null
}

export function buildProjectPlan(files: ProjectFile[], activePath?: string | null): ProjectPlan {
  const markdownFiles = files.filter((file) => file.name.endsWith(".md"))
  const explicit = markdownFiles.find(isMainDocument)
  const active = activePath ? markdownFiles.find((file) => file.path === activePath) : null
  const main = explicit ?? active ?? [...markdownFiles].sort((a, b) => scoreMainCandidate(b) - scoreMainCandidate(a))[0] ?? null
  if (!main) return { main: null, included: [], missingEmbeds: [] }

  const included = new Map<string, ProjectFile>()
  const missing = new Set<string>()
  const visit = (file: ProjectFile) => {
    if (included.has(file.path)) return
    included.set(file.path, file)
    const embedRe = /!\[\[([^\]#|]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
    let match: RegExpExecArray | null
    while ((match = embedRe.exec(file.content)) !== null) {
      const target = findTarget(files, match[1].trim())
      if (target) visit(target)
      else missing.add(match[1].trim())
    }
  }
  visit(main)
  return { main, included: [...included.values()], missingEmbeds: [...missing] }
}

export function composeProjectMarkdown(files: ProjectFile[], mainPath?: string | null): string {
  const plan = buildProjectPlan(files, mainPath)
  if (!plan.main) return ""
  const resolver = (target: string) => findTarget(files, target)?.content ?? null
  return resolveTransclusions(plan.main.content, resolver)
}
