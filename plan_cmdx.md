# Plan v1.2.0: CMDX bidirectional internal format

> **Status: superseded.** This is the original v1.2.0 design plan; the CMDX
> format has long since shipped. For the current behaviour see
> [`docs/cmdx-contract.md`](docs/cmdx-contract.md) and the README.
> Kept for historical reference only.

## Status: IN DEVELOPMENT

> **Start date:** 2026-04-24
> **Target version:** 1.2.0
> **Dependencies:** preprocessor.ts, obsidianExport.ts (existing)

---

## Executive summary

**CMDX** (ComdTeX Internal Format) is the internal working format that exists only in memory while the user edits. Files on disk (.md or .tex) are converted to CMDX when opened and converted back when saved.

```
.file.md (disk) ←→ CMDX (memory) ←→ User.edits
.file.tex (disk) ←→ CMDX (memory) ←→ User.edits
```

This allows:
1. Interoperability with Obsidian (.md files)
2. A working format with shorthands (table(), mat(), :::env, etc.)
3. Transparent bidirectional conversion
4. Support for both .md and .tex

---

## Architecture

### System layers

| Layer | Existence | User sees |
|------|------------|-----------|
| File on disk (.md/.tex) | ✅ Persistent | ✅ |
| CMDX format (internal) | ✅ Memory only | ❌ |
| UI (editing) | - | Content only |

### Data flow

```
┌─────────────────────────────────────────────────────────────┐
│  User opens a file                                          │
│  └─→ Detect extension (.md / .tex)                          │
│  └─→ Read the file content                                  │
│  └─→ Apply converter: format → CMDX                         │
│  └─→ Store in the tab as content (CMDX format)              │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  User edits the file (works in CMDX format)                  │
│  └─→ Monaco editor shows the CMDX content                    │
│  └─→ Preview renders with expanded shorthands                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  User saves the file                                        │
│  └─→ Apply converter: CMDX → original format                │
│  └─→ Write the file to disk                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Existing code to reuse

### Relevant existing files

| File | Function | Reuse for |
|---------|---------|--------------|
| `src/preprocessor.ts` | `expandShorthandsInRegion()`, `HANDLERS`, `applyTableShorthand()` | CMDX → LaTeX (tex) conversion |
| `src/obsidianExport.ts` | `exportToObsidianMarkdown()` | CMDX → .md conversion (Obsidian callouts) |
| `src/environments.ts` | `ALL_ENVS`, `NUMBERED_ENVS`, `UNNUMBERED_ENVS` | Mapping of envs and types |
| `src/exporter.ts` | `mdToTex()` | CMDX → .tex conversion (export) |

### Reuse strategy

```
CMDX → .md  → Use obsidianExport.ts (invert the logic)
CMDX → .tex → Use exporter.ts (mdToTex) or preprocessor.ts
.md → CMDX  → New functions (callouts → :::env)
.tex → CMDX → New functions (LaTeX → shorthands)
```

---

## Conversion specification

### 1. Conversions for .md files

#### On open: .md → CMDX (Markdown/Obsidian → internal format)

| .md (Obsidian) | → internal CMDX |
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
| `\| --- \| --- \|` | (ignored, it is a separator) |
| `{#eq:label}` | Keep |
| `{#fig:label}` | Keep |
| `{#sec:label}` | Keep |

**Special .md cases:**
- Frontmatter (YAML): keep at the start, unmodified
- Plain blockquotes (`>` without a callout): keep as they are
- Headings (`#`) with labels: `# Title {#sec:label}` → keep

#### On save: CMDX → .md (internal format → Markdown/Obsidian)

| Internal CMDX | → .md |
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
| `:::folded[Title]` | `> [!note] (Collapsed)` or remove |
| `table(A, B, C)` | `| A | B | C |` |
| `table(A, B)` | `\| A \| B \|` + separator `\| --- \| --- \|` |

**Labels (kept in both directions):**
- `{#eq:label}` → keep in .md
- `{#fig:label}` → keep in .md
- `{#sec:label}` → keep in .md
- `{#tbl:label}` → keep in .md

---

### 2. Conversions for .tex files

#### On open: .tex → CMDX (LaTeX → internal format)

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
| `\partial` | `pder(f, x)` (partial, needs context) |
| Labels `\label{eq:foo}` | Keep `{#eq:foo}` |
| References `\eqref{eq:foo}` | Keep `@eq:foo` |
| Includes `\input{file}` | Keep |
| Custom macros `\newcommand` | Keep (in the preamble) |

**LaTeX environments to convert:**
- `theorem`, `lemma`, `corollary`, `proposition`
- `definition`, `example`, `exercise`
- `proof`, `remark`, `note`
- `figure`, `table` (check whether they have content)
- `equation`, `align`, `gather`

#### On save: CMDX → .tex (internal format → LaTeX)

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

**Kept in .tex:**
- LaTeX frontmatter (between `---` and `---` at the start)
- usepackage packages
- Custom \newcommand commands
- Cross-references

---

### 3. Converter functions (API)

```typescript
// src/cmdxFormat.ts

/**
 * Converts the storage format to the internal CMDX format.
 * @param text - File content (.md or .tex)
 * @param format - "md" or "tex"
 * @returns Content in the internal CMDX format
 */
export function toCmdx(text: string, format: "md" | "tex"): string

/**
 * Converts the internal CMDX format to the storage format.
 * @param text - Content in CMDX format
 * @param format - "md" or "tex"
 * @returns Content in the storage format
 */
export function toStorage(text: string, format: "md" | "tex"): string

/**
 * Detects whether the text is already in CMDX format (contains :::env or shorthands).
 * @param text - Content to evaluate
 * @returns true if it is in CMDX format
 */
export function isCmdxFormat(text: string): boolean

/**
 * Detects the storage format based on content.
 * @param text - Content to evaluate
 * @returns "md" | "tex" | "unknown"
 */
export function detectStorageFormat(text: string): "md" | "tex" | "unknown"
```

---

## Integration with useVault.ts

### Open flow (openFileNode / openFilePath)

```typescript
// Integration pseudocode
const content = await readTextFile(path)
const format = path.endsWith(".tex") ? "tex" : "md"

// Convert to CMDX only if NOT already in CMDX format
const internalContent = isCmdxFormat(content)
  ? content
  : toCmdx(content, format)

const newTab: OpenFile = {
  path,
  name,
  content: internalContent,  // Stored in CMDX format
  isDirty: false,
  mode: format,
}
```

### Save flow (saveFile)

```typescript
// Integration pseudocode
const tab = openTabs.find(t => t.path === path)
const format = path.endsWith(".tex") ? "tex" : "md"

// Convert from CMDX to the storage format
const storageContent = toStorage(tab.content, format)

await writeTextFile(path, storageContent)
```

### Format detection

```typescript
// Helper to detect the format
function detectFormat(path: string, content: string): "md" | "tex" {
  if (path.endsWith(".tex")) return "tex"
  if (path.endsWith(".md")) return "md"
  // Fallback: detect by content
  return detectStorageFormat(content)
}
```

---

## Edge cases and handling

### 1. File already in CMDX format

**Problem:** The user opens a file that already contains CMDX syntax (:::env, table(), etc.)

**Solution:**
```typescript
// If it is already CMDX, do not convert again
if (!isCmdxFormat(content)) {
  content = toCmdx(content, format)
}
```

### 2. File with mixed content

**Problem:** A .md file has both callouts (`> [!note]`) and `:::env`

**Solution:** Run the converter in order:
1. Convert callouts to CMDX
2. Keep existing :::env
3. Merge the result

### 3. Frontmatter

**Problem:** Keep the frontmatter (YAML) at the start of the file

**Solution:**
```typescript
// Split off the frontmatter before converting
function processContent(text: string, format: StorageFormat): string {
  // If it has frontmatter, split it off
  const frontmatterMatch = text.match(/^---\n[\s\S]*?\n---\n/)
  const frontmatter = frontmatterMatch?.[0] ?? ""
  const body = text.slice(frontmatter.length)
  
  // Convert the body
  const convertedBody = toCmdx(body, format)
  
  // Recombine
  return frontmatter + convertedBody
}
```

### 4. Conversion error

**Problem:** The conversion fails because of unexpected content

**Solution:**
- Wrap in try-catch
- If it fails, warn the user and save raw
- Never lose data

### 5. External-edit conflicts

**Problem:** The user edits a file in Obsidian while it is open in ComdTeX

**Solution:** Already handled by `cachedMtime` in useVault.ts (check for external changes before saving)

### 6. Binary files

**Problem:** Images, PDFs, etc.

**Solution:** Already handled, skipped through BINARY_EXTS in useVault.ts

### 7. Labels and references

**Problem:** Keep labels across conversions

**Solution:**
- `{#eq:label}` → preserved in both directions
- `{#fig:label}` → preserved
- `{#sec:label}` → preserved
- `@eq:label` → preserved

---

## Files to modify

| File | Change | Type |
|---------|--------|------|
| `src/cmdxFormat.ts` | **NEW**: converters | Create |
| `src/useVault.ts` | Integrate the converters in openFileNode, openFilePath, saveFile | Modify |
| `src/i18n.ts` | Add strings for conversion warnings | Modify |
| `src/exporter.ts` | (Optional) export the vault to .md | Modify |

---

## Testing

### Test cases

| # | Scenario | Input | Expected |
|---|---------|-------|----------|
| 1 | Open .md with callout | `> [!note] Hello` | `:::note Hello` |
| 2 | Open .md with table | `\| A \| B \|` | `table(A, B)` |
| 3 | Save CMDX → .md | `:::theorem Hello` | `> [!abstract] Hello` |
| 4 | Save CMDX → .md | `table(A, B)` | `\| A \| B \|` |
| 5 | Open .tex with theorem | `\begin theorem}...` | `:::theorem...` |
| 6 | Open .tex with matrix | `\begin{bmatrix}1 & 2` | `mat(1, 2)` |
| 7 | Save CMDX → .tex | `mat(1,2)` | `\begin{bmatrix}1 & 2\end{bmatrix}` |
| 8 | File already CMDX | `:::note Hello` | Unchanged |
| 9 | Frontmatter | `---\ntitle: X\n---` | Keep |
| 10 | Labels | `$$x^2$$ {#eq:foo}` | Keep |
| 11 | Conversion error | Invalid content | Warn + save raw |

---

## Implementation summary

### Main tasks

- [ ] **Create** `src/cmdxFormat.ts`
  - [ ] Implement .md → CMDX converters
  - [ ] Implement CMDX → .md converters
  - [ ] Implement .tex → CMDX converters
  - [ ] Implement CMDX → .tex converters
  - [ ] Implement `isCmdxFormat()`
  - [ ] Implement `detectStorageFormat()`

- [ ] **Modify** `src/useVault.ts`
  - [ ] Integrate `toCmdx()` in `openFileNode()`
  - [ ] Integrate `toCmdx()` in `openFilePath()`
  - [ ] Integrate `toStorage()` in `saveFile()`
  - [ ] Handle the format according to the extension

- [ ] **Testing**
  - [ ] Cover the conversion cases for .md
  - [ ] Cover the conversion cases for .tex
  - [ ] Cover the edge cases

- [ ] **Documentation**
  - [ ] Update the README with the new feature

---

## Expected benefits

1. **Interoperability:** .md files work in Obsidian
2. **Flexibility:** Work with shorthands while editing
3. **Bidirectionality:** lossless round-trip
4. **.tex support:** The same for LaTeX files
5. **UX:** The user does not notice the conversion, it is transparent

## Technical notes

- **Performance:** Conversion takes ~1-2ms per file, negligible
- **Memory:** Exists only in memory while the tab is open
- **I/O:** One read + one write per operation (no duplicates)
- **Conflicts:** Handled by the existing mtime cache
- **Autosave:** The conversion applies before writing to disk

---

## Additional special cases

### 1. New files (createFile)

**Problem:** The user creates a new file from scratch

**Solution:**
- Apply the converter only when opening existing files
- New files keep the default format (.md)
- Optional: a `defaultFileFormat` setting to choose .md vs .tex

```typescript
// createFile does NOT apply a conversion
await writeTextFile(filePath, content) // content is already in the original format
```

### 2. .bib files (BibTeX)

**Problem:** BibTeX files must not be converted

**Solution:**
- Already handled by extension in useVault.ts
- Skip the conversion for `.bib`

### 3. Ctrl+S / manual save

**Problem:** The conversion must apply on every save

**Solution:**
- `saveFile()` handles both autosave and manual save
- The conversion is applied there, whatever the trigger

### 4. Export (Export to .tex)

**Problem:** Export already has its own flow (exporter.ts)

**Solution:**
- Export uses mdToTex() and must NOT use toStorage()
- Export generates a .tex independent of the source file
- Only the normal save uses toStorage()

### 5. Revert / Undo

**Problem:** The user undoes after opening

**Solution:**
- The content is already in internal CMDX
- Undo operates on the in-memory content, so there is no problem

### 6. Diff / version history

**Problem:** Viewing differences between versions

**Solution:**
- diff should compare against the original version (.md/.tex on disk)
- not the internal CMDX version
- Optional: an external diff tool

---

## Detailed implementation checklist

### Phase 1: Create cmdxFormat.ts

- [ ] Imports from existing files (preprocessor, environments, obsidianExport)
- [ ] `isCmdxFormat(text)` function - detects whether it already has CMDX syntax
- [ ] `toCmdxMd(text)` function - .md → CMDX
  - [ ] Convert callouts to :::env
  - [ ] Convert tables to table()
- [ ] `toCmdxTex(text)` function - .tex → CMDX
  - [ ] Convert environments
  - [ ] Convert matrices to mat()
- [ ] `toStorageMd(text)` function - CMDX → .md (reuse obsidianExport.ts)
- [ ] `toStorageTex(text)` function - CMDX → .tex (reuse exporter.ts)
- [ ] `toCmdx(text, format)` function - Router
- [ ] `toStorage(text, format)` function - Router

### Phase 2: Integrate into useVault.ts

- [ ] Import cmdxFormat
- [ ] Modify `openFileNode()` - apply toCmdx after readTextFile
- [ ] Modify `openFilePath()` - apply toCmdx after readTextFile
- [ ] Modify `saveFile()` - apply toStorage before writeTextFile
- [ ] Handle the format according to the extension (.md/.tex)
- [ ] Skip the conversion if it is already in CMDX format

### Phase 3: Testing

- [ ] Testing: coverage for .md → CMDX
- [ ] Testing: coverage for CMDX → .md
- [ ] Testing: coverage for .tex → CMDX
- [ ] Testing: coverage for CMDX → .tex
- [ ] Testing: binary files are not touched
- [ ] Testing: .bib files are not touched

### Phase 4: Documentation

- [ ] README updated with the feature
- [ ] CHANGELOG.md entry for v1.2.0

---

## Risks and mitigations

| Risk | Probability | Impact | Mitigation |
|-------|------------|---------|------------|
| Incomplete conversion | Medium | Medium | Extensive test coverage |
| Data loss | Low | High | Try-catch, save raw if it fails |
| Conflicts with external files | Medium | Medium | Warn if an external change is detected |
| Slow performance | Low | Low | Conversion takes ~1-2ms |
| Reconversion loop | Low | Medium | `isCmdxFormat()` check |

---

## Potential implementation errors

### 1. Infinite reconversion loop

**Problem:** On open we convert .md → CMDX. On save we convert CMDX → .md. On the next open the .md is converted again... if the conversion is not perfect, it degrades on every cycle.

**Scenario:**
```
.open(#1): .md "Hello" → CMDX "Hello"
.save(#1): CMDX "Hello" → .md "Hello"
.open(#2): .md "Hello" → CMDX "Hello" ✓ (should be the same)
```

**Required verification:**
- The conversion must be idempotent: `toCmdx(toStorage(x)) === x` (or at least equivalent)
- Test 10+ open/save cycles without degradation

### 2. Loss of frontmatter or metadata

**Problem:** The frontmatter (YAML at the start) could be lost or duplicated in conversions.

**Required verification:**
- Files with frontmatter keep the frontmatter intact after open + save

### 3. Incomplete regex for callouts

**Problem:** Obsidian callouts can have variations:
- `> [!NOTE]` (uppercase)
- `> [!NOTE] Title` (with a title on the same line)
- `> [!NOTE]\n> Content` (multiline)
- `> [!warning] Message` (without brackets)

**Verification:**
- Cover all Obsidian callout formats

### 4. Tables with empty cells or pipes in the content

**Problem:**
- `| A | | B |` (empty cell)
- `| "A | B" | C |` (pipe in the content)
- `| A \| B | C |` (escaped pipe)

**Verification:**
- Cover tables with special content

### 5. Conflicts with the existing preprocessor

**Problem:** The preprocessor already has:
- `table()` → markdown table (preprocessor.ts line 170)
- `mat()` → LaTeX matrix (preprocessor.ts line 76)

**Potential conflict:** If we convert `| A | B |` to `table(A,B)` in CMDX, and the preview then uses the preprocessor, we could get a double conversion.

**Solution:**
- The preprocessor must run AFTER the file is loaded (it already does)
- The in-memory content is CMDX, the preprocessor converts it to LaTeX for the preview
- This is correct: CMDX → preview uses preprocessor → HTML

### 6. Monaco editor with CMDX content

**Problem:** The user sees CMDX in the editor, but the original file was .md

**Verification:**
- The content is displayed correctly in Monaco
- Cmd+S saves correctly to .md (not CMDX)

### 7. Preview renders differently

**Problem:** The preview must render the CMDX content (which it already does with the preprocessor)

**Confirmation:**
- The preview already uses `preprocess()`, which converts shorthands to LaTeX
- No change is needed in the preview

### 8. Undo/Redo after conversion

**Problem:** After opening a file, the undo history holds the converted content.

**Verification:**
- Test Ctrl+Z after opening - it should work
- It should not allow undoing to a version from before the file was opened

### 9. Autosave during conversion

**Problem:** Autosave fires while the conversion is in progress

**Verification:**
- Test opening a large file (1MB+) - autosave should not run during the load
- Manual save (Ctrl+S) must wait for the conversion

### 10. Binary files (.png, .jpg, .pdf)

**Problem:** Trying to convert binary files

**Verification:**
- Monaco already excludes binary files through BINARY_EXTS
- Verify that no conversion is attempted

### 11. Empty files or files with only whitespace

**Problem:** Empty files or files with only spaces

**Verification:**
- Empty files load without error
- Whitespace is preserved

### 12. Large files (10MB+)

**Problem:** Converting large files can be slow

**Verification:**
- Performance with large files
- Memory usage during conversion

---

## Common mistakes to avoid

```typescript
// ❌ ERROR 1: Forgetting extensions
if (!isCmdxFormat(content)) {
  content = toCmdx(content, format)  // ✅ Check beforehand
}

// ❌ ERROR 2: Not handling exceptions
try {
  content = toCmdx(content, format)
} catch (e) {
  showToast("Conversion failed", "error")
  return originalContent // ✅ Keep the original if it fails
}

// ❌ ERROR 3: Not detecting the source format
const format = path.endsWith(".tex") ? "tex" : "md"  // ✅ Detect by extension

// ❌ ERROR 4: Modifying a tab without marking it dirty
setOpenTabs(tabs.map(t => t.path === path ? { ...t, content: newContent, isDirty: true } : t))
// ✅ isDirty must be true after the content changes

// ❌ ERROR 5: Using toStorage in export
// Export does NOT use toStorage - it uses exporter.ts directly
// toStorage is only for saveFile (normal save)

// ❌ ERROR 6: Forgetting to update cachedMtime
await writeTextFile(path, storageContent)
// ✅ Update cachedMtime after saving
const info = await stat(path)
setOpenTabs(tabs.map(t => t.path === path ? { ...t, isDirty: false, cachedMtime: info.mtime?.getTime() } : t))

// ❌ ERROR 7: The dirty flag is not reset
// ✅ isDirty must be false after a successful save

// ❌ ERROR 8: Not clearing the draft after saving
clearDraft(path)  // ✅ Clear the draft too

// ❌ ERROR 9: Converting at the wrong moment
// The content must be converted BEFORE it is stored in the tab
// but AFTER it is read from the file
// openFilePath:
//   1. readTextFile → content (raw)
//   2. toCmdx(content) → cmdxContent
//   3. setOpenTabs(cmdxContent)
// saveFile:
//   1. get tab.content (cmdx)
//   2. toStorage(cmdx) → rawContent
//   3. writeTextFile(rawContent)
```

---

## Minimum required test coverage

| # | Test | Input | Expected |
|---|------|-------|----------|
| 1 | .md → CMDX simple callout | `> [!note] Hello` | `:::note Hello` |
| 2 | .md → CMDX callout with title | `> [!NOTE] Title` | `:::note[Title]` |
| 3 | .md → CMDX multiline callout | `> [!tip]\n> line 1\n> line 2` | `:::tip\nline 1\nline 2` |
| 4 | .md → CMDX simple table | `| A | B |` | `table(A, B)` |
| 5 | .md → CMDX 3-column table | `| A | B | C |` | `table(A, B, C)` |
| 6 | .md → CMDX with frontmatter | `---\ntitle: X\n---\nHello` | frontmatter + CMDX |
| 7 | CMDX → .md callout | `:::theorem` | `> [!abstract] Theorem` |
| 8 | CMDX → .md table | `table(A, B)` | `| A | B |` |
| 9 | CMDX → .md labels | `$$x^2$$ {#eq:foo}` | keeps `{#eq:foo}` |
| 10 | .tex → CMDX theorem | `\begin theorem}Hello\end theorem}` | `:::theorem Hello` |
| 11 | .tex → CMDX matrix | `\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}` | `mat(1, 2, 3, 4)` |
| 12 | CMDX → .tex theorem | `:::theorem Hello` | `\begin theorem}Hello\end theorem}` |
| 13 | CMDX → .tex matrix | `mat(1, 2)` | `\begin{bmatrix}1 & 2\end{bmatrix}` |
| 14 | File already in CMDX | `:::note Hello` | unchanged |
| 15 | Mixed callout + :::env | `> [!note] X\n\n:::theorem Y` | converts the callout, keeps the env |
| 16 | Empty file | `` | no error |
| 17 | Whitespace only | `   \n\n   ` | keeps the whitespace |
| 18 | 10 open/save cycles | file.md | no degradation |
| 19 | Binary file | image.png | skip (no conversion) |
| 20 | .bib file | refs.bib | skip (no conversion) |
