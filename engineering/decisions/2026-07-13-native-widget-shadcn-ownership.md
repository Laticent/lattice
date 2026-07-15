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

Existing `ui/` primitives: badge, breadcrumb, button, card, checkbox, collapsible,
command, dialog, dropdown-menu, input, kbd, pill-tabs, popover, radio-group,
scroll-area, select, separator, sheet, slider, sonner, split, switch, table, tabs,
textarea, toggle-group, tooltip.

**Excluded — FROZEN** (`2026-07-03-studio-succession.md`): the **Drawing Board**
(`pages/drawing-board.astro`, `docs/src/playground/*`, `drawing-board.css`) and
the **Workbench** (`components/workbench/WorkbenchApp.tsx`, `workbench.css`). No
migration work on either — their native selects/drawers/tab-strips stay.

### A. Adopt an existing primitive (surviving surfaces)

| Current control | Where | → shadcn |
|---|---|---|
| Native `<select>` | `studio/SlideContext.tsx:156`, `studio/Fabricate.tsx:795`, `studio/WorkspaceSheet.tsx:582`, `pages/cadenza.astro:140` | `ui/select` |
| `<input type=range>` | `model/ConceptWalkthrough.astro:63`, `model/ConceptGraph.astro:39` | `ui/slider` (needs a React island; pages are vanilla) |
| ~~Hand-rolled model pickers~~ **WON'T DO** | `studio/ModelPicker.tsx`, `studio/TtsModelPicker.tsx` | **Keep inline — NOT a `popover`+`command` target.** They live inside the modal Workspace `Sheet`; a portaled Popover there inherits the dialog's `pointer-events:none` and dies to touch on real iOS Safari. The inline expand-in-place accordion is the iOS-safe form the `2026-07-13-tts-picker-ia.md` §"iOS fix" ADR mandates. See the batch note below. |
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
| `ui/tooltip.tsx` ✅ *(built 2026-07-14)* | native `title=` hints on icon controls | StudioShell + NavActions migrated; other live surfaces are fast-follow |
| `ui/separator.tsx` ✅ *(built 2026-07-14)* | hand-rolled `bg-border` rule `<span>`s | StudioShell's 6 toolbar dividers migrated |
| `ui/kbd.tsx` ✅ *(built 2026-07-14)* | copy-pasted `⌘K` chip spans | StudioShell (3) + NavActions (1) migrated |

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

## Batch outcome — 2026-07-14 (steps 4–5 revisited against the real code)

A follow-up batch took on steps 4–5. Step 4 landed in full; steps 2/5's
remaining items, on inspection, turned out to be traps — migrating them would
*regress* behaviour, so they are deliberately NOT done. Recorded here so the
catalog doesn't rot and nobody re-attempts a bad migration.

### Done (verified on the real Studio, adversarial-trio hardened)
- **`ui/checkbox`** — Radix Checkbox → FinishStudio's two native checkboxes
  (row-label click preserved via `htmlFor`/`id`; closed by `FinishStudio.test.tsx`).
- **`ui/radio-group`** — Radix RadioGroup, a REAL `role="radiogroup"`
  (pick-exactly-one). Consumers: SlideContext `Seg` (segmented; the trio caught
  that `ToggleGroup`'s root is `role="group"` — a silent a11y downgrade for a
  segmented control, so exactly-one controls use RadioGroup), **PrintOptionsPanel**
  (paper/orientation/layout/color), **ExportOptionsPanel** (comment scope). The
  last two were a gap in this doc's original catalog — now closed.
- **`ui/toggle-group`** — Radix ToggleGroup (zero-or-one) → SlideContext `ChipRow`
  (state / tone / tint / mark chips; clear-on-tap).

### Deferred, with reason (NOT to be force-migrated)
- **Model pickers → `popover`+`command`** — **WON'T DO (corrected 2026-07-14).**
  Originally deferred as OpenRouter-gated/unverifiable; when a key later let us
  drive it, an attempt was made — and reverted, because it's a **documented iOS
  regression**, not just an unverified one. The pickers live inside the modal
  Workspace `Sheet`; a Radix `Popover` there portals onto the dialog's
  `pointer-events:none` layer, which real iOS Safari enforces against touch — the
  search + rows go dead to tap. `2026-07-13-tts-picker-ia.md` §"iOS fix" already
  hit this exact bug (one day earlier) and dropped the Popover for an inline
  panel; the model pickers were never broken *precisely because* they stayed
  inline. So the inline accordion IS the final, correct form — `popover`+`command`
  is an anti-pattern for this surface. (Caught by an independent checker citing the
  ADR; the desktop/jsdom gates can't see it — the HARD RULE #23 gap the ADR names.)
- **Tab strips → `pill-tabs`** — most flagged `role="tablist"` strips are the
  WRONG primitive for pill-tabs: `RestyleShowcase` is a row of color-swatch dots;
  `WorkspaceSheet`'s tier switch is a full-width segmented switch (pills would
  regress it); `Specimen.astro` is vanilla (island). Forcing them makes it worse.
- **Range → `ui/slider`** (`ConceptWalkthrough`/`ConceptGraph`) — the range is one
  input inside a bespoke vanilla 3D animation loop; a React `ui/slider` means
  rewriting the whole interaction (or an awkward partial island) at real risk of
  breaking it, for only cosmetic consistency (native range is already
  `accent-color`-styled).
- **`SiteHeader` `<details>`-menu → `dropdown-menu`** — the `<details>` is a
  DELIBERATE no-JS/crawlable disclosure (real `<a href>` links, SSR). A Radix
  dropdown needs an island and breaks the no-JS fallback — a regression. Correct
  as-is; the earlier "(no-JS preserved)" caveat is unachievable with Radix.
- **`cadenza.astro` `<select>`** — vanilla SSR page; island rewrite, marginal
  value, deferred.
- **`PaletteControls`/`NavActions`** — verified NOT a gap: `PaletteControls`
  already uses `ui/select`; `NavActions` only embeds it.

### The sharpened rule
A migration only ships when it (a) reaches for the RIGHT primitive (a segmented
pick-one is `radio-group`, a zero-or-one chip set is `toggle-group`, a swatch row
is neither), (b) does NOT regress an intentional SSR/no-JS/crawlable surface, and
(c) can be verified on the real surface. "Migrate everything native" is not the
goal; "share the right component where it's a genuine, verifiable improvement" is.

## Batch outcome — 2026-07-14 (b): tooltip + separator + kbd

The three §B gaps that were NOT composite controls — a hint, a rule, a keycap —
built and adopted. All verified on the real Studio (puppeteer-driven, both colour
modes): tooltips fire with a themed `bg-popover` surface that flips light↔dark,
Kbd renders the `⌘K` chip, and the six Separators render at the right thickness
with `--border` colour.

### Shipped
- **`ui/tooltip`** (Radix Tooltip) + a project `Tip` convenience wrapper (one-line
  `<Tip label="…">{control}</Tip>` in place of a four-node Tooltip tree). Neutral
  popover-language surface (no loud accent fill); self-provides its `Provider` so a
  caller needs no root wiring. Migrated **StudioShell** — every native `title=` in
  the file: the ~24 toolbar icon/text controls, the two dark/light mode toggles,
  and the shared `PaneBtn`/`BarIcon`/`RailOp` helper buttons (so no native tip
  survives *inside* a migrated cluster) — plus **NavActions** (feedback). Only the
  `ArchCard title=` *prop* (not a hover hint) remains. Redundant `title=` dropped;
  `aria-label` kept as the
  accessible NAME (the tooltip is only the `aria-describedby` DESCRIPTION — two
  buttons that had NO `aria-label` gained one so they aren't nameless when their
  visible text is width-hidden).
- **`ui/separator`** (Radix Separator) — deliberately sets only THICKNESS + colour,
  leaving LENGTH to the caller/flex parent (shadcn's `w-full`/`h-full` default
  Tailwind-clashes with our explicitly-sized rules). Migrated StudioShell's 6
  toolbar dividers.
- **`ui/kbd`** — a styled semantic `<kbd>` (+ `KbdGroup`), not a Radix primitive.
  Migrated the 3 StudioShell `⌘K` spans + NavActions.

### Footgun found & fixed (blast-radius note)
Wrapping a control that is ALSO a Radix `*Trigger asChild` child (the **Refine**
and **Show me** dropdown openers) in `Tip` breaks the `asChild` ref chain — `Tip`
renders a Provider/Root, not a DOM node, so the outer trigger loses its anchor.
The `studio.refine.test.tsx` suite caught Refine. Fix is the canonical nested
composition: `<Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild>
<Button/>…`. **Rule: `Tip` is for plain (`onClick`) controls only; a control that
is itself a Radix trigger needs the explicit nested triggers.**

*Accepted tradeoff:* a Radix `TooltipTrigger` on a `disabled` control receives no
pointer events, so a disabled button (e.g. `Fix all` at rest, `Refine` mid-run)
no longer shows its hint on hover — native `title` did. Minor discoverability
loss at exactly the "why is this greyed out?" moment; accepted as the cost of the
themed surface (independent-checker call).

### Scope / fast-follow
Migrated only the surfaces driven in verification (StudioShell + NavActions).
Other live surfaces still on native `title=` — Fabricate, PresentOverlay,
SlideContext, and a few more — are a documented fast-follow (native `title` stays
accessible meanwhile). The OpenRouter-gated model pickers are excluded (see the
2026-07-14 (c) correction — they must stay inline). Frozen surfaces untouched.
**Landed 2026-07-14 (d) — see below.**

## Batch outcome — 2026-07-14 (d): tooltip fast-follow sweep

Swept the remaining genuine native-`title=` **interactive** controls onto `Tip`
across **Fabricate, PresentOverlay, SlideContext, Library, SlideComments,
TtsSettings** (~13 controls). Key lesson from scoping: the raw `title=` grep count
badly over-reports — most hits are **component props**, not native hover hints:
`ShareSheet` (`<Row title=…>`), `WorkspaceSheet` (`<GovRow title=…>`),
`CommandPalette`/`InsertComponent` (`<CommandDialog title=…>`), plus a11y
attributes (`<iframe title>`, `<img title>`) and decorative/non-focusable `<span
title>` labels — all correctly skipped. So those three "fast-follow" surfaces named
above had **zero** genuine tooltips.

- Plain `<button>`/`<Button>` controls with an `onClick` → `<Tip label=…>` (drop
  `title`, keep `aria-label`). The `PresentOverlay` "Slides" button gained
  `aria-label="Slides"` (its visible text is width-hidden; matches the e2e name).
  A `.map()`-keyed control (Fabricate's theme-start button) moves its `key` to the
  `Tip`.
- **Verified:** PresentOverlay driven on the real Studio — the Slides tooltip fires
  AND the button still opens the slide sorter. The rest are the identical proven
  wrapper (#985) on plain buttons; `Tip` adds no DOM, so no structural change.

**Deferred — reference-doc-ui's attach button.** It's a `PopoverTrigger asChild`
child, so it needs the nested `<Tooltip><TooltipTrigger asChild><PopoverTrigger
asChild>` composition (not `Tip`). That composition is the proven #985 Refine/Show-me
pattern, BUT the button sits deep in the architect-chat composer and couldn't be
driven from this sandbox to confirm the Popover still opens — so per HARD RULE #23
it stays on native `title` (it already has an `aria-label`) rather than ship an
unverified structural change to a working popover.

## Batch outcome — 2026-07-14 (e): toasts → Sonner (`ui/sonner`)

The highest-value NEW primitive: `ui/sonner` (adds the `sonner` package) retires
TWO hand-rolled toast state machines — StudioShell (a `role="status"` message pill
+ a separate bottom-left Undo pill) and PlaygroundApp (a `.pg-toast` message with
Undo / Reload actions) — for one Sonner surface (HARD RULE #15). `toast()` is now
callable from anywhere; each app mounts one `<Toaster>`.

- **Themed** to the established look — the dark `--surface-inverse` pill, white
  text, in both colour modes — via the CSS vars Sonner reads (`--normal-bg/text/
  border`); `lx-ui` carries the token reset into Sonner's document-root portal.
- **Message toasts** (StudioShell's `notify`, used everywhere by prop-drill) → a
  one-line `toast(msg, {duration})`.
- **Action toasts** map to Sonner's `action`: StudioShell's **Undo** (the reactive
  prev/next dismiss logic stays app-side — the effect calls `toast.dismiss(id)`
  when the source moves; the action closes over that write's prev/next and reverts
  only if nothing changed since); PlaygroundApp's **Undo** (via a ref, since the
  handler is defined after `showToast`) and **Reload**.
- **Verified** on the real Studio: message + Undo action toasts fire, Undo reverts
  and dismisses, `pointer-events:auto` on desktop (the inspector is docked, not a
  modal). Playground's `<Toaster>` confirmed mounted (its undo/reload paths are
  unit-tested + use the identical mechanism; not driven live from here).

**Position note:** the Undo toast moved bottom-left → bottom-center (Sonner's
default stack). The old bottom-left was a hand-rolled workaround to clear the right
panel; a centered transient toast-with-Undo is the conventional pattern and reads
cleanly. **Modal note:** Sonner toasts are body-level exactly like the retired
pills, so they behave identically over a modal Sheet — no NEW `pointer-events`
regression (unlike an interactive Popover, which is why the model pickers stayed
inline; a toast is read, its action optional).

## Batch outcome — 2026-07-15 (f): last hand-rolled switch → `ui/switch`

A consistency sweep for `role="switch"` turned up exactly one holdout still
hand-rolled after the `ui/switch` primitive was already in use at 15 sites: the
**Workspace → General → Diagnostics → "Viz diagnostics"** toggle
(`WorkspaceSheet.tsx`), a `<button role="switch">` with a manual track + thumb
`<span>`. It sat *directly between* the Performance-overlay and Read-aloud-diagnostics
toggles, which already used `<Switch>` — so the three near-identical controls in one
group were two shared + one bespoke, and the bespoke one missed the Radix
focus-visible ring and consistent disabled semantics (HARD RULE #15 + #18).

Swapped to `<Switch id="ws-viz-overlay" checked … onCheckedChange … />`, mirroring
its two siblings verbatim (`htmlFor`/`id` pairing, `onCheckedChange` replacing the
manual `!vizOverlay` flip). **Verified** on the real Studio (puppeteer): the toggle
renders as the Radix Switch (`role="switch"` on a `<button>` with `data-state`
transitioning `unchecked → checked` — the primitive's signature, absent on the old
hand-rolled node), clicking flips `aria-checked`, `pointer-events:auto` inside the
sheet, and it's visually identical to the two switches above it. Closes the
switch-consistency gap; the native-widget → shadcn thread has no remaining holdouts.

**Follow-up fix (same batch):** driving the migrated switches on the real Studio to answer a
"the knob looks centered / bleeds" report exposed a **pre-existing bug in `ui/switch` itself**,
not the migration: the Radix `<button>` Root kept the UA default ~6px horizontal button padding
(the `.lx-ui` reset never zeroed it), so the 18px thumb traveled inside a 26px content box, not
the 38px track — off it rested ~8px from the left (looked centered), on it ran 4px past the right
cap. Measured both states on the real surface (off 8px-left/12px-right, on 24px-left/−4px-right).
Fix: `p-0` on the Root. Re-measured: off 2/18, on 18/2 — flush both ends, matching the reference.
One shared primitive, so all 15+ switch sites are corrected at once.
