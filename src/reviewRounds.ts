// Review rounds on git.
//
// A round is a lightweight tag `review-N` on a commit of the vault repository:
// "this is what I sent out for review". Comparing the open note with a round
// turns the text difference into CriticMarkup (criticMarkup.ts), so the
// change reads as tracked changes: additions, deletions, replacements.
//
// Two halves, both free of the UI:
//  - `diffToCriticMarkup`: a pure text diff that emits marks;
//  - the round helpers, which run git through the injected runner (the same
//    `GitRunner` the sync code uses, so they are unit-testable without git
//    and with a real repository).
//
// A round never pushes, never rewrites history and never touches the working
// tree beyond recording it in a commit.

import { acceptAll, hasCriticMarks, parseCriticMarks, rejectAll } from "./criticMarkup"
import { exclusionRegions } from "./keepMarks"
import type { GitRunner } from "./vaultSync"

// ── Diff to CriticMarkup ─────────────────────────────────────────────────────

const MAX_CELLS = 3_000_000

type Op = { t: "eq" | "del" | "ins"; s: string }

/** Longest-common-subsequence diff of two string lists, trimmed at both ends. */
function diffLists(a: string[], b: string[]): Op[] | null {
  let lo = 0
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++
  let ea = a.length
  let eb = b.length
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) {
    ea--
    eb--
  }
  const ops: Op[] = []
  for (let i = 0; i < lo; i++) ops.push({ t: "eq", s: a[i] })
  const m = ea - lo
  const n = eb - lo
  if (m * n > MAX_CELLS) return null
  const w = n + 1
  const dp = new Uint32Array((m + 1) * w)
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i * w + j] =
        a[lo + i] === b[lo + j]
          ? dp[(i + 1) * w + j + 1] + 1
          : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1])
    }
  }
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[lo + i] === b[lo + j]) {
      ops.push({ t: "eq", s: a[lo + i] })
      i++
      j++
    } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) {
      ops.push({ t: "del", s: a[lo + i++] })
    } else {
      ops.push({ t: "ins", s: b[lo + j++] })
    }
  }
  while (i < m) ops.push({ t: "del", s: a[lo + i++] })
  while (j < n) ops.push({ t: "ins", s: b[lo + j++] })
  for (let k = ea; k < a.length; k++) ops.push({ t: "eq", s: a[k] })
  return ops
}

/** Lines, with a display-math or code block kept whole as one unit. */
function lineUnits(text: string): string[] {
  const regions = exclusionRegions(text)
  const units: string[] = []
  const nextEnd = (from: number): number => {
    const k = text.indexOf("\n", from)
    return k < 0 ? text.length : k + 1
  }
  let pos = 0
  while (pos < text.length) {
    let end = nextEnd(pos)
    for (;;) {
      const r = regions.find((x) => x[0] < end && x[1] > end)
      if (!r) break
      end = nextEnd(r[1] - 1)
    }
    units.push(text.slice(pos, end))
    pos = end
  }
  return units
}

const TOKEN_RE = /[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu

/** Words, whitespace runs and punctuation; math and code are one token each. */
function tokens(text: string): string[] {
  const out: string[] = []
  let cursor = 0
  const plain = (s: string) => {
    for (const m of s.matchAll(TOKEN_RE)) out.push(m[0])
  }
  for (const [a, b] of exclusionRegions(text)) {
    plain(text.slice(cursor, a))
    out.push(text.slice(a, b))
    cursor = b
  }
  plain(text.slice(cursor))
  return out
}

function mark(kind: "add" | "del", body: string): string {
  return kind === "add" ? `{++${body}++}` : `{--${body}--}`
}

function sub(oldS: string, newS: string): string {
  // Whitespace both sides share stays outside the mark.
  const lead = /^\s*/.exec(oldS)![0]
  const lead2 = /^\s*/.exec(newS)![0]
  let l = 0
  while (l < lead.length && l < lead2.length && lead[l] === lead2[l]) l++
  const head = lead.slice(0, l)
  const o = oldS.slice(l)
  const n = newS.slice(l)
  const tail = /\s*$/.exec(o)![0]
  const tail2 = /\s*$/.exec(n)![0]
  let t = 0
  while (
    t < tail.length &&
    t < tail2.length &&
    tail[tail.length - 1 - t] === tail2[tail2.length - 1 - t]
  )
    t++
  const foot = t ? tail.slice(tail.length - t) : ""
  return `${head}{~~${o.slice(0, o.length - t)}~>${n.slice(0, n.length - t)}~~}${foot}`
}

/** Inline-level diff of two changed hunks. Returns null when it is too big. */
function inlineDiff(oldS: string, newS: string): string | null {
  const ops = diffLists(tokens(oldS), tokens(newS))
  if (!ops) return null
  // Group: a run of changes, bridged across tiny equal stretches.
  type Group = { eq: string } | { del: string; ins: string }
  const groups: Group[] = []
  let k = 0
  while (k < ops.length) {
    if (ops[k].t === "eq") {
      let s = ""
      while (k < ops.length && ops[k].t === "eq") s += ops[k++].s
      groups.push({ eq: s })
    } else {
      let del = ""
      let ins = ""
      for (;;) {
        while (k < ops.length && ops[k].t !== "eq") {
          if (ops[k].t === "del") del += ops[k].s
          else ins += ops[k].s
          k++
        }
        // Bridge a short equal stretch that sits between two changes.
        let j = k
        let bridge = ""
        while (j < ops.length && ops[j].t === "eq") bridge += ops[j++].s
        if (
          j < ops.length &&
          bridge.length > 0 &&
          bridge.length <= 3 &&
          /^[\s\p{P}]*$/u.test(bridge)
        ) {
          del += bridge
          ins += bridge
          k = j
          continue
        }
        break
      }
      groups.push({ del, ins })
    }
  }
  return groups
    .map((g) => {
      if ("eq" in g) return g.eq
      if (g.del && g.ins) return sub(g.del, g.ins)
      return g.del ? mark("del", g.del) : mark("add", g.ins)
    })
    .join("")
}

/** Whole-unit change. The line break is part of the change, so it stays inside. */
function blockChange(kind: "add" | "del", text: string): string {
  return text === "" ? "" : mark(kind, text)
}

function unitHunk(oldS: string, newS: string): string {
  if (!oldS) return blockChange("add", newS)
  if (!newS) return blockChange("del", oldS)
  const nl = oldS.endsWith("\n") && newS.endsWith("\n") ? "\n" : ""
  const o = nl ? oldS.slice(0, -1) : oldS
  const n = nl ? newS.slice(0, -1) : newS
  return `{~~${o}~>${n}~~}${nl}`
}

export interface DiffMarkup {
  markup: string
  /**
   * True when accepting every mark gives the new text and rejecting every
   * mark gives the old text. False when some part (a fenced code block that
   * changed, say, which cannot sit inside a mark) is shown as its new text
   * followed by a note, because no mark can hold it.
   */
  exact: boolean
}

const DEFAULT_NOTE = "This part changed in a way that cannot be shown as marks."

function build(a: string, b: string, inline: boolean, note: string): DiffMarkup | null {
  const ops = diffLists(lineUnits(a), lineUnits(b))
  if (!ops) return null
  let out = ""
  let exact = true
  let k = 0
  while (k < ops.length) {
    if (ops[k].t === "eq") {
      out += ops[k++].s
      continue
    }
    let del = ""
    let ins = ""
    while (k < ops.length && ops[k].t !== "eq") {
      if (ops[k].t === "del") del += ops[k].s
      else ins += ops[k].s
      k++
    }
    const candidates: string[] = []
    if (inline && del && ins) {
      const fine = inlineDiff(del, ins)
      if (fine !== null) candidates.push(fine)
    }
    candidates.push(unitHunk(del, ins))
    const ok = candidates.find((c) => acceptAll(c) === ins && rejectAll(c) === del)
    if (ok !== undefined) {
      out += ok
    } else {
      exact = false
      out += ins + (ins.endsWith("\n") || ins === "" ? "" : "\n") + `{>>${note}<<}\n`
    }
  }
  return { markup: out, exact }
}

/**
 * The difference between two versions of a note, written as CriticMarkup:
 * accepting every mark gives `newText`, rejecting every mark gives `oldText`.
 *
 * Lines that changed are compared word by word; a formula, code span or fenced
 * block is one unit, so a mark never lands inside one. A note that already
 * holds marks is compared as if they were accepted.
 *
 * A change that no mark can hold (a fenced block that differs: a fence only
 * opens at the start of a line, so it cannot sit inside a mark) is shown as
 * the new text followed by `note`, and `exact` is false. Returns null when the
 * notes are too large to compare or the marks would not read back.
 */
export function diffToCriticMarkup(
  oldText: string,
  newText: string,
  note: string = DEFAULT_NOTE,
): DiffMarkup | null {
  const a = hasCriticMarks(oldText) ? acceptAll(oldText) : oldText
  const b = hasCriticMarks(newText) ? acceptAll(newText) : newText
  if (a === b) return { markup: b, exact: true }
  for (const inline of [true, false]) {
    const r = build(a, b, inline, note)
    if (!r) continue
    // Context can change how a mark reads (a stray `{++` earlier on): check
    // the whole, and never claim exactness that does not hold.
    const holds = acceptAll(r.markup) === b && rejectAll(r.markup) === a
    if (r.exact && holds) return r
    if (!r.exact) return r
  }
  return null
}

// ── Rounds ───────────────────────────────────────────────────────────────────

export interface ReviewRound {
  /** The round number: the tag is `review-<n>`. */
  n: number
  tag: string
  /** Commit the round points at (short). */
  commit: string
  /** ISO date of that commit. */
  date: string
}

const TAG_RE = /^review-(\d+)$/

/** Every review round of the repository, oldest first. */
export async function listRounds(git: GitRunner): Promise<ReviewRound[]> {
  const r = await git([
    "for-each-ref",
    "--format=%(refname:short)\t%(objectname:short)\t%(creatordate:iso-strict)",
    "refs/tags/review-*",
  ])
  if (r.code !== 0) return []
  const rounds: ReviewRound[] = []
  for (const line of r.stdout.split("\n")) {
    const [tag, commit, date] = line.trim().split("\t")
    const m = tag ? TAG_RE.exec(tag) : null
    if (m) rounds.push({ n: Number(m[1]), tag, commit: commit ?? "", date: date ?? "" })
  }
  return rounds.sort((x, y) => x.n - y.n)
}

export type StartRoundResult =
  | { ok: true; round: ReviewRound; committed: boolean }
  | { ok: false; reason: "not-repo" | "empty" | "error"; message: string }

/**
 * Close the current state as the next round: record the vault's pending work
 * in one commit (when there is any), then tag it `review-N`. Does nothing to
 * the remote.
 */
export async function startRound(
  git: GitRunner,
  opts: { message: (n: number) => string },
): Promise<StartRoundResult> {
  const inside = await git(["rev-parse", "--is-inside-work-tree"])
  if (inside.code !== 0 || inside.stdout.trim() === "false")
    return { ok: false, reason: "not-repo", message: (inside.stderr || inside.stdout).trim() }
  const rounds = await listRounds(git)
  const n = (rounds.length ? rounds[rounds.length - 1].n : 0) + 1
  let committed = false
  const status = await git(["status", "--porcelain"])
  if (status.stdout.trim()) {
    const add = await git(["add", "-A"])
    if (add.code !== 0)
      return { ok: false, reason: "error", message: (add.stderr || add.stdout).trim() }
    const commit = await git(["commit", "-m", opts.message(n)])
    if (commit.code !== 0)
      return { ok: false, reason: "error", message: (commit.stderr || commit.stdout).trim() }
    committed = true
  }
  const head = await git(["rev-parse", "--short", "HEAD"])
  if (head.code !== 0 || !head.stdout.trim())
    return { ok: false, reason: "empty", message: (head.stderr || head.stdout).trim() }
  const tag = `review-${n}`
  const made = await git(["tag", tag, "HEAD"])
  if (made.code !== 0)
    return { ok: false, reason: "error", message: (made.stderr || made.stdout).trim() }
  const date = (await git(["log", "-1", "--format=%cI", "HEAD"])).stdout.trim()
  return { ok: true, committed, round: { n, tag, commit: head.stdout.trim(), date } }
}

/** A note as it was in a round, or null when the round did not have it. */
export async function noteAtRound(
  git: GitRunner,
  round: ReviewRound | number,
  vaultRelativePath: string,
): Promise<string | null> {
  const tag = typeof round === "number" ? `review-${round}` : round.tag
  const rel = vaultRelativePath.replace(/\\/g, "/").replace(/^\.?\//, "")
  // `./` makes git resolve the path against the vault folder, which is right
  // even when the vault sits inside a larger repository.
  const r = await git(["show", `${tag}:./${rel}`])
  return r.code === 0 ? r.stdout : null
}

export type CompareResult =
  | { ok: true; markup: string; changed: boolean; exact: boolean }
  | { ok: false; reason: "no-such-note" | "too-different" }

/** The open note compared with how it stood in `round`, as CriticMarkup. */
export async function compareWithRound(
  git: GitRunner,
  round: ReviewRound | number,
  vaultRelativePath: string,
  currentText: string,
  note?: string,
): Promise<CompareResult> {
  const before = await noteAtRound(git, round, vaultRelativePath)
  if (before === null) return { ok: false, reason: "no-such-note" }
  const diff = diffToCriticMarkup(before, currentText, note)
  if (diff === null) return { ok: false, reason: "too-different" }
  return {
    ok: true,
    markup: diff.markup,
    exact: diff.exact,
    changed:
      diff.markup !== currentText && (!diff.exact || parseCriticMarks(diff.markup).length > 0),
  }
}
