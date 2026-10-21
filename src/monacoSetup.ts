import type * as monacoApi from "monaco-editor"
import type { VimAdapterInstance } from "monaco-vim"
import { lintFile, LINTER_SOURCE, type LintContext } from "./contentLinter"
import { registerCodeActions } from "./codeActions"
import { setBibHoverEntries, type BibHoverEntry } from "./editorHovers"
import { registerEditorNavigation } from "./editorNavigation"
import { parseKeepMarks } from "./keepMarks"
import { computeFoldRanges, resolveEnterOverride } from "./markdownEditing"
import { pathBasename } from "./pathUtils"
import { registerTypstLanguage } from "./typstLanguage"
import { registerComdtexLanguage, shorthandNames } from "./comdtexLanguage"
import { registerLatexLanguage } from "./latexLanguage"
import { findDisplayMathBlocks } from "./useDisplayMathPreview"
import {
  COMPLETIONS as COMPLETIONS_LOCAL,
  findEnclosingSpecialBlock,
  getSpecialBlockCompletions,
  registerCompletion,
  resolveBlockCloserEnter,
  resolveSpecialBlockTabCompletion,
  resolveTabCompletion,
  setupCompletionTriggers,
  SPECIAL_BLOCK_COMPLETIONS,
} from "./completion"
import { renderHoverKatex } from "./completion/katexPreview"

// The completion code lives in src/completion/. These re-exports keep the
// names other modules (App.tsx, commands.ts, the tests) already import.
export {
  COMPLETIONS,
  findEnclosingSpecialBlock,
  getSpecialBlockCompletions,
  resolveSpecialBlockTabCompletion,
  resolveTabCompletion,
  setCompletionCsvResolver,
  setCompletionCurrentFile,
  setCompletionKatexMacros,
  updateBibSuggestions,
  updateLabelIndex,
  updateMacroCompletions,
  updateUserSnippets,
  updateVaultFiles,
  type Completion,
  type TabCompletionResolution,
} from "./completion"

export function updateBibHoverEntries(entries: BibHoverEntry[]) {
  setBibHoverEntries(entries)
}

let completionDisposable: monacoApi.IDisposable | null = null
let codeActionsDisposable: monacoApi.IDisposable | null = null

export function setupMonaco(monaco: typeof monacoApi) {
  registerTypstLanguage(monaco)
  codeActionsDisposable?.dispose()
  codeActionsDisposable = registerCodeActions(monaco)
  registerLatexLanguage(monaco)
  // Grammar for the "markdown" language; the vocabulary is injected so the
  // grammar never imports this file.
  registerComdtexLanguage(monaco, {
    shorthands: shorthandNames(COMPLETIONS_LOCAL),
    blocks: Object.fromEntries(
      ["pseudocode", "flowchart", "truth", "graph", "plot", "commdiag"].map((type) => [
        type,
        getSpecialBlockCompletions(type) ?? [],
      ]),
    ),
  })
  completionDisposable?.dispose()
  completionDisposable = registerCompletion(monaco)

  // Auto-close $ pairs and surrounding selection in $...$
  //
  // NOTE: setLanguageConfiguration REPLACES markdown's built-in configuration
  // rather than merging into it. An earlier version of this call passed only the
  // pair options, which silently dropped markdown's `onEnterRules`; that is why
  // lists, task items and quotes stopped continuing on Enter. Everything the
  // default config provided has to be restated here.
  //
  // List/quote/table continuation is NOT reinstated as `onEnterRules`: those can
  // only append a constant string, so they cannot increment an ordered list,
  // count a table's columns, or clear an abandoned marker. `setupEditorCommands`
  // handles Enter explicitly via `resolveEnterOverride` instead: one mechanism,
  // so the two can never both fire on the same keystroke.
  monaco.languages.setLanguageConfiguration("markdown", {
    comments: { blockComment: ["<!--", "-->"] },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    surroundingPairs: [
      { open: "$", close: "$" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: "`", close: "`" },
      { open: "*", close: "*" },
      { open: "_", close: "_" },
    ],
    autoClosingPairs: [
      { open: "$", close: "$" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: "`", close: "`" },
    ],
    folding: {
      markers: { start: /^\s*<!--\s*#region\b/, end: /^\s*<!--\s*#endregion\b/ },
    },
  })

  // Folding provider for ::: blocks
  // Folding for ::: blocks AND heading sections. Heading folding is what makes a
  // single long per-subject file navigable; the range logic is pure and tested
  // in markdownEditing.test.ts.
  monaco.languages.registerFoldingRangeProvider("markdown", {
    provideFoldingRanges(model) {
      return computeFoldRanges(model.getLinesContent()).map((range) => ({
        start: range.start,
        end: range.end,
        // Region for both: Comment/Imports would put these in the wrong bucket
        // for "fold all comments"-style commands.
        kind: monaco.languages.FoldingRangeKind.Region,
      }))
    },
  })

  // Go to definition, find usages, link underlines and the hover cards for
  // ComdTeX syntax live in editorNavigation.ts / editorHovers.ts.
  registerEditorNavigation(monaco)
}

// ── Typewriter mode ───────────────────────────────────────────────────────────

export function applyTypewriterMode(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  enabled: boolean,
) {
  editor.updateOptions({
    cursorSurroundingLines: enabled ? 999 : 0,
    cursorSurroundingLinesStyle: enabled ? "all" : "default",
  })
}

// ── Vim mode ─────────────────────────────────────────────────────────────────

export async function enableVimMode(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  statusEl: HTMLElement,
): Promise<VimAdapterInstance> {
  const { initVimMode } = await import("monaco-vim")
  return initVimMode(editor, statusEl)
}

// ── Content linter (Monaco markers) ──────────────────────────────────────────

const LINTER_DEBOUNCE_MS = 600

/**
 * Attach the content linter to `editor`. Runs on every model-content change
 * (debounced) and on model switch. Returns a disposable to detach.
 *
 * @param getContext  Called on each lint pass to get the current vault state.
 */
export interface ContentLinterHandle extends monacoApi.IDisposable {
  /**
   * Force an immediate re-lint of the current model. Use when external linter
   * state changes (e.g. the spell-check setting is toggled, the active
   * spell-check language changes, or a dictionary finishes loading async).
   */
  relint(): void
}

export function setupContentLinter(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  getContext: () => LintContext,
): ContentLinterHandle {
  let debounce: ReturnType<typeof setTimeout> | null = null

  const run = () => {
    const model = editor.getModel()
    if (!model) return
    const filename = pathBasename(model.uri.path)
    const markers = lintFile(model.getValue(), filename, getContext(), monaco.MarkerSeverity)
    monaco.editor.setModelMarkers(model, LINTER_SOURCE, markers)
  }

  const schedule = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(run, LINTER_DEBOUNCE_MS)
  }

  const contentDisposable = editor.onDidChangeModelContent(schedule)
  // Re-run when the user switches tabs (model changes)
  const modelDisposable = editor.onDidChangeModel(schedule)

  // Initial pass
  setTimeout(run, 0)

  return {
    relint: run,
    dispose() {
      contentDisposable.dispose()
      modelDisposable.dispose()
      if (debounce) clearTimeout(debounce)
    },
  }
}

// ── Math hover preview (KaTeX overlay widget) ─────────────────────────────────

/**
 * Attach a math preview overlay to the editor.
 * When the cursor is inside `$...$` or `$$...$$`, renders the expression
 * with KaTeX in a floating widget above the cursor.
 */
export function setupMathHover(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  getMacros: () => Record<string, string>,
  isEnabled: () => boolean = () => true,
): monacoApi.IDisposable {
  let currentWidget: monacoApi.editor.IOverlayWidget | null = null

  const removeWidget = () => {
    if (currentWidget) {
      editor.removeOverlayWidget(currentWidget)
      currentWidget = null
    }
  }

  const updateHover = () => {
    // Gated by the same "Math preview" setting as the display-math view zones,
    // so turning the setting off hides the floating overlay too.
    if (!isEnabled()) {
      removeWidget()
      return
    }
    const model = editor.getModel()
    const cursor = editor.getPosition()
    if (!model || !cursor) {
      removeWidget()
      return
    }

    try {
      const lineText = model.getLineContent(cursor.lineNumber)
      const col = cursor.column - 1 // 0-indexed

      let mathExpr: string | null = null
      let displayMode = false
      let matchStart = -1

      // Try display math $$ ... $$ on the same line first
      // Use (?:.|$(?!\$))+? to match at least one char but allow escaped $
      const displayRe = /\$\$((?:.|\$(?!\$))+?)\$\$/g
      let m: RegExpExecArray | null
      while ((m = displayRe.exec(lineText)) !== null) {
        if (col >= m.index && col <= m.index + m[0].length) {
          mathExpr = m[1]
          displayMode = true
          matchStart = m.index
          break
        }
      }

      // Try inline math $ ... $
      if (!mathExpr) {
        const inlineRe = /\$([^$\n]+?)\$/g
        while ((m = inlineRe.exec(lineText)) !== null) {
          if (col >= m.index && col <= m.index + m[0].length) {
            mathExpr = m[1]
            displayMode = false
            matchStart = m.index
            break
          }
        }
      }

      // Try multi-line $$ block
      if (!mathExpr) {
        // Pair fences from the top of the document (the same detector as the
        // display-math view zones), so a labelled closing fence is never
        // mistaken for an opening one.
        const cursorLine = cursor.lineNumber
        const block = findDisplayMathBlocks(model).find(
          (b) => b.startLine < b.endLine && cursorLine >= b.startLine && cursorLine <= b.endLine,
        )
        if (block && block.expr.trim()) {
          mathExpr = block.expr
          displayMode = true
          matchStart = 0
        }
      }

      if (!mathExpr) {
        removeWidget()
        return
      }

      const rendered = renderHoverKatex(mathExpr, displayMode, getMacros())
      if (rendered === null) {
        removeWidget()
        return
      }

      // Get pixel position of the match start within the editor
      const screenPos = editor.getScrolledVisiblePosition({
        lineNumber: cursor.lineNumber,
        column: matchStart + 1,
      })
      if (!screenPos) {
        removeWidget()
        return
      }

      removeWidget()

      const domNode = document.createElement("div")
      domNode.className = "math-hover-widget"
      domNode.innerHTML = rendered
      // Position above the cursor line
      domNode.style.top = `${Math.max(0, screenPos.top - 4)}px`
      domNode.style.left = `${screenPos.left}px`

      const widget: monacoApi.editor.IOverlayWidget = {
        getId: () => "math-hover-preview",
        getDomNode: () => domNode,
        getPosition: () => null,
      }

      editor.addOverlayWidget(widget)
      currentWidget = widget
    } catch {
      // Swallow transient Monaco overlay/layout errors (e.g. "this.domNode.domNode")
      // during (re)mount or rapid cursor changes.
      try {
        removeWidget()
      } catch {
        /* ignore */
      }
    }
  }

  // Debounce: the cursor moves on every keystroke; rendering KaTeX + scanning
  // for the enclosing block on each was a per-keystroke cost. Coalesce.
  let hoverTimer: ReturnType<typeof setTimeout> | null = null
  const disposable = editor.onDidChangeCursorPosition(() => {
    if (hoverTimer) clearTimeout(hoverTimer)
    hoverTimer = setTimeout(updateHover, 120)
  })

  return {
    dispose() {
      if (hoverTimer) clearTimeout(hoverTimer)
      disposable.dispose()
      removeWidget()
    },
  }
}

// ── Tab expansion via onKeyDown ───────────────────────────────────────────────

export function setupEditorCommands(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  /** Read per keystroke so toggling the setting takes effect without a remount. */
  isListContinuationEnabled: () => boolean = () => true,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snippetCtrl = () => editor.getContribution<any>("snippetController2")

  editor.onKeyDown((e) => {
    if (e.keyCode !== monaco.KeyCode.Tab) return

    const ctrl = snippetCtrl()

    // Active snippet → advance to next placeholder (Monaco handles it internally)
    if (ctrl?.isInSnippet?.()) return

    const position = editor.getPosition()
    const model = editor.getModel()
    if (!position || !model) return

    const lineText = model.getLineContent(position.lineNumber)
    const beforeCursor = lineText.slice(0, position.column - 1)
    const word = model.getWordUntilPosition(position)
    // Inside a special block only its own keywords expand; never the global
    // shorthands (`sin` inside :::plot must stay plain sin(), not \sin).
    const enclosingBlock = findEnclosingSpecialBlock(
      (n) => model.getLineContent(n),
      position.lineNumber,
    )
    const inBlockCompletions = enclosingBlock ? getSpecialBlockCompletions(enclosingBlock) : null
    const resolution = inBlockCompletions
      ? resolveSpecialBlockTabCompletion(inBlockCompletions, word.word)
      : resolveTabCompletion(beforeCursor, word.word)
    if (!resolution) return

    // Take control of Tab: prevent any other handler
    e.preventDefault()
    e.stopPropagation()

    // Close the suggestion widget if open
    editor.trigger("keyboard", "hideSuggestWidget", null)

    // Insert the snippet using snippetController2
    ctrl?.insert(resolution.completion.snippet, {
      overwriteBefore: resolution.overwriteBefore,
      overwriteAfter: 0,
    })
  })

  // ── Enter: continue lists / task items / quotes / table rows / close blocks ──
  // Monaco's markdown `onEnterRules` cannot increment an ordered list, count a
  // table's columns, or clear an abandoned marker, so Enter is handled here.
  // Everything below is a single `executeEdits`, which keeps it in the native
  // undo stack: one Ctrl+Z undoes the continuation, exactly like typing it.
  // This is the ONLY Enter handler: the closing `:::` of a block opened on this
  // line is decided here too (resolveBlockCloserEnter), so two mechanisms can
  // never both fire on one keystroke.
  editor.onKeyDown((e) => {
    if (e.keyCode !== monaco.KeyCode.Enter) return
    // Shift/Ctrl/Alt+Enter are other people's shortcuts; never shadow them.
    if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return
    if (editor.getOption(monaco.editor.EditorOption.readOnly)) return

    // Enter belongs to the widget while a suggestion or snippet is active.
    if (snippetCtrl()?.isInSnippet?.()) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suggest = editor.getContribution<any>("editor.contrib.suggestController")
    if (suggest?.model?.state) return

    const model = editor.getModel()
    const selection = editor.getSelection()
    if (!model || !selection || !selection.isEmpty()) return

    const { lineNumber, column } = selection.getPosition()
    const lineText = model.getLineContent(lineNumber)
    // Mid-line Enter must split normally; continuing a marker there would
    // duplicate text the user meant to push onto the next line.
    if (column !== lineText.length + 1) return

    const fullLine = {
      startLineNumber: lineNumber,
      startColumn: 1,
      endLineNumber: lineNumber,
      endColumn: lineText.length + 1,
    }

    // `:::theorem` + Enter writes the closing fence too.
    const closer = resolveBlockCloserEnter(
      (n) => model.getLineContent(n),
      model.getLineCount(),
      lineNumber,
      column,
      model.getEOL(),
    )
    if (closer) {
      e.preventDefault()
      e.stopPropagation()
      editor.executeEdits(
        "markdownEnter",
        [{ range: { ...fullLine, startColumn: lineText.length + 1 }, text: closer.text }],
        [new monaco.Selection(closer.caretLine, 1, closer.caretLine, 1)],
      )
      return
    }

    if (!isListContinuationEnabled()) return
    const override = resolveEnterOverride(lineText, model.getOptions().tabSize)
    if (!override) return

    e.preventDefault()
    e.stopPropagation()

    if (override.kind === "replaceLine") {
      editor.executeEdits(
        "markdownEnter",
        [{ range: fullLine, text: override.text }],
        [
          new monaco.Selection(
            lineNumber,
            override.text.length + 1,
            lineNumber,
            override.text.length + 1,
          ),
        ],
      )
    } else {
      const eol = model.getEOL()
      const at = { ...fullLine, startColumn: lineText.length + 1 }
      editor.executeEdits(
        "markdownEnter",
        [{ range: at, text: eol + override.text }],
        [
          new monaco.Selection(
            lineNumber + 1,
            override.text.length + 1,
            lineNumber + 1,
            override.text.length + 1,
          ),
        ],
      )
      editor.revealPositionInCenterIfOutsideViewport({
        lineNumber: lineNumber + 1,
        column: override.text.length + 1,
      })
    }
  })

  // Keep the suggest widget coming in frontmatter, :::csv bodies, multi-cites
  // and math, without enabling quickSuggestions for prose.
  setupCompletionTriggers(editor)

  // quickSuggestions is off globally (App.tsx editor options) so the widget
  // doesn't pop while writing prose. Inside a special block with a catalog we
  // flip it on so keywords suggest as you type, and off again on exit. The
  // scan is bounded and only runs on cursor moves; options update only on
  // boundary crossings.
  let blockSuggestActive = false
  editor.onDidChangeCursorPosition((e) => {
    const model = editor.getModel()
    if (!model) return
    const type = findEnclosingSpecialBlock((n) => model.getLineContent(n), e.position.lineNumber)
    const active = type !== null && type in SPECIAL_BLOCK_COMPLETIONS
    if (active === blockSuggestActive) return
    blockSuggestActive = active
    editor.updateOptions({
      quickSuggestions: { other: active, comments: false, strings: false },
    })
  })
}

// ── Per-line comment decorations (gutter glyphs) ─────────────────────────────

export interface CommentMarker {
  /** Stable comment id (used to fire onClick callbacks). */
  id: string
  /** 1-based line number to anchor the glyph on. */
  line: number
  /** Comment body for the hover tooltip. */
  body: string
  /** Whether the comment is resolved (used for muted styling). */
  resolved: boolean
  /** Optional: line snippet at the time of creation (used for drift hint). */
  lineSnippet?: string
  /** Optional: true if `lineSnippet` no longer matches the current line. */
  drifted?: boolean
}

export interface CommentDecorationsHandle extends monacoApi.IDisposable {
  /**
   * Replace the current set of glyphs. Cheap to call on every change:
   * Monaco reconciles the decoration deltas internally.
   */
  update(markers: CommentMarker[]): void
}

/**
 * Attach gutter glyphs for per-line comments and dispatch a click callback
 * when the user clicks on one of them. Returns an `update()` method so the
 * host can refresh the marker list whenever the underlying comments change.
 */
export function setupCommentDecorations(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  onClickMarker: (id: string) => void,
): CommentDecorationsHandle {
  // Make sure the glyph margin is enabled; otherwise the gutter is hidden.
  editor.updateOptions({ glyphMargin: true })

  const collection = editor.createDecorationsCollection([])
  let markers: CommentMarker[] = []

  const buildDecorations = (items: CommentMarker[]): monacoApi.editor.IModelDeltaDecoration[] =>
    items.map((m) => ({
      range: new monaco.Range(m.line, 1, m.line, 1),
      options: {
        isWholeLine: false,
        glyphMarginClassName: `comment-glyph${m.resolved ? " resolved" : ""}${m.drifted ? " drifted" : ""}`,
        glyphMarginHoverMessage: { value: m.body || "(empty)" },
      },
    }))

  const update = (next: CommentMarker[]) => {
    markers = next
    collection.set(buildDecorations(markers))
  }

  const clickDisposable = editor.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
    const lineNumber = e.target.position?.lineNumber
    if (!lineNumber) return
    // Line might host multiple comments; fire for the first one we find.
    const hit = markers.find((m) => m.line === lineNumber)
    if (hit) onClickMarker(hit.id)
  })

  return {
    update,
    dispose() {
      clickDisposable.dispose()
      collection.clear()
    },
  }
}

// ── Keep marks ───────────────────────────────────────────────────────────────

const KEEP_MARK_DEBOUNCE_MS = 400

export interface KeepMarkDecorationsHandle extends monacoApi.IDisposable {
  /** Re-scan the current model and refresh the decorations. */
  refresh(): void
}

/**
 * Decorate keep marks (`^^texto^^` / `^^def: texto^^`) in the editor.
 *
 * This is the ONLY surface where a keep mark is visible: the preview and every
 * export collapse it to plain text (see keepMarks.ts). The decoration is
 * deliberately subtle: a faint underline on the marked range plus a gutter
 * glyph, so the writer can see their own marks without the document looking
 * annotated.
 *
 * Scanning goes through `parseKeepMarks`, so math (`$x^{2^^3}$`, `^` is
 * LaTeX superscript) and code (`` `^^x^^` ``, fences) are excluded here exactly
 * as they are everywhere else.
 */
export function setupKeepMarkDecorations(
  editor: monacoApi.editor.IStandaloneCodeEditor,
  monaco: typeof monacoApi,
  onClickGlyph: () => void,
): KeepMarkDecorationsHandle {
  editor.updateOptions({ glyphMargin: true })
  const collection = editor.createDecorationsCollection([])
  let glyphLines = new Set<number>()

  const refresh = () => {
    const model = editor.getModel()
    if (!model) return
    const marks = parseKeepMarks(model.getValue())
    glyphLines = new Set(marks.map((m) => m.line))
    collection.set(
      marks.map((m) => {
        const start = model.getPositionAt(m.index)
        const end = model.getPositionAt(m.index + m.raw.length)
        return {
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: {
            inlineClassName: "keep-mark-inline",
            glyphMarginClassName: "keep-mark-glyph",
            hoverMessage: { value: m.category ? `${m.category}: ${m.text}` : m.text },
          },
        }
      }),
    )
  }

  // Debounced like the content linter: a full-document scan on every keystroke
  // is exactly the class of work v1.9.5 spent a release removing.
  let debounce: ReturnType<typeof setTimeout> | null = null
  const schedule = () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(refresh, KEEP_MARK_DEBOUNCE_MS)
  }

  const changeDisposable = editor.onDidChangeModelContent(schedule)
  const modelDisposable = editor.onDidChangeModel(schedule)
  const clickDisposable = editor.onMouseDown((e) => {
    if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return
    const line = e.target.position?.lineNumber
    if (line && glyphLines.has(line)) onClickGlyph()
  })
  refresh()

  return {
    refresh,
    dispose() {
      if (debounce) clearTimeout(debounce)
      changeDisposable.dispose()
      modelDisposable.dispose()
      clickDisposable.dispose()
      collection.clear()
    },
  }
}
