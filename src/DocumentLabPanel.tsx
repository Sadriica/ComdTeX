import { useMemo, useState, type CSSProperties } from "react"
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
  /** Citation keys of the vault bibliography (what the preview resolves). */
  bibKeys?: ReadonlySet<string>
  /** Paths of the non-document vault files (images and other assets). */
  assetPaths?: readonly string[]
  vaultPath?: string | null
  onOpenFile: (path: string, line?: number) => void
}

type LabTab = "diagnostics" | "compatibility" | "project" | "structure" | "mathlinks"

const SEVERITIES = ["error", "warning", "info"] as const

/** The severity marker: its shape (disc, diamond, ring) carries the meaning, colour reinforces it. */
function SeverityIcon({ label }: { label: string }) {
  return <span className="lab-icon" role="img" aria-label={label} title={label} />
}

/** One export target's score as a small meter: width and colour come from the value. */
function CompatMeter({ label, score }: { label: string; score: number }) {
  const level = score >= 80 ? "high" : score >= 50 ? "mid" : "low"
  return (
    <div className="compat-target" data-level={level}>
      <span className="compat-name">{label}</span>
      <span className="compat-value">{score}%</span>
      <span
        className="compat-meter"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
      >
        <span className="compat-meter-fill" style={{ "--value": score } as CSSProperties} />
      </span>
    </div>
  )
}

function GroupTitle({ label, count }: { label: string; count: number }) {
  return (
    <div className="lab-group-title">
      <span>{label}</span>
      <span className="lab-group-count">{count}</span>
    </div>
  )
}

function IssueRow({
  issue,
  severityText,
  onOpenFile,
}: {
  issue: DiagnosticIssue
  severityText: string
  onOpenFile: (path: string, line?: number) => void
}) {
  return (
    <button
      className={`lab-item lab-${issue.severity}`}
      onClick={() => onOpenFile(issue.filePath, issue.line)}
    >
      <SeverityIcon label={severityText} />
      <span className="lab-item-title">{issue.message}</span>
      <span className="lab-item-meta">
        {displayBasename(issue.filePath)}:{issue.line}
      </span>
      {issue.context && <span className="lab-item-context">{issue.context}</span>}
    </button>
  )
}

export default function DocumentLabPanel({
  files,
  activePath,
  activeContent,
  bibKeys,
  assetPaths,
  vaultPath,
  onOpenFile,
}: DocumentLabPanelProps) {
  const t = useT()
  const [tab, setTab] = useState<LabTab>("diagnostics")
  const diagnostics = useMemo(
    () =>
      diagnoseDocuments(files, {
        bibKeys,
        assetPaths,
        vaultPath: vaultPath ?? undefined,
        messages: t.documentLab.diag,
      }),
    [files, bibKeys, assetPaths, vaultPath, t],
  )
  const compatibility = useMemo(
    () => analyzeExportCompatibility(activeContent, t.documentLab.compat),
    [activeContent, t],
  )
  const project = useMemo(() => buildProjectPlan(files, activePath), [files, activePath])
  const mathlinks = useMemo(() => scanMathBacklinks(files), [files])
  const structureIssues = diagnostics.issues.filter((issue) => issue.category === "structure")

  const severityText: Record<DiagnosticIssue["severity"], string> = {
    error: t.documentLab.errors,
    warning: t.documentLab.warnings,
    info: t.documentLab.info,
  }
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
        <span className="panel-header-actions">
          {diagnostics.errors}/{diagnostics.warnings}
        </span>
      </div>
      <div className="lab-tabs">
        {(Object.keys(TAB_LABELS) as LabTab[]).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {TAB_LABELS[item]}
          </button>
        ))}
      </div>

      {tab === "diagnostics" && (
        <div className="lab-list">
          {diagnostics.issues.length === 0 ? (
            <div className="panel-empty">{t.documentLab.noIssues}</div>
          ) : (
            SEVERITIES.map((sev) => {
              const group = diagnostics.issues.filter((issue) => issue.severity === sev)
              if (group.length === 0) return null
              return (
                <section key={sev} className={`lab-group lab-${sev}`}>
                  <GroupTitle label={severityText[sev]} count={group.length} />
                  {group.map((issue, i) => (
                    <IssueRow
                      key={`${issue.filePath}-${issue.line}-${i}`}
                      issue={issue}
                      severityText={severityText[sev]}
                      onOpenFile={onOpenFile}
                    />
                  ))}
                </section>
              )
            })
          )}
        </div>
      )}

      {tab === "compatibility" && (
        <div className="lab-list">
          <div className="compat-score">
            <CompatMeter label="Overleaf/LaTeX" score={compatibility.latexScore} />
            <CompatMeter label="Obsidian MD" score={compatibility.obsidianScore} />
          </div>
          <GroupTitle label="LaTeX" count={compatibility.latexIssues.length} />
          {compatibility.latexIssues.length === 0 ? (
            <div className="panel-empty">{t.documentLab.noIssuesCompat}</div>
          ) : (
            compatibility.latexIssues.map((issue, i) => (
              <button
                key={`tex-${i}`}
                className={`lab-item lab-${issue.severity}`}
                onClick={() => activePath && onOpenFile(activePath, issue.line)}
              >
                <SeverityIcon label={severityText[issue.severity]} />
                <span className="lab-item-title">{issue.message}</span>
                <span className="lab-item-meta">
                  {t.documentLab.line} {issue.line}
                </span>
              </button>
            ))
          )}
          <GroupTitle label="Obsidian" count={compatibility.obsidianIssues.length} />
          {compatibility.obsidianIssues.length === 0 ? (
            <div className="panel-empty">{t.documentLab.noIssuesCompat}</div>
          ) : (
            compatibility.obsidianIssues.map((issue, i) => (
              <button
                key={`obs-${i}`}
                className={`lab-item lab-${issue.severity}`}
                onClick={() => activePath && onOpenFile(activePath, issue.line)}
              >
                <SeverityIcon label={severityText[issue.severity]} />
                <span className="lab-item-title">{issue.message}</span>
                <span className="lab-item-meta">
                  {t.documentLab.line} {issue.line}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {tab === "project" && (
        <div className="lab-list">
          {project.main ? (
            <>
              <div className="lab-card">
                <span className="lab-item-title">{t.documentLab.mainDocument}</span>
                <button className="lab-link" onClick={() => onOpenFile(project.main!.path, 1)}>
                  {project.main.name}
                </button>
              </div>
              <div className="lab-score-row">
                <span className="lab-chip">
                  {t.documentLab.included} <strong>{project.included.length}</strong>
                </span>
                <span className="lab-chip">
                  {t.documentLab.missingEmbeds} <strong>{project.missingEmbeds.length}</strong>
                </span>
              </div>
              <GroupTitle label={t.documentLab.includedFiles} count={project.included.length} />
              {project.included.map((file) => (
                <button
                  key={file.path}
                  className="lab-item"
                  onClick={() => onOpenFile(file.path, 1)}
                >
                  <span className="lab-item-title">{file.name}</span>
                  <span className="lab-item-meta">{file.path}</span>
                </button>
              ))}
              {project.missingEmbeds.map((item) => (
                <div key={item} className="lab-item lab-warning">
                  <SeverityIcon label={severityText.warning} />
                  <span className="lab-item-title">{t.documentLab.missingEmbed(item)}</span>
                </div>
              ))}
            </>
          ) : (
            <div className="panel-empty">{t.documentLab.noMainDoc}</div>
          )}
        </div>
      )}

      {tab === "structure" && (
        <div className="lab-list">
          {structureIssues.length === 0 ? (
            <div className="panel-empty">{t.documentLab.noIssuesStructure}</div>
          ) : (
            structureIssues.map((issue, i) => (
              <IssueRow
                key={`${issue.filePath}-${issue.line}-${i}`}
                issue={issue}
                severityText={severityText[issue.severity]}
                onOpenFile={onOpenFile}
              />
            ))
          )}
        </div>
      )}

      {tab === "mathlinks" && (
        <div className="lab-list">
          {mathlinks.length === 0 ? (
            <div className="panel-empty">{t.documentLab.noMathBacklinks}</div>
          ) : (
            mathlinks.map((group) => (
              <div key={`${group.label.filePath}-${group.label.id}`} className="labels-section">
                <button
                  className="lab-item"
                  onClick={() => onOpenFile(group.label.filePath, group.label.line)}
                >
                  <span className="lab-item-title">{group.label.id}</span>
                  <span className="lab-item-meta">
                    {t.documentLab.references(group.references.length)}
                  </span>
                </button>
                {group.references.map((ref, i) => (
                  <button
                    key={`${ref.filePath}-${ref.line}-${i}`}
                    className="lab-item lab-nested"
                    onClick={() => onOpenFile(ref.filePath, ref.line)}
                  >
                    <span className="lab-item-title">
                      {displayBasename(ref.filePath)}:{ref.line}
                    </span>
                    <span className="lab-item-context">{ref.context}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
