import { expect, test } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"
import { boxOf, cursorLine, openVault, revealLine } from "./support/editorNav"

// Editor navigation in the fake vault: Ctrl+click opens a note, F12 jumps to a
// label's definition, Shift+F12 lists usages in Monaco's references peek.

test("Ctrl+click on [[mixing-times]] opens that note", async ({ page }) => {
  const errors = await openVault(page)
  const box = await boxOf(page, "[[mixing-times]]")
  await page.keyboard.down("Control")
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
  await page.keyboard.up("Control")
  await expect(page.locator(".tab-active .tab-name")).toContainText("mixing-times.md")
  expect(errors).toEqual([])
})

test("F12 on @lem:cheeger moves the caret to the lemma", async ({ page }) => {
  const errors = await openVault(page)
  await revealLine(page, 44)
  const box = await boxOf(page, "@lem:cheeger")
  // A loaded CI runner can deliver F12 before the editor has wired its
  // providers; press again until it answers instead of assuming it is ready.
  await expect(async () => {
    await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
    await page.keyboard.press("F12")
    await expect.poll(() => cursorLine(page), { timeout: 2_000 }).toBe(28)
  }).toPass({ timeout: 20_000 })
  expect(errors).toEqual([])
})

test("Shift+F12 on @lem:cheeger lists its usages in the references peek", async ({ page }) => {
  const errors = await openVault(page)
  await revealLine(page, 44)
  const box = await boxOf(page, "@lem:cheeger")
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
  await page.keyboard.press("Shift+F12")
  const peek = page.locator(".zone-widget.peekview-widget, .reference-zone-widget").first()
  await expect(peek).toBeVisible()
  // The definition plus the uses on lines 44, 48 and the task on 107.
  await expect(
    peek.locator(".monaco-list-row").filter({ hasText: "@lem:cheeger" }).first(),
  ).toBeVisible()
  expect(errors).toEqual([])
})

test("F12 on a citation key opens references.bib at the entry", async ({ page }) => {
  const errors = await openVault(page)
  const box = await boxOf(page, "@lubotzky1988")
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
  await page.keyboard.press("F12")
  await expect(page.locator(".tab-active .tab-name")).toContainText("references.bib")
  await expect.poll(() => cursorLine(page)).toBe(9)
  expect(errors).toEqual([])
})

test("a jump to another note joins the back history", async ({ page }) => {
  await openVault(page)
  const box = await boxOf(page, "[[expander-notes]]")
  await page.keyboard.down("Control")
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
  await page.keyboard.up("Control")
  await expect(page.locator(".tab-active .tab-name")).toContainText("expander-notes.md")
  await page.locator(".breadcrumb-nav-btn").first().click()
  await expect(page.locator(".tab-active .tab-name")).toContainText("spectral-gap.md")
})

test("usages of a note open the note that links to it", async ({ page }) => {
  const errors = await openVault(page)
  const box = await boxOf(page, "[[expander-notes]]")
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
  await page.keyboard.press("Shift+F12")
  const peek = page.locator(".reference-zone-widget, .zone-widget.peekview-widget").first()
  await expect(peek).toBeVisible()
  // Hits are grouped by note; expand reading-list.md and open its hit.
  const group = peek.locator(".monaco-list-row").filter({ hasText: "reading-list.md" }).first()
  await expect(group).toBeVisible()
  await group.locator(".monaco-tl-twistie").click()
  const row = group.locator("xpath=following-sibling::*[1]")
  await expect(row).toContainText("expander-notes")
  await row.dblclick()
  await expect(page.locator(".tab-active .tab-name")).toContainText("reading-list.md")
  expect(errors).toEqual([])
})

test("the references peek cannot be typed into: its copies of other notes are never saved", async ({
  page,
}) => {
  const errors = await openVault(page)
  await revealLine(page, 44)
  const box = await boxOf(page, "@lem:cheeger")
  await page.mouse.click(box.x + box.w / 2, box.y + box.h / 2)
  await page.keyboard.press("Shift+F12")
  const peek = page.locator(".zone-widget.peekview-widget, .reference-zone-widget").first()
  await expect(peek).toBeVisible()
  const preview = peek.locator(".preview .monaco-editor").first()
  await expect(preview.locator(".view-lines")).toContainText("cheeger")
  await preview.locator(".view-line").filter({ hasText: "cheeger" }).first().click()
  await page.keyboard.type("ZZQQ")
  await expect(preview.locator(".view-lines")).not.toContainText("ZZQQ")
  expect(errors).toEqual([])
})

test("F12 on \\ref{} in a .tex file jumps to its \\label, and on \\cite{} to references.bib", async ({
  page,
}) => {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    tabs: ["chapters/a.tex"],
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
    files: {
      "chapters/a.tex": [
        "\\section{Intro}",
        "",
        "Some text.",
        "",
        "\\begin{equation}\\label{eq:main} x = 1 \\end{equation}",
        "",
        "As in \\ref{eq:main} and \\cite{lubotzky1988}.",
        "",
      ].join("\n"),
    },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await expect(page.locator(".view-lines")).toContainText("As in")

  // Monospace: the line's own first word gives the character width.
  const line = "As in \\ref{eq:main} and \\cite{lubotzky1988}."
  const first = await boxOf(page, "As in")
  const charW = first.w / "As in".length
  const clickAt = (index: number) =>
    page.mouse.click(first.x + charW * (index + 0.5), first.y + first.h / 2)
  await clickAt(line.indexOf("eq:main") + 2)
  await page.keyboard.press("F12")
  // The caret is on the label line (the editor shows it as {#eq:main}): a typed marker lands there.
  await page.keyboard.press("End")
  await page.keyboard.type("QQ")
  await expect(page.locator(".view-line", { hasText: "QQ" })).toContainText("{#eq:main}")
  await page.keyboard.press("Control+z")

  await clickAt(line.indexOf("lubotzky1988") + 3)
  await page.keyboard.press("F12")
  await expect(page.locator(".tab-active .tab-name")).toContainText("references.bib")
  expect(errors).toEqual([])
})
