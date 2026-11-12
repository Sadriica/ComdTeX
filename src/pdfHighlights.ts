/**
 * Highlights on PDF pages, kept in the vault next to the notes
 * (`.comdtex-pdf-highlights.json`) so they travel with the vault and never
 * touch the PDF itself: a compiled PDF is rewritten by every compile, and a
 * paper you read stays byte for byte what you downloaded.
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

/**
 * Turns the client rectangles of a selection into page rectangles: clipped to
 * the sheet, converted to points, tiny slivers dropped, and the rectangles of
 * one line merged (a line is many text runs, each with its own rectangle).
 */
export function selectionRectsOnPage(
  clientRects: ArrayLike<{ left: number; top: number; right: number; bottom: number }>,
  sheet: { left: number; top: number; right: number; bottom: number },
  scale: number,
): HighlightRect[] {
  const rects: HighlightRect[] = []
  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i]
    const left = Math.max(r.left, sheet.left)
    const right = Math.min(r.right, sheet.right)
    const top = Math.max(r.top, sheet.top)
    const bottom = Math.min(r.bottom, sheet.bottom)
    if (right - left < 1 || bottom - top < 1) continue
    rects.push([
      (left - sheet.left) / scale,
      (top - sheet.top) / scale,
      (right - left) / scale,
      (bottom - top) / scale,
    ])
  }
  rects.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const merged: HighlightRect[] = []
  for (const r of rects) {
    const last = merged[merged.length - 1]
    // Same line: vertical overlap of more than half the shorter height, and
    // touching or overlapping horizontally (runs of one line sit side by side).
    if (last) {
      const overlap = Math.min(last[1] + last[3], r[1] + r[3]) - Math.max(last[1], r[1])
      const sameLine = overlap > Math.min(last[3], r[3]) / 2
      // Justified lines are one run per word: bridge gaps up to about a word
      // space (half the line height) so a highlighted line reads as one mark.
      const gap = Math.min(last[3], r[3]) * 0.6
      const touches = r[0] <= last[0] + last[2] + gap && r[0] + r[2] >= last[0] - gap
      if (sameLine && touches) {
        const x = Math.min(last[0], r[0])
        const y = Math.min(last[1], r[1])
        const right = Math.max(last[0] + last[2], r[0] + r[2])
        const bottom = Math.max(last[1] + last[3], r[1] + r[3])
        merged[merged.length - 1] = [x, y, right - x, bottom - y]
        continue
      }
    }
    merged.push(r)
  }
  return merged.map((r) => r.map((n) => Math.round(n * 100) / 100) as HighlightRect)
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

export function newHighlightId(): string {
  return `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
