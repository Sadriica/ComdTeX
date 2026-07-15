// Extracted from App.tsx: the export/import/compile handlers. These are thin
// wrappers over exportActions.ts, moved verbatim (no behavior change) to keep
// App.tsx smaller. See CLAUDE.md — App.tsx is a documented refactor target.
import { useCallback, useMemo, type RefObject } from "react"
import type * as monaco from "monaco-editor"
import { save } from "@tauri-apps/plugin-dialog"
import { writeTextFile, readTextFile, exists, copyFile, remove } from "@tauri-apps/plugin-fs"
import { Command } from "@tauri-apps/plugin-shell"
import { openPath } from "@tauri-apps/plugin-opener"
import { renderMarkdown } from "./renderer"
import { sanitizeRenderedHtml } from "./sanitizeRenderedHtml"
import { pathJoin, pathDirname } from "./pathUtils"
import { MACROS_FILENAME } from "./macros"
import type { KatexMacros } from "./macros"
import type { BibEntry } from "./bibtex"
import { exportToTex, exportReveal } from "./exporter"
import {
  exportPdf as exportPdfAction,
  exportAnkiCardsToFile,
  compileLatexPdf as compileLatexPdfAction,
  importDocument as importDocumentAction,
  exportTypst as exportTypstAction,
  exportTypstPdf as exportTypstPdfAction,
} from "./exportActions"
import type { ProjectFile } from "./projectExport"
import { toPandocMarkdownInput } from "./exportConversion"
import type { LatexDiagnostic } from "./latexErrors"
import { exportToObsidianMarkdown } from "./obsidianExport"
import { extractFrontmatter } from "./frontmatter"
import type { DepStatus } from "./checkDeps"
import { resolveTransclusions } from "./transclusion"
import { composeProjectMarkdown } from "./projectExport"
import { showToast } from "./toastService"
import type { useVault } from "./useVault"
import type { T } from "./i18n"

export interface ExportActionsCtx {
  editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>
  vault: ReturnType<typeof useVault>
  t: T
  deps: DepStatus | null
  vaultFiles: ProjectFile[]
  transclusionResolver: (target: string) => string | null
  useWasmTex: boolean
  macros: KatexMacros
  wikiNames: Set<string>
  bibMap: Map<string, BibEntry>
  pdfPath: string | null
  setLatexDiagnostics: (diags: LatexDiagnostic[] | null) => void
  setPdfPath: (path: string | null | ((prev: string | null) => string | null)) => void
  setTexEngineState: (state: "idle" | "initializing" | "compiling") => void
}

export function useExportActions(ctx: ExportActionsCtx) {
  const {
    editorRef, vault, t, deps, vaultFiles, transclusionResolver, useWasmTex,
    macros, wikiNames, bibMap, pdfPath, setLatexDiagnostics, setPdfPath, setTexEngineState,
  } = ctx

  const handleExportMd = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.app.dialogExportMd,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".md") ?? "export.md",
    })
    if (!path) return
    // Export Markdown produces clean Obsidian/GFM Markdown (lossy by design).
    await writeTextFile(path, exportToObsidianMarkdown(editor.getValue()))
  }, [vault, t, editorRef])

  const handleExportTex = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    let macrosText = ""
    if (vault.vaultPath) {
      try {
        const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
        if (await exists(mp)) macrosText = await readTextFile(mp)
      } catch { /* ok */ }
    }
    const titleGuess = vault.openFile?.name.replace(/\.[^.]+$/, "") ?? ""
    const content = resolveTransclusions(editor.getValue(), transclusionResolver)
    const parsed = extractFrontmatter(content)
    const fm = parsed?.data
    const author = fm?.author as string | undefined
    const tex = exportToTex(
      content,
      macrosText,
      (fm?.title as string) || titleGuess,
      author,
      { headerLeft: fm?.headerLeft as string, headerCenter: fm?.headerCenter as string, headerRight: fm?.headerRight as string, footerLeft: fm?.footerLeft as string, footerCenter: fm?.footerCenter as string, footerRight: fm?.footerRight as string }
    )
    const path = await save({
      title: t.app.dialogExportTex,
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".tex") ?? "export.tex",
    })
    if (!path) return
    await writeTextFile(path, tex)
  }, [vault, t, transclusionResolver, editorRef])

  const handleExportProjectTex = useCallback(async () => {
    let macrosText = ""
    if (vault.vaultPath) {
      try {
        const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
        if (await exists(mp)) macrosText = await readTextFile(mp)
      } catch { /* ok */ }
    }
    const content = composeProjectMarkdown(vaultFiles, vault.activeTabPath)
    if (!content) {
      showToast(t.app.noMainDocument, "error")
      return
    }
    const parsed = extractFrontmatter(content)
    const fm = parsed?.data
    const title = (fm?.title as string) || vault.openFile?.name.replace(/\.[^.]+$/, "") || "project"
    const tex = exportToTex(content, macrosText, title, fm?.author as string | undefined)
    const path = await save({
      title: t.palette.exportProjectTex,
      filters: [{ name: "LaTeX", extensions: ["tex"] }],
      defaultPath: `${title.replace(/[^\w.-]+/g, "-").toLowerCase()}.tex`,
    })
    if (!path) return
    await writeTextFile(path, tex)
  }, [vault.vaultPath, vault.activeTabPath, vault.openFile, vaultFiles, t])

  const handleCompileLatexPdf = useCallback(async (opts?: { forceWasm?: boolean }) => {
    await compileLatexPdfAction({
      activeFile: vault.openFile,
      vaultPath: vault.vaultPath,
      activePath: vault.activeTabPath,
      vaultFiles,
      deps,
      dialogs: {
        saveAs: "Save as",
        exportMd: t.app.dialogExportMd,
        exportTex: t.app.dialogExportTex,
        exportPdf: t.app.dialogExportPdf,
        exportReveal: "Export Reveal.js",
      },
      messages: {
        pandocMissing: t.app.pandocMissing,
        generatingPdf: t.app.generatingPdf,
        pdfDone: t.app.pdfDone,
        pandocError: t.app.pandocError,
        backupSuccess: t.app.backupSuccess,
        backupError: t.app.backupError,
        copiedLatex: t.app.copiedLatex,
        copyError: t.app.copyError,
        revealExportSuccess: t.app.revealExportSuccess,
        revealExportError: t.app.revealExportError,
        noMainDocument: t.app.noMainDocument,
        pdfCompiledLocal: t.app.pdfCompiledLocal,
        compilationFailed: t.app.compilationFailed,
        zipMissing: t.app.zipMissing,
        wasmTexInitializing: t.settings.wasmTexInitializing,
        wasmTexCompiling: t.settings.wasmTexCompiling,
        wasmTexFallback: t.settings.wasmTexFallback,
        wasmTexUnavailable: t.settings.wasmTexUnavailable,
      },
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      reloadVault: async () => { await vault.loadVault?.() },
      resolveTransclusion: transclusionResolver,
      toast: showToast,
      writeClipboard: (text) => navigator.clipboard.writeText(text),
      onLatexError: (diags) => setLatexDiagnostics(diags),
      useWasmTex: opts?.forceWasm ?? useWasmTex,
      onPdfSaved: setPdfPath,
      onWasmStatus: (state) => setTexEngineState(state),
    })
  }, [vault, t, deps, vaultFiles, transclusionResolver, useWasmTex, editorRef, setLatexDiagnostics, setPdfPath, setTexEngineState])

  // ── Auto-rebuild PDF on save (when PDF preview is open + setting on) ─────
  // We recompile to the existing pdfPath, no dialog. Skips silently on error.
  const rebuildPdfInPlace = useCallback(async () => {
    const editor = editorRef.current
    const currentFile = vault.openFile
    if (!editor || !currentFile || !pdfPath) return
    let macrosText = ""
    if (vault.vaultPath) {
      try {
        const mp = await pathJoin(vault.vaultPath, MACROS_FILENAME)
        if (await exists(mp)) macrosText = await readTextFile(mp)
      } catch { /* ok */ }
    }
    const content = resolveTransclusions(editor.getValue(), transclusionResolver)
    const parsed = extractFrontmatter(content)
    const fm = parsed?.data
    const title = (fm?.title as string) || currentFile.name.replace(/\.[^.]+$/, "")
    const tex = exportToTex(content, macrosText, title, fm?.author as string | undefined)
    const dir = pathDirname(currentFile.path) || "."
    const base = currentFile.name.replace(/\.[^.]+$/, "")
    const tmpTex = `${dir}/${base}.comdtex-rebuild.tex`
    const tmpPdf = `${dir}/${base}.comdtex-rebuild.pdf`
    try {
      await writeTextFile(tmpTex, tex)
      const attempts: Array<[string, string[]]> = [
        ["tectonic", [tmpTex, "--outdir", dir]],
        ["xelatex", ["-interaction=nonstopmode", "-halt-on-error", `-jobname=${base}.comdtex-rebuild`, tmpTex]],
        ["pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `-jobname=${base}.comdtex-rebuild`, tmpTex]],
      ]
      for (const [cmdName, args] of attempts) {
        try {
          const result = await Command.create(cmdName, args, { cwd: dir }).execute()
          if (result.code === 0 && await exists(tmpPdf)) {
            await copyFile(tmpPdf, pdfPath)
            // Force PdfPreviewPanel to reload by re-setting the same path with a
            // cache-busting suffix is awkward (Tauri convertFileSrc); instead we
            // toggle the path through null then back so the effect re-runs.
            const restore = pdfPath
            setPdfPath(null)
            setTimeout(() => setPdfPath(restore), 0)
            return
          }
        } catch { /* try next engine */ }
      }
    } finally {
      await remove(tmpTex).catch(() => {})
      await remove(tmpPdf).catch(() => {})
      await remove(`${dir}/${base}.comdtex-rebuild.aux`).catch(() => {})
      await remove(`${dir}/${base}.comdtex-rebuild.log`).catch(() => {})
    }
  }, [vault.openFile, vault.vaultPath, pdfPath, transclusionResolver, editorRef, setPdfPath])

  const handleExportPdf = useCallback(async () => {
    await exportPdfAction({
      activeFile: vault.openFile,
      vaultPath: vault.vaultPath,
      activePath: vault.activeTabPath,
      vaultFiles,
      deps,
      dialogs: { saveAs: "Save as", exportMd: t.app.dialogExportMd, exportTex: t.app.dialogExportTex, exportPdf: t.app.dialogExportPdf, exportReveal: "Export Reveal.js" },
      messages: { pandocMissing: t.app.pandocMissing, generatingPdf: t.app.generatingPdf, pdfDone: t.app.pdfDone, pandocError: t.app.pandocError, backupSuccess: t.app.backupSuccess, backupError: t.app.backupError, copiedLatex: t.app.copiedLatex, copyError: t.app.copyError, revealExportSuccess: t.app.revealExportSuccess, revealExportError: t.app.revealExportError, noMainDocument: t.app.noMainDocument, pdfCompiledLocal: t.app.pdfCompiledLocal, compilationFailed: t.app.compilationFailed, zipMissing: t.app.zipMissing },
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      reloadVault: async () => { await vault.loadVault?.() },
      resolveTransclusion: transclusionResolver,
      toast: showToast,
      writeClipboard: (text) => navigator.clipboard.writeText(text),
      onLatexError: (diags) => setLatexDiagnostics(diags),
      onPdfSaved: (path) => setPdfPath(path),
    })
  }, [vault, t, deps, vaultFiles, transclusionResolver, editorRef, setLatexDiagnostics, setPdfPath])

  const handleExportAnki = useCallback(async () => {
    await exportAnkiCardsToFile(
      { activeFile: vault.openFile, readEditorContent: () => editorRef.current?.getValue() ?? null, toast: showToast },
      { ankiNoCards: t.ankiExport.ankiNoCards, ankiExported: t.ankiExport.ankiExported },
    )
  }, [vault.openFile, t, editorRef])

  const handleImportDocument = useCallback(async () => {
    await importDocumentAction({
      vaultPath: vault.vaultPath,
      deps,
      dialogTitle: t.app.importDocTitle,
      messages: {
        pandocMissing: t.app.pandocMissingImport,
        importing: t.app.importing,
        importSuccess: t.app.importSuccess,
        importError: t.app.importError,
      },
      toast: showToast,
      reloadVault: vault.loadVault,
      openFilePath: vault.openFilePath,
    })
  }, [vault.vaultPath, vault.loadVault, vault.openFilePath, t, deps])

  const typstMessages = useMemo(() => ({
    pandocMissing: t.app.pandocMissingTypst,
    generating: t.app.typstGenerating,
    typstSuccess: t.app.typstSuccess,
    typstError: t.app.typstError,
    typstPdfSuccess: t.app.typstPdfSuccess,
    typstPdfError: t.app.typstPdfError,
  }), [t])

  const handleExportTypst = useCallback(async () => {
    await exportTypstAction({
      activeFile: vault.openFile,
      deps,
      dialogTitle: t.app.typstExportTitle,
      messages: typstMessages,
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      toast: showToast,
    })
  }, [vault.openFile, deps, t, typstMessages, editorRef])

  const handleExportTypstPdf = useCallback(async () => {
    await exportTypstPdfAction({
      activeFile: vault.openFile,
      deps,
      dialogTitle: t.app.typstExportTitle,
      messages: typstMessages,
      readEditorContent: () => editorRef.current?.getValue() ?? null,
      toast: showToast,
    })
  }, [vault.openFile, deps, t, typstMessages, editorRef])

  const handleExportDocx = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    if (deps && !deps.pandoc) {
      showToast(t.app.pandocMissingDocx, "error", 6000)
      return
    }
    const outPath = await save({ filters: [{ name: "Word Document", extensions: ["docx"] }] })
    if (!outPath) return
    // Derive the temp path by APPENDING, not by swapping a `.docx` suffix: the
    // GTK save dialog on Linux doesn't reliably auto-append the filter
    // extension, so a `.replace(/\.docx$/…)` would be a no-op and tmpPath would
    // equal outPath — pandoc would then read+write the same path and `remove`
    // would delete the user's chosen file, destroying it.
    const tmpPath = `${outPath}.comdtex-tmp.md`
    try {
      await writeTextFile(tmpPath, toPandocMarkdownInput(editorRef.current?.getValue() ?? file.content))
      const cmd = Command.create("pandoc", [tmpPath, "-o", outPath, "--standalone"])
      const result = await cmd.execute()
      if (result.code !== 0) throw new Error(result.stderr)
      await remove(tmpPath)
      showToast(t.app.exportDocxSuccess, "success")
    } catch (e) {
      try { await remove(tmpPath) } catch {}
      showToast(t.app.exportDocxError, "error")
      console.error(e)
    }
  }, [vault.openFile, t, deps, editorRef])

  const handleExportBeamer = useCallback(async () => {
    const file = vault.openFile
    if (!file) return
    if (deps && !deps.pandoc) {
      showToast(t.app.pandocMissingBeamer, "error", 6000)
      return
    }
    const outPath = await save({ filters: [{ name: "PDF Slides (Beamer)", extensions: ["pdf"] }] })
    if (!outPath) return
    // Append rather than swap the `.pdf` suffix — see handleExportDocx: an
    // extension-less outPath would otherwise make tmpPath === outPath and the
    // final `remove` would destroy the user's chosen file.
    const tmpPath = `${outPath}.comdtex-tmp.md`
    try {
      await writeTextFile(tmpPath, toPandocMarkdownInput(editorRef.current?.getValue() ?? file.content))
      const cmd = Command.create("pandoc", [tmpPath, "-o", outPath, "-t", "beamer", "--standalone"])
      const result = await cmd.execute()
      if (result.code !== 0) throw new Error(result.stderr)
      await remove(tmpPath)
      showToast(t.app.exportBeamerSuccess, "success")
      await openPath(outPath)
    } catch (e) {
      try { await remove(tmpPath) } catch {}
      showToast(t.app.exportBeamerError, "error")
      console.error(e)
    }
  }, [vault.openFile, t, deps, editorRef])

  // ── Reveal.js export ──────────────────────────────────────────────────────
  const handleExportReveal = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || !vault.openFile) return
    const content = editor.getValue()
    const title = vault.openFile.name.replace(/\.[^.]+$/, "")
    const html = exportReveal(content, title)
    try {
      const path = await save({
        title: t.palette.exportReveal,
        filters: [{ name: "HTML", extensions: ["html"] }],
        defaultPath: vault.openFile.name.replace(/\.[^.]+$/, ".html"),
      })
      if (!path) return
      await writeTextFile(path, html)
      showToast(t.app.revealExportSuccess, "success")
      await openPath(path)
    } catch {
      showToast(t.app.revealExportError, "error")
    }
  }, [vault.openFile, t, editorRef])

  // ── HTML export ───────────────────────────────────────────────────────────
  const handleExportHtml = useCallback(async () => {
    const editor = editorRef.current
    if (!editor || !vault.openFile) return
    const content = editor.getValue()
    let html: string
    try {
      html = sanitizeRenderedHtml(
        renderMarkdown(content, macros, vault.vaultPath ?? undefined, wikiNames, bibMap, transclusionResolver)
      )
    } catch { return }

    const previewCss = `
      body{max-width:860px;margin:2rem auto;padding:0 1.5rem;font-family:Georgia,serif;line-height:1.7;color:#1a1a1a}
      h1,h2,h3,h4,h5,h6{font-family:system-ui,sans-serif;margin:1.5em 0 .5em;line-height:1.2}
      pre,code{font-family:monospace;background:#f4f4f4;border-radius:4px}
      pre{padding:1em;overflow:auto}code{padding:2px 5px}
      blockquote{border-left:4px solid #ccc;margin:0;padding-left:1em;color:#555}
      table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:.5em}
      .eq-block{position:relative;text-align:center;margin:1em 0}
      .eq-number{position:absolute;right:0;top:50%;transform:translateY(-50%);color:#888}
      .fig-block{text-align:center;margin:1.5em 0}figcaption{font-size:.9em;color:#555}
      .callout{border-left:4px solid #888;padding:.75em 1em;margin:1em 0;background:#f9f9f9}
    `

    const standalone = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${vault.openFile.name.replace(/\.[^.]+$/, "")}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<style>${previewCss}</style>
</head>
<body>
${html}
</body>
</html>`

    const path = await save({
      title: t.palette.exportHtml,
      filters: [{ name: "HTML", extensions: ["html"] }],
      defaultPath: vault.openFile.name.replace(/\.[^.]+$/, ".html"),
    })
    if (!path) return
    await writeTextFile(path, standalone)
    showToast(t.app.htmlExported, "success")
    await openPath(path)
  }, [vault, macros, wikiNames, bibMap, transclusionResolver, t, editorRef])

  const handleExportObsidian = useCallback(async () => {
    const editor = editorRef.current; if (!editor) return
    const path = await save({
      title: t.palette.exportObsidian,
      filters: [{ name: "Markdown", extensions: ["md"] }],
      defaultPath: vault.openFile?.name.replace(/\.[^.]+$/, ".md") ?? "export.md",
    })
    if (!path) return
    await writeTextFile(path, exportToObsidianMarkdown(editor.getValue()))
    showToast(t.app.revealExportSuccess, "success")
  }, [vault, t, editorRef])

  return {
    handleExportMd,
    handleExportTex,
    handleExportProjectTex,
    handleCompileLatexPdf,
    rebuildPdfInPlace,
    handleExportPdf,
    handleExportAnki,
    handleImportDocument,
    handleExportTypst,
    handleExportTypstPdf,
    handleExportDocx,
    handleExportBeamer,
    handleExportReveal,
    handleExportHtml,
    handleExportObsidian,
  }
}
