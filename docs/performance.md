# ComdTeX — Performance Audit & Optimization Guide

> Last updated: 2026-07-15. Produced by a full-code performance investigation
> (live CPU captures on a real vault + per-pass benchmarks + an 8-angle
> adversarially-verified code review). Update this document when the preview
> pipeline, the autosave path, or the per-keystroke render path changes.

## 1. Measured baselines (the numbers behind every decision here)

Environment: Arch Linux, Wayland/Sway, Intel Meteor Lake (Arc iGPU),
webkit2gtk-4.1 2.52.5, release build v1.10.1.

### Live typing capture (real vault, KaTeX-heavy document, `top -d 0.5`)

| Metric | Value |
|---|---|
| WebKitWebProcess CPU while typing continuously | **100–130% sustained, peak 165.8%** |
| Samples ≥90% CPU during a 3-min window | 75 (≈38 s) |
| CPU at idle (app open, not typing) | **0.0–0.5%** |
| RSS | ~650 MB, flat over 50 s idle (no leak; GC oscillation 600–810 MB is normal) |

Conclusions: no leak, no idle churn (with `WEBKIT_DISABLE_DMABUF_RENDERER=1`
on this hardware), the entire cost is **per-refresh work while typing**.

### Render pipeline benchmark (4 000-line doc, 400 display + 400 inline equations)

| Stage | Cost |
|---|---|
| All ~18 string passes of `renderMarkdown` combined (wikilinks, refs, prescans, headings…) | **~30 ms** (negligible individually) |
| `md.render` (markdown-it) | 21.5 ms |
| KaTeX, warm cache | small (cache works; cold adds ~170 ms once) |
| `sanitizeRenderedHtml` (DOMPurify string round-trip) | 208 ms (jsdom; native is faster but same shape) |
| **Full-document HTML parses per preview refresh (old pipeline)** | **3 parses + 2 serializes** |
| `lintContent` (the 600 ms-debounced linter) | 7.3 ms — not a problem |

The dominant cost is **not** the markdown/TeX string pipeline. It is parsing
and re-serializing the rendered HTML — which for KaTeX-heavy documents is
multi-MB (each equation explodes into hundreds of `<span>`s) — multiple times
per refresh, on the same thread that handles keystrokes:

1. `annotateSourceLines` (inside `renderMarkdown`): `DOMParser` full parse + `innerHTML` re-serialize
2. `sanitizeRenderedHtml`: DOMPurify full parse + re-serialize
3. `morphPreviewContent`: `template.innerHTML` third parse

### Single-parse pipeline (implemented 2026-07-15)

`renderMarkdown(…, { annotate: false })` → `sanitizeRenderedHtmlToFragment()`
(DOMPurify `RETURN_DOM_FRAGMENT`, identical policy via shared
`PURIFY_OPTIONS`) → `annotateSourceLinesIn(fragment, raw)` (in place) →
`morphPreviewContent(el, fragment)`.

**3 parses + 2 serializes → 1 parse + 0 serializes. Measured 2.0× on the
commit path** (jsdom benchmark, 1 600-line/400-equation doc: 5 170 ms → 2 612 ms;
native ratio is similar, absolute numbers far lower).

## 2. Architecture of the hot paths (what happens on a keystroke)

```
keystroke
 ├─ Monaco internal edit                 (native-ish, fine)
 ├─ handleChange → vault.updateContent
 │    ├─ setOpenTabs(map)                → RE-RENDERS AppContent (~3000-line JSX)  ← §4.1
 │    ├─ pendingContent.set / saveDraft  (draft queue, flushed ≤1×/300 ms)
 │    └─ autosave debounce re-arm        (800 ms)
 ├─ preview debounce re-arm              (adaptive: previewDelayMs(), 150–1500 ms)
 └─ [after debounce] setPreviewContent
      └─ previewHtml useMemo → renderMarkdown (string pipeline, ~30–350 ms by doc size)
           └─ commit useLayoutEffect → sanitize→annotate→morph (single parse)
```

Deletion (held Backspace) is the worst case: key-repeat fires ~30 events/s,
so every per-keystroke cost above is multiplied ~4–6× vs normal typing.

## 3. Review findings on the 2026-07-15 optimization work

An 8-angle high-effort review (line-by-line, removed-behavior, cross-file,
reuse, simplification, efficiency, altitude, conventions) with adversarial
verification produced these **confirmed** findings. Status here reflects the
working tree at the time of writing; keep this list in sync as they are fixed.

| # | Where | Finding | Status |
|---|---|---|---|
| 1 | `App.tsx` commit effects | **Stale `data-source-line`** — effects dep only on `[previewHtml]`; with annotations no longer baked into the string, a line-shifting edit that produces byte-identical HTML (blank line inserted, list-marker change) skips re-annotation → click-to-jump/scroll-sync land on wrong lines. Fix: add the source-text dep. | FIXED — effects dep on `[previewHtml, deferredPreviewContent]` / `[splitPreviewHtml, deferredSplitContent]`, eslint-disable removed |
| 2 | `App.tsx` menus/palette memos, `useExportActions` | **Memoization chain defeated** — `useVault` returns a fresh object per render and `vault.openFile` changes identity per keystroke; `handleSave` deps `[vault]`, export handlers dep `[vault…]` → `exportActions` → `menus`/`paletteCommands` → `MenuBar.memo` all churn per keystroke anyway. Root enabler: `updateContent` deps `[openTabs]` (`useVault.ts`) instead of the existing `openTabsRef` pattern. | FIXED — `updateContent` reads via `openTabsRef` (deps `[saveFile, autoSaveMs]`); `vaultRef` pattern in both `useExportActions` (15 handlers) and `App.tsx` (12 handlers, e.g. `handleSave` `[vault]`→`[]`); persist-tabs effect skips unchanged writes |
| 3 | `App.tsx` commit effects | **Annotation scope widened** — `annotateSourceLinesIn` walks frontmatter header (`.fm-title`) and bibliography HTML (old code annotated body only), so a frontmatter title equal to a body heading consumes the duplicate-key index and shifts jumps. Fix: skip `.fm-title`/bibliography subtrees. | FIXED — `el.closest(".frontmatter-header, .bibliography")` skip guard + regression test in `previewAnchors.test.ts` |
| 4 | `App.tsx` | **Cost refs freeze while preview hidden** — old unguarded measuring effect reset `previewCostRef` on hide; merged effect early-returns on `!el`, so the adaptive delay stays pinned (≤1500 ms) for still-visible `previewContent` consumers (OutlinePanel, breadcrumb heading, spellcheck lang, StatusBar counts): 10× staleness regression vs the old 150 ms floor. | FIXED — effect on `settings.previewVisible === false` resets both refs to 0 (150 ms floor while hidden) |
| 5 | `App.tsx` | `renderCostRef` shared by main + split panes (same callback) and written during render phase → split-pane cost poisons the main pane's debounce. Fix: per-pane cost sinks. | FIXED — `renderPreviewHtml(content, costSink?)`; only the main memo passes `renderCostRef` |
| 6 | `App.tsx` | `renderCostRef` not written on the error path (`renderErrorHtml`) → error-message refreshes lag at the stale heavy delay while the user types the fix. One-liner: measure in `finally`. | FIXED — timing moved to `finally` |
| 7 | `useExportActions.ts` | `handleExportHtml` is the only production caller left on `annotate: true` — ships `data-source-line` attrs in exported HTML and pays the parse. Then consider flipping the default. | FIXED — passes `{ annotate: false }`. Default-flip still pending (see finding 9) |
| 8 | `App.tsx`/`previewMorph.ts` | The sanitize→annotate→morph sequence is copy-pasted in two effects; the "raw `previewHtml` never reaches the DOM" invariant is comment-enforced. Fix: single `commitPreview(el, rawHtml, sourceText, onCost?)` in `previewMorph.ts`; drop `morphPreviewContent`'s now-unused string branch so the type system blocks unsanitized injection. | FIXED — `commitPreview()` exported from `previewMorph.ts` (both effects use it); `morphPreviewContent` accepts `DocumentFragment` only |
| 9 | `renderer.ts` | `opts` as 8th positional param forces `undefined,` padding at call sites (5 copies now). Prefer an options object / renderer-owned preview entry point; with zero production callers wanting `annotate: true`, consider flipping the default. | OPEN (deliberate: low-risk cleanup, batch with the next renderer touch) |
| 10 | `CLAUDE.md` | Developer note "sanitizeRenderedHtml() must wrap every renderMarkdown() call" no longer describes the fragment path. | FIXED (note updated 2026-07-15; names `commitPreview` as the sanctioned preview path) |

Refuted during verification (do not re-report): "annotating after sanitize
loses annotations for DOMPurify-altered blocks" — structurally impossible:
a stripped tag inside the 40-char key window meant the raw-side key contained
the tag markup, so the OLD pipeline failed those blocks identically.

## 4. Optimization roadmap (verified opportunities, ranked by impact)

### 4.1 Stabilize `vault` identity churn — unlocks everything else
Every keystroke currently re-renders all of `AppContent` and defeats every
downstream memo (finding 2). Concrete steps, in order:
1. ✅ DONE — `useVault.updateContent`: read tabs via `openTabsRef.current` (pattern
   already used at two other sites in the file) so the callback stops
   depending on `[openTabs]`.
2. Superseded by the `vaultRef` pattern (3): memoizing the return object
   doesn't help because per-keystroke state lives inside it.
3. ✅ DONE — App-side handlers (12) and export handlers (15) read the current
   vault through a `vaultRef` and no longer dep on `vault`/`vault.openFile`;
   `menus`/`paletteCommands`/`exportActions` memos now hold across keystrokes.
4. Longer term: move document text out of `useState` (ref + subscription /
   `useSyncExternalStore` for the few readers: StatusBar counts, preview
   scheduler). This dissolves the memo whack-a-mole (TabBar and StatusBar
   still re-render per keystroke and *cannot* be memoized while tab content
   lives in `openTabs` state).

### 4.2 Guard the remaining unconditional full-document passes (`renderer.ts`)
Cheap `indexOf` short-circuits, same pattern `maskCodeRegions`/`injectToc`
already use:
- checkbox pass (`split("\n")` + 2 regexes/line + rebuild even with zero
  `- [ ]` items),
- `TOC_MARKER_RE` replace with no `[[toc]]` in the doc,
- `attachSectionIds` (2 full-string regex replaces; guard on
  `includes("\x02SECID")`).
Also: count and consolidate the number of times one render splits the same
document with `split("\n")`.

### 4.3 KaTeX cache: FIFO-evict instead of clear-all
`katexCache.clear()` at `KATEX_CACHE_MAX` wipes entries inserted earlier in
the *same render*; sessions crossing the cap degrade to pre-cache behavior on
exactly the heaviest documents. Map preserves insertion order — evict with
`katexCache.delete(katexCache.keys().next().value)`.

### 4.4 Draft flush I/O (`useVault.ts`)
`flushDrafts` (≤1×/300 ms while typing) JSON-parses **all** stored drafts (up
to 20 full documents) and re-stringifies all of them to update one. Keep the
parsed array in module memory as authoritative, or use one localStorage key
per draft path.
Related (✅ DONE): the persist-tabs effect now compares the serialized path
list against the last-persisted value and skips the redundant
`localStorage.setItem` per keystroke.

### 4.5 Cache `buildParagraphLineMap` by `raw` identity
Rebuilt O(lines × ~8 regexes) on every commit (twice with the split pane
open). The map is read-only (mutation lives in the caller's `consumed` map);
a two-line `lastRaw`/`lastMap` module cache dedupes identical-content commits.

### 4.6 Web Worker for `renderMarkdown` (the ceiling)
After the above, the remaining per-refresh main-thread block is the string
pipeline + markdown-it (~30–350 ms by doc size). It is `string → string` and
worker-friendly, with two caveats: the resolvers (transclusion, env-refs) are
sync callbacks — pre-resolve the needed docs into a plain map before posting;
and annotation/sanitize/morph must stay on the main thread (DOM). This is the
"never blocks typing at any document size" endgame. Compare effort against
4.1–4.5 first; they may be enough.

## 5. Hardware/environment notes (this dev machine)

- `WEBKIT_DISABLE_DMABUF_RENDERER=1` is worth keeping on Intel Arc + Wayland;
  idle CPU is 0% with it. Consider a wrapper script if the release binary is
  used daily (auto-updates replace the binary, not the wrapper).
- `ps`/`watch ps` show **lifetime-average** CPU, not instantaneous — always
  measure with `top -b -d 0.5 -p <pid>` (the WebKitWebProcess child, not the
  comdtex parent).

## 6. How to reproduce the measurements

```bash
# Webview PID
WV=$(ps --ppid $(pgrep -f 'target/release/comdtex' | head -1) -o pid=,comm= | awk '/WebKit.*Web/{print $1}')

# Live CPU while typing (0.5 s samples)
top -b -d 0.5 -n 120 -p "$WV" | grep WebKit

# Idle RSS / leak check
for i in $(seq 1 10); do awk '/VmRSS/{print $2}' /proc/$WV/status; sleep 5; done
```

For pipeline benchmarks, write a throwaway `src/_bench.test.ts` that builds a
synthetic doc (sections × [inline math + display math + list]) and times
`renderMarkdown` / the sanitize+annotate+morph path under
`// @vitest-environment jsdom`; run with
`npx vitest run src/_bench.test.ts --disableConsoleIntercept`. Delete it
afterwards (don't commit benches; they time out the default 5 s test budget).
