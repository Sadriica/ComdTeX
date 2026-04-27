import { expect, test } from "@playwright/test"

test("renders the initial ComdTeX shell", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator(".welcome-logo")).toContainText("ComdTeX")
  await expect(page.getByText(/Markdown \+ LaTeX|Markdown \+ LaTeX/i)).toBeVisible()
  await expect(page.getByRole("button", { name: /Abrir carpeta existente|Open existing folder/ })).toBeVisible()
})
