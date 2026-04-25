import { scanStructuralLabels, type StructuralLabel, type StructuralReference } from "./structuralLabels"

export interface MathBacklinkGroup {
  label: StructuralLabel
  references: StructuralReference[]
}

export function scanMathBacklinks(files: { path: string; name: string; content: string }[]): MathBacklinkGroup[] {
  const index = scanStructuralLabels(files)
  return index.labels
    .map((label) => ({
      label,
      references: index.references.filter((ref) => ref.id === label.id),
    }))
    .filter((group) => group.references.length > 0)
    .sort((a, b) => b.references.length - a.references.length || a.label.id.localeCompare(b.label.id))
}
