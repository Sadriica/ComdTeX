import { useEffect, useId, useRef, useState } from "react"
import { open as openDialog } from "@tauri-apps/plugin-dialog"
import { documentDir } from "@tauri-apps/api/path"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"
import { Icon, X } from "./icons"
import {
  cloneVault,
  repoNameFromUrl,
  validateCloneUrl,
  type CloneErrorKind,
  type CloneHost,
  type CloneProgress,
} from "./vaultClone"
import { tauriCloneHost } from "./vaultCloneHost"

interface CloneVaultModalProps {
  open: boolean
  onClose: () => void
  /** The vault folder that was created; the caller opens it. */
  onCloned: (path: string) => void
  /** Injected in tests; the app uses the Tauri host. */
  host?: CloneHost
  /** Injected in tests; the app uses the native folder dialog. */
  pickFolder?: () => Promise<string | null>
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KiB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MiB`
  return `${(n / 1024 ** 3).toFixed(2)} GiB`
}

async function nativePick(title: string): Promise<string | null> {
  const picked = await openDialog({ directory: true, multiple: false, title })
  return typeof picked === "string" ? picked : null
}

export default function CloneVaultModal(props: CloneVaultModalProps) {
  if (!props.open) return null
  // Remounts per opening so the form always starts clean.
  return <CloneDialog {...props} />
}

function CloneDialog({
  onClose,
  onCloned,
  host = tauriCloneHost,
  pickFolder,
}: CloneVaultModalProps) {
  const t = useT()
  const [url, setUrl] = useState("")
  const [parent, setParent] = useState("")
  const [name, setName] = useState("")
  const [nameEdited, setNameEdited] = useState(false)
  const [running, setRunning] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [error, setError] = useState<{ kind: CloneErrorKind | "cancelled"; detail: string } | null>(
    null,
  )
  const abortRef = useRef<AbortController | null>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const urlId = useId()
  const nameId = useId()

  const cancel = () => {
    if (!abortRef.current) return
    setCancelling(true)
    abortRef.current.abort()
  }
  useFocusTrap(modalRef, true, () => (running ? cancel() : onClose()))

  // The default folder is the Documents folder, when the platform has one.
  useEffect(() => {
    let alive = true
    documentDir()
      .then((d) => alive && setParent((p) => p || d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const checked = validateCloneUrl(url)
  const urlProblem = url.trim() && !checked.ok ? checked.problem : null
  const canStart = checked.ok && !!parent && !!name.trim() && !running

  const onUrl = (v: string) => {
    setUrl(v)
    setError(null)
    if (!nameEdited) setName(v.trim() ? repoNameFromUrl(v) : "")
  }

  const choose = async () => {
    try {
      const picked = await (pickFolder ? pickFolder() : nativePick(t.cloneVault.pickerTitle))
      if (picked) {
        setParent(picked)
        setError(null)
      }
    } catch {
      /* the dialog failing leaves the folder unchanged */
    }
  }

  const start = async () => {
    if (!canStart) return
    const ctl = new AbortController()
    abortRef.current = ctl
    setRunning(true)
    setCancelling(false)
    setError(null)
    setProgress(null)
    const r = await cloneVault(host, {
      url,
      parent,
      name: name.trim(),
      onProgress: setProgress,
      signal: ctl.signal,
    })
    abortRef.current = null
    setRunning(false)
    setCancelling(false)
    if (r.ok) {
      onCloned(r.path)
      onClose()
    } else {
      setError({ kind: r.kind, detail: r.detail })
    }
  }

  const sep = parent.includes("\\") ? "\\" : "/"
  const where = parent && name.trim() ? `${parent.replace(/[\\/]+$/, "")}${sep}${name.trim()}` : ""

  const errorText = (() => {
    if (!error) return null
    if (error.kind === "cancelled") return t.cloneVault.cancelled
    if (error.kind === "badUrl")
      return t.cloneVault.problem[error.detail as keyof typeof t.cloneVault.problem] ?? ""
    return t.cloneVault.error[error.kind]
  })()
  const showDetail =
    error && error.detail && !["badUrl", "cancelled", "destNotEmpty"].includes(error.kind)

  const phase = progress ? t.cloneVault.phase[progress.phase] : t.cloneVault.phase.starting

  return (
    <div className="modal-overlay" onMouseDown={() => !running && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal clone-modal"
        ref={modalRef}
        data-testid="clone-vault"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span id={titleId}>{t.cloneVault.title}</span>
          <button
            className="modal-close"
            onClick={() => (running ? cancel() : onClose())}
            aria-label={t.cloneVault.close}
            title={t.cloneVault.close}
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="modal-body">
          <p className="clone-intro">{t.cloneVault.intro}</p>
          <label className="prompt-label" htmlFor={urlId}>
            {t.cloneVault.urlLabel}
          </label>
          <input
            id={urlId}
            className="template-filename-input prompt-field"
            value={url}
            autoFocus
            spellCheck={false}
            disabled={running}
            placeholder={t.cloneVault.urlPlaceholder}
            aria-invalid={!!urlProblem}
            onChange={(e) => onUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                void start()
              }
            }}
          />
          {urlProblem && (
            <p className="clone-problem" role="alert">
              {t.cloneVault.problem[urlProblem]}
            </p>
          )}
          <p className="clone-hint">{t.cloneVault.sshHint}</p>

          <span className="prompt-label">{t.cloneVault.folderLabel}</span>
          <div className="clone-folder-row">
            <code className="clone-folder" title={parent}>
              {parent || "-"}
            </code>
            <button className="btn-cancel" onClick={() => void choose()} disabled={running}>
              {t.cloneVault.chooseFolder}
            </button>
          </div>

          <label className="prompt-label" htmlFor={nameId}>
            {t.cloneVault.nameLabel}
          </label>
          <input
            id={nameId}
            className="template-filename-input prompt-field"
            value={name}
            spellCheck={false}
            disabled={running}
            onChange={(e) => {
              setName(e.target.value)
              setNameEdited(true)
              setError(null)
            }}
          />
          {where && <p className="clone-hint">{t.cloneVault.willCreate(where)}</p>}

          {running && (
            <div className="clone-progress" role="status" aria-live="polite">
              <div className="clone-progress-label">
                {cancelling ? t.cloneVault.cancelling : phase}
                {progress?.percent != null && ` ${progress.percent}%`}
                {progress?.bytes != null &&
                  ` · ${t.cloneVault.received(formatBytes(progress.bytes))}`}
              </div>
              <div
                className="clone-bar"
                role="progressbar"
                aria-label={t.cloneVault.working}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress?.percent ?? undefined}
              >
                <div
                  className={`clone-bar-fill${progress?.percent == null ? " indeterminate" : ""}`}
                  style={progress?.percent != null ? { width: `${progress.percent}%` } : undefined}
                />
              </div>
            </div>
          )}

          {errorText && (
            <div className="clone-error" role="alert" data-testid="clone-error">
              <p>{errorText}</p>
              {showDetail && (
                <details>
                  <summary>{t.cloneVault.details}</summary>
                  <pre>{error!.detail}</pre>
                </details>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer">
          {running ? (
            <button className="btn-cancel" onClick={cancel} disabled={cancelling}>
              {t.cloneVault.cancel}
            </button>
          ) : (
            <>
              <button className="btn-cancel" onClick={onClose}>
                {t.cloneVault.close}
              </button>
              <button className="btn-create" onClick={() => void start()} disabled={!canStart}>
                {t.cloneVault.clone}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
