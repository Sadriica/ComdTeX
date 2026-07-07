import { describe, it, expect } from "vitest"
import { es } from "./i18n/es"
import { en } from "./i18n/en"

type Kind = "string" | "function" | "object" | "other"

function kindOf(v: unknown): Kind {
  if (typeof v === "string") return "string"
  if (typeof v === "function") return "function"
  if (v !== null && typeof v === "object") return "object"
  return "other"
}

// Deep-walks two translation trees in lockstep, collecting every path where
// keys are missing on either side or the value kind (string/function/object)
// diverges. Used to catch drift between en and es as new UI strings are added.
function diff(a: Record<string, unknown>, b: Record<string, unknown>, path = ""): string[] {
  const problems: string[] = []
  const aKeys = new Set(Object.keys(a))
  const bKeys = new Set(Object.keys(b))

  for (const key of aKeys) {
    if (!bKeys.has(key)) problems.push(`${path}${key}: present in es, missing in en`)
  }
  for (const key of bKeys) {
    if (!aKeys.has(key)) problems.push(`${path}${key}: present in en, missing in es`)
  }

  for (const key of aKeys) {
    if (!bKeys.has(key)) continue
    const av = a[key]
    const bv = b[key]
    const aKind = kindOf(av)
    const bKind = kindOf(bv)
    const childPath = `${path}${key}.`

    if (aKind !== bKind) {
      problems.push(`${path}${key}: type mismatch (es=${aKind}, en=${bKind})`)
      continue
    }
    if (aKind === "object") {
      problems.push(...diff(av as Record<string, unknown>, bv as Record<string, unknown>, childPath))
    }
  }

  return problems
}

describe("i18n parity between es and en", () => {
  it("has identical key sets and matching value kinds at every path", () => {
    const problems = diff(es as unknown as Record<string, unknown>, en as unknown as Record<string, unknown>)
    expect(problems).toEqual([])
  })
})
