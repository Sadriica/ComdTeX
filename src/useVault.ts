import { useState, useCallback, useRef, useEffect } from "react"
import { readDir, readTextFile, writeTextFile, mkdir, remove, rename, stat } from "@tauri-apps/plugin-fs"
import { open, save } from "@tauri-apps/plugin-dialog"
import { pathJoin, pathDirname, displayBasename } from "./pathUtils"
import type { FileNode, OpenFile, SearchResult } from "./types"
import { showToast } from "./toastService"
import { useT } from "./i18n"
import { extractDetailedTags, extractFrontmatter } from "./frontmatter"

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

export function useVault(autoSaveMs = 800) {
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
          const fileExt = name.split(".").pop() ?? "md"
          // Use draft if present — cleared on save, its presence indicates unsaved changes
          const draft = getDrafts().find((d) => d.path === path)
          const content = await readTextFile(path)
          const finalContent = draft ? draft.content : content
          tabs.push({ path, name, content: finalContent, isDirty: !!draft, mode: fileExt === "tex" ? "tex" : "md" })
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
    const newTab: OpenFile = { path: readmePath, name: README_FILENAME, content, isDirty: false, mode: "md" }
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
      const ext = node.ext ?? "md"
      const newTab: OpenFile = { path: node.path, name: node.name, content, isDirty: false, mode: ext === "tex" ? "tex" : "md" }
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
      // Get modification time for conflict detection
      let cachedMtime: number | undefined
      try {
        const info = await stat(path)
        cachedMtime = info.mtime?.getTime()
      } catch {
        // stat optional - some filesystems may not support it
      }
      const newTab: OpenFile = {
        path,
        name,
        content,
        isDirty: false,
        mode: ext === "tex" ? "tex" : "md",
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

  const closeTab = useCallback((path: string) => {
    if (pinnedPaths.has(path)) return
    const closedTab = openTabs.find((t) => t.path === path)
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path)
      if (idx === -1) return prev
      const next = prev.filter((t) => t.path !== path)
      if (path === activeTabPathRef.current) {
        setActiveTabPath(next.length > 0 ? next[Math.max(0, idx - 1)].path : null)
      }
      return next
    })
    if (closedTab && !closedTab.isDirty) {
      saveClosedTab(path)
    }
    const timer = saveTimers.current.get(path)
    if (timer) { clearTimeout(timer); saveTimers.current.delete(path) }
    clearDraft(path)
  }, [pinnedPaths, openTabs])

  const switchTab = useCallback((path: string) => setActiveTabPath(path), [])

  const reopenTab = useCallback(async (path: string) => {
    await openFilePath(path)
  }, [openFilePath])

  const getClosedTabs = useCallback(() => loadClosedTabs(), [])

  const saveFile = useCallback(async (path: string, content: string) => {
    try {
      // Check for external modification before saving
      const openTab = openTabs.find((t) => t.path === path && t.cachedMtime)
      if (openTab?.cachedMtime) {
        try {
          const info = await stat(path)
          const currentMtime = info.mtime?.getTime()
          if (currentMtime && currentMtime > openTab.cachedMtime) {
            showToast(t.vault.fileChangedExternally(openTab.name), "error")
            return // Don't save — will retry on next change
          }
        } catch {
          // ignore stat errors
        }
      }
      await writeTextFile(path, content)
      // Update mtime after successful save
      try {
        const info = await stat(path)
        setOpenTabs((tabs) => tabs.map((t) => t.path === path ? { ...t, isDirty: false, cachedMtime: info.mtime?.getTime() } : t))
      } catch {
        setOpenTabs((tabs) => tabs.map((t) => t.path === path ? { ...t, isDirty: false } : t))
      }
      clearDraft(path)
    } catch (e) {
      showToast(t.vault.errorSaving(e instanceof Error ? e.message : String(e)), "error")
    }
  }, [openTabs, t])

  const updateContent = useCallback((content: string) => {
    const path = activeTabPathRef.current
    if (!path) return
    setOpenTabs((tabs) => tabs.map((t) => t.path === path ? { ...t, content, isDirty: true } : t))
    saveDraft(path, content)
    const existing = saveTimers.current.get(path)
    if (existing) clearTimeout(existing)
    saveTimers.current.set(path, setTimeout(() => {
      saveFile(path, content)
      saveTimers.current.delete(path)
    }, autoSaveMs))
  }, [saveFile, autoSaveMs])

  const createFile = useCallback(async (name: string, content = "") => {
    if (!vaultPath) return
    const v = validate(name.replace(/\.[^.]+$/, ""))
    if (!v.valid) { showToast(v.error!, "error"); return }
    const fileName = name.endsWith(".md") || name.endsWith(".tex") || name.endsWith(".bib") ? name : `${name}.md`
    const filePath = await pathJoin(vaultPath, fileName)
    try {
      await writeTextFile(filePath, content)
      await refreshTree(vaultPath)
      const ext = fileName.split(".").pop() as string
      const newTab: OpenFile = { path: filePath, name: fileName, content, isDirty: false, mode: ext === "tex" ? "tex" : "md" }
      setOpenTabs((tabs) => [...tabs, newTab])
      setActiveTabPath(filePath)
    } catch (e) {
      showToast(t.vault.errorCreating(e instanceof Error ? e.message : String(e)), "error")
    }
  }, [vaultPath, refreshTree, validate, t])

  const deleteFile = useCallback(async (path: string) => {
    try {
      await remove(path)
      if (vaultPath) await refreshTree(vaultPath)
      closeTab(path)
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
            const parsed = extractFrontmatter(content)
            const tags = extractDetailedTags(content).map((tag) => tag.tag)
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
            content.split("\n").forEach((line, i) => {
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
            re.lastIndex = 0
            const matches = content.match(re)
            if (!matches) continue
            re.lastIndex = 0
            const updated = content.replace(re, replacement)
            await writeTextFile(node.path, updated)
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
