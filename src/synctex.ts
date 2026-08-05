// Minimal SyncTeX parser.
//
// SyncTeX is the cross-reference format TeX engines (pdftex/xetex/luatex)
// emit when invoked with `-synctex=1`. It records, for every typeset box and
// glyph run, the *input file* and *line number* that produced it together with
// the page and the box geometry in TeX scaled points (sp). That mapping is
// what enables:
//
//   • forward sync  : editor (file, line) -> PDF (page, x, y)
//   • inverse sync  : PDF (page, x, y)    -> editor (file, line)
//
// This module parses the **uncompressed** `.synctex` text format (a tiny,
// human-readable, line-oriented format). When a TeX engine produces a gzip'd
// `.synctex.gz`, callers are expected to gunzip it first and hand us the text
// This keeps the module dependency-free and trivially unit-testable.
//
// We deliberately implement only the subset needed for line<->position lookup:
// the preamble (unit + magnification + offsets), the input-file table, and the
// horizontal/vertical/kern/glue/box records that carry (tag, line, x, y).
//
// References: the SyncTeX file format is documented in `synctex_parser.c`
// (the canonical implementation that ships with TeX Live). This is a faithful
// but intentionally small re-implementation of the geometry-relevant parts.

/** A point/region resolved from a (tag,line) or a click. */
export interface SyncBox {
  /** SyncTeX "tag": index into the input-file table. */
  tag: number
  /** 1-based input line that produced this box. */
  line: number
  /** 1-based PDF page. */
  page: number
  /** Horizontal position, in TeX points (1pt = 65536 sp). Origin top-left. */
  x: number
  /** Vertical position, in TeX points. Origin top-left. */
  y: number
  /** Box width in points (0 for point-like records). */
  width: number
  /** Box height in points (0 for point-like records). */
  height: number
}

export interface SyncTexData {
  /** sp-per-output-unit; PDF user space is points, so this is 65536. */
  unit: number
  /** Document magnification (\mag/1000); usually 1. */
  magnification: number
  /** Page offset X in points (from the preamble X Offset). */
  offsetX: number
  /** Page offset Y in points (from the preamble Y Offset). */
  offsetY: number
  /** tag -> input file path. */
  files: Map<number, string>
  /** path -> tag (reverse of `files`). */
  tags: Map<string, number>
  /** All geometry records carrying a (tag,line) reference. */
  boxes: SyncBox[]
}

const SP_PER_PT = 65536

/**
 * Parse the textual SyncTeX format into an indexable structure.
 *
 * Tolerant by design: unknown record types are skipped, and a malformed line
 * never throws; the worst case is an empty `boxes` array, which lets callers
 * fall back to their heading-based shim.
 */
export function parseSyncTex(text: string): SyncTexData {
  const data: SyncTexData = {
    unit: SP_PER_PT,
    magnification: 1000,
    offsetX: 0,
    offsetY: 0,
    files: new Map(),
    tags: new Map(),
    boxes: [],
  }

  const lines = text.split(/\r?\n/)
  let page = 0

  for (const raw of lines) {
    if (!raw) continue
    const line = raw

    // ── Preamble key:value lines ────────────────────────────────────────────
    if (line.startsWith("Unit:")) {
      const v = Number(line.slice(5).trim())
      if (Number.isFinite(v) && v > 0) data.unit = v
      continue
    }
    if (line.startsWith("Magnification:")) {
      const v = Number(line.slice(14).trim())
      if (Number.isFinite(v) && v > 0) data.magnification = v
      continue
    }
    if (line.startsWith("X Offset:")) {
      const v = Number(line.slice(9).trim())
      if (Number.isFinite(v)) data.offsetX = v
      continue
    }
    if (line.startsWith("Y Offset:")) {
      const v = Number(line.slice(9).trim())
      if (Number.isFinite(v)) data.offsetY = v
      continue
    }

    // ── Input-file table: "Input:<tag>:<path>" ──────────────────────────────
    if (line.startsWith("Input:")) {
      const rest = line.slice(6)
      const colon = rest.indexOf(":")
      if (colon > 0) {
        const tag = Number(rest.slice(0, colon))
        const path = rest.slice(colon + 1)
        if (Number.isFinite(tag)) {
          data.files.set(tag, path)
          if (!data.tags.has(path)) data.tags.set(path, tag)
        }
      }
      continue
    }

    // ── Page boundaries: "{<page>" opens, "}<page>" closes ──────────────────
    const first = line[0]
    if (first === "{") {
      const p = Number(line.slice(1).trim())
      if (Number.isFinite(p)) page = p
      continue
    }
    if (first === "}") {
      continue
    }

    // ── Geometry records ────────────────────────────────────────────────────
    // Record types that carry (tag,line[,column]) and geometry:
    //   ( and )      : vertical box open/close      "(tag,line:x,y:w,h,d"
    //   [ and ]      : horizontal box open/close    same shape
    //   h            : horizontal-box void          same shape
    //   v            : vertical-box void
    //   x            : current record (glyph run)   "x tag,line:x,y"
    //   k            : kern                          "k tag,line:x,y:w"
    //   g            : glue                          "g tag,line:x,y"
    //   $            : math                          "$ tag,line:x,y"
    if (first === "(" || first === "[" || first === "h" || first === "v") {
      const rec = parseBoxRecord(line.slice(1), page)
      if (rec) data.boxes.push(rec)
      continue
    }
    if (first === "x" || first === "k" || first === "g" || first === "$") {
      // "x" etc. may be followed by a space then the payload.
      const body = line.slice(1).replace(/^\s+/, "")
      const rec = parsePointRecord(body, page)
      if (rec) data.boxes.push(rec)
      continue
    }
    // ")" / "]" close records and anything else: ignore.
  }

  return data
}

// "tag,line:x,y:w,h,d" or "tag,line:x,y"; leading column ("tag,line,col:")
// variants are also accepted (the column is dropped).
function parseBoxRecord(body: string, page: number): SyncBox | null {
  const segs = body.split(":")
  if (segs.length < 2) return null
  const tl = parseTagLine(segs[0])
  if (!tl) return null
  const xy = segs[1].split(",")
  const x = Number(xy[0])
  const y = Number(xy[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  let width = 0
  let height = 0
  if (segs.length >= 3) {
    const whd = segs[2].split(",")
    width = Number(whd[0]) || 0
    height = Number(whd[1]) || 0
  }
  return {
    tag: tl.tag,
    line: tl.line,
    page,
    x: x / SP_PER_PT,
    y: y / SP_PER_PT,
    width: width / SP_PER_PT,
    height: height / SP_PER_PT,
  }
}

// "tag,line:x,y" possibly with trailing ":w".
function parsePointRecord(body: string, page: number): SyncBox | null {
  const segs = body.split(":")
  if (segs.length < 2) return null
  const tl = parseTagLine(segs[0])
  if (!tl) return null
  const xy = segs[1].split(",")
  const x = Number(xy[0])
  const y = Number(xy[1])
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return {
    tag: tl.tag,
    line: tl.line,
    page,
    x: x / SP_PER_PT,
    y: y / SP_PER_PT,
    width: 0,
    height: 0,
  }
}

function parseTagLine(seg: string): { tag: number; line: number } | null {
  const parts = seg.split(",")
  if (parts.length < 2) return null
  const tag = Number(parts[0])
  const line = Number(parts[1])
  if (!Number.isFinite(tag) || !Number.isFinite(line)) return null
  return { tag, line }
}

/**
 * Inverse sync: given a PDF click in user-space points (origin top-left, the
 * same space `parseSyncTex` stores), return the best-matching source location.
 *
 * Strategy: among records on `page`, pick the one whose anchor point is closest
 * to the click (Euclidean), preferring records that vertically *contain* the
 * click within their box height when geometry is present.
 */
export function inverseSync(
  data: SyncTexData,
  page: number,
  x: number,
  y: number,
): { file: string; line: number; tag: number } | null {
  let best: SyncBox | null = null
  let bestScore = Infinity
  for (const b of data.boxes) {
    if (b.page !== page) continue
    // Vertical containment bonus: if the click falls within [y, y+height] of a
    // box, strongly prefer it (height grows downward in our top-left space).
    const dx = b.x - x
    const dy = b.y - y
    let score = dx * dx + dy * dy
    if (b.height > 0 && y >= b.y - b.height && y <= b.y + b.height) {
      score *= 0.1
    }
    if (score < bestScore) {
      bestScore = score
      best = b
    }
  }
  if (!best) return null
  const file = data.files.get(best.tag) ?? ""
  return { file, line: best.line, tag: best.tag }
}

/**
 * Forward sync: given a source (file path or tag) and line, return the PDF
 * region(s) that line produced. Returns the closest-line match when the exact
 * line was not recorded (TeX only records lines that produced output).
 */
export function forwardSync(
  data: SyncTexData,
  fileOrTag: string | number,
  line: number,
): SyncBox | null {
  const tag = typeof fileOrTag === "number"
    ? fileOrTag
    : data.tags.get(fileOrTag) ?? matchTagByBasename(data, fileOrTag)
  if (tag == null) return null

  let exact: SyncBox | null = null
  let nearest: SyncBox | null = null
  let nearestDelta = Infinity
  for (const b of data.boxes) {
    if (b.tag !== tag) continue
    if (b.line === line) {
      // Prefer the first record on the lowest page for a stable anchor.
      if (!exact || b.page < exact.page || (b.page === exact.page && b.y < exact.y)) {
        exact = b
      }
    }
    const delta = Math.abs(b.line - line)
    if (delta < nearestDelta) {
      nearestDelta = delta
      nearest = b
    }
  }
  return exact ?? nearest
}

// SyncTeX records absolute paths; callers often have only a basename or a
// vault-relative path. Fall back to a basename match when the exact key misses.
function matchTagByBasename(data: SyncTexData, path: string): number | null {
  const base = basename(path)
  for (const [tag, p] of data.files) {
    if (basename(p) === base) return tag
  }
  return null
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"))
  return i >= 0 ? p.slice(i + 1) : p
}
