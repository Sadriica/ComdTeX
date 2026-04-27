import { useRef, useState } from "react"
import { useT } from "./i18n"
import { useFocusTrap } from "./useFocusTrap"

interface OnboardingTourProps {
  open: boolean
  onClose: () => void
}

export default function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const t = useT()
  const modalRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState(0)
  useFocusTrap(modalRef, open, onClose)

  if (!open) return null

  const steps: Array<{ icon: string; title: string; text: string }> = [
    { icon: "☰", title: t.onboarding.step1Title, text: t.onboarding.step1Text },
    { icon: "✎", title: t.onboarding.step2Title, text: t.onboarding.step2Text },
    { icon: "⌘", title: t.onboarding.step3Title, text: t.onboarding.step3Text },
    { icon: "⚙", title: t.onboarding.step4Title, text: t.onboarding.step4Text },
  ]

  const total = steps.length
  const current = steps[step]
  const isLast = step === total - 1

  const handleClose = () => {
    setStep(0)
    onClose()
  }

  const handleNext = () => {
    if (isLast) handleClose()
    else setStep((s) => s + 1)
  }

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1)
  }

  return (
    <div className="modal-overlay" onMouseDown={handleClose}>
      <div className="onboarding-modal" ref={modalRef} onMouseDown={(e) => e.stopPropagation()}>
        <div className="onboarding-header">
          <span className="onboarding-title">{t.onboarding.title}</span>
          <span className="onboarding-step-counter">{t.onboarding.step(step + 1, total)}</span>
        </div>
        <div className="onboarding-body">
          <div className="onboarding-step-icon" aria-hidden="true">{current.icon}</div>
          <div className="onboarding-step-title">{current.title}</div>
          <div className="onboarding-step-text">{current.text}</div>
        </div>
        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <span key={i} className={`onboarding-progress-dot${i === step ? " active" : ""}`} />
          ))}
        </div>
        <div className="onboarding-actions">
          <button onClick={handleClose}>{t.onboarding.skip}</button>
          <div style={{ display: "flex", gap: 8 }}>
            {step > 0 && <button onClick={handleBack}>{t.onboarding.back}</button>}
            <button className="primary" onClick={handleNext}>
              {isLast ? t.onboarding.done : t.onboarding.next}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
