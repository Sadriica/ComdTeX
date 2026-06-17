import { useState, useCallback, useRef, useEffect } from "react"
import { readDir, readTextFile, writeTextFile, mkdir, remove, rename, stat } from "@tauri-apps/plugin-fs"
import { open, save, message } from "@tauri-apps/plugin-dialog"
import { pathJoin, pathDirname, pathBasename, displayBasename } from "./pathUtils"
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

function editorModeForPath(path: string): "md" | "tex" | "pdf" {
  if (path.toLowerCase().endsWith(".pdf")) return "pdf"
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

export const README_FILENAME = "comdtex.md"

export const README_CONTENT = `# Mi Vault — ComdTeX

> Este archivo es tuyo. Edítalo, bórralo, o úsalo como punto de partida.
> Es tu área de juego para explorar todas las funciones de ComdTeX.

---

## Shorthands — escribe y pulsa Tab

Los shorthands son funciones cortas que se expanden a LaTeX. Cada uno se
auto-envuelve en math, así que no necesitas escribir \`$\` para los más comunes:

La fracción frac(1, n+1) se hace pequeña cuando n crece.

La raíz sqrt(2) es irracional.

El límite fundamental: lim(x, 0) — escrito así, sin nada alrededor.

La sumatoria sum(n=1, 100) llega a 5050.

La integral int(0, 1) tiene un valor entre 0 y 1.

La derivada parcial pder(u, t) aparece en la ecuación del calor.

La derivada total der(f, x) y la inversa inv(A).

La matriz identidad 3×3:

mat(1,0,0, 0,1,0, 0,0,1)

Letras de pizarra: bb(R), bb(N), bb(Z). Caligrafía: cal(L), cal(F).

> **Tip:** para una fórmula completa con varios símbolos conectados (igualdades,
> operadores como \`\\cdot\` o \`\\implies\`, letras griegas como \`\\varepsilon\`),
> envuelve **todo el bloque** en \`$...$\` y los shorthands siguen funcionando dentro:
>
> \`$frac(1, sqrt(2 \\pi)) sup(e, -sup(x, 2)/2)$\`
>
> renderiza la densidad gaussiana entera como una sola expresión matemática.

---

## Entornos matemáticos

Escribe \`:::tipo[Título]\` para abrir un entorno y \`:::\` para cerrarlo.
Añade \`sm\` o \`lg\` antes del tipo para cambiar el tamaño.

:::definition[Función continua]
Una función f es **continua** en un punto x₀ cuando el límite existe y coincide
con el valor de la función:

$$lim(x, x_0) f(x) = f(x_0)$$ {#eq:continua}
:::

:::theorem[Suma de continuas]
Si f y g son continuas en x₀, entonces f + g también lo es.
:::

:::proof
Aplica @eq:continua a cada función y suma los límites. $\\square$
:::

:::remark
Los entornos \`proof\`, \`remark\` y \`note\` no llevan número automático.
Los demás (\`theorem\`, \`lemma\`, \`corollary\`, \`proposition\`, \`definition\`,
\`example\`, \`exercise\`) sí.
:::

---

## Ecuaciones y referencias cruzadas

Usa \`$$...$$\` para ecuaciones en bloque (display math). Se numeran solas, y con
\`{#eq:etiqueta}\` puedes referenciarlas desde el texto:

$$sum(n=0, \\infty) sup(x, n) = frac(1, 1-x)$$ {#eq:geom}

$$sup(e, i\\pi) + 1 = 0$$ {#eq:euler}

La serie geométrica (@eq:geom) y la identidad de Euler (@eq:euler) son dos de las
fórmulas más elegantes de las matemáticas.

**Etiquetas en línea:** también puedes etiquetar matemáticas inline:

$lim(x, 0) frac(sin(x), x) = 1$ {#eq:limite-fundamental}

y referenciar el resultado en (@eq:limite-fundamental) desde cualquier párrafo.

---

## Bloques de código

Tres backticks abren un bloque con resaltado. El idioma va después de los backticks:

\`\`\`python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
\`\`\`

\`\`\`haskell
factorial :: Integer -> Integer
factorial 0 = 1
factorial n = n * factorial (n - 1)
\`\`\`

Para código en línea usa una sola backtick: \`O(n log n)\`.

También puedes usar la sintaxis uniforme \`:::code\` (con o sin lenguaje):

:::code python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
:::

:::code
texto plano sin resaltado
:::

---

## Pseudocódigo → flowchart automático

Escribe el algoritmo en pseudocódigo y ComdTeX lo convierte en un diagrama de
flujo Mermaid:

El bloque \`:::pseudocode\` muestra código numerado con sintaxis resaltada y
un flowchart Mermaid plegable. Para un **flowchart visual directamente** usa
\`:::flowchart\` con la misma sintaxis:

:::flowchart[Búsqueda binaria]
ALGORITHM BinarySearch(A, target)
    INPUT array A ordenado, valor target
    lo ← 0
    hi ← length(A) - 1
    WHILE lo ≤ hi
        mid ← (lo + hi) / 2
        IF A[mid] = target
            RETURN mid
        ELSE IF A[mid] < target
            lo ← mid + 1
        ELSE
            hi ← mid - 1
        ENDIF
    ENDWHILE
    RETURN -1
END
:::

Versión con código numerado:

:::pseudocode[Búsqueda binaria]
ALGORITHM BinarySearch(A, target)
    INPUT array A ordenado, valor target
    lo ← 0
    hi ← length(A) - 1
    WHILE lo ≤ hi
        mid ← (lo + hi) / 2
        IF A[mid] = target
            RETURN mid
        ELSE IF A[mid] < target
            lo ← mid + 1
        ELSE
            hi ← mid - 1
        ENDIF
    ENDWHILE
    RETURN -1
END
:::

---

## Tablas de verdad

Pasa una expresión lógica y ComdTeX genera la tabla con todas las combinaciones:

:::truth[Equivalencia: contrapositiva]
(p → q) ↔ (¬q → ¬p)
:::

Operadores soportados: \`¬\` \`∧\` \`∨\` \`→\` \`↔\` (también \`!\`, \`&&\`, \`||\`, \`->\`, \`<->\`).

---

## Grafos

Sintaxis simple para grafos dirigidos / no dirigidos / con pesos:

:::graph[Camino mínimo]
A -- B : 4
A -- C : 2
B -- C : 1
B -- D : 5
C -- D : 8
D -- E : 3
:::

\`--\` es no dirigido, \`->\` dirigido, \`: peso\` añade etiqueta numérica.

---

## Plot de funciones

Sin dependencias externas — el parser está integrado y NO usa \`eval\`:

:::plot[Densidad gaussiana]
f(x) = exp(-x^2 / 2) / sqrt(2 * pi)
xmin = -4
xmax = 4
:::

Funciones disponibles: \`sin\`, \`cos\`, \`tan\`, \`exp\`, \`ln\`, \`log\`, \`sqrt\`,
\`abs\`. Constantes: \`e\`, \`pi\`.

---

## Diagramas conmutativos

Para teoría de categorías, álgebra homológica o cualquier diagrama con flechas etiquetadas:

:::commdiag[Pullback]
A -> B [f]
A -> C [g]
B -> D [h]
C -> D [k]
:::

Estilos de flecha: \`->\` \`<-\` \`<->\` \`->>\` (epi) \`>->\` (mono) \`==>\` (doble).

---

## Wikilinks y transclusión

Enlaza otras notas del vault con \`[[nombre-de-nota]]\`. Haz clic en el preview para navegar.
La pestaña **←** de la barra lateral muestra qué notas enlazan a la activa.

Para **incrustar** el contenido de otra nota, usa \`![[otra-nota]]\` — se expande en línea
durante el render. Ideal para tesis con un archivo principal y capítulos separados.

---

## Callouts

> [!note]
> Los callouts son bloques destacados con icono. Tipos disponibles:
> \`note\` \`tip\` \`warning\` \`important\` \`danger\` \`success\` \`question\` \`quote\`.

> [!tip] Atajo
> Pulsa \`Ctrl+P\` para el palette de comandos, \`Ctrl+Shift+F\` para búsqueda
> en todo el vault, \`Ctrl+Tab\` para navegar pestañas.

---

## Tabla de ejemplo

table(Concepto, Definición, Ejemplo)

---

## Siguientes pasos

- Abre \`macros.md\` desde **Vault → Editar macros.md** para definir tus propios comandos LaTeX
- Añade entradas en \`references.bib\` y cita con \`[@clave]\`
- Crea nuevas notas con el botón **+** en la barra lateral
- Explora las plantillas en **Archivo → Nuevo desde plantilla**
- Compila a PDF con \`Ctrl+Shift+B\` (motor WASM integrado, sin LaTeX en el sistema)
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
const IGNORED_TREE_DIRS = new Set([
  "node_modules",
])

function isTextVaultFile(node: FileNode): boolean {
  const ext = (node.ext ?? "").toLowerCase()
  return ext === "md" || ext === "tex" || ext === "bib"
}

async function buildTree(dirPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > MAX_TREE_DEPTH) return []
  const entries = await readDir(dirPath)
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith(".")) continue
    const fullPath = await pathJoin(dirPath, entry.name)
    if (entry.isDirectory) {
      if (IGNORED_TREE_DIRS.has(entry.name)) continue
      const children = await buildTree(fullPath, depth + 1)
      if (children.length > 0)
        nodes.push({ name: entry.name, path: fullPath, type: "dir", children })
    } else if (entry.isFile) {
      const ext = entry.name.split(".").pop()?.toLowerCase()
      if (ext === "md" || ext === "tex" || ext === "bib" || ext === "pdf")
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

/**
 * Reject obviously-bad vault paths before we try to walk them. Picking `/` or
 * a system folder as the vault recursively reads `/proc`, `/sys`, etc. and
 * locks up the WebView (it tries to render millions of nodes).
 *
 * Returns a translation key (`invalidPathSystem` or null) so the caller can
 * surface the right message in the active language.
 */
const SYSTEM_PATHS_UNIX = [
  "/", "/proc", "/sys", "/dev", "/run", "/boot", "/etc", "/var", "/usr", "/lib", "/lib64",
  "/sbin", "/bin", "/srv", "/opt", "/tmp", "/mnt", "/media",
]
const SYSTEM_PATHS_WIN = [
  "c:\\", "c:\\windows", "c:\\program files", "c:\\program files (x86)",
  "c:\\programdata", "c:\\users",
]

export function validateVaultPath(path: string): { valid: boolean; reason?: "empty" | "tooShort" | "system" } {
  if (!path || typeof path !== "string") return { valid: false, reason: "empty" }
  const trimmed = path.replace(/[\\/]+$/, "").trim()
  if (trimmed.length === 0) return { valid: false, reason: "empty" }
  // `/` collapses to `` after the trailing-slash strip — catch it.
  if (path.replace(/\\/g, "/").replace(/\/+$/, "") === "") return { valid: false, reason: "system" }
  // Length sanity: a real user path is virtually never under 4 chars.
  if (trimmed.length < 4) return { valid: false, reason: "tooShort" }
  const norm = trimmed.toLowerCase().replace(/\\/g, "/")
  for (const sys of SYSTEM_PATHS_UNIX) {
    const sysNorm = sys.toLowerCase()
    if (norm === sysNorm) return { valid: false, reason: "system" }
  }
  for (const sys of SYSTEM_PATHS_WIN) {
    if (norm === sys.toLowerCase().replace(/\\/g, "/")) return { valid: false, reason: "system" }
  }
  return { valid: true }
}

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

  const [vaultPath, setVaultPath] = useState<string | null>(() => {
    // Defensive: if a previous run somehow stored a system path (e.g. "/"),
    // refuse to load it on startup so we don't tree-walk the whole filesystem.
    const stored = localStorage.getItem(VAULT_KEY)
    if (!stored) return null
    if (!validateVaultPath(stored).valid) {
      try { localStorage.removeItem(VAULT_KEY) } catch {}
      return null
    }
    return stored
  })
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
        const ext = path.split(".").pop()?.toLowerCase() ?? ""
        // PDFs restore as preview-mode tabs, no text content
        if (ext === "pdf") {
          tabs.push({ path, name: displayBasename(path), content: "", isDirty: false, mode: "pdf" })
          continue
        }
        // Skip other binary files
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
      // Migration: older template versions wrote literal `\`` (backslash-backtick)
      // sequences inside the code-block examples — they rendered as `\\\`\\\`\\\``
      // in the preview. Rewrite those to plain backticks. Safe: no real Markdown
      // pairs `\` immediately with a `` ` ``.
      if (/\\`/.test(content)) {
        content = content.replace(/\\`/g, "`")
        try { await writeTextFile(readmePath, content) }
        catch { /* migration is best-effort; preview will still be correct */ }
      }
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
    // Guard against accidental event-object invocation (e.g. `onClick={selectVault}`
    // — React passes a SyntheticEvent which would silently skip the dialog).
    if (typeof preselected === "string" && preselected.length > 0) {
      selected = preselected
    } else {
      try {
        selected = await open({ directory: true, multiple: false, title: "Seleccionar carpeta del vault" })
      } catch (e) {
        showToast(t.vault.selectVaultError(e instanceof Error ? e.message : String(e)), "error")
        return
      }
    }
    if (!selected || typeof selected !== "string") return
    const validation = validateVaultPath(selected)
    if (!validation.valid) {
      showToast(
        validation.reason === "system" ? t.vault.invalidPathSystem : t.vault.invalidPath(selected),
        "error",
        7000,
      )
      return
    }
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
    let chosen: string | null
    try {
      chosen = await save({
        title: "Crear nueva carpeta de vault",
        defaultPath: "mi-vault",
      })
    } catch (e) {
      showToast(t.vault.selectVaultError(e instanceof Error ? e.message : String(e)), "error")
      return
    }
    if (!chosen) return
    const validation = validateVaultPath(chosen)
    if (!validation.valid) {
      showToast(
        validation.reason === "system" ? t.vault.invalidPathSystem : t.vault.invalidPath(chosen),
        "error",
        7000,
      )
      return
    }
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
    // PDFs open as a preview-mode tab — no text read, rendered by PdfPreviewPanel.
    if (node.ext === "pdf") {
      const pdfTab: OpenFile = { path: node.path, name: node.name, content: "", isDirty: false, mode: "pdf" }
      setOpenTabs((tabs) => tabs.find((tb) => tb.path === node.path) ? tabs : [...tabs, pdfTab])
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
    if (ext === "pdf") {
      const pdfTab: OpenFile = { path, name, content: "", isDirty: false, mode: "pdf" }
      setOpenTabs((tabs) => tabs.find((tb) => tb.path === path) ? tabs : [...tabs, pdfTab])
      setActiveTabPath(path)
      return
    }
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
      // Read-only modes (currently just PDF) must never write to disk —
      // doing so would overwrite the binary file with text content.
      if (openTab?.mode === "pdf") return false
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
                const fresh = toEditorContent(path, await readTextFile(path))
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
    // Hard guard: PDF tabs are read-only previews. Without this, a stray
    // editor onChange (e.g. when an extension fires) would queue an autosave
    // that overwrites the binary PDF file with empty/text content, destroying
    // the user's document.
    const tab = openTabs.find((t) => t.path === path)
    if (tab?.mode === "pdf") return
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
  }, [saveFile, autoSaveMs, openTabs])

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
      // fails, surface the error and KEEP the tab open so the user does not
      // silently lose unsaved content. The draft remains so a future retry
      // (or crash recovery) can still rescue the data.
      try {
        await saveFile(path, pending)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        showToast(t.vault.closeTabSaveError(closedTab?.name ?? path, msg), "error")
        return
      }
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
  }, [pinnedPaths, openTabs, saveFile, t])

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

  /**
   * Re-key any pending autosave state (debounce timer, pending content, draft)
   * from oldPath to newPath before a rename/move. Otherwise the queued
   * saveFile(oldPath, ...) fires after the FS rename and recreates the old file,
   * and the last in-flight edit never lands on newPath. Mirrors deleteFile's
   * cleanup but migrates instead of dropping.
   */
  const migratePending = useCallback((oldPath: string, newPath: string) => {
    const timer = saveTimers.current.get(oldPath)
    if (timer) {
      // Cancel the timer keyed to the old path; the pending content is re-queued
      // below so the autosave still happens, just against the new path.
      clearTimeout(timer)
      saveTimers.current.delete(oldPath)
    }
    const pending = pendingContent.current.get(oldPath)
    if (pending !== undefined) {
      pendingContent.current.delete(oldPath)
      pendingContent.current.set(newPath, pending)
      // Re-arm the debounced save against the new path.
      saveTimers.current.set(newPath, setTimeout(() => {
        saveTimers.current.delete(newPath)
        void saveFile(newPath, pending)
      }, autoSaveMs))
    }
    const draft = getDrafts().find((d) => d.path === oldPath)
    if (draft) {
      clearDraft(oldPath)
      saveDraft(newPath, draft.content)
    }
  }, [autoSaveMs, saveFile])

  const renameFile = useCallback(async (oldPath: string, newName: string) => {
    const v = validate(newName.replace(/\.[^.]+$/, ""))
    if (!v.valid) { showToast(v.error!, "error"); return }
    const dir = pathDirname(oldPath)
    const newPath = await pathJoin(dir, newName)
    try {
      await rename(oldPath, newPath)
      // Re-key pending autosave only AFTER the rename succeeds, so a failed
      // rename can't leave a re-armed timer that recreates the file at newPath.
      migratePending(oldPath, newPath)
      if (vaultPath) await refreshTree(vaultPath)
      setOpenTabs((tabs) => tabs.map((tab) => tab.path === oldPath ? { ...tab, path: newPath, name: newName } : tab))
      if (activeTabPathRef.current === oldPath) setActiveTabPath(newPath)
      showToast(t.vault.renamed(newName), "success")
    } catch (e) {
      showToast(t.vault.errorRenaming(e instanceof Error ? e.message : String(e)), "error")
    }
  }, [vaultPath, refreshTree, validate, migratePending, t])

  const moveFile = useCallback(async (oldPath: string, targetFolderPath: string) => {
    const name = pathBasename(oldPath)
    const newPath = await pathJoin(targetFolderPath, name)
    if (oldPath === newPath) return
    try {
      await rename(oldPath, newPath)
      // Re-key pending autosave only after a successful rename (see renameFile).
      migratePending(oldPath, newPath)
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
  }, [vaultPath, refreshTree, migratePending, t])

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

  /**
   * Write CMDX `editorContent` to `path` safely, masking special blocks via
   * `toDiskContent` and defeating the per-path autosave race the same way
   * `replaceInVault` does: cancel any queued autosave timer, drop the stale
   * pending content, then write. After a successful write it patches the open
   * tab's content (so an in-memory edit/reopen stays consistent) and refreshes
   * cachedMtime so the next real save doesn't misfire the external-conflict
   * guard against our own write.
   *
   * Use this for out-of-band programmatic writes (todo toggle, wikilink
   * refactor, backlink removal) that target arbitrary vault files — open or
   * not — instead of a raw `writeTextFile`, which would bypass masking and lose
   * the last in-flight autosave.
   *
   * Returns true if the bytes reached disk; throws are surfaced to the caller.
   */
  const writeFileSafe = useCallback(async (path: string, editorContent: string): Promise<void> => {
    // Cancel + drop any queued autosave for this path so a stale debounced
    // saveFile() can't fire after our write and clobber it with the pre-edit
    // buffer.
    const timer = saveTimers.current.get(path)
    if (timer) { clearTimeout(timer); saveTimers.current.delete(path) }
    pendingContent.current.delete(path)
    await writeTextFile(path, toDiskContent(path, editorContent))
    // Keep the open tab (if any) consistent with what's on disk and clear dirty.
    patchTabContent(path, editorContent)
    clearDraft(path)
    // Refresh cachedMtime so the next real save's external-conflict guard
    // doesn't trip on our own write.
    let newMtime: number | undefined
    try { newMtime = (await stat(path)).mtime?.getTime() } catch {}
    if (newMtime !== undefined) {
      setOpenTabs((tabs) => tabs.map((tab) =>
        tab.path === path ? { ...tab, cachedMtime: newMtime } : tab
      ))
    }
  }, [patchTabContent])

  /**
   * Flush every in-flight debounced autosave to disk immediately. Used by the
   * window-close handler so the user's last ~800ms of edits aren't lost when the
   * app quits before the debounce timer fires.
   *
   * For each pending path: cancel its queued timer (so it can't double-fire) and
   * await saveFile() against the latest in-memory content. Paths under an
   * unresolved external-modification conflict are skipped (saveFile would prompt
   * a modal — not appropriate mid-quit; their drafts survive for recovery).
   */
  const flushPending = useCallback(async (): Promise<void> => {
    const entries = Array.from(pendingContent.current.entries())
    for (const [path, content] of entries) {
      if (conflictPaths.current.has(path)) continue
      const timer = saveTimers.current.get(path)
      if (timer) { clearTimeout(timer); saveTimers.current.delete(path) }
      try { await saveFile(path, content) } catch { /* best-effort flush */ }
    }
  }, [saveFile])

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
        } else if (node.type === "file" && isTextVaultFile(node)) {
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
        } else if (node.type === "file" && isTextVaultFile(node)) {
          try {
            const content = await readTextFile(node.path)
            const editorContent = toEditorContent(node.path, content)
            re.lastIndex = 0
            const matches = editorContent.match(re)
            if (!matches) continue
            re.lastIndex = 0
            const updated = editorContent.replace(re, replacement)
            // If this file has a queued autosave, cancel it and drop the stale
            // pending content — otherwise the timer could fire after our write
            // and clobber the replacement with the pre-replace buffer.
            const timer = saveTimers.current.get(node.path)
            if (timer) { clearTimeout(timer); saveTimers.current.delete(node.path) }
            pendingContent.current.delete(node.path)
            await writeTextFile(node.path, toDiskContent(node.path, updated))
            total += matches.length
            patchTabContent(node.path, updated)
            // Refresh the open tab's cachedMtime so the next real save doesn't
            // misfire the external-conflict guard against our own write.
            let newMtime: number | undefined
            try { newMtime = (await stat(node.path)).mtime?.getTime() } catch {}
            if (newMtime !== undefined) {
              setOpenTabs((tabs) => tabs.map((tab) =>
                tab.path === node.path ? { ...tab, cachedMtime: newMtime } : tab
              ))
            }
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
    selectVault, createVault, loadVault, refreshTree,
    openFileNode, openFilePath, closeTab, switchTab,
    reopenTab, getClosedTabs,
    updateContent, saveFile, patchTabContent, writeFileSafe, flushPending,
    createFile, createFolder, deleteFile, renameFile, moveFile,
    search, replaceInVault,
  }
}
