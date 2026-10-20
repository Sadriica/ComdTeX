// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"
import { useRef, useState } from "react"
import HelpModal from "./HelpModal"
import BookmarksPopup from "./BookmarksPopup"
import ClosedTabsPopup from "./ClosedTabsPopup"
import QuickSwitcher from "./QuickSwitcher"
import OnboardingTour from "./OnboardingTour"
import CitationManager from "./CitationManager"
import TableEditor from "./TableEditor"
import ToastContainer from "./Toast"
import { showToast } from "./toastService"
import { useFocusTrap } from "./useFocusTrap"

function expectLabelledDialog() {
  const dialog = screen.getByRole("dialog")
  expect(dialog.getAttribute("aria-modal")).toBe("true")
  const labelledBy = dialog.getAttribute("aria-labelledby")
  if (labelledBy) {
    expect(document.getElementById(labelledBy)?.textContent?.length).toBeGreaterThan(0)
  } else {
    expect(dialog.getAttribute("aria-label")).toBeTruthy()
  }
}

describe("modal dialog semantics", () => {
  it("HelpModal", () => {
    render(<HelpModal open onClose={() => {}} />)
    expectLabelledDialog()
  })
  it("BookmarksPopup", () => {
    render(
      <BookmarksPopup
        open
        bookmarks={[{ slot: 1, line: 3 }]}
        onGoTo={() => {}}
        onRemove={() => {}}
        onClose={() => {}}
      />,
    )
    expectLabelledDialog()
  })
  it("ClosedTabsPopup", () => {
    render(<ClosedTabsPopup open paths={[]} onSelect={() => {}} onClose={() => {}} />)
    expectLabelledDialog()
  })
  it("QuickSwitcher", () => {
    render(
      <QuickSwitcher open files={[]} recentFiles={[]} onSelect={() => {}} onClose={() => {}} />,
    )
    expectLabelledDialog()
  })
  it("OnboardingTour", () => {
    render(<OnboardingTour open onClose={() => {}} />)
    expectLabelledDialog()
  })
})

describe("Escape closes the editors", () => {
  it("CitationManager", () => {
    const onClose = vi.fn()
    render(
      <CitationManager
        open
        bibMap={new Map()}
        onSave={() => {}}
        onPersist={() => {}}
        onClose={onClose}
      />,
    )
    expectLabelledDialog()
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("TableEditor", () => {
    const onClose = vi.fn()
    render(<TableEditor open onClose={onClose} onInsert={() => {}} />)
    expectLabelledDialog()
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe("toasts", () => {
  it("uses a polite status container and alert role for errors", () => {
    render(<ToastContainer />)
    act(() => {
      showToast("boom", "error", 50)
    })
    expect(screen.getByRole("status")).toBeTruthy()
    expect(screen.getByRole("alert").textContent).toBe("boom")
  })
})

describe("useFocusTrap", () => {
  function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLDivElement>(null)
    useFocusTrap(ref, open, () => {
      setOpen(false)
      onClose()
    })
    return (
      <>
        <button onClick={() => setOpen(true)}>opener</button>
        {open && (
          <div ref={ref}>
            <input aria-label="inside" />
          </div>
        )}
      </>
    )
  }
  it("moves focus in, closes on Escape and restores focus", () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const opener = screen.getByText("opener")
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByLabelText("inside"))
    fireEvent.keyDown(screen.getByLabelText("inside"), { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
    expect(document.activeElement).toBe(opener)
  })
})

afterEach(cleanup)

// jsdom has no layout, so offsetParent is always null and the trap would see
// no focusable elements. Report elements as rendered.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get() {
      return this.parentNode
    },
  })
})
