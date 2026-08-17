# Gotchas — CI (GitHub Actions / code scanning)

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## The `CodeQL` check reports a verdict BEFORE its `Analyze` jobs finish

- **Symptom:** A push lands, the `CodeQL` check goes red within seconds naming a
  security alert, and the alert points at code that does not exist — a line
  number landing on test data, or on a construct you already removed. You "fix"
  it, push, and the same red check reappears against the new head.
- **Cause:** `CodeQL` is an aggregate check run, not a job. It is posted early
  and summarizes the alerts *known at that moment*, which on a fresh push are the
  ones uploaded by the PREVIOUS commit's analysis. The jobs that actually
  recompute them — `Analyze (javascript-typescript)` and friends — are still
  running, and finish a minute or two later. Observed on #1427: the `CodeQL`
  check started 11:18:27 and concluded `failure` at 11:18:30, while the two
  JavaScript analyses ran until 11:19:34 and 11:19:45. The check was never
  refreshed afterwards.
- **How to tell:** compare `completed_at` on the `CodeQL` check against
  `completed_at` on the `Analyze (…)` jobs. If the check finished first, its
  verdict predates the evidence. A three-second `CodeQL` check is always stale.
- **Fix:** wait for every `Analyze` job to complete before reading the check, and
  before changing anything read the annotation's file at the reported line. A
  successful `Analyze` run with no matching code in the diff means the alert is
  from the previous head. `rerun_workflow_run` will NOT help — a run whose jobs
  all succeeded cannot be retried, so the only way to refresh the aggregate is a
  new commit.
- **Cost of not knowing this:** four force-push rounds on #1427, three of them
  chasing an alert that had already been fixed. The general rule it belongs to is
  the same one the two-pass bench gate encodes: **a check-run conclusion is not
  evidence until its inputs have completed.**
- **Triggered by:** #1427.

## The editor|preview divider snaps to the middle a moment after the page loads

- **Symptom:** you drag the Studio's divider, reload, and the divider appears where
  you left it — then jumps to roughly the middle, then jumps back. Reads as the
  pre-paint placeholder not knowing where the splitter was.
- **Why (and why the obvious reading is wrong):** the placeholder knows exactly. It
  reads the persisted split in `studio.astro`'s pre-paint seed and draws it correctly.
  It is the APP that was late. `StudioShell` rendered its panels at a hardcoded
  46/54, and `useResizableSplit` applied the saved layout in an effect deferred by a
  double `requestAnimationFrame` — frames that queue behind the ~505KB engine fetch.
  Measured at 1440x900 with the split at editor 25%: the shell had the divider at
  360.75px from t=320ms, the app mounted at 662/777 at t=1467ms, the shell was
  dismissed at t=2896ms, and the saved layout landed at t=3317ms. So the corrected
  paint arrived ~400ms AFTER the correct placeholder was taken away.
- **Fix (shipped):** the saved layout is read during the first render and handed to
  `react-resizable-panels` as the group's `defaultLayout`, so it initializes at the
  remembered widths and the default share is never laid out. The consumer declares its
  `clientOnlyPanelIds` because the only runtime source of the real ids — the mounted
  group — is one mount too late. Pinned by the `@smoke` case in
  `docs/e2e/studio-instant-shell.spec.ts` that asserts the pane's whole width log is
  one entry.
- **Do NOT copy that seed to a splitter on a page that server-renders.**
  `getPanelStyles` reads `defaultLayout` during RENDER, so on a hydrated island it is a
  style mismatch React 19 refuses to patch ("this won't be patched up"): the DOM keeps
  the server's `flex-basis` forever and the pane stops measuring the share it reports.
  The give-away is `aria-valuenow` staying right while the pixels go wrong. The
  Playground (`client:load`) therefore restores post-mount and only the Studio
  (`client:only`) is seeded.
- **The Playground's version of the same disease, and its different cure:** that
  island server-renders, so before hydration its panes carry no `flex-grow` and an
  inline `flex-basis:45` — unitless, therefore invalid, therefore dropped. The panes
  size to CONTENT and leave the row empty (measured: 123px + 300px = 29% of the row,
  for ~1s on a reload). Because the inline value is invalid and the inline grow is
  absent, a STYLESHEET can own that window — which is what the 2026-07-19 migration
  note wrongly assumed was impossible when it retired the old CSS-var seed. The seed
  is back (`playground.astro` + the `--pg-split-a/b` rules in `playground.css`), and
  that, not `defaultLayout`, is how you give a hydrated splitter a correct first paint.
## The Playground's preview pane is empty for seconds after a reload

- **Symptom:** reload the Playground and the preview half is a blank void until the
  engine finishes loading, then a slide appears. The Studio never does this.
- **Why:** the Playground DOES have a pre-paint snapshot replay (`.pg-ssr-shell`,
  gated on `data-pg-shell="on"`), and it was dead. Its gate compared the cached
  snapshot's `srcHash` against `fp(lattice-docs-pg-source)` — the visitor's DRAFT,
  which is only written once they type in the editor. Anyone who just picks
  components has no draft, so the comparison was the snapshot's real hash against the
  hash of the empty string. Measured: every other clause (`v`, palette, mode, html,
  css) passed and this one failed `96ae8e9b` vs `1505`.
- **How to tell:** watch `document.documentElement.getAttribute('data-pg-shell')`
  across a reload. If it is never `"on"`, the replay was rejected — evaluate the gate's
  clauses one at a time rather than guessing which.
- **The trap that hid it:** every existing test waited for the LIVE filmstrip, which
  arrives either way. A silent pre-paint mechanism needs a test that asserts the
  MECHANISM ran, not that the content eventually appeared.
- **Fix (shipped):** with no draft, the identity of what will render is
  `lattice-docs-pg-inserted-hash` — which the same seed already uses for its `pristine`
  test. Pinned by "a reload replays the cached slide before the engine renders".
- **Triggered by:** #1553.

- **The general rule:** the shell and the app share boot state through the same
  storage, so they agree at rest; they disagree in the FIRST SECOND whenever one
  reads before paint and the other corrects after it. If you add shared boot state,
  make the app read it at render, not in an effect.
- **Triggered by:** `engineering/decisions/2026-08-10-shell-app-boot-state-sharing.md`.

## The Playground's cached slide jumps when the live preview takes over

- **Symptom:** a reload shows a real slide almost immediately (the instant shell doing
  its job), and then, three or four seconds later, that slide shrinks and shifts as the
  engine's filmstrip appears. Nothing is broken afterwards — it just moved.
- **Why:** the two halves each derived their own geometry. The replay centered the slide
  in the preview pane less a 16px padding; the live filmstrip centers it inside a srcdoc
  whose `html,body{padding:18px}` applies to BOTH elements — so the usable width is
  `frameW - 72`, not `- 32` — with `justify-content: safe center` over a FIT-clamped deck
  height. Measured at 1194x834: cached `[354,261,824x464]`, live `[374,290,784x441]`.
- **Do NOT fix it by re-deriving the filmstrip's chain in the replay.** That is a second
  model of a layout the srcdoc's own CSS owns, and it drifts the moment either padding
  changes — the exact failure the Studio shell's six hand-measured constants keep having.
- **Fix (shipped):** the app MEASURES its own live slide when it captures the snapshot and
  stores the rect in the replay box's coordinates (`snap.fit`, plus the box size it was
  measured in, snapshot `v: 2`); the replay places the cached slide exactly there. The
  hand-off is then a cross-fade in place. If the filmstrip's geometry changes, the next
  capture records it and nothing in the replay needs to know.
- **A measurement is valid ONLY for the box it was taken in.** The first draft rescaled the
  stored rect into a differently-sized pane and was measurably 5–18px out, because the
  filmstrip centers at `18 + (boxH-h)/2` — the srcdoc's html padding sits OUTSIDE the box it
  centers in, so a slack ratio cannot reproduce it. The replay now refuses when the pane
  differs from the captured one, and a ResizeObserver withdraws the shell if the pane moves
  underneath it. A blank that never moves beats a slide that jumps.
- **The general rule:** when the pre-paint side needs a number a THIRD party decides, have
  the app measure what happened and publish it — don't mirror the third party's arithmetic.
- **A capture taken with the preview COLLAPSED cannot poison the next load, and it is worth
  knowing why (#1590).** Two independent guards, either of which alone refuses: the box the
  fit is measured against (`.pg-preview-wrap`) sits inside the `.pg-pane-inner` a collapsed
  pane hides, so it is 0x0 — and the preview iframe has no layout under a `display:none`
  ancestor, so the slide inside it is 0x0 too. `captureFirstSectionFromFrame` returns null,
  `savePlaygroundSnapshot` is never reached, and the PREVIOUS good snapshot stays. Driven on
  the real surface (collapse → render → leave-capture → expand → reload): the stored `ts` is
  unchanged and the replay lands on the live slide within 0.05px. If you ever relax
  `measureFit`'s zero-box check, this is what you are removing.
- **Triggered by:** #1563, #1590.

## The Playground's Explore layout arrives a second after the page does

- **Symptom:** open the Playground with nothing saved (or with Explore remembered) and the
  page paints as the two-pane EDITOR — markdown on the left, preview on the right — then
  about a second later the editor pane vanishes, the deck goes full width, the pane labels
  disappear and a walk bar drops in at the bottom.
- **Why:** every one of those is `body[data-view='read']`, and the app set that attribute in
  a mount effect. Before it ran, the CSS saw no attribute and drew the Edit layout.
  Measured at 1194x834, CPU 6x: editor pane 337px at t=487ms and gone at t=1349ms; preview
  856 → 1194 → 1194x619.
- **Fix (shipped):** the pre-paint script resolves the boot view — it already computed the
  same answer to gate the snapshot replay — and publishes `<html data-pg-view>`;
  `playground.css` reads it through `:is(:root[data-pg-view='read'], body[data-view='read'])`
  aliases, and `adoptBootSeed` moves ownership to the app in one step at mount.
- **Both attributes must never be live at once.** They drive the same rules, so a stale seed
  beside a different body value hides OPPOSITE panes on the phone and leaves the surface
  blank. Setting the body attribute and removing the seed is therefore one function, not two
  effects.
- **The walk bar used to arrive late and take its band, and a RESERVE for it was built and
  withdrawn — don't rebuild that.** The only height available to reserve from is the one the
  last session measured (the caption of the slide it ended on) while the band belongs to the
  next boot's FIRST slide: 127px reserved against a 184px bar on an ordinary flow, 71px the
  other way on a stale deep link, and — keyed on the bar's absence with no time bound — a
  permanent dead band whenever the plan fetch 404s.
- **What fixed it instead (#1588): stop reserving a box and just have the box.** In Explore
  the walk bar is CHROME, not walk state, so it is rendered unconditionally — in the SSR'd
  markup, before any plan exists — with only its contents waiting for the network (steppers
  disabled, position empty). Then nothing is allowed to change its height: the row is
  `nowrap`, EVERY item in it except `.next` is rigid, the position holds a fixed slot, and the
  caption box is exactly `--pg-walk-cap-lines` lines whatever it holds. A notice shares that
  line-box rather than adding one.
- **`flex-wrap: nowrap` is not enough on its own, and the near-miss is worth knowing.** It
  stops the ROW wrapping; it does nothing about text wrapping INSIDE a shrinkable item. With
  only `.next` hardened, a long cross-component label squeezed Prev until "‹ Prev" broke onto
  two lines and the bar grew 20.8px — at ≤390px, mid-read, at exactly the moment the bar is
  supposed to be still. A SHORT label does not trip it (the threshold is ≈220px), which is how
  the first verification cleared it.
- **The bar is hidden by DEFAULT and Explore reveals it — not hidden in Edit.** Its visibility
  hangs on the pre-paint seed, and the seed's outer `try` opens with a `localStorage` read, so
  storage denied means no boot view at all. Defaulting to shown put a 93px dead nav in EDIT
  for ~1.5s on that path.
- **If you touch the walk bar, its height is the invariant.** Anything content-shaped you add
  — a second notice line, a wrapping row, an un-clamped caption, a button that can shrink —
  puts the jump back, and the e2e case that catches it is the Explore one in
  `playground-first-paint.spec.ts` (which tracks `previewPane` and `walkBar` again precisely
  because of this). Test it with the LONGEST cross-component label, not the first one you hit.
- **`aria-live` has to arrive WITH its value.** `.pg-walk-pos` is SSR'd empty; a live region
  already in the tree that goes from nothing to "1 / 8" is a change, and assistive tech
  announces it. The attribute is set only once there is a position, so the region reads as
  arriving populated. A pending state has to be pending to AT too.
- **Triggered by:** #1563, #1588.

## The Playground's divider is in one place before hydration and another after

- **Symptom:** reload the Playground on a window narrower than the one you last sized it in
  and the editor|preview divider paints in one place, then jumps a few tens of pixels as the
  island hydrates. Often accompanied by the instant shell simply not appearing.
- **Why:** the saved layout is a pair of PERCENTAGES; the panes' minimums are PIXELS
  (`PG_SPLIT_MIN` — editor 280, preview 320). A share that clears its minimum at the window it
  was saved in can fall below it at a narrower one. The library clamps at hydration; the
  pre-paint seed spent the raw share. Measured: a real drag to a 25% preview at 1920, reloaded
  at 1194, painted **298.3px** and settled at **320px**. The missing shell is downstream — the
  cached slide's rect was measured in a box that changed size, so the box-match gate declined.
- **Fix (shipped, #1589):** the seed emits `min-width` rules into `<head>`, scoped to the
  viewport band where the library actually clamps, and `data-pg-split-seed` gates them.
- **RESTORING IS NOT CLAMPING, and this is the trap.** `react-resizable-panels` resolves an
  under-minimum size in TWO branches (`Z()` in its bundle): a `collapsible` pane restored below
  the MIDPOINT of `collapsedSize` and `minSize` snaps to the rail; only above it does it clamp
  to the minimum. Modeling the clamp alone painted a 320px preview where the app then handed
  off to a 28px rail — 292px wrong, held ~1.3s, WORSE than the defect it fixed. `PG_SPLIT_RAIL`
  and `PG_SPLIT_SNAP_MIDPOINT` exist so the seed can express both branches; below the midpoint
  it emits nothing and the raw share paints. `Z()` is the RESTORE path — a drag goes through
  `le()`'s own half-delta arithmetic, so don't reuse the midpoint to predict a drag. The Studio's `preview-rect.ts` has carried this
  rule since #1553 ("clamping alone painted a 300px preview where the app handed off to a 46px
  rail") — read it before writing a pre-paint side for any splitter here.
- **Do NOT reach for the sessionStorage collapse marker to detect this.** It was tried: the
  marker is per-tab, the sub-minimum SHARE is in `localStorage` and permanent, so a new tab
  takes the clamp branch and breaks. *A guard is only as good as the shortest-lived thing it
  reads.*
- **`!important` is load-bearing there, and setting the style on the element is not the
  shortcut it looks like.** The SSR'd panel wrapper carries `min-width:0` INLINE, so a plain
  stylesheet rule loses. Writing `el.style.minWidth` instead would win the cascade and then
  never be undone: React's prop record would still read `0`, so the library would never write
  over it, and the clamp would outlive the seed for the life of the page.
- **The clamp must die with the seed.** `adoptBootSeed` drops `data-pg-split-seed` alongside
  the view/pane attributes. A surviving `min-width:320px` would stop a collapsed preview from
  ever reaching its 28px rail — the grow vars are safe to leave only because the library's
  inline `flex-grow` outranks them, and `min-width` has no such counterpart.
- **Triggered by:** #1589, from the red-team pass on #1563/#1581.

## A header control shows nothing (or the wrong thing) for a second after every page load

- **Symptom:** the theme `<select>` in the site header is empty on load and fills in with the
  persisted palette a second or more later; the light/dark button shows the Monitor
  ("System") icon at someone who pinned dark, then swaps. Every page of the site.
- **Why (two causes, and the second is the surprising one):** the control read its state in a
  mount effect, so it had nothing to say until the `client:idle` island hydrated — under load
  that was 1.9s to 5.1s. And radix's `SelectValue` with no children renders NOTHING: the
  selected item's text is portaled in by `SelectItemText`, which only exists once a layout
  effect has built the closed content's DocumentFragment. So the trigger was empty in the SSR
  markup no matter what the value was.
- **Fix (shipped, #1592):** both controls are PAINTED FROM `<html>` ATTRIBUTES. PaletteControls
  renders every palette's label and all three mode icons; one CSS rule per palette (and three
  for the stops) shows the one in force. A pre-paint seed in `SiteHeader.astro` publishes
  `data-palette` and `data-mode-pref`, and `PaletteControls` reads them in its first render so
  its own state agrees.
- **The seed sits ABOVE the header markup, and that is the second half of the fix.** A first
  draft patched the trigger's text right AFTER the markup instead. A per-frame sampler caught
  the un-seeded state about one run in three ("Indaco"/System at t=114ms, corrected at
  t=177ms): a script that has to beat the first paint of markup it sits below is a race.
  Setting an attribute the markup has not been parsed against yet is not.
- **The per-palette rules are injected by that script, not shipped as a `<style>` in the
  component.** A `<style set:html>` in an `.astro` file is not bundled into the head — Astro
  emits it at the END of the body, i.e. after the header it styles, which reopens the same
  window (measured: no label at all from t≈165ms to t≈365ms). Appending the sheet to `<head>`
  from a script that runs before the header is parsed does not have that problem.
- **`data-mode` cannot stand in for `data-mode-pref`.** System-resolved-dark and pinned-dark
  are the same resolved mode and a different STOP, and the icon names the stop.
- **The mode icon is three icons with CSS picking one, and that is not decoration.** The
  server cannot know the stop, so React choosing would put Monitor in the HTML and Moon in
  the client's first render — a hydration mismatch React 19 does not patch. Rendering the
  same three on both sides moves the choice to an attribute the seed has already written.
- **A seed that NORMALIZES a bad stored value must also CLEAR it.** The first version rewrote
  `<html data-palette>` to a shipped palette and left the key alone; `syncFromStorage` re-reads
  the key at mount with no validation and stamped it straight back, so the page painted the
  fallback and then flipped to a theme whose CSS 404s — a flash the seed itself introduced.
  `playground.astro` has always removed the key; the site-wide surfaces had nothing that did.
- **Making one control truthful can make the one beside it a liar.** The command palette sets the
  palette directly and `storage` only fires cross-tab, so `PaletteControls`' state never moved:
  once the trigger read correctly, the select's LIST still ticked the old palette — and
  re-picking the item radix believes is selected fires no `onValueChange`, so it was a dead
  control. `site-chrome` dispatches `CHROME_CHANGE_EVENT` on a same-tab set and the control
  listens. If you add another writer of palette/mode, go through `site-chrome`.
- **If you add a header control that shows persisted state,** give it the same shape: render
  every possible value, pick one with CSS keyed on an `<html>` attribute, and set that
  attribute above the markup. `site-chrome-first-paint.spec.ts` samples every frame across
  three page families and fails on any second value.
- **A per-frame sampler must know when a control is half-PARSED.** The three mode icons are
  large inline SVGs and the HTML parser yields between them, so a frame can land on a button
  holding two of the three — no icon lit, which reads as a second value for the control and
  fails about one run in eight. That is absence, not a state a person sees: the sampler skips
  a frame whose button does not hold all three, and the case asserts the settled DOM does hold
  all three so the skip cannot hide a real regression.
- **Triggered by:** #1592.
