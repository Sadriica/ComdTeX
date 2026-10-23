import { expect, test, type Page } from "@playwright/test"
import { installDeterminism } from "./support/deterministic"
import { installFakeVault } from "./support/fakeVault"

// The ComdTeX Monarch grammar in the real editor: tokens reach the screen in
// the theme's colours, embedded fence languages load, and the editing
// behaviour the language configuration owns (auto-closing `$`, list
// continuation, in-block suggestions) survived the tokenizer swap.

async function openEditor(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 })
  await installDeterminism(page)
  await installFakeVault(page, {
    settings: { theme: "vs-dark" },
    tabs: ["papers/spectral-gap.md"],
    storage: { comdtex_deps_dismissed: JSON.stringify(["pandoc", "zip"]) },
  })
  await page.goto("/")
  await page.locator(".monaco-editor").first().waitFor({ timeout: 30_000 })
  await page.locator(".monaco-editor .view-line").first().click()
  // start from an empty document
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
}

/** Colour of the first rendered span whose text is exactly `text`, as "r,g,b". */
async function colourOf(page: Page, text: string): Promise<string> {
  return page.evaluate((t) => {
    const span = [...document.querySelectorAll(".view-lines span")].find(
      (s) => s.children.length === 0 && s.textContent === t,
    )
    return span ? getComputedStyle(span).color : "missing"
  }, text)
}

/** What a design token resolves to under the dark theme, in the same "rgb()" form. */
async function tokenColour(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("div")
    probe.className = "app"
    probe.setAttribute("data-theme", "dark")
    probe.style.color = `var(${name})`
    document.body.appendChild(probe)
    const computed = getComputedStyle(probe).color
    probe.remove()
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!
    ctx.fillStyle = computed
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `rgb(${r}, ${g}, ${b})`
  }, token)
}

async function paste(page: Page, text: string) {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.evaluate((t) => navigator.clipboard.writeText(t), text)
  await page.keyboard.press("Control+v")
  await page.waitForTimeout(300)
}

test("grammar tokens reach the screen in the theme colours", async ({ page }) => {
  await openEditor(page)
  await paste(
    page,
    [
      "See @eq:gap and [@levin2017, p. 3] and {#sec:x} and $a + \\alpha$.",
      "",
      ":::theorem[T]",
      "body",
      ":::",
    ].join("\n"),
  )
  await expect(page.locator(".view-lines")).toContainText("@eq:gap")
  await page.waitForTimeout(300)
  const ref = await tokenColour(page, "--syn-ref")
  const cite = await tokenColour(page, "--syn-cite")
  const label = await tokenColour(page, "--syn-label")
  const keyword = await tokenColour(page, "--syn-keyword")
  const fn = await tokenColour(page, "--syn-function")
  expect(await colourOf(page, "@eq:gap")).toBe(ref)
  expect(await colourOf(page, "@levin2017")).toBe(cite)
  expect(await colourOf(page, "#sec:x")).toBe(label)
  expect(await colourOf(page, "theorem")).toBe(keyword)
  expect(await colourOf(page, "\\alpha")).toBe(fn)
})

test("a python fence loads its language lazily", async ({ page }) => {
  await openEditor(page)
  await paste(page, ["```python", "def f(x): return x", "```"].join("\n"))
  await expect(page.locator(".view-lines")).toContainText("def f(x)")
  // `def` is coloured by the python grammar, not by the opaque code token
  await expect
    .poll(async () => (await colourOf(page, "def")) !== (await colourOf(page, "```")), {
      timeout: 10_000,
    })
    .toBe(true)
})

test("typing $ still auto-closes and Enter continues a list", async ({ page }) => {
  await openEditor(page)
  await page.keyboard.type("$")
  await page.keyboard.type("x")
  await expect(page.locator(".view-lines")).toContainText("$x$")
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
  await page.keyboard.type("`")
  await page.keyboard.type("y")
  await expect(page.locator(".view-lines")).toContainText("`y`")
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
  await page.keyboard.type("- one")
  await page.keyboard.press("Enter")
  await page.keyboard.type("two")
  await page.keyboard.press("Enter")
  await page.keyboard.press("Enter")
  await page.keyboard.type("1. a")
  await page.keyboard.press("Enter")
  await page.keyboard.type("b")
  await expect
    .poll(async () =>
      (await page.locator(".view-lines").innerText())
        .split("\n")
        .map((l) => l.replace(/\u00a0/g, " ").trim())
        .filter(Boolean),
    )
    .toEqual(["- one", "- two", "1. a", "2. b"])
})

test("keywords suggest inside a special block and not in prose", async ({ page }) => {
  await openEditor(page)
  await paste(page, [":::pseudocode", ""].join("\n"))
  await page.keyboard.type("FO")
  await expect(page.locator(".suggest-widget.visible")).toBeVisible()
  await expect(page.locator(".suggest-widget .monaco-list-row").first()).toContainText("FOR")
  await page.keyboard.press("Escape")
  await page.keyboard.press("Control+a")
  await page.keyboard.press("Delete")
  await page.keyboard.type("Some prose with FO")
  await page.waitForTimeout(600)
  await expect(page.locator(".suggest-widget.visible")).toHaveCount(0)
})
