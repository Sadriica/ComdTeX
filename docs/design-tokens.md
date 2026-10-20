# Design tokens

The contract every stylesheet in `src/styles/` follows. Values live in
`src/styles/tokens.css` (theme-independent scales) and `src/styles/themes.css`
(colour, one block per theme). Components reference these names only: no hex,
rgb or named colours outside `themes.css`, and no `[data-theme]` selectors
outside it.

Visual direction: the "slate and chalk" identity of comdtex.witara.site
(dark: slate `#171a19`, chalk `#e9e6dc`, ink `#d3d2c9`, blue `#89b0bf`,
amber `#d3bd72`). Light is cream paper with slate ink. High contrast is
black, white and yellow. Colours are written in `oklch()`.

Runtime floor: WebKitGTK 2.46 (Safari 18 level). Safe: oklch, color-mix,
@layer, :has, container queries, nesting, @property, popover, light-dark,
@starting-style, subgrid, content-visibility, text-wrap: balance. Progressive
only: view transitions, text-wrap: pretty. Avoid: anchor positioning,
scroll-driven animations, interpolate-size, field-sizing.

## Colour (per theme)

| Token | Use |
|---|---|
| `--bg-app` | window background, editor gutter area |
| `--bg-surface` | panels, sidebar, preview pane |
| `--bg-raised` | menus, popovers, modals, cards |
| `--bg-sunken` | inputs, code blocks, wells |
| `--bg-hover` | hover row or button |
| `--bg-active` | pressed or open state |
| `--bg-selected` | selected row (tree, list) |
| `--chrome-bg`, `--chrome-fg` | titlebar, menu bar, toolbar, tab strip |
| `--status-bg`, `--status-fg` | status bar |
| `--fg` | primary text |
| `--fg-muted` | secondary text, at least 4.5:1 on every bg above |
| `--fg-subtle` | placeholders, disabled (decorative only) |
| `--border` | hairlines and dividers |
| `--border-strong` | input and control boundaries, at least 3:1 |
| `--accent`, `--accent-fg`, `--accent-soft` | primary action, text on accent, tinted accent background |
| `--link` | links in UI and preview |
| `--focus-ring` | `:focus-visible` outline |
| `--danger`, `--warn`, `--ok`, `--info` | status foreground; each also has `-bg` and `-border` |
| `--overlay` | modal backdrop |
| `--code-bg`, `--code-fg` | code blocks and inline code |
| `--syn-keyword`, `--syn-string`, `--syn-number`, `--syn-comment`, `--syn-function`, `--syn-type`, `--syn-punct` | syntax colours in the preview |
| `--env-theorem`, `--env-lemma`, `--env-corollary`, `--env-proposition`, `--env-definition`, `--env-example`, `--env-exercise`, `--env-remark`, `--env-proof`, `--env-note` | environment accent; backgrounds come from `color-mix(in oklch, var(--env-x) 8%, transparent)` |
| `--callout-note`, `--callout-tip`, `--callout-info`, `--callout-warning`, `--callout-danger`, `--callout-success`, `--callout-quote` | callout accent, same mixing rule |
| `--viz-1` … `--viz-8` | categorical colours for graph, plots, Mermaid |
| `--mark-yellow`, `--mark-green`, `--mark-blue`, `--mark-purple`, `--mark-orange`, `--mark-red`, `--mark-pink` | highlight backgrounds |
| `--selection` | `::selection` background |

## Type

| Token | Value |
|---|---|
| `--font-ui` | system sans stack |
| `--font-mono` | `"JetBrains Mono Variable", ui-monospace, ...` (bundled) |
| `--font-doc` | `"Libertinus Serif", ...` (bundled); the sans document style swaps it |
| `--font-display` | `"Fraunces Variable", ...` (bundled; brand and welcome only) |
| `--text-xs` `--text-sm` `--text-md` `--text-lg` `--text-xl` `--text-2xl` | 11, 12, 13, 15, 18, 22 px, expressed in rem from a 13px UI root so chrome scales with zoom |
| `--leading-tight` `--leading-normal` `--leading-doc` | 1.25, 1.45, 1.6 |

## Space, shape, depth, motion, layers

| Token | Value |
|---|---|
| `--space-1` … `--space-8` | 2, 4, 6, 8, 12, 16, 24, 32 px |
| `--radius-sm` `--radius-md` `--radius-lg` `--radius-pill` | 4, 6, 10, 999 px |
| `--shadow-1` `--shadow-2` `--shadow-3` | resting, popover, modal (theme-aware alpha) |
| `--dur-fast` `--dur-med` `--dur-slow` | 100, 160, 240 ms (0 under reduced motion) |
| `--ease-standard` | `cubic-bezier(.2, .8, .2, 1)` |
| `--z-sticky` `--z-dropdown` `--z-popover` `--z-modal` `--z-toast` `--z-tooltip` | 10, 1000, 1100, 1500, 2000, 2100 |
