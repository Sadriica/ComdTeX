# Plan v1.2.0 — CMDX Formato Interno Bidireccional

## Estado: EN DESARROLLO

> **Fecha inicio:** 2026-04-24
> **Versión target:** 1.2.0
> **Dependencias:** preprocessor.ts, obsidianExport.ts (existentes)

---

## Resumen Ejecutivo

**CMDX** (ComdTeX Internal Format) es el formato de trabajo interno que existe solo en memoria mientras el usuario edita. Los archivos en disco (.md o .tex) se convierten a CMDX al abrirlos y se convierten de vuelta al guardarlos.

```
.archivo.md (disco) ←→ CMDX (memoria) ←→ Usuario.edita
.archivo.tex (disco) ←→ CMDX (memoria) ←→ Usuario.edita
```

Esto permite:
1. Interoperabilidad con Obsidian (archivos .md)
2. Working format con shorthands (table(), mat(), :::env, etc.)
3. Conversión bidireccional transparente
4. Soporte para ambos .md y .tex

---

## Arquitectura

### Capas del Sistema

| Capa | Existencia | Usuario ve |
|------|------------|-----------|
| Archivo en disco (.md/.tex) | ✅ Persistente | ✅ |
| Formato CMDX (interno) | ✅ Solo en memoria | ❌ |
| UI (editando) | - | Solo contenido |

### Flujo de Datos

```
┌─────────────────────────────────────────────────────────────┐
│  Usuarioabre un archivo                                      │
│  └─→ Detectar extensión (.md / .tex)                        │
│  └─→ Leer contenido del archivo                            │
│  └─→ Aplicar conversor: formato → CMDX                   │
│  └─→ Almacenar en tab como content (formato CMDX)         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Usuario edita el archivo (trabaja en formato CMDX)          │
│  └─→ Monaco editor muestra contenido CMDX                    │
│  └─→ Preview renderiza con shorthandsexpandidos              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Usuario guarda el archivo                                 │
│  └─→ Aplicar conversor: CMDX → formato original            │
│  └─→ Escribir archivo en disco                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Código Existente a Reutilizar

### Archivos Existentes Relevantes

| Archivo | Función | Reutilizar Para |
|---------|---------|--------------|
| `src/preprocessor.ts` | `expandShorthandsInRegion()`, `HANDLERS`, `applyTableShorthand()` | Conversión CMDX → LaTeX (tex) |
| `src/obsidianExport.ts` | `exportToObsidianMarkdown()` | Conversión CMDX → .md (Obsidian callouts) |
| `src/environments.ts` | `ALL_ENVS`, `NUMBERED_ENVS`, `UNNUMBERED_ENVS` | Mapeo envs y tipos |
| `src/exporter.ts` | `mdToTex()` | Conversión CMDX → .tex (export) |

### Estrategia de Reutilización

```
CMDX → .md  → Usar obsidianExport.ts (invertir lógica)
CMDX → .tex → Usar exporter.ts (mdToTex) o preprocessor.ts
.md → CMDX  → Nuevas funciones (callouts → :::env)
.tex → CMDX → Nuevas funciones (LaTeX → shorthands)
```

---

## Especificación de Conversiones

### 1. Conversiones para archivos .md

#### Al Abrir: .md → CMDX (Markdown/Obsidian → Formato Interno)

| .md (Obsidian) | → CMDX interno |
|--------------|---------------|
| `> [!note]` | `:::note` |
| `> [!tip]` | `:::tip` |
| `> [!warning]` | `:::warning` |
| `> [!success]` | `:::proof` |
| `> [!question]` | `:::exercise` |
| `> [!abstract]` | `:::lemma` |
| `> [!important]` | `:::remark` |
| `| A | B |` | `table(A, B)` |
| `| A | B |` | `table(A, B, C...)` |
| `\| --- \| --- \|` | (se ignora, es separador) |
| `{#eq:label}` | Mantener |
| `{#fig:label}` | Mantener |
| `{#sec:label}` | Mantener |

**Casos especiales .md:**
- Frontmatter (YAML): Mantener al inicio sin modificar
- Blockquotes simples (`>` sin callout): Mantener como están
- Encabezados (`#`) con labels: `# Title {#sec:label}` → mantener

#### Al Guardar: CMDX → .md (Formato Interno → Markdown/Obsidian)

| CMDX interno | → .md |
|-------------|-------|
| `:::theorem[Title]` | `> [!abstract] Title` |
| `:::lemma[Title]` | `> [!abstract] Lemma` |
| `:::proposition[Title]` | `> [!abstract] Proposition` |
| `:::corollary[Title]` | `> [!abstract] Corollary` |
| `:::definition[Title]` | `> [!note] Definition` |
| `:::example[Title]` | `> [!note] Example` |
| `:::exercise[Title]` | `> [!question] Exercise` |
| `:::proof[Title]` | `> [!success] Proof` |
| `:::remark[Title]` | `> [!important] Remark` |
| `:::note[Title]` | `> [!note] Note` |
| `:::tip[Title]` | `> [!tip] Tip` |
| `:::warning[Title]` | `> [!warning] Warning` |
| `:::folded[Title]` | `> [!note] (Collapsed)` o remover |
| `table(A, B, C)` | `| A | B | C |` |
| `table(A, B)` | `\| A \| B \|` + separador `\| --- \| --- \|` |

**Labels (se mantienen en ambos sentidos):**
- `{#eq:label}` → mantener en .md
- `{#fig:label}` → mantener en .md
- `{#sec:label}` → mantener en .md
- `{#tbl:label}` → mantener en .md

---

### 2. Conversiones para archivos .tex

#### Al Abrir: .tex → CMDX (LaTeX → Formato Interno)

| .tex | → CMDX |
|------|-------|
| `\begin{environment}{...}` | `:::environment[...]` |
| `\end{environment}` | `:::` |
| `\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}` | `mat(1, 2, 3, 4)` |
| `\begin{matrix}...\end{matrix}` | `mat(...)` |
| `\begin{pmatrix}...\end{pmatrix}` | `pmat(...)` |
| `\begin{pmatrix}...\end{pmatrix}` | `pmat(...)` |
| `\frac{a}{b}` | `frac(a, b)` |
| `\sqrt{x}` | `sqrt(x)` |
| `\sum_{i=0}^{n}` | `sum(i=0, n)` |
| `\int_{a}^{b}` | `int(a, b)` |
| `\lim_{x \to a}` | `lim(x, a)` |
| `\vec{x}` | `vec(x)` |
| `\left|x\right|` | `abs(x)` |
| `\left\|x\right\|` | `norm(x)` |
| `\mathbf{x}` | `bf(x)` |
| `\mathcal{A}` | `cal(A)` |
| `\mathbb{R}` | `bb(R)` |
| `\partial` | `pder(f, x)` (parcial, requiere contexto) |
| Labels `\label{eq:foo}` | Mantener `{#eq:foo}` |
| Referencias `\eqref{eq:foo}` | Mantener `@eq:foo` |
| Includes `\input{file}` | Mantener |
| Custom macros `\newcommand` | Mantener (en preamble) |

**LaTeX environments a convertir:**
- `theorem`, `lemma`, `corollary`, `proposition`
- `definition`, `example`, `exercise`
- `proof`, `remark`, `note`
- `figure`, `table` (verificar si hay contenido)
- `equation`, `align`, `gather`

#### Al Guardar: CMDX → .tex (Formato Interno → LaTeX)

| CMDX | → .tex |
|------|--------|
| `:::theorem[Title]` | `\begin{theorem}[Title]\n...\n\end theorem}` |
| `:::lemma[Title]` | `\begin lemma}[Title]\n...\n\end lemma}` |
| `mat(1, 2, 3, 4)` | `\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}` |
| `frac(a, b)` | `\frac{a}{b}` |
| `sqrt(x)` | `\sqrt{x}` |
| `sum(i, n)` | `\sum_{i}^{n}` |
| `int(a, b)` | `\int_{a}^{b}` |
| `vec(x)` | `\vec{x}` |
| `abs(x)` | `\left|x\right|` |
| `{... #eq:label}` | `\label{eq:label}` |
| `@eq:label` | `\eqref{eq:label}` |

**Mantenidos en .tex:**
- Frontmatter de LaTeX (entre `---` y `---` al inicio)
- Paquetes usepackage
- Comandos personalizados \newcommand
- Referencias cruzadas

---

### 3. Funciones del Conversor (API)

```typescript
// src/cmdxFormat.ts

/**
 * Convierte formato de almacenamiento a formato CMDX interno.
 * @param text - Contenido del archivo (.md o .tex)
 * @param format - "md" o "tex"
 * @returns Contenido en formato CMDX interno
 */
export function toCmdx(text: string, format: "md" | "tex"): string

/**
 * Convierte formato CMDX interno a formato de almacenamiento.
 * @param text - Contenido en formato CMDX
 * @param format - "md" o "tex"
 * @returns Contenido en formato de almacenamiento
 */
export function toStorage(text: string, format: "md" | "tex"): string

/**
 * Detecta si el texto ya está en formato CMDX (contiene :::env o shorthands).
 * @param text - Contenido a evaluar
 * @returns true si está en formato CMDX
 */
export function isCmdxFormat(text: string): boolean

/**
 * Detecta el formato de almacenamiento basado en contenido.
 * @param text - Contenido a evaluar
 * @returns "md" | "tex" | "unknown"
 */
export function detectStorageFormat(text: string): "md" | "tex" | "unknown"
```

---

## Integración con useVault.ts

### Flujo de Apertura (openFileNode / openFilePath)

```typescript
// Pseudo-código de integración
const content = await readTextFile(path)
const format = path.endsWith(".tex") ? "tex" : "md"

// Convertir a CMDX solo si NO está ya en formato CMDX
const internalContent = isCmdxFormat(content)
  ? content
  : toCmdx(content, format)

const newTab: OpenFile = {
  path,
  name,
  content: internalContent,  // Almacena en formato CMDX
  isDirty: false,
  mode: format,
}
```

### Flujo de Guardado (saveFile)

```typescript
// Pseudo-código de integración
const tab = openTabs.find(t => t.path === path)
const format = path.endsWith(".tex") ? "tex" : "md"

// Convertir de CMDX a formato de almacenamiento
const storageContent = toStorage(tab.content, format)

await writeTextFile(path, storageContent)
```

### Determinación del Formato

```typescript
// Función auxiliar para detectar formato
function detectFormat(path: string, content: string): "md" | "tex" {
  if (path.endsWith(".tex")) return "tex"
  if (path.endsWith(".md")) return "md"
  // Fallback: detectar por contenido
  return detectStorageFormat(content)
}
```

---

## Casos Edge y Manejo

### 1. Archivo Ya En Formato CMDX

**Problema:** Usuario abre un archivo que ya contiene sintaxis CMDX (:::env, table(), etc.)

**Solución:**
```typescript
// Si ya tiene formato CMDX, no reconvertir
if (!isCmdxFormat(content)) {
  content = toCmdx(content, format)
}
```

### 2. Archivo con Contenido Mixto

**Problema:** Archivo .md tiene tanto callouts (`> [!note]`) como `:::env`

**Solución:** Ejecutar conversor en orden:
1. Convertir callouts a CMDX
2. Mantener :::env existente
3. Unificar resultado

### 3. Frontmatter

**Problema:** Mantener frontmatter (YAML) al inicio del archivo

**Solución:**
```typescript
// Separar frontmatter antes de convertir
function processContent(text: string, format: StorageFormat): string {
  // Si tiene frontmatter, separarlo
  const frontmatterMatch = text.match(/^---\n[\s\S]*?\n---\n/)
  const frontmatter = frontmatterMatch?.[0] ?? ""
  const body = text.slice(frontmatter.length)
  
  // Convertir body
  const convertedBody = toCmdx(body, format)
  
  // Recombinar
  return frontmatter + convertedBody
}
```

### 4. Error de Conversión

**Problema:** La conversión falla por contenido inesperado

**Solución:**
- Wrap en try-catch
- Si falla, warn al usuario y guardar raw
- No perder datos

### 5. Conflictos de Editado Externo

**Problema:** Usuario edita archivo en Obsidian mientras está abierto en ComdTeX

**Solución:** Ya manejado por `cachedMtime` en useVault.ts (verificar cambio externo antes de guardar)

### 6. Archivos Binarios

**Problema:** Imágenes, PDFs, etc.

**Solución:** Ya manejado, skip de BINARY_EXTS en useVault.ts

### 7. Labels y Referencias

**Problema:** Mantener labels en conversiones

**Solución:**
- `{#eq:label}` → сохраняется en ambos sentidos
- `{#fig:label}` → сохраняется
- `{#sec:label}` → сохраняется
- `@eq:label` → сохраняется

---

## Archivos a Modificar

| Archivo | Cambio | Tipo |
|---------|--------|------|
| `src/cmdxFormat.ts` | **NUEVO** — conversores | Crear |
| `src/useVault.ts` | Integrar conversores en openFileNode, openFilePath, saveFile | Modificar |
| `src/i18n.ts` | Añadir strings para warnings de conversión | Modificar |
| `src/exporter.ts` | (Opcional) exportar vault a .md | Modificar |

---

## Testing

### Casos de Prueba

| # | Scenario | Input | Expected |
|---|---------|-------|----------|
| 1 | Abrir .md con callout | `> [!note] Hola` | `:::note Hola` |
| 2 | Abrir .md con table | `\| A \| B \|` | `table(A, B)` |
| 3 | Guardar CMDX → .md | `:::theorem Hola` | `> [!abstract] Hola` |
| 4 | Guardar CMDX → .md | `table(A, B)` | `\| A \| B \|` |
| 5 | Abrir .tex con theorem | `\begin theorem}...` | `:::theorem...` |
| 6 | Abrir .tex con matrix | `\begin{bmatrix}1 & 2` | `mat(1, 2)` |
| 7 | Guardar CMDX → .tex | `mat(1,2)` | `\begin{bmatrix}1 & 2\end{bmatrix}` |
| 8 | Archivo ya CMDX | `:::note Hola` | Sin cambios |
| 9 | Frontmatter | `---\ntitle: X\n---` | Mantener |
| 10 | Labels | `$$x^2$$ {#eq:foo}` | Mantener |
| 11 | Error de conversión | Contenido inválido | Warn + guardar raw |

---

## Resumen de Implementación

### Tareas Principales

- [ ] **Crear** `src/cmdxFormat.ts`
  - [ ] Implementar conversores .md → CMDX
  - [ ] Implementar conversores CMDX → .md
  - [ ] Implementar conversores .tex → CMDX
  - [ ] Implementar conversores CMDX → .tex
  - [ ] Implementar `isCmdxFormat()`
  - [ ] Implementar `detectStorageFormat()`

- [ ] **Modificar** `src/useVault.ts`
  - [ ] Integrar `toCmdx()` en `openFileNode()`
  - [ ] Integrar `toCmdx()` en `openFilePath()`
  - [ ] Integrar `toStorage()` en `saveFile()`
  - [ ] Manejar formato según extensión

- [ ] **Testing**
  - [ ] Covered casos de conversión para .md
  - [ ] Covered casos de conversión para .tex
  - [ ] Covered casos edge

- [ ] **Documentación**
  - [ ] Actualizar README con nueva feature

---

## Benefits Esperados

1. **Interoperabilidad:** Archivos .md funcionan en Obsidian
2. **Flexibilidad:** Trabajar con shorthands mientras se edita
3. **Bidireccionalidad:**round-trip sin pérdida de datos
4. **Soporte .tex:** Lo mismo para archivos LaTeX
5. **UX:** Usuario no nota la conversión, es transparente

## Notas Técnicas

- **Performance:** Conversión es ~1-2ms por archivo, negligible
- **Memoria:** Solo existe en memoria mientras el tab está abierto
- **I/O:** Una lectura + una escritura por operación (no duplicados)
- **Conflictos:** Manejado por mtime cache existente
- **Autosave:** Conversión aplica antes de escribir a disco

---

## Casos Especiales Adicionales

### 1. Archivos Nuevos (createFile)

**Problema:** Usuario crea archivo nuevo desde cero

**Solución:**
- Apply conversor solo al abrir archivos existentes
-Archivos nuevos mantienen formato por defecto (.md)
- Opcional: setting `defaultFileFormat` para elegir .md vs .tex

```typescript
// createFile NO aplica conversión
await writeTextFile(filePath, content) // content ya en formato original
```

### 2. Archivos .bib (BibTeX)

**Problema:** Archivos BibTeX no deben convertirse

**Solución:**
- Ya manejado por extensión en useVault.ts
- Skip conversión para `.bib`

### 3. Ctrl+S / Guardado Manual

**Problema:** Conversión debe aplica en todo guardado

**Solución:**
- La función `saveFile()` maneja tanto autosave como guardado manual
- La conversión se aplica ahí, no importa el trigger

### 4. Exportación (Export to .tex)

**Problema:** El export ya tiene su propio flujo (exporter.ts)

**Solución:**
- Export usa mdToTex(), NO debe usar toStorage()
- El export genera .tex independiente del archivo fuente
- Solo el guardado normal usa toStorage()

### 5. Revert / Undo

**Problema:** Usuario hace undo después de abrir

**Solución:**
- El contenido ya está en CMDX interno
- Undo opera sobre el contenido en memoria, no hay problema

### 6. Diff / Version History

**Problema:** Ver diferencias entre versiones

**Solución:**
- diff debería compararversion原始 (.md/.tex en disco)
- no la versión CMDX interna
- Opcional: herramienta de diff externa

---

## Checklist de Implementación Detallado

### Fase 1: Crear cmdxFormat.ts

- [ ] Imports de archivos existentes (preprocessor, environments, obsidianExport)
- [ ] Función `isCmdxFormat(text)` - detecta si ya tiene sintaxis CMDX
- [ ] Función `toCmdxMd(text)` - .md → CMDX
  - [ ] Convertir callouts a :::env
  - [ ] Convertir tables a table()
- [ ] Función `toCmdxTex(text)` - .tex → CMDX
  - [ ] Convertir environments
  - [ ] Convertir matrices a mat()
- [ ] Función `toStorageMd(text)` - CMDX → .md (reutilizar obsidianExport.ts)
- [ ] Función `toStorageTex(text)` - CMDX → .tex (reutilizar exporter.ts)
- [ ] Función `toCmdx(text, format)` - Router
- [ ] Función `toStorage(text, format)` - Router

### Fase 2: Integrar en useVault.ts

- [ ] Importar cmdxFormat
- [ ] Modificar `openFileNode()` - apply toCmdx después de readTextFile
- [ ] Modificar `openFilePath()` - apply toCmdx después de readTextFile
- [ ] Modificar `saveFile()` - apply toStorage antes de writeTextFile
- [ ] Manejar formato según extensión (.md/.tex)
- [ ] Skip conversión si ya está en formato CMDX

### Fase 3: Testing

- [ ] Testing: covered para .md → CMDX
- [ ] Testing: covered para CMDX → .md
- [ ] Testing: covered para .tex → CMDX
- [ ] Testing: covered para CMDX → .tex
- [ ] Testing: archivos binarios no se tocan
- [ ] Testing: archivos .bib no se tocan

### Fase 4: Documentación

- [ ] README actualizado con feature
- [ ] CHANGELOG.md entrada para v1.2.0

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|-------|------------|---------|------------|
| Conversión incompleta | Media | Medio | Covered testing extenso |
| Pérdida de datos | Baja | Alto | Try-catch, guardar raw si falla |
| Conflictos con archivos externos | Media | Medio | Warn si detectacambio externo |
| Performance lenta | Baja | Bajo | Conversión es ~1-2ms |
| Loop de reconversión | Baja | Medio | isCmdxFormat() check |

---

## Errores Potenciales de Implementación

### 1. Loop de Reconversión Infinita

**Problema:** Al abrir, convertimos .md → CMDX. Al guardar, convertimos CMDX → .md. Al abrir de nuevo, el .md se convierte otra vez... si la conversión no es perfecta, se degrada cada ciclo.

**Escenario:**
```
.open(#1): .md "Hola" → CMDX "Hola"
.save(#1): CMDX "Hola" → .md "Hola"
.open(#2): .md "Hola" → CMDX "Hola" ✓ (debería ser igual)
```

**Verificación requerida:**
- La conversión debe ser idempotente: `toCmdx(toStorage(x)) === x` (o al menos equivalent)
- Probar 10+ ciclos de open/save sin degradación

### 2. Pérdida de Frontmatter o Metadatos

**Problema:** El frontmatter (YAML al inicio) podría perderse o duplicarse en conversiones.

**Verificación requerida:**
- Archivos con frontmatter mantienen el frontmatter intacto después de open + save

### 3. Regex Incompleto para Callouts

**Problema:** Los callouts de Obsidian pueden tener variaciones:
- `> [!NOTE]` (mayúsculas)
- `> [!NOTE] Title` (con título en la misma línea)
- `> [!NOTE]\n> Content` (multilínea)
- `> [!warning] Mensaje` (sin corchetes)

**Verificación:**
- Cubrir todos los formatos de callout de Obsidian

### 4. Tablas con Celdas Vacías o pipes en contenido

**Problema:**
- `| A | | B |` (celda vacía)
- `| "A | B" | C |` (pipe en contenido)
- `| A \| B | C |` (pipe escapado)

**Verificación:**
- Cubrir tablas con contenido especial

### 5. Conflictos con Preprocessor Existente

**Problema:** El preprocessor ya tiene:
- `table()` → markdown table (preprocessor.ts línea 170)
- `mat()` → LaTeX matrix (preprocessor.ts línea 76)

**Conflicto potencial:** Si convertimos `| A | B |` a `table(A,B)` en CMDX, y luego el preview usa el preprocessor, podemos tener doble conversión.

**Solución:**
- El preprocessor debe ejecutarse DESPUÉS de cargar el archivo (ya es así)
- El contenido en memoria es CMDX, el preprocessor lo convierte a LaTeX para preview
- Esto es correcto: CMDX → preview usa preprocessor → HTML

### 6. Editor Monaco con Contenido CMDX

**Problema:** El usuario ve CMDX en el editor, pero el archivo original era .md

**Verificación:**
- El contenido se muestra correctamente en Monaco
- Cmd+S guarda correctamente en .md (no en CMDX)

### 7. Preview Renderiza Diferente

**Problema:** El preview debe renderizar el contenido CMDX (lo que ya hace con preprocessor)

**Confirmación:**
- El preview ya usa `preprocess()` que convierte shorthands a LaTeX
- No hay cambio necesario en preview

### 8. Undo/Redo Después de Conversión

**Problema:** Después de abrir un archivo, el historial de undo tiene el contenido convertido.

**Verificación:**
- Probar Ctrl+Z después de abrir - debería funcionar
- No debería permitir undo a versión previa a la apertura

### 9. Autosave Durante Conversión

**Problema:** Autosave se activa mientras se está convirtiendo

**Verificación:**
- Probar abrir archivo grande (1MB+) - el autosave no debería ejecutarse durante la carga
- El guardado manual (Ctrl+S) debe esperar conversión

### 10. Archivos Binarios (.png, .jpg, .pdf)

**Problema:** Intentar convertir archivos binarios

**Verificación:**
- Monaco ya excluye archivos binarios en BINARY_EXTS
- Verificar que no se intenta convertir

### 11. Archivos Vacíos o Solo con Whitespace

**Problema:** Archivos vacíos o con solo espacios

**Verificación:**
- Archivos vacíos se cargan sin error
- Whitespace se preserva

### 12. Grandes Archivos (10MB+)

**Problema:** Conversión de archivos grandes puede ser lenta

**Verificación:**
- Rendimiento con archivos grandes
- Memory usage durante conversión

---

## Errores Comunes a Evitar

```typescript
// ❌ ERROR 1: Olvidar extensiones
if (!isCmdxFormat(content)) {
  content = toCmdx(content, format)  // ✅ Check antes
}

// ❌ ERROR 2: No manejar excepciones
try {
  content = toCmdx(content, format)
} catch (e) {
  showToast("Conversión fallida", "error")
  return originalContent // ✅ Guardar original si falla
}

// ❌ ERROR 3: No detectar formato origen
const format = path.endsWith(".tex") ? "tex" : "md"  // ✅ Detectar por extensión

// ❌ ERROR 4: Modificar tab sin marcar dirty
setOpenTabs(tabs.map(t => t.path === path ? { ...t, content: newContent, isDirty: true } : t))
// ✅ isDirty debe ser true después de cambiar contenido

// ❌ ERROR 5: Usar toStorage en export
// El export NO usa toStorage - usa exporter.ts directamente
// toStorage solo para saveFile (guardado normal)

// ❌ ERROR 6: Olvidar update de cachedMtime
await writeTextFile(path, storageContent)
// ✅ Actualizar cachedMtime después de guardar
const info = await stat(path)
setOpenTabs(tabs.map(t => t.path === path ? { ...t, isDirty: false, cachedMtime: info.mtime?.getTime() } : t))

// ❌ ERROR 7: Dirty flag no se resetea
// ✅ isDirty debe ser false después de guardar exitoso

// ❌ ERROR 8: No limpiar draft después de guardar
clearDraft(path)  // ✅ Limpiar draft también

// ❌ ERROR 9: Conversion en el momento incorrecto
// El contenido debe convertirse ANTES de guardar en tab
// Pero DESPUÉS de leer del archivo
// openFilePath:
//   1. readTextFile → content (raw)
//   2. toCmdx(content) → cmdxContent
//   3. setOpenTabs(cmdxContent)
// saveFile:
//   1. get tab.content (cmdx)
//   2. toStorage(cmdx) → rawContent
//   3. writeTextFile(rawContent)

---

## Cobertura de Testing Mínima Requerida

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | .md → CMDX callout simple | `> [!note] Hola` | `:::note Hola` |
| 2 | .md → CMDX callout con title | `> [!NOTE] Título` | `:::note[Título]` |
| 3 | .md → CMDX callout multilínea | `> [!tip]\n> línea 1\n> línea 2` | `:::tip\nlínea 1\nlínea 2` |
| 4 | .md → CMDX table simple | `| A | B |` | `table(A, B)` |
| 5 | .md → CMDX table 3 columnas | `| A | B | C |` | `table(A, B, C)` |
| 6 | .md → CMDX con frontmatter | `---\ntitle: X\n---\nHola` | frontmatter + CMDX |
| 7 | CMDX → .md callout | `:::theorem` | `> [!abstract] Theorem` |
| 8 | CMDX → .md table | `table(A, B)` | `| A | B |` |
| 9 | CMDX → .md labels | `$$x^2$$ {#eq:foo}` | mantiene `{#eq:foo}` |
| 10 | .tex → CMDX theorem | `\begin theorem}Hola\end theorem}` | `:::theorem Hola` |
| 11 | .tex → CMDX matrix | `\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}` | `mat(1, 2, 3, 4)` |
| 12 | CMDX → .tex theorem | `:::theorem Hola` | `\begin theorem}Hola\end theorem}` |
| 13 | CMDX → .tex matrix | `mat(1, 2)` | `\begin{bmatrix}1 & 2\end{bmatrix}` |
| 14 | Archivo ya en CMDX | `:::note Hola` | sin cambios |
| 15 | Callout + :::env mixto | `> [!note] X\n\n:::theorem Y` | convierte callout, mantiene env |
| 16 | Archivo vacío | `` | sin error |
| 17 | Solo whitespace | `   \n\n   ` | mantiene whitespace |
| 18 | 10 ciclos open/save | archivo.md | sin degradación |
| 19 | Archivo binario | imagen.png | skip (no convierte) |
| 20 | Archivo .bib | refs.bib | skip (no convierte) |
```