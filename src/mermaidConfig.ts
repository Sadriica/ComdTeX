// Shared Mermaid initialization config.
//
// Lives in its own module (rather than inline in App.tsx) so the render path
// and the regression tests read the SAME object — a duplicated literal could
// drift and let a test pass while the app stays broken.

export const MERMAID_CONFIG = {
  startOnLoad: false,
  theme: "dark",
  // Render node/edge labels as native SVG <text>/<tspan> instead of HTML
  // inside <foreignObject>.
  //
  // This is NOT cosmetic — it's required for labels to be visible at all.
  // `sanitizeRenderedHtml` runs DOMPurify over every rendered SVG, and
  // DOMPurify ships `foreignobject` in its DEFAULT_FORBID_CONTENTS set: it
  // keeps the <foreignObject> element but deliberately drops its children.
  // With Mermaid's default `htmlLabels: true`, every node rendered as an
  // empty shape. Native <text>/<tspan> passes the sanitizer untouched.
  //
  // Do not "fix" a label problem by weakening the sanitizer — removing
  // `foreignobject` from FORBID_CONTENTS does not restore the children
  // anyway (a namespace check rejects them too).
  //
  // Mermaid 11: the root-level flag takes precedence over the (deprecated)
  // per-diagram `flowchart.htmlLabels` / `class.htmlLabels` / … settings, so
  // this single flag covers every diagram type we can emit.
  htmlLabels: false,
  // `securityLevel` is intentionally left at Mermaid's default ("strict").
  //
  // It used to be "loose", justified by a comment claiming loose was required
  // for the `↺` (and similar) characters in our pseudocode-derived flowcharts.
  // That is not true: rendering the same diagrams under strict and loose
  // produces byte-identical SVG (same viewBox, same `↺` / `≤` / `←` / accented
  // text). The special chars are plain Unicode in SVG text — no HTML involved.
  //
  // Strict is the safer default: Mermaid additionally sanitizes label text
  // itself, so a hostile label in a raw ```mermaid fence is defanged before it
  // ever reaches our sanitizer. Nothing is lost — Mermaid's `click` handlers
  // (the other thing strict disables) never worked here anyway, since the
  // render path re-injects the SVG through `innerHTML`, which drops any
  // listeners Mermaid attached.
  themeVariables: {
    background: "transparent",
    mainBkg: "transparent",
    primaryColor: "transparent",
    secondaryColor: "transparent",
    tertiaryColor: "transparent",
  },
} as const
