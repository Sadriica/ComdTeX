import { useEffect, useMemo, useState } from "react"
import { useT } from "./i18n"
import {
  CURATED,
  DEFAULT_FONT,
  buildStack,
  pickInstalled,
  presetValue,
  quoteFamily,
  systemValue,
  type FontRole,
  type SystemFont,
} from "./fontChoices"
import { loadSystemFonts } from "./systemFonts"

interface FontPickerProps {
  role: FontRole
  "data-setting": string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
}

const DEFAULT_SAMPLE_FONT: Record<FontRole, string | undefined> = {
  ui: undefined,
  editor: "var(--font-mono)",
  preview: "var(--font-doc)",
}

/** A typeface select: default, curated stacks, then the fonts installed on the system. */
export default function FontPicker({
  role,
  "data-setting": settingId,
  label,
  hint,
  value,
  onChange,
}: FontPickerProps) {
  const t = useT()
  const [fonts, setFonts] = useState<SystemFont[] | null>(null)

  useEffect(() => {
    let alive = true
    void loadSystemFonts().then((list) => {
      if (alive) setFonts(list)
    })
    return () => {
      alive = false
    }
  }, [])

  const installed = useMemo(() => pickInstalled(role, fonts ?? []), [role, fonts])
  // A saved family that is no longer installed (or not scanned yet) must stay selectable.
  const savedFamily = value.startsWith("system:") ? value.slice(7) : null
  const missing = savedFamily !== null && !installed.some((f) => f.name === savedFamily)
  const sample = buildStack(role, value) ?? DEFAULT_SAMPLE_FONT[role]
  const optionStyle = (family: string) => ({ fontFamily: `${quoteFamily(family)}, sans-serif` })
  const note =
    fonts === null ? t.typography.scanning : fonts.length === 0 ? t.typography.noInstalled : null

  return (
    <>
      <label className="setting-row" data-setting={settingId}>
        <span>{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value={DEFAULT_FONT}>{t.typography.defaultOption}</option>
          <optgroup label={t.typography.groupSuggested}>
            {CURATED[role].map((p) => (
              <option key={p.id} value={presetValue(p.id)} style={{ fontFamily: p.stack }}>
                {p.label}
              </option>
            ))}
          </optgroup>
          {(installed.length > 0 || missing) && (
            <optgroup
              label={
                role === "editor" ? t.typography.groupInstalledMono : t.typography.groupInstalled
              }
            >
              {missing && savedFamily && (
                <option value={value} style={optionStyle(savedFamily)}>
                  {savedFamily}
                </option>
              )}
              {installed.map((f) => (
                <option key={f.name} value={systemValue(f.name)} style={optionStyle(f.name)}>
                  {f.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      <p className="setting-hint">{hint}</p>
      <p className="font-sample" style={sample ? { fontFamily: sample } : undefined}>
        {role === "editor" ? t.typography.sampleCode : t.typography.sample}
      </p>
      {note && role === "ui" && <p className="setting-hint">{note}</p>}
    </>
  )
}
