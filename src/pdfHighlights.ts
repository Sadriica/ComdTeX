/**
 * Highlights ComdTeX 1.34.2 kept in the vault (`.comdtex-pdf-highlights.json`).
 * Since then highlights are pdf.js annotations written into the PDF; these are
 * still read, drawn and removable so nothing made with 1.34.2 disappears.
 *
 * Rectangles are in PDF points at scale 1 with a top-left origin, so they
 * follow any zoom: the viewer multiplies them by the page's scale.
 */
import { exists, readTextFile } from "@tauri-apps/plugin-fs"
import { writeTextFileAtomic } from "./atomicWrite"

export const HIGHLIGHTS_FILENAME = ".comdtex-pdf-highlights.json"
export const HIGHLIGHTS_VERSION = 1

export const HIGHLIGHT_COLORS = ["yellow", "green", "blue", "pink"] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

/** x, y, width, height in PDF points (scale 1, top-left origin). */
export type HighlightRect = [number, number, number, number]

export interface PdfHighlight {
  id: string
  page: number
  rects: HighlightRect[]
  color: HighlightColor
  /** The highlighted text, for search and for a later list of highlights. */
  text: string
  createdAt: string
}

export interface HighlightsFile {
  version: number
  /** Vault-relative PDF path (forward slashes) to its highlights. */
  files: Record<string, PdfHighlight[]>
}

const EMPTY: HighlightsFile = { version: HIGHLIGHTS_VERSION, files: {} }

function isRect(r: unknown): r is HighlightRect {
  return Array.isArray(r) && r.length === 4 && r.every((n) => typeof n === "number" && isFinite(n))
}

function isHighlight(h: unknown): h is PdfHighlight {
  if (!h || typeof h !== "object") return false
  const o = h as Record<string, unknown>
  return (
    typeof o.id === "string" &&
    typeof o.page === "number" &&
    o.page >= 1 &&
    Array.isArray(o.rects) &&
    o.rects.length > 0 &&
    o.rects.every(isRect) &&
    HIGHLIGHT_COLORS.includes(o.color as HighlightColor) &&
    typeof o.text === "string"
  )
}

/** Parses the file, dropping anything malformed instead of failing. */
export function parseHighlights(text: string): HighlightsFile {
  try {
    const data = JSON.parse(text) as { files?: unknown }
    if (!data || typeof data !== "object" || !data.files || typeof data.files !== "object") {
      return { ...EMPTY, files: {} }
    }
    const files: Record<string, PdfHighlight[]> = {}
    for (const [path, list] of Object.entries(data.files as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue
      const valid = list.filter(isHighlight).map((h) => ({
        ...h,
        createdAt: typeof h.createdAt === "string" ? h.createdAt : "",
      }))
      if (valid.length) files[path] = valid
    }
    return { version: HIGHLIGHTS_VERSION, files }
  } catch {
    return { ...EMPTY, files: {} }
  }
}

export function serializeHighlights(file: HighlightsFile): string {
  const files: Record<string, PdfHighlight[]> = {}
  for (const path of Object.keys(file.files).sort()) {
    if (file.files[path].length) files[path] = file.files[path]
  }
  return JSON.stringify({ version: HIGHLIGHTS_VERSION, files }, null, 2) + "\n"
}

/** Vault-relative, forward slashes; null when the PDF is outside the vault. */
export function vaultRelative(path: string, vaultPath: string): string | null {
  const p = path.replace(/\\/g, "/")
  const v = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "")
  return p.startsWith(`${v}/`) ? p.slice(v.length + 1) : null
}

function fileIn(vaultPath: string): string {
  return `${vaultPath.replace(/[\\/]+$/, "")}/${HIGHLIGHTS_FILENAME}`
}

export async function loadHighlights(vaultPath: string): Promise<HighlightsFile> {
  const path = fileIn(vaultPath)
  try {
    if (!(await exists(path))) return { ...EMPTY, files: {} }
    return parseHighlights(await readTextFile(path))
  } catch {
    return { ...EMPTY, files: {} }
  }
}

/**
 * Replaces one PDF's highlights. Re-reads the file first so a change made in
 * another window (or synced in) for a different PDF is not overwritten.
 */
export async function saveHighlightsFor(
  vaultPath: string,
  relPath: string,
  highlights: PdfHighlight[],
): Promise<void> {
  const current = await loadHighlights(vaultPath)
  current.files[relPath] = highlights
  await writeTextFileAtomic(fileIn(vaultPath), serializeHighlights(current))
}

/** The highlight under a point given in page points, topmost (latest) first. */
export function highlightAt(
  highlights: readonly PdfHighlight[],
  page: number,
  x: number,
  y: number,
): PdfHighlight | null {
  for (let i = highlights.length - 1; i >= 0; i--) {
    const h = highlights[i]
    if (h.page !== page) continue
    if (h.rects.some(([rx, ry, rw, rh]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh)) {
      return h
    }
  }
  return null
}
