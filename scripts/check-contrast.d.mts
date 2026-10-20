export type Rgb = [number, number, number]
export interface ContrastResult {
  theme: string
  label: string
  ratio: number
  min: number
  ok: boolean
  note?: string
}
export function oklchToLinear(L: number, C: number, hDeg: number): Rgb
export function contrast(a: Rgb, b: Rgb): number
export function mixOklch(a: Rgb, pct: number, b: Rgb): Rgb
export function parseThemes(css: string): Record<"dark" | "light" | "hc", Record<string, Rgb>>
export function runChecks(themes: Record<string, Record<string, Rgb>>): ContrastResult[]
export function loadThemes(): Record<"dark" | "light" | "hc", Record<string, Rgb>>
