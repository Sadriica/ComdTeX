import { open, save } from "@tauri-apps/plugin-dialog"
import { copyFile, exists, readFile, readTextFile, remove, writeFile, writeTextFile } from "@tauri-apps/plugin-fs"
import { openPath } from "@tauri-apps/plugin-opener"
import { Command } from "@tauri-apps/plugin-shell"
import { extractAnkiCards, exportAnkiTsv } from "./ankiExport"
import { toDiskContent } from "./cmdxFormat"
import { parseLatexStderr } from "./latexErrors"
import type { LatexDiagnostic } from "./latexErrors"
import { toExportMarkdownContent, toPandocMarkdownInput } from "./exportConversion"
import { exportReveal, exportToTex } from "./exporter"
import { extractFrontmatter } from "./frontmatter"
import { MACROS_FILENAME } from "./macros"
import { pathJoin, pathBasename, pathDirname } from "./pathUtils"
import { composeProjectMarkdown, type ProjectFile } from "./projectExport"
import { buildTexLineMap } from "./texLineMap"
import { resolveTransclusions } from "./transclusion"
import { getSharedWasmTexEngine, type WasmTexResult } from "./wasmTex"

/** SyncTeX bundle for the last successful local compile. */
export interface SyncTexBundle {
  /** Uncompressed .synctex text, ready for parseSyncTex. */
  synctex: string
  /** tex line -> editor source line (see texLineMap.ts). */
  texToSrc: number[]
}

export interface ActiveDocument {
  path: string
  name: string
  content: string
}

export interface ExportMessages {
  pandocMissing: string
  generatingPdf: string
  pdfDone: string
  pandocError: (message: string) => string
  backupSuccess: string
  backupError: string
  copiedLatex: string
  copyError: string
  revealExportSuccess: string
  revealExportError: string
  noMainDocument: string
  pdfCompiledLocal: string
  pdfCompiledWasm?: string
  compilationFailed: (err: string) => string
  zipMissing: string
  wasmTexInitializing?: string
  wasmTexCompiling?: string
  wasmTexFallback?: string
  wasmTexUnavailable?: string
}

export interface AnkiExportMessages {
  ankiNoCards: string
  ankiExported: (n: number) => string
}

export interface ExportDialogTitles {
  saveAs: string
  exportMd: string
  exportTex: string
  exportPdf: string
  exportReveal: string
}

export interface ExportActionsContext {
  activeFile: ActiveDocument | null
  vaultPath: string | null
  activePath: string | null
  vaultFiles: ProjectFile[]
  deps: { pandoc?: boolean; zip?: boolean; typst?: boolean } | null
  dialogs: ExportDialogTitles
  messages: ExportMessages
  readEditorContent: () => string | null
  reloadVault: () => Promise<void>
  resolveTransclusion: (target: string) => string | null
  toast: (message: string, kind?: "success" | "error" | "info", duration?: number) => void
  writeClipboard: (text: string) => Promise<void>
  onLatexError?: (diagnostics: LatexDiagnostic[]) => void
  /**
   * Whether the WASM LaTeX engine should be tried before falling back to
   * a locally-installed compiler. Defaults to true when omitted.
   */
  useWasmTex?: boolean
  /**
   * TeX package server used by the WASM engine for on-demand `.sty`/font
   * downloads. Omitted → the engine's built-in default.
   */
  texliveUrl?: string
  /**
   * Notified once the PDF is written to disk so callers can refresh the
   * preview pane.
   */
  onPdfSaved?: (outPath: string) => void
  /**
   * Notified when the WASM engine starts and stops compiling so callers can
   * surface a status indicator.
   */
  onWasmStatus?: (state: "idle" | "initializing" | "compiling") => void
  /**
   * Notified with SyncTeX data after a successful LOCAL compile (the WASM
   * engine emits none, so its successes report null: stale data must never
   * outlive the PDF it described).
   */
  onSyncTex?: (bundle: SyncTexBundle | null) => void
}

/** Gunzip via the browser's DecompressionStream; null when unsupported. */
async function gunzipToText(bytes: Uint8Array): Promise<string | null> {
  try {
    if (typeof DecompressionStream === "undefined") return null
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
    return await new Response(stream).text()
  } catch {
    return null
  }
}

/**
 * Read the .synctex(.gz) an engine left beside its output and turn it into a
 * bundle mapped back to the editor's source. Best-effort: any failure is null.
 */
export async function collectSyncTex(
  dir: string,
  jobname: string,
  sourceContent: string,
  tex: string,
): Promise<SyncTexBundle | null> {
  try {
    const gzPath = `${dir}/${jobname}.synctex.gz`
    const plainPath = `${dir}/${jobname}.synctex`
    let text: string | null = null
    if (await exists(gzPath)) {
      text = await gunzipToText(await readFile(gzPath))
    } else if (await exists(plainPath)) {
      text = await readTextFile(plainPath)
    }
    if (!text) return null
    return { synctex: text, texToSrc: buildTexLineMap(sourceContent, tex) }
  } catch {
    return null
  }
}

async function readMacros(vaultPath: string | null): Promise<string> {
  if (!vaultPath) return ""
  try {
    const macrosPath = await pathJoin(vaultPath, MACROS_FILENAME)
    return await exists(macrosPath) ? await readTextFile(macrosPath) : ""
  } catch {
    return ""
  }
}

function frontmatterOptions(data: Record<string, unknown> | undefined) {
  return {
    headerLeft: data?.headerLeft as string,
    headerCenter: data?.headerCenter as string,
    headerRight: data?.headerRight as string,
    footerLeft: data?.footerLeft as string,
    footerCenter: data?.footerCenter as string,
    footerRight: data?.footerRight as string,
  }
}

async function buildLatex(
  content: string,
  titleGuess: string,
  vaultPath: string | null,
  resolveTransclusion: (target: string) => string | null,
): Promise<string> {
  const macrosText = await readMacros(vaultPath)
  const resolvedContent = resolveTransclusions(content, resolveTransclusion)
  const parsed = extractFrontmatter(resolvedContent)
  const fm = parsed?.data
  return exportToTex(
    resolvedContent,
    macrosText,
    (fm?.title as string) || titleGuess,
    fm?.author as string | undefined,
    frontmatterOptions(fm),
  )
}

export async function saveCurrentFileAs(ctx: Pick<ExportActionsContext, "activeFile" | "dialogs" | "readEditorContent" | "reloadVault">) {
  const content = ctx.readEditorContent()
  if (content === null) return
  const path = await save({
    title: ctx.dialogs.saveAs,
    filters: [{ name: "Documentos", extensions: ["md", "tex"] }],
    defaultPath: ctx.activeFile?.name,
  })
  if (!path) return
  await writeTextFile(path, toDiskContent(path, content))
  await ctx.reloadVault()
}

export async function exportMarkdown(ctx: ExportActionsContext) {
  const content = ctx.readEditorContent()
  if (content === null) return
  const path = await save({
    title: ctx.dialogs.exportMd,
    filters: [{ name: "Markdown", extensions: ["md"] }],
    defaultPath: ctx.activeFile?.name.replace(/\.[^.]+$/, ".md") ?? "export.md",
  })
  if (!path) return
  await writeTextFile(path, toExportMarkdownContent(content))
}

export async function exportLatex(ctx: ExportActionsContext) {
  const content = ctx.readEditorContent()
  if (content === null) return
  const titleGuess = ctx.activeFile?.name.replace(/\.[^.]+$/, "") ?? ""
  const tex = await buildLatex(content, titleGuess, ctx.vaultPath, ctx.resolveTransclusion)
  const path = await save({
    title: ctx.dialogs.exportTex,
    filters: [{ name: "LaTeX", extensions: ["tex"] }],
    defaultPath: ctx.activeFile?.name.replace(/\.[^.]+$/, ".tex") ?? "export.tex",
  })
  if (!path) return
  await writeTextFile(path, tex)
}

export async function exportProjectLatex(ctx: ExportActionsContext) {
  const content = composeProjectMarkdown(ctx.vaultFiles, ctx.activePath)
  if (!content) {
    ctx.toast(ctx.messages.noMainDocument, "error")
    return
  }
  const macrosText = await readMacros(ctx.vaultPath)
  const parsed = extractFrontmatter(content)
  const fm = parsed?.data
  const title = (fm?.title as string) || ctx.activeFile?.name.replace(/\.[^.]+$/, "") || "project"
  const tex = exportToTex(content, macrosText, title, fm?.author as string | undefined)
  const path = await save({
    title: ctx.dialogs.exportTex,
    filters: [{ name: "LaTeX", extensions: ["tex"] }],
    defaultPath: `${title.replace(/[^\w.-]+/g, "-").toLowerCase()}.tex`,
  })
  if (!path) return
  await writeTextFile(path, tex)
}

async function tryCompileWithWasm(
  tex: string,
  ctx: ExportActionsContext,
): Promise<WasmTexResult | null> {
  try {
    ctx.onWasmStatus?.("initializing")
    if (ctx.messages.wasmTexInitializing) {
      ctx.toast(ctx.messages.wasmTexInitializing, "info", 2000)
    }
    const { engine, ready } = getSharedWasmTexEngine()
    await ready
    ctx.onWasmStatus?.("compiling")
    if (ctx.messages.wasmTexCompiling) {
      ctx.toast(ctx.messages.wasmTexCompiling, "info", 2500)
    }
    const result = await engine.compile(tex, {
      mainFile: "main.tex",
      texliveUrl: ctx.texliveUrl,
      onProgress: (m) => {
        // Surface package-level progress as a fleeting toast.
        if (m) ctx.toast(`LaTeX: ${m}`, "info", 1500)
      },
    })
    return result
  } catch (err) {
    return {
      status: "error",
      pdf: null,
      log: err instanceof Error ? err.message : String(err),
    }
  } finally {
    ctx.onWasmStatus?.("idle")
  }
}

export async function compileLatexPdf(ctx: ExportActionsContext) {
  const content = ctx.readEditorContent()
  const currentFile = ctx.activeFile
  if (content === null || !currentFile) return
  const tex = await buildLatex(content, currentFile.name.replace(/\.[^.]+$/, ""), ctx.vaultPath, ctx.resolveTransclusion)
  const outPath = await save({
    title: ctx.dialogs.exportPdf,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: `${pathDirname(currentFile.path) || "."}/${currentFile.name.replace(/\.[^.]+$/, ".pdf")}`,
  })
  if (!outPath) return

  // ── Step 1 — try the bundled WASM engine if enabled ─────────────────────
  // WASM diagnostics are HELD here, not shown yet: a local engine may still
  // succeed (Step 2), and popping an error modal over a successful export
  // reads as failure. The modal only appears if every engine failed.
  let wasmDiags: LatexDiagnostic[] = []
  const wantWasm = ctx.useWasmTex !== false
  if (wantWasm) {
    const wasm = await tryCompileWithWasm(tex, ctx)
    if (wasm && wasm.status === "ok" && wasm.pdf) {
      await writeFile(outPath, wasm.pdf)
      // The WASM engine ships without synctex output: clear any bundle from
      // a previous local compile so clicks fall back to the heading shim
      // instead of landing via a map that describes an older PDF.
      ctx.onSyncTex?.(null)
      ctx.onPdfSaved?.(outPath)
      await openPath(outPath).catch(() => { /* file saved; opener failure is non-fatal */ })
      ctx.toast(ctx.messages.pdfCompiledWasm ?? ctx.messages.pdfCompiledLocal, "success")
      return
    }
    if (wasm && wasm.status === "error") {
      wasmDiags = parseLatexStderr(wasm.log)
    }
    if (wasm && wasm.status === "unavailable" && ctx.messages.wasmTexFallback) {
      ctx.toast(ctx.messages.wasmTexFallback, "info", 3000)
    }
  }

  // ── Step 2 — fall back to local LaTeX toolchain ─────────────────────────
  const dir = pathDirname(currentFile.path) || "."
  const base = currentFile.name.replace(/\.[^.]+$/, "")
  const tmpTex = `${dir}/${base}.comdtex-compile.tex`
  const tmpPdf = `${dir}/${base}.comdtex-compile.pdf`
  await writeTextFile(tmpTex, tex)
  const jobname = `${base}.comdtex-compile`
  // -synctex=1 makes the engine emit <jobname>.synctex.gz beside the PDF,
  // which is what powers click-to-source in the preview.
  const attempts: Array<[string, string[]]> = [
    ["tectonic", ["--synctex", tmpTex, "--outdir", dir]],
    ["xelatex", ["-interaction=nonstopmode", "-halt-on-error", "-synctex=1", `-jobname=${jobname}`, tmpTex]],
    ["pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "-synctex=1", `-jobname=${jobname}`, tmpTex]],
  ]
  let lastError = ""
  try {
    for (const [cmdName, args] of attempts) {
      try {
        const result = await Command.create(cmdName, args, { cwd: dir }).execute()
        if (result.code === 0 && await exists(tmpPdf)) {
          await copyFile(tmpPdf, outPath)
          ctx.onSyncTex?.(await collectSyncTex(dir, jobname, content, tex))
          ctx.onPdfSaved?.(outPath)
          await openPath(outPath).catch(() => { /* file saved; opener failure is non-fatal */ })
          ctx.toast(ctx.messages.pdfCompiledLocal, "success")
          return
        }
        lastError = result.stderr || result.stdout || `${cmdName} falló`
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    // Every engine failed — NOW surface the held WASM diagnostics (they are
    // usually the most readable), falling back to the local engines' stderr.
    if (ctx.onLatexError && wasmDiags.length > 0) {
      ctx.onLatexError(wasmDiags)
    }
    ctx.toast(ctx.messages.compilationFailed(lastError), "error", 8000)
  } finally {
    await remove(tmpTex).catch(() => {})
    await remove(tmpPdf).catch(() => {})
    await remove(`${dir}/${jobname}.aux`).catch(() => {})
    await remove(`${dir}/${jobname}.log`).catch(() => {})
    await remove(`${dir}/${jobname}.synctex.gz`).catch(() => {})
    await remove(`${dir}/${jobname}.synctex`).catch(() => {})
  }
}

export async function exportPdf(ctx: ExportActionsContext) {
  const content = ctx.readEditorContent()
  const currentFile = ctx.activeFile
  if (content === null || !currentFile) {
    window.print()
    return
  }
  if (ctx.deps && !ctx.deps.pandoc) {
    ctx.toast(ctx.messages.pandocMissing, "info", 6000)
    window.print()
    return
  }
  const outPath = await save({
    title: ctx.dialogs.exportPdf,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: `${pathDirname(currentFile.path) || "."}/${currentFile.name.replace(/\.[^.]+$/, ".pdf")}`,
  })
  if (!outPath) return

  const parsed = extractFrontmatter(content)
  const fm = parsed?.data ?? {}
  const papersize = (fm.papersize as string) || "a4"
  const orientation = (fm.orientation as string) || "portrait"

  // Build fancyhdr preamble if any header/footer fields are set
  const hdrFields = [
    fm.headerLeft, fm.headerCenter, fm.headerRight,
    fm.footerLeft, fm.footerCenter, fm.footerRight,
  ]
  const hasHeaderFooter = hdrFields.some((v) => v && String(v).trim() !== "")

  function resolveHdrVars(s: string): string {
    return s
      .replace(/\{\{title\}\}/g, "\\thetitle")
      .replace(/\{\{author\}\}/g, "\\theauthor")
      .replace(/\{\{date\}\}/g, "\\thedate")
      .replace(/\{\{page\}\}/g, "\\thepage")
  }

  const tempHdrPath = `${currentFile.path}.comdtex-hdr.tex`

  try {
    ctx.toast(ctx.messages.generatingPdf, "info")
    const tempInputPath = `${currentFile.path}.comdtex-export.tmp.md`
    await writeTextFile(tempInputPath, toPandocMarkdownInput(content))

    const pandocArgs: string[] = [
      tempInputPath,
      "--pdf-engine=xelatex",
      "--standalone",
      "-V", `papersize=${papersize}`,
      "-V", `geometry:margin=2.5cm${orientation === "landscape" ? ",landscape" : ""}`,
      "-V", "fontsize=11pt",
      "--mathjax",
      "-o", outPath,
    ]

    if (hasHeaderFooter) {
      const preamble = [
        "\\usepackage{fancyhdr}",
        "\\pagestyle{fancy}",
        `\\fancyhead[L]{${resolveHdrVars(String(fm.headerLeft ?? ""))}}`,
        `\\fancyhead[C]{${resolveHdrVars(String(fm.headerCenter ?? ""))}}`,
        `\\fancyhead[R]{${resolveHdrVars(String(fm.headerRight ?? ""))}}`,
        `\\fancyfoot[L]{${resolveHdrVars(String(fm.footerLeft ?? ""))}}`,
        `\\fancyfoot[C]{${resolveHdrVars(String(fm.footerCenter ?? ""))}}`,
        `\\fancyfoot[R]{${resolveHdrVars(String(fm.footerRight ?? ""))}}`,
      ].join("\n")
      await writeTextFile(tempHdrPath, preamble)
      pandocArgs.push("--include-in-header", tempHdrPath)
    }

    // Engine preference: tectonic first — it fetches missing packages on
    // demand, so it survives the partial TeX installs that break xelatex/
    // pdflatex with "xcolor.sty not found"-style errors. Then XeLaTeX (full
    // Unicode), then pdflatex. The FIRST failure's stderr is kept for the
    // diagnostics modal when every engine fails (it names the root cause;
    // later engines usually just repeat a vaguer variant of it).
    let result: { code: number | null; stderr: string; stdout: string } | null = null
    let firstFailure: { code: number | null; stderr: string; stdout: string } | null = null
    for (const engine of ["tectonic", "xelatex", "pdflatex"]) {
      const args = pandocArgs.map((a) => (a === "--pdf-engine=xelatex" ? `--pdf-engine=${engine}` : a))
      try {
        const attempt = await Command.create("pandoc", args).execute()
        if (attempt.code === 0) { result = attempt; break }
        if (!firstFailure) firstFailure = attempt
      } catch {
        // pandoc itself unavailable/denied — try the next engine anyway
      }
    }
    if (!result) result = firstFailure ?? { code: -1, stderr: "pandoc failed", stdout: "" }
    await remove(tempInputPath).catch(() => {})
    if (hasHeaderFooter) await remove(tempHdrPath).catch(() => {})
    if (result.code !== 0) {
      const stderrText = result.stderr || ""
      if (ctx.onLatexError) {
        const diags = parseLatexStderr(stderrText)
        if (diags.length > 0) {
          ctx.onLatexError(diags)
          ctx.toast(ctx.messages.pandocError("See error details"), "error")
          return
        }
      }
      throw new Error(stderrText || "pandoc failed")
    }
    ctx.toast(ctx.messages.pdfDone, "success")
    ctx.onPdfSaved?.(outPath)
    await openPath(outPath).catch(() => { /* file saved; opener failure is non-fatal */ })
  } catch (err) {
    await remove(`${currentFile.path}.comdtex-export.tmp.md`).catch(() => {})
    if (hasHeaderFooter) await remove(tempHdrPath).catch(() => {})
    ctx.toast(ctx.messages.pandocError((err as Error).message), "error")
  }
}

export async function backupVault(ctx: ExportActionsContext) {
  if (!ctx.vaultPath) return
  if (ctx.deps && !ctx.deps.zip) {
    ctx.toast(ctx.messages.zipMissing, "error", 6000)
    return
  }
  const outPath = await save({ filters: [{ name: "ZIP Archive", extensions: ["zip"] }] })
  if (!outPath) return
  try {
    const vaultName = pathBasename(ctx.vaultPath) || "vault"
    const result = await Command.create("zip", ["-r", outPath, vaultName], { cwd: ctx.vaultPath + "/.." }).execute()
    if (result.code !== 0) throw new Error(result.stderr)
    ctx.toast(ctx.messages.backupSuccess, "success")
    await openPath(outPath).catch(() => { /* file saved; opener failure is non-fatal */ })
  } catch (e) {
    ctx.toast(ctx.messages.backupError, "error")
    console.error(e)
  }
}

export async function copyLatex(ctx: ExportActionsContext) {
  const file = ctx.activeFile
  if (!file) return
  try {
    const tex = await buildLatex(file.content, file.name.replace(/\.[^.]+$/, ""), ctx.vaultPath, ctx.resolveTransclusion)
    await ctx.writeClipboard(tex)
    ctx.toast(ctx.messages.copiedLatex, "success")
  } catch {
    ctx.toast(ctx.messages.copyError, "error")
  }
}

export async function exportRevealHtml(ctx: ExportActionsContext) {
  const content = ctx.readEditorContent()
  if (content === null || !ctx.activeFile) return
  const title = ctx.activeFile.name.replace(/\.[^.]+$/, "")
  const html = exportReveal(content, title)
  try {
    const path = await save({
      title: ctx.dialogs.exportReveal,
      filters: [{ name: "HTML", extensions: ["html"] }],
      defaultPath: ctx.activeFile.name.replace(/\.[^.]+$/, ".html"),
    })
    if (!path) return
    await writeTextFile(path, html)
    ctx.toast(ctx.messages.revealExportSuccess, "success")
    await openPath(path)
  } catch {
    ctx.toast(ctx.messages.revealExportError, "error")
  }
}

export interface ImportMessages {
  pandocMissing: string
  importing: string
  importSuccess: (name: string) => string
  importError: (err: string) => string
}

export interface ImportActionsContext {
  vaultPath: string | null
  deps: { pandoc?: boolean; zip?: boolean } | null
  dialogTitle: string
  messages: ImportMessages
  toast: (message: string, kind?: "success" | "error" | "info", duration?: number) => void
  /** Refresh the file tree so the freshly written file appears. */
  reloadVault: () => Promise<void>
  /** Open the imported file in a new tab. */
  openFilePath: (path: string) => Promise<void>
}

// Map a source extension to an explicit pandoc input format. When a format is
// not listed pandoc infers it from the extension, which works for docx/odt/epub
// etc. — we only pin the ambiguous ones.
const PANDOC_INPUT_FORMATS: Record<string, string> = {
  tex: "latex",
  htm: "html",
  rst: "rst",
  org: "org",
}

/**
 * Import an external document via pandoc, converting it to GitHub-flavored
 * Markdown and dropping the result into the vault root as a new `.md` file,
 * then opening it.
 *
 * For DOCX/ODT/EPUB sources pandoc can embed images; we extract them to a
 * sibling media folder so links resolve. If extraction fails for any reason
 * pandoc still emits the text+math, so the import is never blocked by media.
 */
export async function importDocument(ctx: ImportActionsContext) {
  if (!ctx.vaultPath) return
  if (ctx.deps && !ctx.deps.pandoc) {
    ctx.toast(ctx.messages.pandocMissing, "error", 6000)
    return
  }

  const source = await open({
    title: ctx.dialogTitle,
    multiple: false,
    directory: false,
    filters: [{ name: "Documentos", extensions: ["docx", "odt", "tex", "html", "htm", "epub", "rtf", "md", "markdown", "rst", "org"] }],
  })
  if (!source || typeof source !== "string") return

  const srcName = pathBasename(source)
  const ext = (srcName.match(/\.([^.]+)$/)?.[1] ?? "").toLowerCase()
  const stem = srcName.replace(/\.[^.]+$/, "") || "imported"

  // Pick a safe, unique target name in the vault root (append a counter on collision).
  let outName = `${stem}.md`
  let outPath = await pathJoin(ctx.vaultPath, outName)
  let counter = 1
  while (await exists(outPath)) {
    outName = `${stem}-${counter}.md`
    outPath = await pathJoin(ctx.vaultPath, outName)
    counter++
  }

  // Extract embedded images alongside the new file so links resolve.
  const mediaDir = await pathJoin(ctx.vaultPath, `${stem}-media`)

  const args: string[] = [source, "-t", "gfm", "-o", outPath, "--extract-media", mediaDir]
  const inputFormat = PANDOC_INPUT_FORMATS[ext]
  if (inputFormat) args.unshift("-f", inputFormat) // pandoc reads flags before the input path too

  try {
    ctx.toast(ctx.messages.importing, "info")
    const result = await Command.create("pandoc", args).execute()
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "pandoc failed")
    await ctx.reloadVault()
    await ctx.openFilePath(outPath)
    ctx.toast(ctx.messages.importSuccess(outName), "success")
  } catch (e) {
    ctx.toast(ctx.messages.importError(e instanceof Error ? e.message : String(e)), "error", 8000)
    console.error(e)
  }
}

export interface TypstMessages {
  pandocMissing: string
  generating: string
  typstSuccess: string
  typstError: (err: string) => string
  typstPdfSuccess: string
  typstPdfError: (err: string) => string
}

export interface TypstExportContext {
  activeFile: ActiveDocument | null
  deps: { pandoc?: boolean; zip?: boolean; typst?: boolean } | null
  dialogTitle: string
  messages: TypstMessages
  readEditorContent: () => string | null
  toast: (message: string, kind?: "success" | "error" | "info", duration?: number) => void
}

/**
 * Export the current document to a Typst markup file (`.typ`).
 *
 * We deliberately reuse pandoc's `-t typst` writer rather than hand-rolling a
 * Markdown→Typst converter: Typst's math syntax differs substantially from
 * LaTeX, and pandoc already handles the conversion well. Guards on pandoc being
 * present; never crashes when it is missing.
 */
export async function exportTypst(ctx: TypstExportContext) {
  const file = ctx.activeFile
  const content = ctx.readEditorContent()
  if (content === null || !file) return
  if (ctx.deps && !ctx.deps.pandoc) {
    ctx.toast(ctx.messages.pandocMissing, "error", 6000)
    return
  }
  const outPath = await save({
    title: ctx.dialogTitle,
    filters: [{ name: "Typst", extensions: ["typ"] }],
    defaultPath: file.name.replace(/\.[^.]+$/, ".typ"),
  })
  if (!outPath) return
  const tmpPath = await pathJoin(pathDirname(outPath) || ".", `${pathBasename(outPath)}.comdtex-typst.tmp.md`)
  try {
    ctx.toast(ctx.messages.generating, "info")
    await writeTextFile(tmpPath, toPandocMarkdownInput(content))
    const result = await Command.create("pandoc", [tmpPath, "-t", "typst", "--standalone", "-o", outPath]).execute()
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || "pandoc failed")
    ctx.toast(ctx.messages.typstSuccess, "success")
  } catch (e) {
    ctx.toast(ctx.messages.typstError(e instanceof Error ? e.message : String(e)), "error", 8000)
    console.error(e)
  } finally {
    await remove(tmpPath).catch(() => {})
  }
}

/**
 * Export the current document to PDF by piping pandoc's Typst output through
 * the `typst compile` binary. Only meaningful when both pandoc and typst are
 * installed; callers gate the action's visibility on `deps.typst`. Guards on
 * both tools so the action can never crash when one is missing.
 */
export async function exportTypstPdf(ctx: TypstExportContext) {
  const file = ctx.activeFile
  const content = ctx.readEditorContent()
  if (content === null || !file) return
  if (ctx.deps && !ctx.deps.pandoc) {
    ctx.toast(ctx.messages.pandocMissing, "error", 6000)
    return
  }
  if (ctx.deps && !ctx.deps.typst) return
  const outPath = await save({
    title: ctx.dialogTitle,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: file.name.replace(/\.[^.]+$/, ".pdf"),
  })
  if (!outPath) return
  const dir = pathDirname(outPath) || "."
  const base = pathBasename(outPath).replace(/\.[^.]+$/, "")
  const tmpMd = await pathJoin(dir, `${base}.comdtex-typst.tmp.md`)
  const tmpTyp = await pathJoin(dir, `${base}.comdtex-typst.tmp.typ`)
  try {
    ctx.toast(ctx.messages.generating, "info")
    await writeTextFile(tmpMd, toPandocMarkdownInput(content))
    const pandoc = await Command.create("pandoc", [tmpMd, "-t", "typst", "--standalone", "-o", tmpTyp]).execute()
    if (pandoc.code !== 0) throw new Error(pandoc.stderr || pandoc.stdout || "pandoc failed")
    const typst = await Command.create("typst", ["compile", tmpTyp, outPath]).execute()
    if (typst.code !== 0) throw new Error(typst.stderr || typst.stdout || "typst failed")
    ctx.toast(ctx.messages.typstPdfSuccess, "success")
    await openPath(outPath).catch(() => { /* file saved; opener failure is non-fatal */ })
  } catch (e) {
    ctx.toast(ctx.messages.typstPdfError(e instanceof Error ? e.message : String(e)), "error", 8000)
    console.error(e)
  } finally {
    await remove(tmpMd).catch(() => {})
    await remove(tmpTyp).catch(() => {})
  }
}

export async function exportAnkiCardsToFile(
  ctx: Pick<ExportActionsContext, "activeFile" | "readEditorContent" | "toast">,
  messages: AnkiExportMessages,
): Promise<void> {
  const content = ctx.readEditorContent()
  if (content === null) return
  const cards = extractAnkiCards(content)
  if (cards.length === 0) {
    ctx.toast(messages.ankiNoCards, "error")
    return
  }
  const path = await save({
    filters: [{ name: "Anki cards", extensions: ["txt"] }],
    defaultPath: ctx.activeFile?.name.replace(/\.[^.]+$/, "-anki-cards.txt") ?? "anki-cards.txt",
  })
  if (!path) return
  await writeTextFile(path, exportAnkiTsv(cards))
  ctx.toast(messages.ankiExported(cards.length), "success")
}
