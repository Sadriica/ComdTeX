import type { FileNode } from "./types"

/** Return a set of all file base-names (without extension) in the vault tree. */
export function getFileNameSet(tree: FileNode[]): Set<string> {
  const names = new Set<string>()
  const collect = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === "file") names.add(n.name.replace(/\.[^.]+$/, "").toLowerCase())
      if (n.children) collect(n.children)
    }
  }
  collect(tree)
  return names
}

/** Return all file nodes as a flat list. */
export function flatFiles(tree: FileNode[]): FileNode[] {
  const files: FileNode[] = []
  const collect = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === "file") files.push(n)
      if (n.children) collect(n.children)
    }
  }
  collect(tree)
  return files
}

/** Find a file node by base name (case-insensitive, ignores extension). */
export function findByName(tree: FileNode[], name: string): FileNode | null {
  const lower = name.toLowerCase()
  const search = (nodes: FileNode[]): FileNode | null => {
    for (const n of nodes) {
      if (n.type === "file" && n.name.replace(/\.[^.]+$/, "").toLowerCase() === lower) return n
      if (n.children) { const f = search(n.children); if (f) return f }
    }
    return null
  }
  return search(tree)
}

/**
 * Match a vault-relative path (`gp/calendario`, extension optional) against an
 * absolute file path. Used by cross-file environment refs (`@gp/calendario@def:x`),
 * which are deliberately path-based rather than name-based: `findByName` returns
 * the FIRST match silently, so a vault with two `calendario.md` files resolves
 * bare names ambiguously.
 */
export function matchesVaultRelPath(filePath: string, relPath: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, "/").toLowerCase()
  const file = norm(filePath).replace(/\.[^./]+$/, "")
  const rel = norm(relPath.trim()).replace(/\.[^./]+$/, "").replace(/^\.?\//, "")
  if (!rel) return false
  return file === rel || file.endsWith(`/${rel}`)
}

/** Find a file node by vault-relative path (extension optional). */
export function findByVaultRelPath(tree: FileNode[], relPath: string): FileNode | null {
  const search = (nodes: FileNode[]): FileNode | null => {
    for (const n of nodes) {
      if (n.type === "file" && matchesVaultRelPath(n.path, relPath)) return n
      if (n.children) { const f = search(n.children); if (f) return f }
    }
    return null
  }
  return search(tree)
}

const WIKILINK_RE = /\[\[([^\]|#\n]+?)(?:#([^\]|]+?))?(?:\|([^\]\n]+?))?\]\]/g

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/**
 * Replace [[target]], [[target|label]], [[target#heading]] in raw text with
 * HTML anchors. Must run before markdown-it (html:true passes them through).
 */
export function processWikilinks(text: string, existingNames: Set<string>): string {
  return text.replace(WIKILINK_RE, (_, target, heading, label) => {
    const display = label ?? target
    const exists = existingNames.has(target.trim().toLowerCase())
    const cls = exists ? "wikilink" : "wikilink wikilink-broken"
    const headingAttr = heading ? ` data-heading="${esc(heading.trim())}"` : ""
    return `<a class="${cls}" data-target="${esc(target.trim())}"${headingAttr} href="#">${esc(display)}</a>`
  })
}
