import { save } from "@tauri-apps/plugin-dialog"
import { copyFile, exists, readTextFile, remove, writeTextFile } from "@tauri-apps/plugin-fs"
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
import { pathJoin } from "./pathUtils"
import { composeProjectMarkdown, type ProjectFile } from "./projectExport"
import { resolveTransclusions } from "./transclusion"

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
  exportDocxSuccess: string
  exportDocxError: string
  exportBeamerSuccess: string
  exportBeamerError: string
  backupSuccess: string
  backupError: string
  copiedLatex: string
  copyError: string
  revealExportSuccess: string
  revealExportError: string
  noMainDocument: string
  pdfCompiledLocal: string
  compilationFailed: (err: string) => string
  zipMissing: string
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
  deps: { pandoc?: boolean; zip?: boolean } | null
  dialogs: ExportDialogTitles
  messages: ExportMessages
  readEditorContent: () => string | null
  reloadVault: () => Promise<void>
  resolveTransclusion: (target: string) => string | null
  toast: (message: string, kind?: "success" | "error" | "info", duration?: number) => void
  writeClipboard: (text: string) => Promise<void>
  onLatexError?: (diagnostics: LatexDiagnostic[]) => void
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

export async function compileLatexPdf(ctx: ExportActionsContext) {
  const content = ctx.readEditorContent()
  const currentFile = ctx.activeFile
  if (content === null || !currentFile) return
  const tex = await buildLatex(content, currentFile.name.replace(/\.[^.]+$/, ""), ctx.vaultPath, ctx.resolveTransclusion)
  const outPath = await save({
    title: ctx.dialogs.exportPdf,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    defaultPath: currentFile.name.replace(/\.[^.]+$/, ".pdf"),
  })
  if (!outPath) return

  const dir = currentFile.path.split("/").slice(0, -1).join("/") || "."
  const base = currentFile.name.replace(/\.[^.]+$/, "")
  const tmpTex = `${dir}/${base}.comdtex-compile.tex`
  const tmpPdf = `${dir}/${base}.comdtex-compile.pdf`
  await writeTextFile(tmpTex, tex)
  const attempts: Array<[string, string[]]> = [
    ["tectonic", [tmpTex, "--outdir", dir]],
    ["xelatex", ["-interaction=nonstopmode", "-halt-on-error", `-jobname=${base}.comdtex-compile`, tmpTex]],
    ["pdflatex", ["-interaction=nonstopmode", "-halt-on-error", `-jobname=${base}.comdtex-compile`, tmpTex]],
  ]
  let lastError = ""
  try {
    for (const [cmdName, args] of attempts) {
      try {
        const result = await Command.create(cmdName, args, { cwd: dir }).execute()
        if (result.code === 0 && await exists(tmpPdf)) {
          await copyFile(tmpPdf, outPath)
          await openPath(outPath)
          ctx.toast(ctx.messages.pdfCompiledLocal, "success")
          return
        }
        lastError = result.stderr || result.stdout || `${cmdName} falló`
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
      }
    }
    ctx.toast(ctx.messages.compilationFailed(lastError), "error", 8000)
  } finally {
    await remove(tmpTex).catch(() => {})
    await remove(tmpPdf).catch(() => {})
    await remove(`${dir}/${base}.comdtex-compile.aux`).catch(() => {})
    await remove(`${dir}/${base}.comdtex-compile.log`).catch(() => {})
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
    defaultPath: currentFile.name.replace(/\.[^.]+$/, ".pdf"),
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

    const result = await Command.create("pandoc", pandocArgs).execute()
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
    await openPath(outPath)
  } catch (err) {
    await remove(`${currentFile.path}.comdtex-export.tmp.md`).catch(() => {})
    if (hasHeaderFooter) await remove(tempHdrPath).catch(() => {})
    ctx.toast(ctx.messages.pandocError((err as Error).message), "error")
  }
}

export async function exportDocx(ctx: ExportActionsContext) {
  const file = ctx.activeFile
  if (!file) return
  if (ctx.deps && !ctx.deps.pandoc) {
    ctx.toast(ctx.messages.pandocMissing, "error", 6000)
    return
  }
  const outPath = await save({ filters: [{ name: "Word Document", extensions: ["docx"] }] })
  if (!outPath) return
  const tmpPath = outPath.replace(/\.docx$/i, "_tmp.md")
  try {
    await writeTextFile(tmpPath, toPandocMarkdownInput(file.content))
    const result = await Command.create("pandoc", [tmpPath, "-o", outPath, "--standalone"]).execute()
    if (result.code !== 0) throw new Error(result.stderr)
    await remove(tmpPath)
    ctx.toast(ctx.messages.exportDocxSuccess, "success")
  } catch (e) {
    try { await remove(tmpPath) } catch {}
    ctx.toast(ctx.messages.exportDocxError, "error")
    console.error(e)
  }
}

export async function exportBeamer(ctx: ExportActionsContext) {
  const file = ctx.activeFile
  if (!file) return
  if (ctx.deps && !ctx.deps.pandoc) {
    ctx.toast(ctx.messages.pandocMissing, "error", 6000)
    return
  }
  const outPath = await save({ filters: [{ name: "PDF Slides (Beamer)", extensions: ["pdf"] }] })
  if (!outPath) return
  const tmpPath = outPath.replace(/\.pdf$/i, "_tmp.md")
  try {
    await writeTextFile(tmpPath, toPandocMarkdownInput(file.content))
    const result = await Command.create("pandoc", [tmpPath, "-o", outPath, "-t", "beamer", "--standalone"]).execute()
    if (result.code !== 0) throw new Error(result.stderr)
    await remove(tmpPath)
    ctx.toast(ctx.messages.exportBeamerSuccess, "success")
    await openPath(outPath)
  } catch (e) {
    try { await remove(tmpPath) } catch {}
    ctx.toast(ctx.messages.exportBeamerError, "error")
    console.error(e)
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
    const vaultName = ctx.vaultPath.split("/").pop() ?? "vault"
    const result = await Command.create("zip", ["-r", outPath, vaultName], { cwd: ctx.vaultPath + "/.." }).execute()
    if (result.code !== 0) throw new Error(result.stderr)
    ctx.toast(ctx.messages.backupSuccess, "success")
    await openPath(outPath)
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
