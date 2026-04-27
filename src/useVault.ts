import { useState, useCallback, useRef, useEffect } from "react"
import { readDir, readTextFile, writeTextFile, mkdir, remove, rename, stat } from "@tauri-apps/plugin-fs"
import { open, save, message } from "@tauri-apps/plugin-dialog"
import { pathJoin, pathDirname, displayBasename } from "./pathUtils"
import type { FileNode, OpenFile, SearchResult } from "./types"
import { showToast } from "./toastService"
import { useT } from "./i18n"
import { extractDetailedTags, extractFrontmatter } from "./frontmatter"
import { analyzeConversion, storageFormatForPath, toEditorContent, toDiskContent } from "./cmdxFormat"

const VAULT_KEY   = "comdtex_vault"
const TABS_KEY    = "comdtex_tabs"
const ACTIVE_KEY  = "comdtex_active"
const DRAFTS_KEY  = "comdtex_drafts"
const RECENT_KEY  = "comdtex_recent_vaults"
const CLOSED_KEY  = "comdtex_closed_tabs"
const MAX_RECENT_VAULTS = 5
const MAX_CLOSED_TABS = 20

function loadRecentVaults(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") }
  catch { return [] }
}

function loadClosedTabs(): string[] {
  try { return JSON.parse(localStorage.getItem(CLOSED_KEY) ?? "[]") }
  catch { return [] }
}

function saveClosedTab(path: string) {
  const current = loadClosedTabs()
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_CLOSED_TABS)
  localStorage.setItem(CLOSED_KEY, JSON.stringify(next))
}

function saveRecentVault(path: string) {
  const current = loadRecentVaults()
  const next = [path, ...current.filter((p) => p !== path)].slice(0, MAX_RECENT_VAULTS)
  localStorage.setItem(RECENT_KEY, JSON.stringify(next))
}

function editorModeForPath(path: string): "md" | "tex" {
  return storageFormatForPath(path) === "tex" ? "tex" : "md"
}

function showConversionWarnings(path: string, content: string, phase: "opening" | "saving") {
  const format = storageFormatForPath(path)
  if (!format) return
  const warnings = analyzeConversion(content, format).warnings
  if (warnings.length === 0) return
  const first = warnings[0]
  const verb = phase === "opening" ? "abrir" : "guardar"
  showToast(`CMDX: ${warnings.length} advertencia(s) al ${verb} ${displayBasename(path)}. Línea ${first.line}: ${first.message}`, "info", 7000)
}

export const README_FILENAME = "README.md"

export const README_CONTENT = `# Mi Vault — ComdTeX

> Este archivo es tuyo. Edítalo, bórralo, o úsalo como punto de partida.
> Es tu área de juego para explorar todas las funciones de ComdTeX.

---

## Entornos matemáticos

Escribe \`:::tipo[Título]\` para abrir un entorno y \`:::\` para cerrarlo.
Añade \`sm\` o \`lg\` antes del tipo para cambiar el tamaño.

:::lg definition[Límite de una función]
Sea $f: \\mathbb{R} \\to \\mathbb{R}$. Decimos que $\\lim_{x \\to a} f(x) = L$ si
para todo $\\varepsilon > 0$ existe $\\delta > 0$ tal que

$$0 < |x - a| < \\delta \\implies |f(x) - L| < \\varepsilon$$ {#eq:limite}
:::

:::theorem[Unicidad del límite]
Si $\\lim_{x \\to a} f(x) = L$ y $\\lim_{x \\to a} f(x) = M$, entonces $L = M$.
:::

:::proof
Supón $L \\neq M$ y toma $\\varepsilon = |L - M|/2$ en @eq:limite. Contradicción. $\\square$
:::

:::sm remark
Los entornos \`proof\`, \`remark\` y \`note\` no llevan número automático.
:::

---

## Shorthands — escribe y pulsa Tab

Los shorthands funcionan dentro y fuera de \`$...$\`. Pruébalos aquí:

La serie armónica: $sum(n=1, \\infty) frac(1, n)$ diverge.

Norma de un vector: norm(vec(v)) = sqrt(sup(v,T) v)

Derivada parcial: pder(u, t) = pder(sup(u,2), x) (ecuación del calor)

Matriz identidad 3×3: mat(1,0,0, 0,1,0, 0,0,1)

---

## Ecuaciones y referencias cruzadas

$$\\sum_{n=0}^{\\infty} x^n = \\frac{1}{1-x}, \\quad |x| < 1$$ {#eq:geom}

$$e^{i\\pi} + 1 = 0$$ {#eq:euler}

La serie geométrica (@eq:geom) y la identidad de Euler (@eq:euler) son dos de las
fórmulas más elegantes de las matemáticas.

---

## Wikilinks

Enlaza otras notas del vault con \`[[nombre-de-nota]]\`. Haz clic en el preview para navegar.
La pestaña **←** de la barra lateral muestra qué notas enlazan a la activa.

---

## Tabla de ejemplo

table(Concepto, Definición, Ejemplo)

---

## Siguientes pasos

- Abre \`macros.md\` desde **Vault → Editar macros.md** para definir tus propios comandos LaTeX
- Añade entradas en \`references.bib\` y cita con \`[@clave]\`
- Crea nuevas notas con el botón **+** en la barra lateral
- Explora las plantillas en **Archivo → Nuevo desde plantilla**
`

// Extensions that are never plain text
const BINARY_EXTS = new Set([
  "png","jpg","jpeg","gif","webp","bmp","svg","ico",
  "pdf","doc","docx","xls","xlsx","ppt","pptx",
  "zip","tar","gz","rar","7z",
  "exe","dll","so","dylib","bin","dat",
  "mp3","mp4","wav","avi","mov","mkv",
  "ttf","otf","woff","woff2",
])

// ── File tree ────────────────────────────────────────────────────────────────

const MAX_TREE_DEPTH = 10

async function buildTree(dirPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > MAX_TREE_DEPTH) return []
  const entries = await readDir(dirPath)
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith(".")) continue
    const fullPath = await pathJoin(dirPath, entry.name)
    if (entry.isDirectory) {
      const children = await buildTree(fullPath, depth + 1)
      if (children.length > 0)
        nodes.push({ name: entry.name, path: fullPath, type: "dir", children })
    } else if (entry.isFile) {
      const ext = entry.name.split(".").pop()?.toLowerCase()
      if (ext === "md" || ext === "tex" || ext === "bib")
        nodes.push({ name: entry.name, path: fullPath, type: "file", ext })
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ── Drafts ────────────────────────────────────────────────────────────────────

interface Draft { path: string; content: string; savedAt: number }

function getDrafts(): Draft[] {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) ?? "[]") }
  catch { return [] }
}

const DRAFT_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days

function isPathInsideVault(path: string, vaultPath: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/")
  const normalizedVault = vaultPath.replace(/\\/g, "/").replace(/\/+$/, "")
  return normalizedPath === normalizedVault || normalizedPath.startsWith(`${normalizedVault}/`)
}

function saveDraft(path: string, content: string) {
  const now = Date.now()
  const drafts = getDrafts().filter((d) => d.path !== path && now - d.savedAt < DRAFT_MAX_AGE)
  drafts.unshift({ path, content, savedAt: now })
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 20)))
}

function clearDraft(path: string) {
  const drafts = getDrafts().filter((d) => d.path !== path)
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts))
}

// ── Main hook ────────────────────────────────────────────────────────────────

export interface UseVaultOptions {
  autoSaveMs?: number
  /**
   * Fires after a file is successfully written to disk (manual save or autosave).
   * Used by the host to trigger side effects such as macros.md hot-reload.
   * Receives both the absolute path and the basename for convenience.
   */
  onAfterSave?: (path: string, basename: string) => void
}

export function useVault(options: UseVaultOptions | number = {}) {
  // Backward-compat: original signature was useVault(autoSaveMs?: number).
  const opts: UseVaultOptions = typeof options === "number" ? { autoSaveMs: options } : options
  const autoSaveMs = opts.autoSaveMs ?? 800
  // Keep the latest onAfterSave in a ref so saveFile (memoised) always fires the
  // current callback even if the host re-renders with a new function identity.
  const onAfterSaveRef = useRef<UseVaultOptions["onAfterSave"]>(opts.onAfterSave)
  onAfterSaveRef.current = opts.onAfterSave
  const t = useT()

  const validate = useCallback((name: string): { valid: boolean; error?: string } => {
    if (!name || !name.trim()) return { valid: false, error: t.vault.nameEmpty }
    if (name.length > 255) return { valid: false, error: t.vault.nameTooLong }
    if (/[<>:"|?*\\]/.test(name)) return { valid: false, error: t.vault.nameInvalidChars }
    if (name.startsWith(".")) return { valid: false, error: t.vault.nameStartsDot }
    if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name))
      return { valid: false, error: t.vault.nameReserved }
    return { valid: true }
  }, [t])

  const [vaultPath, setVaultPath] = useState<string | null>(
    () => localStorage.getItem(VAULT_KEY)
  )
  const [recentVaults, setRecentVaults] = useState<string[]>(() => loadRecentVaults())
  const [tree, setTree] = useState<FileNode[]>([])
  const [openTabs, setOpenTabs] = useState<OpenFile[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  // Pending un-flushed content per path (set on every keystroke, cleared after
  // a successful save). Lets closeTab flush synchronously and lets the conflict
  // resolution flow access the latest in-memory edits.
  const pendingContent = useRef<Map<string, string>>(new Map())
  // Paths that have an unresolved external-modification conflict. Autosave is
  // skipped for these until the user decides reload / overwrite / cancel.
  const conflictPaths = useRef<Set<string>>(new Set())
  const activeTabPathRef = useRef<string | null>(null)
  activeTabPathRef.current = activeTabPath

  const openFile = openTabs.find((tab) => tab.path === activeTabPath) ?? null

  // ── Persist tabs ─────────────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify(openTabs.map((tab) => tab.path)))
  }, [openTabs])

  useEffect(() => {
    if (activeTabPath) localStorage.setItem(ACTIVE_KEY, activeTabPath)
    else localStorage.removeItem(ACTIVE_KEY)
  }, [activeTabPath])

  // ── Tree ──────────────────────────────────────────────────────────────────
  const refreshTree = useCallback(async (path: string) => {
    try { setTree(await buildTree(path)) }
    catch (e) { showToast(t.vault.errorReading(e instanceof Error ? e.message : String(e)), "error") }
  }, [t])

  // ── Restore tabs on mount ────────────────────────────────────────────────
  // Returns true if at least one tab was restored
  const restoreTabs = useCallback(async (vaultP: string): Promise<boolean> => {
    try {
      const savedPaths: string[] = JSON.parse(localStorage.getItem(TABS_KEY) ?? "[]")
      const savedActive = localStorage.getItem(ACTIVE_KEY)
      if (!savedPaths.length) return false

      const tabs: OpenFile[] = []
      for (const path of savedPaths) {
        // Only restore files from the current vault
        if (!isPathInsideVault(path, vaultP)) continue
        // Skip binary files
        const ext = path.split(".").pop()?.toLowerCase() ?? ""
        if (BINARY_EXTS.has(ext)) continue
        try {
          const name = displayBasename(path)
          // Use draft if present — cleared on save, its presence indicates unsaved changes
          const draft = getDrafts().find((d) => d.path === path)
          const content = await readTextFile(path)
          let cachedMtime: number | undefined
          try {
            const info = await stat(path)
            cachedMtime = info.mtime?.getTime()
          } catch {
            // stat optional - some filesystems may not support it
          }
          showConversionWarnings(path, content, "opening")
          const finalContent = draft ? draft.content : toEditorContent(path, content)
          tabs.push({ path, name, content: finalContent, isDirty: !!draft, mode: editorModeForPath(path), cachedMtime })
        } catch { /* file deleted, skip */ }
      }
      if (tabs.length > 0) {
        setOpenTabs(tabs)
        const active = savedActive && tabs.find((t) => t.path === savedActive)
          ? savedActive
          : tabs[0].path
        setActiveTabPath(active)
        return true
      }
      return false
    } catch { /* corrupted storage */ }
    return false
  }, [])

  // ── Open or create README.md ─────────────────────────────────────────────
  const openOrCreateReadme = useCallback(async (vaultP: string) => {
    const readmePath = await pathJoin(vaultP, README_FILENAME)
    let content: string
    try {
      content = await readTextFile(readmePath)
    } catch {
      // Doesn't exist — create it
      content = README_CONTENT
      try {
        await writeTextFile(readmePath, content)
      } catch (e) {
        showToast(t.vault.errorCreatingReadme(e instanceof Error ? e.message : String(e)), "error")
        return
      }
    }
    const newTab: OpenFile = { path: readmePath, name: README_FILENAME, content: toEditorContent(readmePath, content), isDirty: false, mode: "md" }
    setOpenTabs((tabs) => tabs.find((t) => t.path === readmePath) ? tabs : [...tabs, newTab])
    setActiveTabPath(readmePath)
  }, [t])

  const selectVault = useCallback(async (preselected?: string) => {
    let selected: string | null | string[]
    if (preselected) {
      selected = preselected
    } else {
      selected = await open({ directory: true, multiple: false, title: "Seleccionar carpeta del vault" })
    }
    if (!selected || typeof selected !== "string") return
    localStorage.setItem(VAULT_KEY, selected)
    localStorage.removeItem(TABS_KEY)
    localStorage.removeItem(ACTIVE_KEY)
    // Track in recent vaults
    saveRecentVault(selected)
    setRecentVaults(loadRecentVaults())
    // Cancel pending autosaves from the previous vault
    saveTimers.current.forEach(clearTimeout)
    saveTimers.current.clear()
    setOpenTabs([])
    setActiveTabPath(null)
    setVaultPath(selected)
    await refreshTree(selected)
    await openOrCreateReadme(selected)
  }, [refreshTree, openOrCreateReadme])

  const createVault = useCallback(async () => {
    // Ask for the new folder path via a save-style dialog
    const chosen = await save({
      title: "Crear nueva carpeta de vault",
      defaultPath: "mi-vault",
    })
    if (!chosen) return
    await mkdir(chosen, { recursive: true })
    localStorage.setItem(VAULT_KEY, chosen)
    localStorage.removeItem(TABS_KEY)
    localStorage.removeItem(ACTIVE_KEY)
    saveRecentVault(chosen)
    setRecentVaults(loadRecentVaults())
    saveTimers.current.forEach(clearTimeout)
    saveTimers.current.clear()
    setOpenTabs([])
    setActiveTabPath(null)
    setVaultPath(chosen)
    await refreshTree(chosen)
    await openOrCreateReadme(chosen)
  }, [refreshTree, openOrCreateReadme])

  const loadVault = useCallback(async () => {
    if (!vaultPath) return
    setIsLoading(true)
    try {
      await refreshTree(vaultPath)
      const restored = await restoreTabs(vaultPath)
      if (!restored) await openOrCreateReadme(vaultPath)
    } finally {
      setIsLoading(false)
    }
  }, [vaultPath, refreshTree, restoreTabs, openOrCreateReadme])

  const openFileNode = useCallback(async (node: FileNode) => {
    if (openTabs.find((t) => t.path === node.path)) {
      setActiveTabPath(node.path)
      return
    }
    // Skip binaries
    if (BINARY_EXTS.has(node.ext ?? "")) {
      showToast(t.vault.binaryFile(node.name), "error")
      return
    }
    try {
      const content = await readTextFile(node.path)
      showConversionWarnings(node.path, content, "opening")
      let cachedMtime: number | undefined
      try {
        const info = await stat(node.path)
        cachedMtime = info.mtime?.getTime()
      } catch {
        // stat optional - some filesystems may not support it
      }
      const internalContent = toEditorContent(node.path, content)
      const newTab: OpenFile = { path: node.path, name: node.name, content: internalContent, isDirty: false, mode: editorModeForPath(node.path), cachedMtime }
      setOpenTabs((tabs) => tabs.find((tb) => tb.path === node.path) ? tabs : [...tabs, newTab])
      setActiveTabPath(node.path)
    } catch (e) {
      showToast(t.vault.errorOpening(node.name, e instanceof Error ? e.message : String(e)), "error")
    }
  }, [openTabs, t])

  const openFilePath = useCallback(async (path: string) => {
    if (openTabs.find((t) => t.path === path)) {
      setActiveTabPath(path)
      return
    }

    const name = displayBasename(path)
    const ext = name.split(".").pop()?.toLowerCase() ?? ""
    if (BINARY_EXTS.has(ext)) {
      showToast(t.vault.binaryFile(name), "error")
      return
    }

    try {
      const content = await readTextFile(path)
      showConversionWarnings(path, content, "opening")
      // Get modification time for conflict detection
      let cachedMtime: number | undefined
      try {
        const info = await stat(path)
        cachedMtime = info.mtime?.getTime()
      } catch {
        // stat optional - some filesystems may not support it
      }
      const internalContent = toEditorContent(path, content)
      const newTab: OpenFile = {
        path,
        name,
        content: internalContent,
        isDirty: false,
        mode: editorModeForPath(path),
        cachedMtime,
      }
      setOpenTabs((tabs) => tabs.find((tb) => tb.path === path) ? tabs : [...tabs, newTab])
      setActiveTabPath(path)
    } catch (e) {
      showToast(t.vault.errorOpening(name, e instanceof Error ? e.message : String(e)), "error")
    }
  }, [openTabs, t])

  const togglePin = useCallback((path: string) => {
    setPinnedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const reorderTabs = useCallback((fromIdx: number, toIdx: number) => {
    setOpenTabs((tabs) => {
      if (fromIdx === toIdx) return tabs
      const next = [...tabs]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }, [])

  const switchTab = useCallback((path: string) => setActiveTabPath(path), [])

  const reopenTab = useCallback(async (path: string) => {
    await openFilePath(path)
  }, [openFilePath])

  const getClosedTabs = useCallback(() => loadClosedTabs(), [])

  /**
   * Persist `content` to `path`. By default, refuses to save if the file's
   * on-disk mtime advanced past the cached value (external modification) and
   * prompts the user with reload/overwrite/cancel. Passing `{ force: true }`
   * bypasses the mtime check (used after the user picks "Keep mine").
   *
   * Returns `true` only if the bytes actually reached disk — callers that need
   * to flush before destroying state (e.g. closeTab) rely on this signal so
   * they only clear drafts after a confirmed successful write.
   */
  const saveFile = useCallback(async (
    path: string,
    content: string,
    saveOpts: { force?: boolean } = {},
  ): Promise<boolean> => {
    try {
      const openTab = openTabs.find((tab) => tab.path === path)
      if (!saveOpts.force && openTab?.cachedMtime) {
        try {
          const info = await stat(path)
          const currentMtime = info.mtime?.getTime()
          if (currentMtime && currentMtime > openTab.cachedMtime) {
            // Mark the path as conflicted so subsequent autosaves stay blocked
            // until the user decides — without this, the *next* keystroke would
            // refresh cachedMtime via a no-op path and silently overwrite the
            // external changes.
            conflictPaths.current.add(path)
            // Cancel any queued autosave for this path; we don't want it to
            // race with the modal.
            const queued = saveTimers.current.get(path)
            if (queued) { clearTimeout(queued); saveTimers.current.delete(path) }
            // Three-way prompt: Yes = reload from disk (lose edits),
            // No = keep my version (overwrite disk), Cancel = decide later.
            let choice: string
            try {
              choice = await message(
                `${openTab.name} ${t.vault.fileChangedExternally(openTab.name)}\n\n` +
                "Yes = Reload from disk (lose your edits)\n" +
                "No  = Keep mine (overwrite disk)\n" +
                "Cancel = Leave as-is (autosave stays paused)",
                {
                  title: "ComdTeX",
                  kind: "warning",
                  buttons: { yes: "Reload", no: "Keep mine", cancel: "Cancel" },
                },
              )
            } catch {
              // Tauri dialog unavailable (e.g. during tests) — fall back to the
              // safe choice: don't overwrite, don't lose edits, leave conflict
              // pending so the user is forced to handle it explicitly.
              showToast(t.vault.fileChangedExternally(openTab.name), "error")
              return false
            }
            if (choice === "Yes") {
              // Reload from disk and replace tab content
              try {
                const fresh = await readTextFile(path)
                let freshMtime: number | undefined
                try { freshMtime = (await stat(path)).mtime?.getTime() } catch {}
                setOpenTabs((tabs) => tabs.map((tab) =>
                  tab.path === path
                    ? { ...tab, content: fresh, isDirty: false, cachedMtime: freshMtime }
                    : tab
                ))
                pendingContent.current.delete(path)
                clearDraft(path)
                conflictPaths.current.delete(path)
              } catch (e) {
                showToast(t.vault.errorReading(e instanceof Error ? e.message : String(e)), "error")
              }
              return false
            }
            if (choice === "No") {
              // Force-save, fall through to the write below
              conflictPaths.current.delete(path)
            } else {
              // Cancel — stay in conflict state, autosave remains blocked
              return false
            }
          }
        } catch {
          // ignore stat errors (filesystem may not support mtime)
        }
      }
      showConversionWarnings(path, content, "saving")
      // Convert from CMDX to storage format before saving. Non-CMDX files like .bib stay raw.
      const storageContent = toDiskContent(path, content)
      await writeTextFile(path, storageContent)
      // Update mtime after successful save
      let newMtime: number | undefined
      try { newMtime = (await stat(path)).mtime?.getTime() } catch {}
      setOpenTabs((tabs) => tabs.map((tab) =>
        tab.path === path ? { ...tab, isDirty: false, cachedMtime: newMtime ?? tab.cachedMtime } : tab
      ))
      // Only drop the draft AFTER the bytes are confirmed on disk; if the
      // write threw above the catch block returns false and the draft remains
      // for crash recovery.
      pendingContent.current.delete(path)
      conflictPaths.current.delete(path)
      clearDraft(path)
      onAfterSaveRef.current?.(path, displayBasename(path))
      return true
    } catch (e) {
      showToast(t.vault.errorSaving(e instanceof Error ? e.message : String(e)), "error")
      return false
    }
  }, [openTabs, t])

  const updateContent = useCallback((content: string) => {
    const path = activeTabPathRef.current
    if (!path) return
    setOpenTabs((tabs) => tabs.map((t) => t.path === path ? { ...t, content, isDirty: true } : t))
    pendingContent.current.set(path, content)
    saveDraft(path, content)
    // If there is an unresolved external-mod conflict, do NOT schedule an
    // autosave — the user must explicitly resolve it first. The draft above
    // still preserves the in-memory edits for crash recovery.
    if (conflictPaths.current.has(path)) return
    const existing = saveTimers.current.get(path)
    if (existing) clearTimeout(existing)
    saveTimers.current.set(path, setTimeout(() => {
      saveTimers.current.delete(path)
      void saveFile(path, content)
    }, autoSaveMs))
  }, [saveFile, autoSaveMs])

  const closeTab = useCallback(async (path: string) => {
    if (pinnedPaths.has(path)) return
    const closedTab = openTabs.find((t) => t.path === path)
    // Flush any pending autosave SYNCHRONOUSLY before tearing down the tab.
    // Without this, three failure modes are possible:
    //   (a) timer fires after closeTab and re-creates a draft for a closed tab,
    //   (b) timer's saveFile races with the user reopening + editing the file,
    //   (c) the timer's clearTimeout below loses the last unsaved edit entirely.
    const timer = saveTimers.current.get(path)
    if (timer) {
      clearTimeout(timer)
      saveTimers.current.delete(path)
    }
    const pending = pendingContent.current.get(path)
    if (pending !== undefined && closedTab?.isDirty && !conflictPaths.current.has(path)) {
      // Await the save. If it succeeds, saveFile will clearDraft itself; if it
      // fails (or hits the conflict prompt), the draft remains so the user can
      // recover on next launch.
      try { await saveFile(path, pending) } catch {}
    }
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path)
      if (idx === -1) return prev
      const next = prev.filter((t) => t.path !== path)
      if (path === activeTabPathRef.current) {
        setActiveTabPath(next.length > 0 ? next[Math.max(0, idx - 1)].path : null)
      }
      return next
    })
    pendingContent.current.delete(path)
    if (closedTab && !closedTab.isDirty) {
      saveClosedTab(path)
    }
    // Note: clearDraft is intentionally NOT called here for dirty tabs — if
    // the flush above failed, we want the draft to survive for crash recovery.
    // saveFile clears the draft on success.
    if (!closedTab?.isDirty) clearDraft(path)
  }, [pinnedPaths, openTabs, saveFile])

  const createFile = useCallback(async (name: string, content = "") => {
    if (!vaultPath) return
    const v = validate(name.replace(/\.[^.]+$/, ""))
    if (!v.valid) { showToast(v.error!, "error"); return }
    const fileName = name.endsWith(".md") || name.endsWith(".tex") || name.endsWith(".bib") ? name : `${name}.md`
    const filePath = await pathJoin(vaultPath, fileName)
    try {
      await writeTextFile(filePath, toDiskContent(filePath, content))
      await refreshTree(vaultPath)
      const newTab: OpenFile = { path: filePath, name: fileName, content: toEditorContent(filePath, content), isDirty: false, mode: editorModeForPath(filePath) }
      setOpenTabs((tabs) => [...tabs, newTab])
      setActiveTabPath(filePath)
    } catch (e) {
      showToast(t.vault.errorCreating(e instanceof Error ? e.message : String(e)), "error")
    }
  }, [vaultPath, refreshTree, validate, t])

  const deleteFile = useCallback(async (path: string) => {
    try {
      // Drop pending autosave before deleting — we don't want a queued write
      // to recreate the file we're about to delete.
      const timer = saveTimers.current.get(path)
      if (timer) { clearTimeout(timer); saveTimers.current.delete(path) }
      pendingContent.current.delete(path)
      conflictPaths.current.delete(path)
      await remove(path)
      if (vaultPath) await refreshTree(vaultPath)
      await closeTab(path)
      clearDraft(path)
    } catch (e) {
      showToast(t.vault.errorDeleting(e instanceof Error ? e.message : String(e)), "error")
    }
  }, [vaultPath, refreshTree, closeTab, t])

  const renameFile = useCallback(async (oldPath: string, newName: string) => {
    const v = validate(newName.replace(/\.[^.]+$/, ""))
    if (!v.valid) { showToast(v.error!, "error"); return }
    const dir = await pathDirname(oldPath)
    const newPath = await pathJoin(dir, newName)
    try {
      await rename(oldPath, newPath)
      if (vaultPath) await refreshTree(vaultPath)
      setOpenTabs((tabs) => tabs.map((tab) => tab.path === oldPath ? { ...tab, path: newPath, name: newName } : tab))
      if (activeTabPathRef.current === oldPath) setActiveTabPath(newPath)
      showToast(t.vault.renamed(newName), "success")
    } catch (e) {
      showToast(t.vault.errorRenaming(e instanceof Error ? e.message : String(e)), "error")
    }
  }, [vaultPath, refreshTree, validate, t])

  const moveFile = useCallback(async (oldPath: string, targetFolderPath: string) => {
    const name = oldPath.split("/").pop()!
    const newPath = `${targetFolderPath}/${name}`
    if (oldPath === newPath) return
    try {
      await rename(oldPath, newPath)
      if (vaultPath) await refreshTree(vaultPath)
      setOpenTabs((tabs) => tabs.map((tab) =>
        tab.path === oldPath ? { ...tab, path: newPath } : tab
      ))
      setActiveTabPath((p) => p === oldPath ? newPath : p)
      showToast(t.vault.moved(name), "success")
    } catch (e) {
      showToast(t.vault.moveError, "error")
      console.error(e)
    }
  }, [vaultPath, refreshTree, t])

  const createFolder = useCallback(async (name: string) => {
    if (!vaultPath) return
    const v = validate(name)
    if (!v.valid) { showToast(v.error!, "error"); return }
    try {
      await mkdir(await pathJoin(vaultPath, name), { recursive: true })
      await refreshTree(vaultPath)
    } catch (e) {
      showToast(t.vault.errorCreatingFolder(e instanceof Error ? e.message : String(e)), "error")
    }
  }, [vaultPath, refreshTree, validate, t])

  /**
   * Update the content of any open tab without making it active.
   * Used for wikilink refactoring on file rename.
   */
  const patchTabContent = useCallback((path: string, newContent: string) => {
    setOpenTabs((tabs) =>
      tabs.map((t) => t.path === path ? { ...t, content: newContent, isDirty: false } : t)
    )
  }, [])

  // Search with result limit and cancellation
  const searchAbortRef = useRef<{ cancelled: boolean }>({ cancelled: false })

  const search = useCallback(async (
    query: string,
    opts: { regex?: boolean; caseSensitive?: boolean } = {}
  ): Promise<SearchResult[]> => {
    if (!vaultPath || !query.trim()) return []

    const terms = query.trim().split(/\s+/)
    const filters = {
      tags: terms.filter((term) => term.startsWith("tag:")).map((term) => term.slice(4).toLowerCase()),
      paths: terms.filter((term) => term.startsWith("path:")).map((term) => term.slice(5).toLowerCase()),
      exts: terms.filter((term) => term.startsWith("ext:")).map((term) => term.slice(4).replace(/^\./, "").toLowerCase()),
      frontmatter: terms
        .filter((term) => term.startsWith("fm:"))
        .map((term) => term.slice(3))
        .map((term) => {
          const [key, ...valueParts] = term.split("=")
          return { key: key.toLowerCase(), value: valueParts.join("=").toLowerCase() }
        })
        .filter((item) => item.key),
    }
    const textQuery = terms
      .filter((term) => !/^(tag|path|ext|fm):/.test(term))
      .join(" ")

    // Validate regex before starting search
    let searchRe: RegExp
    try {
      searchRe = opts.regex
        ? new RegExp(textQuery || ".*", opts.caseSensitive ? "g" : "gi")
        : new RegExp((textQuery || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), opts.caseSensitive ? "g" : "gi")
    } catch { return [] }

    // Cancel previous search
    searchAbortRef.current.cancelled = true
    const token = { cancelled: false }
    searchAbortRef.current = token

    const MAX_RESULTS = 500
    const results: SearchResult[] = []

    const searchIn = async (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (token.cancelled || results.length >= MAX_RESULTS) return
        if (node.type === "dir" && node.children) {
          await searchIn(node.children)
        } else if (node.type === "file") {
          try {
            if (filters.exts.length > 0 && !filters.exts.includes((node.ext ?? "").toLowerCase())) continue
            if (filters.paths.length > 0 && !filters.paths.some((path) => node.path.toLowerCase().includes(path))) continue
            const content = await readTextFile(node.path)
            const editorContent = toEditorContent(node.path, content)
            const parsed = extractFrontmatter(editorContent)
            const tags = extractDetailedTags(editorContent).map((tag) => tag.tag)
            if (filters.tags.length > 0 && !filters.tags.every((tag) => tags.includes(tag))) continue
            if (filters.frontmatter.length > 0) {
              const data = parsed?.data ?? {}
              const ok = filters.frontmatter.every(({ key, value }) => {
                const actual = data[key]
                if (actual == null) return false
                if (!value) return true
                return String(actual).toLowerCase().includes(value)
              })
              if (!ok) continue
            }
            editorContent.split("\n").forEach((line, i) => {
              searchRe.lastIndex = 0
              if (results.length < MAX_RESULTS && (!textQuery || searchRe.test(line)))
                results.push({ filePath: node.path, fileName: node.name, line: i + 1, content: line.trim().slice(0, 200) })
            })
          } catch { /* skip */ }
        }
      }
    }

    await searchIn(tree)
    return token.cancelled ? [] : results
  }, [vaultPath, tree])

  /**
   * Replace all occurrences of `query` with `replacement` across every file
   * in the vault. Returns the total replacement count.
   * Open tabs are also updated in state to reflect changes.
   */
  const replaceInVault = useCallback(async (
    query: string,
    replacement: string,
    opts: { regex?: boolean; caseSensitive?: boolean } = {}
  ): Promise<number> => {
    if (!vaultPath || !query) return 0

    let re: RegExp
    try {
      re = opts.regex
        ? new RegExp(query, opts.caseSensitive ? "g" : "gi")
        : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), opts.caseSensitive ? "g" : "gi")
    } catch { return 0 }

    let total = 0

    const replaceIn = async (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.type === "dir" && node.children) {
          await replaceIn(node.children)
        } else if (node.type === "file") {
          try {
            const content = await readTextFile(node.path)
            const editorContent = toEditorContent(node.path, content)
            re.lastIndex = 0
            const matches = editorContent.match(re)
            if (!matches) continue
            re.lastIndex = 0
            const updated = editorContent.replace(re, replacement)
            await writeTextFile(node.path, toDiskContent(node.path, updated))
            total += matches.length
            patchTabContent(node.path, updated)
          } catch { /* skip */ }
        }
      }
    }

    await replaceIn(tree)
    return total
  }, [vaultPath, tree, patchTabContent])

  return {
    vaultPath, recentVaults, tree, isLoading,
    openTabs, activeTabPath, openFile,
    pinnedPaths, togglePin, reorderTabs,
    selectVault, createVault, loadVault,
    openFileNode, openFilePath, closeTab, switchTab,
    reopenTab, getClosedTabs,
    updateContent, saveFile, patchTabContent,
    createFile, createFolder, deleteFile, renameFile, moveFile,
    search, replaceInVault,
  }
}
