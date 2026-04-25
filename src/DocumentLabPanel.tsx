import { useMemo, useState } from "react"
import { analyzeExportCompatibility } from "./exportCompatibility"
import { diagnoseDocuments, type DiagnosticIssue } from "./documentDiagnostics"
import { buildProjectPlan } from "./projectExport"
import { scanMathBacklinks } from "./mathBacklinks"
import { displayBasename } from "./pathUtils"

interface DocumentLabPanelProps {
  files: { path: string; name: string; content: string }[]
  activePath: string | null
  activeContent: string
  onOpenFile: (path: string, line?: number) => void
}

type LabTab = "diagnostics" | "compatibility" | "project" | "structure" | "mathlinks"

const TAB_LABELS: Record<LabTab, string> = {
  diagnostics: "Diagnóstico",
  compatibility: "Export",
  project: "Proyecto",
  structure: "Estructura",
  mathlinks: "Backlinks math",
}

const severityLabel: Record<DiagnosticIssue["severity"], string> = {
  error: "error",
  warning: "warn",
  info: "info",
}

function IssueRow({ issue, onOpenFile }: { issue: DiagnosticIssue; onOpenFile: (path: string, line?: number) => void }) {
  return (
    <button className={`lab-item lab-${issue.severity}`} onClick={() => onOpenFile(issue.filePath, issue.line)}>
      <span className="lab-item-title">{issue.message}</span>
      <span className="lab-item-meta">{severityLabel[issue.severity]} · {displayBasename(issue.filePath)}:{issue.line}</span>
      {issue.context && <span className="lab-item-context">{issue.context}</span>}
    </button>
  )
}

export default function DocumentLabPanel({ files, activePath, activeContent, onOpenFile }: DocumentLabPanelProps) {
  const [tab, setTab] = useState<LabTab>("diagnostics")
  const diagnostics = useMemo(() => diagnoseDocuments(files), [files])
  const compatibility = useMemo(() => analyzeExportCompatibility(activeContent), [activeContent])
  const project = useMemo(() => buildProjectPlan(files, activePath), [files, activePath])
  const mathlinks = useMemo(() => scanMathBacklinks(files), [files])
  const structureIssues = diagnostics.issues.filter((issue) => issue.category === "structure")

  return (
    <div className="document-lab-panel">
      <div className="panel-header">
        <span className="panel-header-title">Calidad</span>
        <span className="panel-header-actions">{diagnostics.errors}/{diagnostics.warnings}</span>
      </div>
      <div className="lab-tabs">
        {(Object.keys(TAB_LABELS) as LabTab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{TAB_LABELS[item]}</button>
        ))}
      </div>

      {tab === "diagnostics" && (
        <div className="lab-list">
          <div className="lab-score-row">
            <span>Errores {diagnostics.errors}</span>
            <span>Warnings {diagnostics.warnings}</span>
            <span>Info {diagnostics.info}</span>
          </div>
          {diagnostics.issues.length === 0
            ? <div className="panel-empty">Sin problemas detectados.</div>
            : diagnostics.issues.map((issue, i) => <IssueRow key={`${issue.filePath}-${issue.line}-${i}`} issue={issue} onOpenFile={onOpenFile} />)}
        </div>
      )}

      {tab === "compatibility" && (
        <div className="lab-list">
          <div className="compat-score">
            <div><strong>{compatibility.latexScore}%</strong><span>Overleaf/LaTeX</span></div>
            <div><strong>{compatibility.obsidianScore}%</strong><span>Obsidian MD</span></div>
          </div>
          <div className="labels-section-title">LaTeX</div>
          {compatibility.latexIssues.length === 0
            ? <div className="panel-empty">Sin degradaciones detectadas.</div>
            : compatibility.latexIssues.map((issue, i) => (
              <button key={`tex-${i}`} className={`lab-item lab-${issue.severity}`} onClick={() => activePath && onOpenFile(activePath, issue.line)}>
                <span className="lab-item-title">{issue.message}</span>
                <span className="lab-item-meta">línea {issue.line}</span>
              </button>
            ))}
          <div className="labels-section-title">Obsidian</div>
          {compatibility.obsidianIssues.length === 0
            ? <div className="panel-empty">Sin degradaciones detectadas.</div>
            : compatibility.obsidianIssues.map((issue, i) => (
              <button key={`obs-${i}`} className={`lab-item lab-${issue.severity}`} onClick={() => activePath && onOpenFile(activePath, issue.line)}>
                <span className="lab-item-title">{issue.message}</span>
                <span className="lab-item-meta">línea {issue.line}</span>
              </button>
            ))}
        </div>
      )}

      {tab === "project" && (
        <div className="lab-list">
          {project.main ? (
            <>
              <div className="lab-card">
                <span className="lab-item-title">Documento principal</span>
                <button className="lab-link" onClick={() => onOpenFile(project.main!.path, 1)}>{project.main.name}</button>
              </div>
              <div className="lab-score-row">
                <span>Incluidos {project.included.length}</span>
                <span>Embeds faltantes {project.missingEmbeds.length}</span>
              </div>
              <div className="labels-section-title">Archivos incluidos</div>
              {project.included.map((file) => (
                <button key={file.path} className="lab-item" onClick={() => onOpenFile(file.path, 1)}>
                  <span className="lab-item-title">{file.name}</span>
                  <span className="lab-item-meta">{file.path}</span>
                </button>
              ))}
              {project.missingEmbeds.map((item) => (
                <div key={item} className="lab-item lab-warning">
                  <span className="lab-item-title">Embed faltante: {item}</span>
                </div>
              ))}
            </>
          ) : <div className="panel-empty">No hay documento principal detectado.</div>}
        </div>
      )}

      {tab === "structure" && (
        <div className="lab-list">
          {structureIssues.length === 0
            ? <div className="panel-empty">Estructura académica sin alertas.</div>
            : structureIssues.map((issue, i) => <IssueRow key={`${issue.filePath}-${issue.line}-${i}`} issue={issue} onOpenFile={onOpenFile} />)}
        </div>
      )}

      {tab === "mathlinks" && (
        <div className="lab-list">
          {mathlinks.length === 0 ? <div className="panel-empty">Sin backlinks matemáticos.</div> : mathlinks.map((group) => (
            <div key={`${group.label.filePath}-${group.label.id}`} className="labels-section">
              <button className="lab-item" onClick={() => onOpenFile(group.label.filePath, group.label.line)}>
                <span className="lab-item-title">{group.label.id}</span>
                <span className="lab-item-meta">{group.references.length} referencia(s)</span>
              </button>
              {group.references.map((ref, i) => (
                <button key={`${ref.filePath}-${ref.line}-${i}`} className="lab-item lab-nested" onClick={() => onOpenFile(ref.filePath, ref.line)}>
                  <span className="lab-item-title">{displayBasename(ref.filePath)}:{ref.line}</span>
                  <span className="lab-item-context">{ref.context}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
