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

## Layers and files

`src/styles/index.css` declares the whole cascade once:

```css
@layer vendor, reset, tokens, base, components, utilities, overrides, print;
```

| Layer | Content |
|---|---|
| `vendor` | KaTeX (`@import ... layer(vendor)`; `vite.config.ts` swaps in a woff2-only copy). Monaco and Excalidraw inject their own unlayered CSS, so they still beat layered app rules on their own elements; nothing in the app targets Monaco internals |
| `reset` | `reset.css`: box-sizing, margin, root font size, form controls inherit font |
| `tokens` | `tokens.css` (scales) and `themes.css` (colour per theme) |
| `base` | `fonts.css`, `base.css`: document root, focus ring, selection, scrollbars |
| `components` | one file per component under `components/` |
| `utilities` | `components/icons.css`: `.icon`, `.icon-filled`, `.icon-flip`, `.region-fallback` |
| `overrides` | `overrides.css`: reduced motion and forced colours; wins over every component without `!important` |
| `print` | `print.css`: the one place for hex colours and `!important` besides `themes.css` |

Because the order is fixed by layers, a component never needs `!important` or
a longer selector to beat a base rule. Within `components`, order is source
order, so rules of equal specificity inside one file keep their position.

File layout (`src/styles/`): `index.css`, `reset.css`, `tokens.css`,
`themes.css`, `fonts.css`, `base.css`, `overrides.css`, `print.css`,
`components/<component>.css`. A component is one file; the old numbered
fragments (`preview-2` ... `preview-5`, `tabs-2`, ...) are merged. Shared
chrome files: `shell.css` (window shell: sidebar rail, resizer, breadcrumb,
status bar, panes, focus mode), `menubar.css` (classic menus and sectioned
toolbar), `panels.css` (every sidebar panel anatomy), `modals.css` (modal,
popover, buttons, banners).

## Rules (enforced by `npm run lint:css`)

`.stylelintrc.json` extends `stylelint-config-standard` and adds:

- no hex colour (`color-no-hex`) and no `rgb()`, `hsl()`, `hwb()`, `lab()`,
  `lch()` or named colour in colour-bearing properties, outside `themes.css`
  and `print.css`;
- no `[data-theme]` selector (`selector-disallowed-list`) outside `themes.css`
  and `print.css`: theme differences are tokens, never component rules;
- no `!important` (`declaration-no-important`) outside `print.css`;
- `no-duplicate-selectors`: a selector appears once per file and context;
- `z-index` only as `var(--z-*)`;
- `font-size` only as `var(--text-*)` or a relative unit (`em`, `rem`, `%`),
  never `px` (the 13px root in `reset.css` is the single exemption).

CI runs it next to eslint (`ci.yml`, `release.yml`). Dynamic geometry stays
inline in TSX (a drag position, a progress width, a PDF page size, the user's
preview font size, `--depth` and similar custom properties); everything else is
a class.

## How to add a component

1. Create `components/<name>.css` and add `@import "./components/<name>.css"
   layer(components);` to `index.css` (before `icons.css`).
2. Colours, sizes and motion from the tokens above. Hover, active, selected,
   `:focus-visible` and `:disabled` for every interactive element.
3. Hover transitions: `transition: var(--transition-ui)`.
4. Overlays take `z-index: var(--z-*)`; text takes `var(--text-*)`.
5. Run `npm run lint:css`; fix, do not disable a rule.

## How to add a theme

Add one block to `themes.css` that defines every colour token listed above
(copy the `dark` block) plus the shape tokens that differ: `--focus-offset`,
`--scrollbar-*`, `--pane-divider`, `--drag-mix`. Map the setting to a
`data-theme` value in `App.tsx`, and add the theme to `scripts/check-contrast.mjs`
so the contrast gate covers it. No component file changes.

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
| `--syn-math`, `--syn-ref`, `--syn-cite`, `--syn-label` | editor grammar colours (comdtexLanguage.ts): math body, `@kind:name` references, `[@key]` citations, `{#label}` anchors; each passes 4.5:1 on `--code-bg` and `--bg-surface` |
| `--env-theorem`, `--env-lemma`, `--env-corollary`, `--env-proposition`, `--env-definition`, `--env-example`, `--env-exercise`, `--env-remark`, `--env-proof`, `--env-note` | environment accent; backgrounds come from `color-mix(in oklch, var(--env-x) 8%, transparent)` |
| `--callout-note`, `--callout-tip`, `--callout-info`, `--callout-warning`, `--callout-danger`, `--callout-success`, `--callout-quote` | callout accent, same mixing rule |
| `--viz-1` … `--viz-8` | categorical colours for graph, plots, Mermaid |
| `--mark-yellow`, `--mark-green`, `--mark-blue`, `--mark-purple`, `--mark-orange`, `--mark-red`, `--mark-pink` | highlight backgrounds |
| `--selection` | `::selection` background |
| `--focus-offset`, `--pane-divider`, `--drag-mix` | focus ring offset, divider between editor and preview, tint of the drop overlay |
| `--scrollbar-size`, `--scrollbar-radius`, `--scrollbar-thumb`, `--scrollbar-thumb-hover`, `--scrollbar-track`, `--scrollbar-edge` | scrollbars (the high contrast theme is square and uses `--fg` for the thumb) |

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
| `--transition-ui` | `color`, `background-color` and `border-color` at `--dur-fast`: the one hover transition |
| `--z-sticky` `--z-dropdown` `--z-popover` `--z-modal` `--z-toast` `--z-tooltip` | 10, 1000, 1100, 1500, 2000, 2100 |
