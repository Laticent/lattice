---
status: in-progress
summary: Widget styling splits into TWO layers that don't compete. Layer 1 — global/UA surfaces (the document scrollbar, color-scheme, ::selection, caret, ::placeholder, the focus ring on un-wrapped prose, the mobile tap flash, ::target-text) — is owned by docs/src/styles/native-widgets.css because no React component can mount on a document-root property or a UA pseudo-element; it is also the FOUNDATION shadcn sits on (color-scheme + root accent-color are prerequisites for shadcn to render right in dark mode). Layer 2 — composite interactive controls (select, dialog, slider, switch, tabs…) — is shadcn's job, themed through the @theme inline bridge in tailwind.css (--color-primary → var(--accent), etc.), and we have DRIFTED: we own ui/select.tsx yet still ship native <select> in several surviving surfaces, plus six hand-rolled role="switch" toggles that duplicate a missing ui/switch.tsx. This note carries the full native/hand-rolled → shadcn catalog, the standing rule (no NEW native composite control; reach for ui/*; theme by extending the bridge, not per-widget CSS), the four missing primitives to build (switch, checkbox, radio-group, toggle-group), and the phased migration plan. Frozen surfaces (Drawing Board, Workbench) are excluded per 2026-07-03-studio-succession.md.
---

# Native-widget ownership — two layers, and mapping what we roll our own onto shadcn (2026-07-13)

> Status: **in-progress.** The two-layer principle and the catalog are settled;
> Layer 1 (native-widgets.css) shipped in PR #962. Layer 2 migration starts from
> this note. Born from a "shouldn't shadcn own this?" question during the
> native-widgets work; grounded by a two-part audit of the real docs tree.

## The question

While making native browser widgets theme-mode-aware (scrollbars, form controls,
selection — PR #962), the reasonable challenge came up: *shouldn't shadcn own
this? We should use shadcn components instead of rolling our own — and modify the
shadcn theme — rather than styling native widgets ourselves.*

The answer is **both are true, because they're two different layers**, and
conflating them would either (a) leave the document/prose unstyled, or (b) keep
re-rolling controls shadcn already gives us.

## The two layers

### Layer 1 — global / UA surfaces → `docs/src/styles/native-widgets.css`

Browser-drawn surfaces that **no component can own**, because they apply to the
document root, to markdown/prose the site never wraps in a component, or they are
UA pseudo-elements with no DOM node to mount React on:

- the **document / window scrollbar** + `color-scheme` (root);
- `::selection`, `caret-color`, `::placeholder`, `::target-text`;
- `-webkit-tap-highlight-color` (mobile tap flash);
- the `:focus-visible` ring on **un-wrapped** focusables (prose links, markdown,
  `summary`, native inputs) — written `:where(...)` at ~zero specificity so a
  component's own focus ring always wins.

There is no `<Selection>` or `<Scrollbar>` primitive. In-component scrolling is a
real exception — Radix `ui/scroll-area.tsx` owns overflow *inside* an island —
but the page scrollbar and every pseudo-element above are irreducibly CSS.

**Layer 1 is the FOUNDATION shadcn sits on, not a competitor.** `color-scheme`
(emitted per palette/mode in `lattice-tokens.generated.css`) and root
`accent-color` are what let native-backed pieces render correctly in dark mode. A
shadcn control built on a native `<input>`/`<select>` inherits the root scheme;
without Layer 1 setting it, those surfaces render light-on-dark. So the shadcn
bridge is *stacked on top of* Layer 1.

### Layer 2 — composite interactive controls → shadcn (`docs/src/components/ui/`)

Select, dialog, popover, dropdown-menu, slider, tabs, command, sheet, switch,
checkbox… — authored DOM we fully control. **These are shadcn's job**, themed
through the token bridge in `docs/src/styles/tailwind.css`
(`2026-06-09-shadcn-migration.md`), NOT by hand-styling native controls.

**How the theme bridge works (the "one place to theme all shadcn").** A single
`@theme inline { … }` block aliases shadcn's semantic color tokens onto the live
Lattice palette tokens on `<html>`:

- `--color-primary → var(--accent)`, `--color-primary-foreground → var(--on-accent)`
  (brand lives on `primary`, not shadcn's `accent`);
- `--color-background/foreground → var(--bg)/var(--text-body)`;
- `--color-card/popover → var(--bg-alt)/var(--bg)`;
- `--color-border/input → var(--border)`, `--color-ring → var(--accent)`;
- `--color-chart-1..5 → var(--chart-cat1..5)`.

Because it's `inline`, a palette/mode switch on `<html>` re-resolves every token
with zero JS. Two deliberate escapes are computed on `:root` (not aliased):
`--lx-ui-accent` = `color-mix(in oklab, var(--bg-alt), var(--accent) 14%)` (the
hover/active surface — a direct alias would be invisible on dark palettes) and
`--lx-ui-destructive` (a hand-picked, WCAG-checked red ramp; `themes/` has no
destructive token because danger is hue-universal). A **new** component that uses
existing semantic tokens themes automatically; one needing a new color adds one
alias line to `@theme inline` (or an `--lx-ui-*` helper first if palette-blind).

**Gotchas** (from the audit): Preflight is deliberately OFF (a guard test
enforces it); the scoped `.lx-ui` reset replaces it per island; Tailwind
utilities are layered and the site's bespoke CSS is unlayered (so unlayered
wins — a migrated surface must delete its old bespoke CSS in the same change);
card/popover foreground maps to *body* text, so titles must opt into
`--text-heading`; `tools/check-shadcn-bridge-contrast.js` validates the pairs.

## The catalog — what we roll our own → shadcn

Existing `ui/` primitives: badge, breadcrumb, button, card, collapsible, command,
dialog, dropdown-menu, input, pill-tabs, popover, scroll-area, select, sheet,
slider, split, table, tabs, textarea.

**Excluded — FROZEN** (`2026-07-03-studio-succession.md`): the **Drawing Board**
(`pages/drawing-board.astro`, `docs/src/playground/*`, `drawing-board.css`) and
the **Workbench** (`components/workbench/WorkbenchApp.tsx`, `workbench.css`). No
migration work on either — their native selects/drawers/tab-strips stay.

### A. Adopt an existing primitive (surviving surfaces)

| Current control | Where | → shadcn |
|---|---|---|
| Native `<select>` | `studio/SlideContext.tsx:156`, `studio/Fabricate.tsx:795`, `studio/WorkspaceSheet.tsx:582`, `pages/cadenza.astro:140` | `ui/select` |
| `<input type=range>` | `model/ConceptWalkthrough.astro:63`, `model/ConceptGraph.astro:39` | `ui/slider` (needs a React island; pages are vanilla) |
| Hand-rolled model pickers | `studio/ModelPicker.tsx`, `studio/TtsModelPicker.tsx` | `ui/popover` + `ui/command` (mirror shipped `ComponentPicker.tsx`) |
| `role="tablist"` strips | `studio/WorkspaceSheet.tsx:499`, `studio/ModelPicker.tsx:96`, `studio/TtsModelPicker.tsx:85`, `playground/PlaygroundApp.tsx:1092`, `Specimen.astro:44`, `landing/RestyleShowcase.tsx:153` | `ui/pill-tabs` |
| `<details>`-as-menu | `site/SiteHeader.astro:58` | `ui/dropdown-menu` (**preserve the no-JS/crawlable fallback**) |
| `<details>` disclosures | `pages/cadenza.astro:146,159,164` | `ui/collapsible` |
| `role="dialog"` overlays | `studio/SlideOverview.tsx:56`, `studio/PresentOverlay.tsx:546` | `ui/dialog` (review — some may be intentional fullscreen) |

### B. Build a missing primitive first (GAPS — no `ui/` file exists)

| New primitive | Absorbs | Sites |
|---|---|---|
| `ui/switch.tsx` | hand-rolled `role="switch"` toggles | `studio/StudioShell.tsx:2482`, `studio/SlideContext.tsx:94`, `studio/WorkspaceSheet.tsx:470,683`, `studio/WebpageOptionsPanel.tsx:103`, `studio/ExportOptionsPanel.tsx:65` |
| `ui/checkbox.tsx` | native checkboxes | `studio/FinishStudio.tsx:427,437` |
| `ui/radio-group.tsx` | native radios / picker rows | `studio/ModelPicker.tsx:134`, `studio/TtsModelPicker.tsx:124` |
| `ui/toggle-group.tsx` | segmented / chip radiogroups | `studio/SlideContext.tsx:100,124` |
| `ui/tooltip.tsx` *(optional, low pri)* | native `title=` hints (~17 files) | native `title` is acceptable; only if we want styled tips |

## The standing rule

1. **No NEW native composite control.** A new `<select>`, checkbox, radio, tab
   strip, dropdown menu, modal, toggle, or combobox reaches for the `ui/*`
   primitive. If the primitive is missing (§B), build it in `ui/` first.
2. **Theme by extending the bridge, not per-widget CSS.** Colors come from the
   `@theme inline` map in `tailwind.css` → Lattice palette tokens. Don't
   hand-tint a shadcn component.
3. **Layer 1 stays in `native-widgets.css`** — it is not "rolling our own"; it's
   the document/UA foundation shadcn depends on.
4. **Frozen surfaces are exempt** — no migration on Drawing Board / Workbench.

## Phased plan

1. **This note** — principle + catalog + rule. ✅
2. **`ui/switch.tsx`** + migrate the six `role="switch"` toggles (highest
   duplication payoff, one surviving surface family).
3. **Native `<select>` → `ui/select`** on the four surviving call sites.
4. **`ui/checkbox.tsx`, `ui/radio-group.tsx`, `ui/toggle-group.tsx`** + their
   call sites.
5. **Pickers → `popover`+`command`**; **tab strips → `pill-tabs`**;
   **`SiteHeader` `<details>`-menu → `dropdown-menu`** (no-JS preserved).

Each step is its own branch/PR (HARD RULE #17), verified on the real surface it
touches (HARD RULE #23) — build the docs, drive the actual Studio/Playground
control, not a harness.
