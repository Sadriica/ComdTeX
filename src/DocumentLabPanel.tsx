import { useMemo, useState } from "react"
import { analyzeExportCompatibility } from "./exportCompatibility"
import { diagnoseDocuments, type DiagnosticIssue } from "./documentDiagnostics"
import { buildProjectPlan } from "./projectExport"
import { scanMathBacklinks } from "./mathBacklinks"
import { displayBasename } from "./pathUtils"
import { useT } from "./i18n"

interface DocumentLabPanelProps {
  files: { path: string; name: string; content: string }[]
  activePath: string | null
  activeContent: string
  onOpenFile: (path: string, line?: number) => void
}

type LabTab = "diagnostics" | "compatibility" | "project" | "structure" | "mathlinks"

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
  const t = useT()
  const [tab, setTab] = useState<LabTab>("diagnostics")
  const diagnostics = useMemo(() => diagnoseDocuments(files), [files])
  const compatibility = useMemo(() => analyzeExportCompatibility(activeContent), [activeContent])
  const project = useMemo(() => buildProjectPlan(files, activePath), [files, activePath])
  const mathlinks = useMemo(() => scanMathBacklinks(files), [files])
  const structureIssues = diagnostics.issues.filter((issue) => issue.category === "structure")

  const TAB_LABELS: Record<LabTab, string> = {
    diagnostics: t.documentLab.diagnostics,
    compatibility: t.documentLab.compatibility,
    project: t.documentLab.project,
    structure: t.documentLab.structure,
    mathlinks: t.documentLab.mathlinks,
  }

  return (
    <div className="document-lab-panel">
      <div className="panel-header">
        <span className="panel-header-title">{t.documentLab.quality}</span>
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
            <span>{t.documentLab.errors} {diagnostics.errors}</span>
            <span>{t.documentLab.warnings} {diagnostics.warnings}</span>
            <span>{t.documentLab.info} {diagnostics.info}</span>
          </div>
          {diagnostics.issues.length === 0
            ? <div className="panel-empty">{t.documentLab.noIssues}</div>
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
            ? <div className="panel-empty">{t.documentLab.noIssuesCompat}</div>
            : compatibility.latexIssues.map((issue, i) => (
              <button key={`tex-${i}`} className={`lab-item lab-${issue.severity}`} onClick={() => activePath && onOpenFile(activePath, issue.line)}>
                <span className="lab-item-title">{issue.message}</span>
                <span className="lab-item-meta">{t.documentLab.line} {issue.line}</span>
              </button>
            ))}
          <div className="labels-section-title">Obsidian</div>
          {compatibility.obsidianIssues.length === 0
            ? <div className="panel-empty">{t.documentLab.noIssuesCompat}</div>
            : compatibility.obsidianIssues.map((issue, i) => (
              <button key={`obs-${i}`} className={`lab-item lab-${issue.severity}`} onClick={() => activePath && onOpenFile(activePath, issue.line)}>
                <span className="lab-item-title">{issue.message}</span>
                <span className="lab-item-meta">{t.documentLab.line} {issue.line}</span>
              </button>
            ))}
        </div>
      )}

      {tab === "project" && (
        <div className="lab-list">
          {project.main ? (
            <>
              <div className="lab-card">
                <span className="lab-item-title">{t.documentLab.mainDocument}</span>
                <button className="lab-link" onClick={() => onOpenFile(project.main!.path, 1)}>{project.main.name}</button>
              </div>
              <div className="lab-score-row">
                <span>{t.documentLab.included} {project.included.length}</span>
                <span>{t.documentLab.missingEmbeds} {project.missingEmbeds.length}</span>
              </div>
              <div className="labels-section-title">{t.documentLab.includedFiles}</div>
              {project.included.map((file) => (
                <button key={file.path} className="lab-item" onClick={() => onOpenFile(file.path, 1)}>
                  <span className="lab-item-title">{file.name}</span>
                  <span className="lab-item-meta">{file.path}</span>
                </button>
              ))}
              {project.missingEmbeds.map((item) => (
                <div key={item} className="lab-item lab-warning">
                  <span className="lab-item-title">{t.documentLab.missingEmbed(item)}</span>
                </div>
              ))}
            </>
          ) : <div className="panel-empty">{t.documentLab.noMainDoc}</div>}
        </div>
      )}

      {tab === "structure" && (
        <div className="lab-list">
          {structureIssues.length === 0
            ? <div className="panel-empty">{t.documentLab.noIssuesStructure}</div>
            : structureIssues.map((issue, i) => <IssueRow key={`${issue.filePath}-${issue.line}-${i}`} issue={issue} onOpenFile={onOpenFile} />)}
        </div>
      )}

      {tab === "mathlinks" && (
        <div className="lab-list">
          {mathlinks.length === 0 ? <div className="panel-empty">{t.documentLab.noMathBacklinks}</div> : mathlinks.map((group) => (
            <div key={`${group.label.filePath}-${group.label.id}`} className="labels-section">
              <button className="lab-item" onClick={() => onOpenFile(group.label.filePath, group.label.line)}>
                <span className="lab-item-title">{group.label.id}</span>
                <span className="lab-item-meta">{t.documentLab.references(group.references.length)}</span>
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
