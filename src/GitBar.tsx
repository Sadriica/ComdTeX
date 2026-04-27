import { useState, useCallback, useEffect, useRef } from "react"
import { Command } from "@tauri-apps/plugin-shell"
import { confirm as tauriConfirm } from "@tauri-apps/plugin-dialog"
import { useT } from "./i18n"
import { showToast } from "./toastService"
import { pathBasename, pathDirname } from "./pathUtils"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GitFile { x: string; y: string; path: string }

interface GitStatus {
  branch: string; upstream: string
  ahead: number; behind: number
  staged: GitFile[]; unstaged: GitFile[]; untracked: GitFile[]
}

interface Remote { name: string; fetchUrl: string; pushUrl: string }

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseStatus(raw: string): GitStatus {
  const lines = raw.split("\n").filter(Boolean)
  const bl = lines.find(l => l.startsWith("## "))
  let branch = "", upstream = "", ahead = 0, behind = 0
  if (bl) {
    const rest = bl.slice(3)
    const parts = rest.split("...")
    branch = parts[0].replace(/^No commits yet on /, "").trim()
    upstream = parts[1]?.split(/\s/)[0] ?? ""
    const am = /ahead (\d+)/.exec(rest);  if (am) ahead  = parseInt(am[1])
    const bm = /behind (\d+)/.exec(rest); if (bm) behind = parseInt(bm[1])
  }
  const staged: GitFile[] = [], unstaged: GitFile[] = [], untracked: GitFile[] = []
  for (const line of lines) {
    if (line.startsWith("## ") || line.length < 3) continue
    const x = line[0], y = line[1]
    const fullPath = line.slice(3)
    const path = (x === "R" || y === "R") ? fullPath.split(" -> ")[0] : fullPath
    if (x === "?" && y === "?") untracked.push({ x, y, path })
    else { if (x !== " ") staged.push({ x, y, path }); if (y !== " " && y !== "?") unstaged.push({ x, y, path }) }
  }
  return { branch, upstream, ahead, behind, staged, unstaged, untracked }
}

function parseRemotes(raw: string): Remote[] {
  const map = new Map<string, Partial<Remote>>()
  for (const line of raw.split("\n").filter(Boolean)) {
    const m = /^(\S+)\s+(\S+)\s+\((fetch|push)\)$/.exec(line)
    if (!m) continue
    const [, name, url, type] = m
    if (!map.has(name)) map.set(name, { name })
    if (type === "fetch") map.get(name)!.fetchUrl = url
    else map.get(name)!.pushUrl = url
  }
  return [...map.values()] as Remote[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { M:"M", A:"A", D:"D", R:"R", C:"C", U:"!", "?":"U" }
function badgeClass(code: string) {
  if (code === "A") return "git-badge-added"
  if (code === "D") return "git-badge-deleted"
  if (code === "R") return "git-badge-renamed"
  if (code === "?" || code === "U") return "git-badge-untracked"
  return "git-badge-modified"
}

// ── Diff view ─────────────────────────────────────────────────────────────────

function DiffView({ diff }: { diff: string }) {
  return (
    <div className="git-diff-view">
      {diff.split("\n").map((line, i) => {
        let cls = "git-diff-line"
        if (line.startsWith("+") && !line.startsWith("+++")) cls += " git-diff-add"
        else if (line.startsWith("-") && !line.startsWith("---")) cls += " git-diff-del"
        else if (line.startsWith("@@")) cls += " git-diff-hunk"
        return <div key={i} className={cls}>{line || " "}</div>
      })}
    </div>
  )
}

// ── File row ──────────────────────────────────────────────────────────────────

function FileRow({ file, isStaged, diff, onStage, onUnstage, onDiscard, onToggleDiff, stageTitle, unstageTitle, discardTitle }: {
  file: GitFile; isStaged: boolean; diff: string | null
  onStage?: () => void; onUnstage?: () => void; onDiscard?: () => void; onToggleDiff: () => void
  stageTitle: string; unstageTitle: string; discardTitle: string
}) {
  const code = isStaged ? file.x : file.y
  const name = pathBasename(file.path) || file.path
  const dir  = pathDirname(file.path)
  return (
    <div className="git-file-item">
      <div className="git-file-row">
        <button className="git-file-name-btn" title={file.path} onClick={onToggleDiff}>
          <span className="git-file-name">{name}{dir && <span className="git-file-dir"> {dir}</span>}</span>
        </button>
        <div className="git-file-actions">
          {isStaged
            ? <button className="git-action" title={unstageTitle} onClick={onUnstage}>−</button>
            : <><button className="git-action" title={stageTitle} onClick={onStage}>+</button>
               <button className="git-action git-action-discard" title={discardTitle} onClick={onDiscard}>↩</button></>
          }
          <span className={`git-badge ${badgeClass(code)}`}>{STATUS_LABEL[code] ?? code}</span>
        </div>
      </div>
      {diff !== null && <DiffView diff={diff} />}
    </div>
  )
}

// ── Collapsible section ───────────────────────────────────────────────────────

function GitSection({ title, headerAction, defaultOpen = true, children }: {
  title: string; headerAction?: { label: string; title: string; onClick: () => void }
  defaultOpen?: boolean; children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="git-section">
      <div className="git-section-header">
        <button className="git-section-toggle" onClick={() => setOpen(o => !o)}>
          <span className="git-section-chevron">{open ? "▾" : "▸"}</span>
          <span className="git-section-title">{title}</span>
        </button>
        {headerAction && (
          <button className="git-action git-section-action" title={headerAction.title} onClick={headerAction.onClick}>
            {headerAction.label}
          </button>
        )}
      </div>
      {open && <div className="git-section-body">{children}</div>}
    </div>
  )
}

// ── Branch dropdown ───────────────────────────────────────────────────────────

function BranchDropdown({ vaultPath, currentBranch, onClose, onRefresh }: {
  vaultPath: string; currentBranch: string; onClose: () => void; onRefresh: () => void
}) {
  const g = useT().git
  const [branches, setBranches] = useState<string[]>([])
  const [newBranch, setNewBranch] = useState("")
  const ref = useRef<HTMLDivElement>(null)
  const git = useCallback((...args: string[]) => Command.create("git", ["-C", vaultPath, ...args]).execute(), [vaultPath])

  useEffect(() => {
    git("branch", "--format=%(refname:short)").then(r => {
      if (r.code === 0) setBranches(r.stdout.split("\n").filter(Boolean))
    }).catch(() => {})
  }, [git])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [onClose])

  const switchTo = useCallback(async (b: string) => {
    try {
      const r = await git("checkout", b)
      if (r.code !== 0) throw new Error(r.stderr || r.stdout)
      onRefresh(); onClose()
    } catch (e) { showToast(g.newBranchError(String(e)), "error") }
  }, [git, onRefresh, onClose, g])

  const create = useCallback(async () => {
    const name = newBranch.trim(); if (!name) return
    try {
      const r = await git("checkout", "-b", name)
      if (r.code !== 0) throw new Error(r.stderr || r.stdout)
      showToast(g.newBranchSuccess(name), "success")
      setNewBranch(""); onRefresh(); onClose()
    } catch (e) { showToast(g.newBranchError(String(e)), "error") }
  }, [git, newBranch, onRefresh, onClose, g])

  return (
    <div className="git-branch-dropdown" ref={ref}>
      <div className="git-branch-list">
        {branches.map(b => (
          <button key={b} className={`git-branch-item ${b === currentBranch ? "active" : ""}`}
            onClick={() => b !== currentBranch && switchTo(b)}>
            {b === currentBranch ? "✓ " : "  "}{b}
          </button>
        ))}
        {branches.length === 0 && <div className="git-branch-empty">—</div>}
      </div>
      <div className="git-branch-new">
        <input className="git-branch-input" placeholder={g.newBranchPlaceholder}
          value={newBranch} onChange={e => setNewBranch(e.target.value)}
          onKeyDown={e => e.key === "Enter" && create()} />
        <button className="git-action git-section-action" style={{ opacity: 1 }}
          onClick={create} disabled={!newBranch.trim()}>+</button>
      </div>
    </div>
  )
}

// ── Remotes section ───────────────────────────────────────────────────────────

function RemotesSection({ vaultPath }: { vaultPath: string }) {
  const g = useT().git
  const [remotes, setRemotes] = useState<Remote[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [urlInput, setUrlInput] = useState("")
  const [newName, setNewName] = useState("")
  const [newUrl, setNewUrl] = useState("")
  const git = useCallback((...args: string[]) => Command.create("git", ["-C", vaultPath, ...args]).execute(), [vaultPath])

  const load = useCallback(async () => {
    try {
      const r = await git("remote", "-v")
      setRemotes(r.code === 0 ? parseRemotes(r.stdout) : [])
    } catch { setRemotes([]) }
  }, [git])

  useEffect(() => { load() }, [load])

  const setUrl = useCallback(async (name: string, url: string) => {
    const u = url.trim(); if (!u) return
    try {
      const r = await git("remote", "set-url", name, u)
      if (r.code !== 0) throw new Error(r.stderr || r.stdout)
      showToast(g.remoteUpdated(name), "success")
      setEditing(null); load()
    } catch (e) { showToast(g.remoteError(String(e)), "error") }
  }, [git, load, g])

  const addRemote = useCallback(async () => {
    const n = newName.trim(), u = newUrl.trim(); if (!n || !u) return
    try {
      const r = await git("remote", "add", n, u)
      if (r.code !== 0) throw new Error(r.stderr || r.stdout)
      showToast(g.remoteAdded(n), "success")
      setNewName(""); setNewUrl(""); load()
    } catch (e) { showToast(g.remoteError(String(e)), "error") }
  }, [git, newName, newUrl, load, g])

  const removeRemote = useCallback(async (name: string) => {
    const ok = await tauriConfirm(g.confirmRemoveRemote(name), { title: "Git", kind: "warning" }).catch(() => false)
    if (!ok) return
    try {
      const r = await git("remote", "remove", name)
      if (r.code !== 0) throw new Error(r.stderr || r.stdout)
      showToast(g.remoteRemoved(name), "success"); load()
    } catch (e) { showToast(g.remoteError(String(e)), "error") }
  }, [git, load, g])

  return (
    <GitSection title={g.remotes} defaultOpen={false}
      headerAction={{ label: "↺", title: g.reloadRemotes, onClick: load }}>
      <div className="git-remotes">
        {remotes.length === 0 && <div className="git-no-changes">{g.noRemotes}</div>}
        {remotes.map(r => (
          <div key={r.name} className="git-remote-entry">
            <div className="git-remote-header">
              <span className="git-remote-name">{r.name}</span>
              <div style={{ display: "flex", gap: 2 }}>
                <button className="git-action git-section-action" style={{ opacity: 1 }}
                  title={g.editRemoteUrl} onClick={() => { setEditing(r.name); setUrlInput(r.fetchUrl) }}>✎</button>
                <button className="git-action git-action-discard" style={{ opacity: 1 }}
                  title={g.removeRemote} onClick={() => removeRemote(r.name)}>×</button>
              </div>
            </div>
            {editing === r.name ? (
              <div className="git-remote-edit">
                <input className="git-branch-input" value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") setUrl(r.name, urlInput); if (e.key === "Escape") setEditing(null) }}
                  autoFocus />
                <button className="git-action git-section-action" style={{ opacity: 1 }}
                  onClick={() => setUrl(r.name, urlInput)}>✓</button>
                <button className="git-action" style={{ opacity: 1 }}
                  onClick={() => setEditing(null)}>✕</button>
              </div>
            ) : (
              <div className="git-remote-url" title={r.fetchUrl}>{r.fetchUrl}</div>
            )}
          </div>
        ))}
        <div className="git-remote-add">
          <input className="git-branch-input" placeholder={g.remoteNamePlaceholder}
            value={newName} onChange={e => setNewName(e.target.value)} style={{ width: 80 }} />
          <input className="git-branch-input" placeholder={g.remoteUrlPlaceholder}
            value={newUrl} onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addRemote()} style={{ flex: 1 }} />
          <button className="git-action git-section-action" style={{ opacity: 1 }}
            onClick={addRemote} disabled={!newName.trim() || !newUrl.trim()}>+</button>
        </div>
      </div>
    </GitSection>
  )
}

// ── Config section ────────────────────────────────────────────────────────────

function ConfigSection({ vaultPath }: { vaultPath: string }) {
  const g = useT().git
  const [name, setName]   = useState("")
  const [email, setEmail] = useState("")
  const [editing, setEditing] = useState(false)
  const git = useCallback((...args: string[]) => Command.create("git", ["-C", vaultPath, ...args]).execute(), [vaultPath])

  const load = useCallback(async () => {
    try {
      const [nr, er] = await Promise.all([git("config", "user.name"), git("config", "user.email")])
      setName(nr.stdout.trim()); setEmail(er.stdout.trim())
    } catch {}
  }, [git])

  const save = useCallback(async () => {
    try {
      const results = await Promise.all([
        name.trim()  ? git("config", "user.name",  name.trim())  : Promise.resolve(null),
        email.trim() ? git("config", "user.email", email.trim()) : Promise.resolve(null),
      ])
      const failed = results.find(r => r && r.code !== 0)
      if (failed) throw new Error(failed.stderr)
      showToast(g.configSaved, "success"); setEditing(false)
    } catch (e) { showToast(String(e), "error") }
  }, [git, name, email, g])

  return (
    <GitSection title={g.configSection} defaultOpen={false}
      headerAction={{ label: editing ? "✓" : "✎", title: editing ? g.saveLocal : "Edit",
        onClick: editing ? save : () => { load(); setEditing(true) } }}>
      <div className="git-config-body">
        <div className="git-config-row">
          <span className="git-config-label">user.name</span>
          {editing
            ? <input className="git-branch-input" value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && save()} />
            : <span className="git-config-value" onClick={() => { load(); setEditing(true) }}>{name || <em style={{color:"#555"}}>—</em>}</span>
          }
        </div>
        <div className="git-config-row">
          <span className="git-config-label">user.email</span>
          {editing
            ? <input className="git-branch-input" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && save()} />
            : <span className="git-config-value" onClick={() => { load(); setEditing(true) }}>{email || <em style={{color:"#555"}}>—</em>}</span>
          }
        </div>
        {editing && (
          <div style={{ display: "flex", gap: 4, padding: "4px 0" }}>
            <button className="git-panel-header-btn" style={{ color: "#4ec9b0" }} onClick={save}>{g.saveLocal}</button>
            <button className="git-panel-header-btn" onClick={() => setEditing(false)}>✕</button>
          </div>
        )}
      </div>
    </GitSection>
  )
}

// ── Stash section ─────────────────────────────────────────────────────────────

export function StashSection({ vaultPath }: { vaultPath: string }) {
  const g = useT().git
  const [stashes, setStashes] = useState<string[]>([])
  const git = useCallback((...args: string[]) => Command.create("git", ["-C", vaultPath, ...args]).execute(), [vaultPath])
  const load = useCallback(async () => {
    try { const r = await git("stash", "list"); setStashes(r.code === 0 ? r.stdout.split("\n").filter(Boolean) : []) }
    catch { setStashes([]) }
  }, [git])

  useEffect(() => {
    void load()
  }, [load])

  const push = useCallback(async () => {
    try { const r = await git("stash", "push"); if (r.code !== 0) throw new Error(r.stderr); showToast(g.stashSuccess, "success"); load() }
    catch (e) { showToast(g.stashError(String(e)), "error") }
  }, [git, load, g])
  const pop = useCallback(async (i: number) => {
    try { const r = await git("stash", "pop", `stash@{${i}}`); if (r.code !== 0) throw new Error(r.stderr); showToast(g.stashPopSuccess, "success"); load() }
    catch (e) { showToast(g.stashError(String(e)), "error") }
  }, [git, load, g])
  const drop = useCallback(async (i: number) => {
    try { const r = await git("stash", "drop", `stash@{${i}}`); if (r.code !== 0) throw new Error(r.stderr); load() }
    catch (e) { showToast(g.stashError(String(e)), "error") }
  }, [git, load, g])

  return (
    <GitSection title={g.stashList} defaultOpen={false}
      headerAction={{ label: "↓", title: g.stash, onClick: push }}>
      <div className="git-section-body">
        {stashes.length === 0
          ? <div className="git-no-changes">{g.noStashes}</div>
          : stashes.map((s, i) => (
              <div key={i} className="git-stash-entry">
                <span className="git-stash-label">{s}</span>
                <button className="git-action git-section-action" style={{ opacity: 1 }}
                  title={g.stashPop} onClick={() => pop(i)}>↑</button>
                <button className="git-action git-action-discard" style={{ opacity: 1 }}
                  title={g.stashDrop} onClick={() => drop(i)}>×</button>
              </div>
            ))
        }
      </div>
    </GitSection>
  )
}

// ── Changes panel ─────────────────────────────────────────────────────────────

function ChangesPanel({ vaultPath, status, onRefresh }: {
  vaultPath: string; status: GitStatus; onRefresh: () => void
}) {
  const g = useT().git
  const [commitMsg, setCommitMsg] = useState("")
  const [committing, setCommitting] = useState(false)
  const [diffs, setDiffs] = useState<Record<string, string>>({})
  const [log, setLog] = useState<string[]>([])

  const git = useCallback((...args: string[]) =>
    Command.create("git", ["-C", vaultPath, ...args]).execute(), [vaultPath])

  const toggleDiff = useCallback(async (path: string, staged: boolean) => {
    const key = `${staged ? "s" : "u"}:${path}`
    if (key in diffs) { setDiffs(d => { const n = { ...d }; delete n[key]; return n }); return }
    try {
      const r = await Command.create("git", ["-C", vaultPath,
        ...(staged ? ["diff", "--staged", "--", path] : ["diff", "--", path])]).execute()
      setDiffs(d => ({ ...d, [key]: r.stdout || "(no diff)" }))
    } catch { setDiffs(d => ({ ...d, [key]: "(error)" })) }
  }, [vaultPath, diffs])

  const stage      = useCallback(async (p: string) => { try { await git("add","--",p); onRefresh() } catch (e) { showToast(g.stageError(String(e)),"error") } }, [git,onRefresh,g])
  const unstage    = useCallback(async (p: string) => { try { await git("restore","--staged","--",p); onRefresh() } catch (e) { showToast(g.unstageError(String(e)),"error") } }, [git,onRefresh,g])
  const stageAll   = useCallback(async () => { try { await git("add","-A"); onRefresh() } catch (e) { showToast(g.stageError(String(e)),"error") } }, [git,onRefresh,g])
  const unstageAll = useCallback(async () => { try { await git("restore","--staged","."); onRefresh() } catch (e) { showToast(g.unstageError(String(e)),"error") } }, [git,onRefresh,g])

  const discard = useCallback(async (file: GitFile) => {
    const ok = await tauriConfirm(g.discardConfirm(file.path), { title:"Git", kind:"warning" }).catch(() => false)
    if (!ok) return
    try {
      if (file.x === "?" && file.y === "?") await git("clean","-f","--",file.path)
      else await git("restore","--",file.path)
      onRefresh()
    } catch (e) { showToast(String(e),"error") }
  }, [git,onRefresh,g])

  const commit = useCallback(async () => {
    const msg = commitMsg.trim(); if (!msg) return
    setCommitting(true)
    try {
      const r = await git("commit","-m",msg)
      if (r.code !== 0) throw new Error(r.stderr || r.stdout)
      setCommitMsg(""); showToast(g.commitSuccess,"success")
      if (log.length > 0) { const lr = await git("log","--oneline","-20"); setLog(lr.code===0?lr.stdout.split("\n").filter(Boolean):[]) }
      onRefresh()
    } catch (e) { showToast(g.commitError(String(e)),"error") }
    finally { setCommitting(false) }
  }, [git,commitMsg,onRefresh,log,g])

  const loadLog = useCallback(async () => {
    try { const r = await git("log","--oneline","-20"); setLog(r.code===0?r.stdout.split("\n").filter(Boolean):[]) }
    catch { setLog([]) }
  }, [git])

  const total = status.staged.length + status.unstaged.length + status.untracked.length

  return (
    <div className="git-panel-body">

      {/* Status summary */}
      <div className="git-status-summary">
        {total === 0
          ? <span className="git-summary-clean">✓ Sin cambios pendientes</span>
          : <>
              {status.staged.length > 0    && <span className="git-summary-chip git-chip-staged">↑ {status.staged.length} preparado{status.staged.length !== 1 ? "s" : ""}</span>}
              {status.unstaged.length > 0  && <span className="git-summary-chip git-chip-changed">● {status.unstaged.length} modificado{status.unstaged.length !== 1 ? "s" : ""}</span>}
              {status.untracked.length > 0 && <span className="git-summary-chip git-chip-untracked">? {status.untracked.length} nuevo{status.untracked.length !== 1 ? "s" : ""}</span>}
            </>
        }
      </div>

      {/* Commit area */}
      <div className="git-commit-area">
        <textarea className="git-commit-input" placeholder={g.commitPlaceholder}
          value={commitMsg} rows={3} onChange={e => setCommitMsg(e.target.value)}
          onKeyDown={e => { if ((e.ctrlKey||e.metaKey) && e.key==="Enter") commit() }} />
        <button className="git-commit-btn"
          disabled={!commitMsg.trim()||committing||status.staged.length===0} onClick={commit}>
          {committing ? "…" : g.commit}
        </button>
      </div>

      {/* Staged */}
      {status.staged.length > 0 && (
        <GitSection title={`${g.staged} (${status.staged.length})`}
          headerAction={{ label:"−−", title:g.unstageAll, onClick:unstageAll }}>
          {status.staged.map(f => (
            <FileRow key={`s:${f.path}`} file={f} isStaged diff={diffs[`s:${f.path}`]??null}
              onUnstage={() => unstage(f.path)} onToggleDiff={() => toggleDiff(f.path, true)}
              stageTitle={g.stageOne} unstageTitle={g.unstageOne} discardTitle={g.discard} />
          ))}
        </GitSection>
      )}

      {/* Unstaged */}
      {status.unstaged.length > 0 && (
        <GitSection title={`${g.changes} (${status.unstaged.length})`}
          headerAction={{ label:"++", title:g.stageAll, onClick:stageAll }}>
          {status.unstaged.map(f => (
            <FileRow key={`u:${f.path}`} file={f} isStaged={false} diff={diffs[`u:${f.path}`]??null}
              onStage={() => stage(f.path)} onDiscard={() => discard(f)} onToggleDiff={() => toggleDiff(f.path, false)}
              stageTitle={g.stageOne} unstageTitle={g.unstageOne} discardTitle={g.discard} />
          ))}
        </GitSection>
      )}

      {/* Untracked */}
      {status.untracked.length > 0 && (
        <GitSection title={`${g.untracked} (${status.untracked.length})`}
          headerAction={{ label:"++", title:g.stageAll, onClick:stageAll }}>
          {status.untracked.map(f => (
            <FileRow key={`n:${f.path}`} file={f} isStaged={false} diff={diffs[`n:${f.path}`]??null}
              onStage={() => stage(f.path)} onDiscard={() => discard(f)} onToggleDiff={() => toggleDiff(f.path, false)}
              stageTitle={g.stageOne} unstageTitle={g.unstageOne} discardTitle={g.discard} />
          ))}
        </GitSection>
      )}

      {/* Remotes */}
      <RemotesSection vaultPath={vaultPath} />

      {/* Config */}
      <ConfigSection vaultPath={vaultPath} />

      {/* Stash */}
      <StashSection vaultPath={vaultPath} />

      {/* Recent commits */}
      <GitSection title={`${g.recentCommits}`} defaultOpen={false}>
        <div className="git-log-list">
          {log.length === 0
            ? <div className="git-log-empty" style={{ padding: "6px 8px" }}>
                <button className="git-panel-header-btn" onClick={loadLog}>{g.loadCommits}</button>
              </div>
            : log.map((entry, i) => {
                const si = entry.indexOf(" ")
                return (
                  <div key={i} className="git-log-entry">
                    <span className="git-log-hash">{entry.slice(0, si)}</span>
                    <span className="git-log-msg">{entry.slice(si + 1)}</span>
                  </div>
                )
              })
          }
        </div>
      </GitSection>

    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface GitBarProps { vaultPath: string | null }

export default function GitBar({ vaultPath }: GitBarProps) {
  const g = useT().git

  const [status, setStatus]         = useState<GitStatus | null>(null)
  const [loading, setLoading]       = useState(false)
  const [notRepo, setNotRepo]       = useState(false)
  const [gitMissing, setGitMissing] = useState(false)
  const [panelOpen, setPanelOpen]   = useState(false)
  const [branchOpen, setBranchOpen] = useState(false)
  const [remoteOp, setRemoteOp]     = useState<string | null>(null)

  const wrapRef  = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })

  const git = useCallback(async (...args: string[]) => {
    if (!vaultPath) throw new Error("no vault")
    const r = await Command.create("git", ["-C", vaultPath, ...args]).execute()
    return { stdout: r.stdout, code: r.code ?? 1, stderr: r.stderr }
  }, [vaultPath])

  const refresh = useCallback(async () => {
    if (!vaultPath) return
    setLoading(true)
    try {
      const check = await Command.create("git", ["-C", vaultPath, "rev-parse", "--git-dir"]).execute()
      if (check.code !== 0) { setNotRepo(true); setStatus(null); return }
      setNotRepo(false)
      const r = await Command.create("git", ["-C", vaultPath, "status", "--porcelain", "-b"]).execute()
      setStatus(parseStatus(r.stdout))
    } catch { setGitMissing(true) }
    finally { setLoading(false) }
  }, [vaultPath])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [vaultPath])

  const openPanel = useCallback(() => {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    setPanelPos({ top: rect.bottom, left: rect.left })
    setPanelOpen(true)
  }, [])

  useEffect(() => {
    if (!panelOpen) return
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          wrapRef.current  && !wrapRef.current.contains(e.target as Node))
        setPanelOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [panelOpen])

  const handleInit = useCallback(async () => {
    try {
      const r = await git("init"); if (r.code !== 0) throw new Error(r.stderr)
      showToast(g.initSuccess, "success"); refresh()
    } catch (e) { showToast(String(e), "error") }
  }, [git, refresh, g])

  const handleRemote = useCallback(async (op: "fetch"|"push"|"pull") => {
    setRemoteOp(op)
    try {
      const r = await git(op); if (r.code !== 0) throw new Error(r.stderr || r.stdout)
      showToast({ fetch: g.fetchSuccess, push: g.pushSuccess, pull: g.pullSuccess }[op], "success")
      refresh()
    } catch (e) {
      showToast({ fetch: g.fetchError(String(e)), push: g.pushError(String(e)), pull: g.pullError(String(e)) }[op], "error")
    } finally { setRemoteOp(null) }
  }, [git, refresh, g])

  if (!vaultPath) {
    return (
      <div className="menu-item git-menu-item">
        <button className="menu-btn" style={{ opacity: 0.4, cursor: "default" }}>⎇ Git</button>
      </div>
    )
  }

  const total = status ? status.staged.length + status.unstaged.length + status.untracked.length : 0
  const branchLabel = loading ? "…" : gitMissing ? "git?" : notRepo ? "no repo" : (status?.branch || "—")

  return (
    <div className="menu-item git-menu-item" ref={wrapRef}>
      {/* Menu button */}
      <button className={`menu-btn${panelOpen ? " open" : ""}`}
        onMouseDown={e => { e.preventDefault(); if (panelOpen) setPanelOpen(false); else openPanel() }}>
        <span style={{ color: "#569cd6" }}>⎇</span>
        <span style={{ margin: "0 4px" }}>{branchLabel}</span>
        {(status?.ahead  ?? 0) > 0 && <span className="git-pill git-pill-ahead">↑{status!.ahead}</span>}
        {(status?.behind ?? 0) > 0 && <span className="git-pill git-pill-behind">↓{status!.behind}</span>}
        {status && status.staged.length > 0 && <span className="git-pill git-pill-staged">●{status.staged.length}</span>}
        {status && (total - status.staged.length) > 0 && <span className="git-pill git-pill-changed">●{total - status.staged.length}</span>}
      </button>

      {/* Branch switch chevron */}
      {status && !notRepo && (
        <button className="git-branch-chevron" title={g.switchBranch}
          onMouseDown={e => { e.preventDefault(); setBranchOpen(o => !o) }}>▾</button>
      )}

      {/* Branch dropdown */}
      {branchOpen && status && vaultPath && (
        <BranchDropdown vaultPath={vaultPath} currentBranch={status.branch}
          onClose={() => setBranchOpen(false)} onRefresh={refresh} />
      )}

      {/* Floating panel */}
      {panelOpen && vaultPath && (
        <div className="git-panel-overlay" ref={panelRef} style={{ top: panelPos.top, left: panelPos.left }}>

          {gitMissing ? (
            <div className="git-empty-state">
              <div className="git-empty-icon">⎇</div>
              <div className="git-empty-title">Git no encontrado</div>
              <div className="git-empty-desc">Instala Git y reinicia la aplicación.</div>
            </div>
          ) : notRepo ? (
            <div className="git-empty-state">
              <div className="git-empty-icon">📁</div>
              <div className="git-empty-title">{g.notRepo}</div>
              <div className="git-empty-desc">{g.noVault}</div>
              <button className="git-empty-btn" onClick={handleInit}>
                {loading ? "…" : g.initGitRepo}
              </button>
              <button className={`git-panel-header-btn git-panel-refresh${loading?" git-spin":""}`}
                style={{ marginTop: 8 }} title={g.refresh} disabled={loading} onClick={refresh}>⟳ {g.recheckRepo}</button>
            </div>
          ) : (
            <>
              {/* Toolbar: remote ops + refresh */}
              <div className="git-panel-header">
                <button className={`git-panel-header-btn${remoteOp==="fetch"?" git-op-loading":""}`}
                  disabled={!!remoteOp} onClick={() => handleRemote("fetch")}>↻ {g.fetch}</button>
                <button className={`git-panel-header-btn${remoteOp==="push"?" git-op-loading":""}`}
                  disabled={!!remoteOp} onClick={() => handleRemote("push")}>
                  ↑ {g.push}{status?.ahead ? ` (${status.ahead})` : ""}
                </button>
                <button className={`git-panel-header-btn${remoteOp==="pull"?" git-op-loading":""}`}
                  disabled={!!remoteOp} onClick={() => handleRemote("pull")}>
                  ↓ {g.pull}{status?.behind ? ` (${status.behind})` : ""}
                </button>
                <button className={`git-panel-header-btn git-panel-refresh${loading?" git-spin":""}`}
                  title={g.refresh} disabled={loading} onClick={refresh}>⟳</button>
              </div>

              {/* Upstream info */}
              {status?.upstream && (
                <div className="git-upstream-row">
                  <span className="git-upstream-label">upstream</span>
                  <span className="git-upstream-value">{status.upstream}</span>
                </div>
              )}

              {status && <ChangesPanel vaultPath={vaultPath} status={status} onRefresh={refresh} />}
            </>
          )}
        </div>
      )}
    </div>
  )
}
