import { useMemo, useState } from "react"
import { LABEL_KIND_TITLES, scanStructuralLabels, type StructuralLabel, type StructuralLabelKind } from "./structuralLabels"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

interface LabelsPanelProps {
  files: { path: string; name: string; content: string }[]
  onOpenFile: (path: string, line?: number) => void
}

const KIND_ORDER: StructuralLabelKind[] = ["sec", "eq", "fig", "tbl", "thm", "lem", "cor", "prop", "def", "ex", "exc"]

export default function LabelsPanel({ files, onOpenFile }: LabelsPanelProps) {
  const t = useT()
  const lp = t.labelsPanel
  const [filter, setFilter] = useState("")
  const [kind, setKind] = useState<StructuralLabelKind | "all">("all")
  const index = useMemo(() => scanStructuralLabels(files), [files])
  const filtered = index.labels
    .filter((label) => kind === "all" || label.kind === kind)
    .filter((label) => !filter || label.id.toLowerCase().includes(filter.toLowerCase()) || label.context.toLowerCase().includes(filter.toLowerCase()))

  const grouped = filtered.reduce<Record<string, StructuralLabel[]>>((acc, label) => {
    ;(acc[label.kind] ??= []).push(label)
    return acc
  }, {})

  return (
    <div className="labels-panel">
      <div className="panel-header">
        <span className="panel-header-title">{lp.title}</span>
        <span className="panel-header-actions">{index.labels.length}</span>
      </div>
      <div className="labels-controls">
        <input className="tag-filter" placeholder={lp.filterPlaceholder} value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="tag-filter tag-type-filter" value={kind} onChange={(e) => setKind(e.target.value as StructuralLabelKind | "all")}>
          <option value="all">{lp.allTypes}</option>
          {KIND_ORDER.map((item) => <option key={item} value={item}>{LABEL_KIND_TITLES[item]}</option>)}
        </select>
      </div>
      <div className="labels-health">
        <span className={index.broken.length ? "label-health-bad" : ""}>{lp.broken} {index.broken.length}</span>
        <span className={index.duplicates.size ? "label-health-bad" : ""}>{lp.duplicates} {index.duplicates.size}</span>
        <span>{lp.unused} {index.unused.length}</span>
      </div>
      {index.broken.length > 0 && (
        <div className="labels-section">
          <div className="labels-section-title">{lp.brokenSection}</div>
          {index.broken.map((ref, i) => (
            <button key={`${ref.id}-${ref.filePath}-${ref.line}-${i}`} className="label-item label-item-bad" onClick={() => onOpenFile(ref.filePath, ref.line)}>
              <span className="label-id">@{ref.id}</span>
              <span className="label-file">{displayBasename(ref.filePath)}:{ref.line}</span>
            </button>
          ))}
        </div>
      )}
      <div className="labels-list">
        {KIND_ORDER.filter((item) => grouped[item]?.length).map((item) => (
          <div key={item} className="labels-section">
            <div className="labels-section-title">{LABEL_KIND_TITLES[item]}</div>
            {grouped[item].map((label, i) => {
              const duplicate = (index.duplicates.get(label.id)?.length ?? 0) > 1
              const unused = index.unused.includes(label)
              return (
                <button key={`${label.id}-${label.filePath}-${label.line}-${i}`} className={`label-item${duplicate ? " label-item-bad" : ""}`} onClick={() => onOpenFile(label.filePath, label.line)}>
                  <span className="label-id">{label.id}</span>
                  <span className="label-file">{displayBasename(label.filePath)}:{label.line}</span>
                  {duplicate && <span className="label-chip label-chip-bad">{lp.duplicateChip}</span>}
                  {unused && <span className="label-chip">{lp.unusedChip}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
