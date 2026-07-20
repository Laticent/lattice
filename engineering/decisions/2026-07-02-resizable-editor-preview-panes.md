---
status: shipped
summary: The Playground and Studio ship fixed editor|preview splits — users can't widen the editor for long lines, widen the preview for review, or collapse either pane. We ran a five-way design competition (inversion catalog first, five theses each iterated five times, a red team per design, a three-lens judge panel, then synthesis + an independent checker) for "full freedom to resize and fully collapse" both panes. Unanimous winner is the Craftsman Split — a hand-rolled, CSS-var-driven grid divider (no new dependency; react-resizable-panels can't host Studio's conditional 4-track grid) with pointer-captured drag, drag-past-minimum collapse to an always-visible labeled rail, ARIA window-splitter keyboard support, sanitize-on-read persistence, and explicit iframe-shield + __latticeFit re-fit choreography against the preview-iframe trap catalog. Required red-team fixes are folded in and the best runner-up ideas grafted (DeckPreview `active` for the collapsed Studio preview, ⌘K commands + a header collapse affordance, the 760px preview-cap lift, border ownership, container-aware pane headers). Shipped in PR #717 with three fixes real-surface verification found beyond the spec — a z-order hit-test bug (the preview iframe swallowed divider grabs), the coarse-pointer commit-on-release clause (driven in by a real-iPad jank report), and a React 19 hydration trap that silently dropped all attribute-level persistence restore. See "Shipped deviations".
---

# Resizable & collapsible editor/preview panes — Playground + Studio

*2026-07-02* · Status: **shipped** (PR #717), **implementation superseded 2026-07-19**.

> **Superseded (mechanism, not behavior):** the hand-rolled `ui/split.tsx` this
> doc chose — and the `use-panel-width.ts` docked-column widths — were replaced by
> `react-resizable-panels` (the shadcn resizable panel) once a new requirement
> (resizable Studio Coach/Chat/Library panels) dissolved the "side columns can't
> be Panels" premise that rejected the library here. The resize/collapse *behavior*
> below still holds; the primitive underneath is now the library. See
> `2026-07-19-shadcn-splitter-migration.md`.

## Shipped deviations

Implementation-time corrections to the spec below, recorded rather than
silently absorbed:

- **Restore-by-dragging the rail inward (§1) did not ship** — rails are
  single-click/tap buttons (plus keyboard). Follow-up if demand appears.
- **The touch reset is a synthesized double-tap** on the handle (§4 promised
  it; native dblclick never fires under `touch-action:none` + pointer capture).
- **Touch/pen drags are DEFERRED** (ghost divider line via a paint-only
  transform; tracks commit once on release) per §8's coarse-pointer clause —
  the live-track path is mouse-only. A real-iPad jank report drove this in;
  the FIT resume is rAF-deferred with a 120ms WebKit belt.
- **Persisted state applies POST-MOUNT, not in the hydration render** — React
  19 production hydration silently drops attribute-level mismatches (inline
  vars, aria-valuenow, data-split-collapsed, inert), so an initializer-time
  restore updates the vDOM but never the DOM. Pre-restore the hook emits no
  inline vars so the pre-paint seed carries first paint. Regression net:
  `docs/e2e/split.spec.ts`.
- **Playground rails are a flat 28px** (the ≥44px coarse-pointer hit extension
  is a logged follow-up); Studio rails are 46px as specced.
- **The seed hosts are each page's own head script** (`playground.astro` /
  `studio.astro`) — ThemeProvider.astro is docs-zone-only.
- **The Studio grid matrix is asserted by e2e** (a real 1100px both-panels-open
  no-overflow test), not a track-string unit matrix.
- **Device-pass addition**: verify CodeMirror autocomplete/lint tooltip
  placement in a narrowed Studio editor on Safari — `container-type:inline-size`
  does not re-root `position:fixed` descendants in Chromium (verified live),
  but Safari/Firefox are unverified from the sandbox.
- **The emitted flex pair is the ratio DOUBLED (sum 2), never normalized** —
  the iPad field reports of a dead strip beside a near-minimum preview were a
  spec-correct consequence of a sum-1 pair (CSS Grid §12.7.1: when a pane
  clamps at its px minimum, a remaining flex sum < 1 distributes only that
  fraction of the leftover). Reproduced on real WebKit AND Chromium (engine
  matrix + the real page + a zero-interaction seed reload); fixed by emitting
  `2r fr / 2(1−r) fr` at every site (hook, both page seeds, Studio tracks,
  CSS fallbacks — the defaults are again the historical 0.9/1.1 and 0.92/1.08).
  Tripwire unit test guards against a future "normalize the pair" cleanup;
  e2e asserts the grid fills its container in the exact clamp band at iPad
  width. Related note: the post-drag re-fit rides on the resume belt (the
  onSettle-time fit is gated during suspension by design) — measured landing
  ≤150ms on real WebKit.

## Context & problem

Both authoring surfaces ship fixed splits. The Playground's `.pg-split` is a static grid — `grid-template-columns: minmax(320px, 0.9fr) 1.1fr` (playground.css:80-82) — collapsing to `body[data-pane]` Edit/Preview tabs at `max-width: 820px`. Studio's desktop grid is an inline `gridTemplateColumns` of `[232px?] minmax(0,0.92fr) minmax(0,1.08fr) [300px|46px]` (StudioShell.tsx:1339-1341), with compact and focus variants hard-coding `minmax(0,1fr) minmax(0,1.08fr)`. The user cannot widen the editor for long lines, widen the preview for review, or collapse either pane for a distraction-free mode. "Full freedom to resize and collapse" means: continuous drag resize of the editor|preview pair, full collapse of either pane with an always-visible restore path, keyboard equivalence, persistence — on both surfaces, without touching the mobile tab machinery or Studio's Architect/Inspector columns. Now, because both surfaces are stable enough that the pair-split is the last piece of fixed chrome users still ask to move.

## Design model

Five axes made five genuinely distinct candidates possible:

- **Control granularity** — continuous drag ↔ snap-assisted drag ↔ discrete presets ↔ collapse-only.
- **Collapse affordance** — gesture (drag past minimum), button, header double-click, preset segment.
- **Restore path** — labeled rail, toolbar control, keyboard/palette; hover-only was banned by inversion #4.
- **Memory** — what persists (ratio, collapse, both), for how long (localStorage vs session), and how stale values self-heal.
- **Surface unification** — how one primitive serves a static CSS grid (Playground) and a conditional 2-4-track inline grid (Studio) without becoming a mini-framework (inversion #11).
- **Iframe/FIT constraints** — the non-negotiable physics: pointer events die over the `srcdoc` iframe (inversion #1), the FIT agent bails at zero width and iOS Safari never recovers (inversion #2), and every drag frame that resizes the iframe risks a per-frame reflow storm (inversion #7).

## Process

We ran inversion first (15 pre-design failure modes, each grounded in shipped code), then developed five competing theses in parallel — each drafted and iterated five times against the catalog. Each final spec was independently red-teamed (attacks verified against the repo, with required fixes and a survivability score), then judged by a three-lens panel: boardroom visual excellence, engineering fit + risk, and user experience. The verdict was unanimous. This document is the synthesis: the winner with every required fix folded in and the strongest runner-up ideas grafted on, checked against the real code.

## The five candidates

**Craftsman** — one quiet divider: pointer-captured continuous drag, drag-past-minimum collapse with arming feedback, always-visible labeled rail for restore, CSS-var-driven grid tracks, hand-rolled ~350-line primitive. Red team found zero fatal flaws; all six serious hits were bounded mechanical fixes.

**Stage** — three layouts (split / editor / preview) with drag plus header double-click maximize, an Esc ladder, and a 180ms track animation. Best taught discoverability; but both signature mechanisms failed as written (Radix does not stop Esc propagation; fr↔px track animation snaps in every browser and its `transitionend`-keyed re-fit would never fire).

**Adaptive** — continuous drag with release-snap physics onto 38.2/50/61.8 stops and auto-collapse arming. Verified substrate, but the identity absorbed every hit: snap moves the control after release, ~15% of the track mouse-unreachable, the default unreachable, and its own kill switch converges it to craftsman at higher cost.

**Conductor** — five preset layout states in a toolbar radiogroup, no divider at all. Structurally immune to drag physics, but its flagship "canonical state + projection" unification failed its own trace three ways (desktop picker collapses the editor; mobile taps clobber desktop layout; Studio mobile default flips), and it renegotiates "resize" into presets.

**Rail** — collapse-only via header buttons and 46px rails; no resize path at all. Cleanest manners of the field, but fatal scope renegotiation, and both load-bearing mechanisms were specced against code that doesn't behave as claimed (`hidden` is inert with Tailwind preflight off; the Studio refit plan missed DeckPreview's shipped `active` prop).

| Candidate | Visual | Engineering | UX | Total | Survivability | Fatal flaws |
|---|---|---|---|---|---|---|
| **craftsman** | **9** | **8** | **9** | **26/30** | 8/10 | none |
| stage | 7 | 6 | 7 | 20/30 | 7/10 | none |
| adaptive | 4 | 5 | 6 | 15/30 | 6/10 | none (thesis self-ejects) |
| conductor | 5 | 5 | 4 | 14/30 | 6/10 | conditional (if user means drag) |
| rail | 6 | 3 | 3 | 12/30 | 6/10 | ships zero resize |

## Winner & why

**Craftsman, unanimously.** It is the only candidate that delivers the literal ask — continuous resize *and* full collapse — on a verification record where every citation checked out and no central mechanism was falsified; its rest state adds literally nothing to the screenshot; and its red-team fixes improve the design rather than tax it. Stage lost because both signature mechanisms (Esc ladder, track animation) failed against verifiable facts and the repair amputates its identity, leaving craftsman-with-extra-chrome. Adaptive lost because everything distinctive about it was also everything attacked — post-fixes it *is* craftsman, at 400-600 lines and L effort. Conductor lost because "freedom of destination" is a renegotiation of the brief and its one-source-of-truth claim failed its own trace in three places. Rail lost on fatal scope — collapse-only against an explicit resize-and-collapse ask — with its two load-bearing mechanisms specced against code that doesn't behave as claimed.

## Final design spec

### 1. Interaction model

One vertical divider between editor and preview, per surface. **Drag** (pointer-captured) resizes continuously; grid `minmax()` clamps at each pane's minimum natively. **Drag ~48px past the minimum** arms collapse: the doomed pane dims to 60% opacity and the grip flips to a chevron; release collapses, releasing earlier springs back. **Double-click** the divider resets to the surface default (double-tap synthesized on touch, §4). **Collapse** replaces the pane's track with `0px` and widens the divider column into a labeled restore **rail** — always visible, full-height: chevron, vertical mono label ("Markdown" / "Rendered slides" / "Edit" / "Preview"), status badge (§2). **Restore**: click/tap the rail, Enter/arrow on the focused rail, or drag the rail inward to pull the pane back live; restore returns to the pre-collapse ratio. The collapsed pane stays mounted (`inert`, width 0, overflow hidden) so CodeMirror history and the preview document survive.

**Visible collapse affordance** (graft: Stage — answering the UX judge's one ding that collapse was gesture-only): each pane header (`.pg-pane-label` row; Studio's Edit/Preview header rows) gets one 16px muted `PanelLeftClose`/`PanelRightClose` ghost button, right-aligned, tooltip "Collapse · drag divider past minimum". Per Conductor's toolbar-budget lesson, this lives in the pane header, never the toolbar — zero permanent toolbar chrome added. Studio additionally registers four ⌘K commands: *Collapse editor pane*, *Collapse preview pane*, *Expand …*, *Reset split* (graft: Stage) — the taught, touch-free path.

**Programmatic reveals auto-expand** (required fix): `applyDeck(…, {toPreview:true})` fires on all breakpoints (PlaygroundApp.tsx:307/315/327 — insight: Conductor's red team), so `toPreview` is redefined as *intent* — "ensure the preview is visible": below 820px it sets the tab as today; above, it calls `split.expand('b')`, a no-op when already expanded. Same wiring for `onTab`, and in Studio for slide-navigator clicks, `goToSlide`, and AI-insert. A component pick with the preview collapsed must never render into a hidden frame while the status line claims success.

### 2. Visual spec

Boardroom-quiet at rest: the divider **is** the existing 1px `var(--border)` line — `.pg-pane.editor { border-right }` (playground.css:92-94) and Studio's `md:border-r` (StudioShell.tsx:1048) are **removed** and the rule moves to the handle column, so there is exactly one line, never a doubled line or a transparent gap (graft: Adaptive red team). The hit area is an invisible 10px overlay straddling the line, biased toward the preview side so CodeMirror scrollbar grabs can't start drags. **Hover** (120ms): three 3px grip dots in `var(--text-muted)`; line warms to `color-mix(in srgb, var(--accent) 45%, var(--border))`. **Active drag**: 2px `var(--accent)`; body `cursor: col-resize`; both panes `user-select: none`. **Focus-visible**: 2px `var(--accent)` ring on the grip pill. **Collapse-armed**: grip → chevron, doomed pane at 60%. **Rail**: `var(--bg-alt)`, 1px `var(--border)` edges, vertical-rl 10px uppercase mono label, chevron tile on top, badge slot beneath — Playground preview rail shows a `var(--fail)` dot on render error; Studio editor rail shows the existing amber issue-count pill (inversion #15: never editing blind). **Studio rails are 46px**, matching the Inspector rail's geometry exactly — chevron tile size, label typography, edge treatment — so a collapsed preview rail sitting flush against the closed Inspector rail reads as a deliberate rail *group*, not a collision; this adjacency ships as a named screenshot-matrix configuration (graft: Rail red team). Playground rails are 28px (no adjacent rail exists there). No hex anywhere; all tokens.

### 3. Keyboard + ARIA

ARIA window-splitter: `role="separator"`, `tabindex=0`, `aria-orientation="vertical"`, `aria-label="Resize editor and preview"`, `aria-valuenow` = editor share % (recomputed from real rects on release/keys), `aria-valuemin/max` from clamps, `aria-controls` referencing **new stable pane ids** (`pg-pane-editor`/`pg-pane-preview`; `studio-pane-editor`/`studio-pane-preview`) (required fix). Keys: **←/→** 2%, **Shift+←/→** 10%, **Home/End = jump to min/max — never collapse** (per APG; graft: Adaptive red team — kept exactly as craftsman had it), **Enter** collapses **the editor, deterministically**, announced ("Editor collapsed; press Enter to restore") — a screen-reader user must never have to perceive which pane is "nearer minimum" (required fix). When Enter (or drag) collapses a pane while the separator or that pane owns focus, **focus hands off to the rail button** — never dropped to `<body>` (required fix). **Esc cancels an active drag only**: the listener is a window-level keydown installed at drag start and removed at drag end, so it cannot collide with Radix overlays, PresentOverlay, or CodeMirror's completion Esc — Stage's Esc-ladder lesson applied by *scoping*, not by laddering (graft: Stage red team). The collapsed rail is a `<button aria-expanded="false">`; the collapsed pane is `inert`. State changes announce via `role="status"` (Playground) / `notify` (Studio).

### 4. Touch/tablet

Pointer Events throughout; hit area widens to 24px on `(pointer: coarse)` (as overlay, still preview-biased); the grip is always visible at 50% opacity on coarse pointers; `touch-action: none` on the handle only. Rails grow to 34px visible (Playground) with an invisible hit extension to a ≥44px effective target / stay 46px (Studio) (checker fix). **Double-tap reset is synthesized** from pointerdown timestamps (two downs <300ms apart, <8px travel), since `touch-action:none` + capture suppresses native dblclick (graft: Adaptive red team). Below the tab breakpoints the divider does not render. Real-iOS touch drag and expand-re-fit are **UNVERIFIED** from this sandbox (#23).

### 5. Per-surface adaptation

**Playground**: `.pg-split` becomes `minmax(280px, var(--split-a)) 1px minmax(320px, var(--split-b))` — the custom properties **carry the unit** (`--split-a: 0.45fr`), because `var(--split-a)fr` is invalid CSS (required fix). The handle column is a **1px in-flow track** (it *is* the divider line); the 10px hit area is an absolutely-positioned overlay straddling it, out of flow, so the panes always visually abut. The track widens to the rail width (28px/46px) in a collapsed state. Both surfaces' split tracks consume the same `--split-a`/`--split-b` custom properties (Studio's inline `gridTemplateColumns` references them too), so one pre-paint seed serves both (checker fix). **Studio**: the split governs only the editor|preview pair; Architect (232px) and Inspector (300px/46px) tracks are untouched. **Studio minimums are explicit: editor 240px, preview 280px** — worst case at the 1100px desktop threshold with both panels open: 232 + 240 + 1 + 280 + 300 = **1053px ≤ 1100px**, verified by a Playwright assertion at a 1100px viewport (required fix). One saved ratio serves all non-mobile configurations because the two fr tracks distribute whatever middle space remains. **Pane headers become container-aware**: the Edit-header labels currently use viewport `hidden lg:inline` classes (StudioShell.tsx:1056-1078), which clip when the pane is user-narrowed at a wide viewport — they switch to container queries on the pane section — which first gains `container-type: inline-size` (no container context exists there today; checker fix) (graft: Adaptive red team). **The Studio preview card's `max-w-[760px]` cap (StudioShell.tsx:1106) lifts when the editor is collapsed** — otherwise "collapse editor" delivers the same 760px slide in a sea of gutter (graft: Stage red team). **The collapsed Studio preview passes `active={false}` to DeckPreview** — its shipped rising-edge contract (DeckPreview.tsx:43,139-148) defers per-keystroke renders while collapsed and re-renders once on expand, eliminating both wasted renders and the hidden-iframe-render trap in one prop (graft: Rail red team; a #15 reuse win). The Playground equivalent: the debounced render loop skips `render()` while the preview is collapsed and `expand('b')` triggers one authoritative `freshRender`-path render after reveal.

### 6. Breakpoints (1440 / 820 / 390)

**1440**: full split, both surfaces, all Studio configurations (±Architect, ±Inspector, focus). **820**: Playground = tabs (its media query is `max-width: 820px`; the hook's `active` gate uses the *same* matchMedia string — one source of truth); Studio = tablet, split active. **390**: tabs own visibility exclusively on both surfaces; the split renders nothing and writes nothing — `data-pane`/`mobilePane` is the only authority (inversion #5). As a CSS-side belt, the existing ≤820px block also `display: none`s the handle/rail column, so a server-rendered handle can never wrap into an implicit row during the hydration window (checker fix). Ratio/collapse state is retained but inert; rotating back above the breakpoint re-applies it and fires the expand re-fit (§8).

### 7. Persistence

localStorage (`site-chrome.ts` idiom): `lattice-docs-split-playground` / `lattice-docs-split-studio` → `{"v":1,"a":0.45}`. Defaults 0.45 / 0.46 (today's ratios). Read is self-healing, mirroring `sanitizePalette` (PlaygroundApp.tsx:163): parse-fail/NaN/out-of-band → default written back; ratio clamped 0.2–0.8 on read; pixel minimums re-clamp continuously via `minmax()` at every viewport size (inversion #10). **Collapse is sessionStorage** (`…-collapsed: 'a'|'b'`) — survives reload, never strands a returning visitor (inversion #3); even restored, the labeled rail is on screen. The saved ratio is **seeded pre-hydration** alongside the existing pre-paint chrome script so returning resizers see no first-paint width jump (visual judge's condition). Double-click/double-tap reset clears the stored ratio.

### 8. Engineering plan

**Hand-rolled; no dependency.** `react-resizable-panels` (and shadcn's wrapper) requires every grid sibling to be a Panel — it cannot host Studio's conditional Architect track or the Inspector rail — and we'd still own the iframe shield and re-fit choreography. One shadcn-style primitive `docs/src/components/ui/split.tsx` (honestly ~350–450 LOC with tests): `useSplit({storageKey, defaultRatio, min:[px,px], active, onExpand, onCollapse})` → `{gridTemplate, handleProps, railProps, paneProps(id), collapsed, dragging, expand, collapse, reset}`, plus `<SplitHandle>` / `<SplitRail label badge={children}>` — zero per-surface props (inversion #11).

**Drag lifecycle** (required fix): `setPointerCapture` on pointerdown; **`lostpointercapture` is the single authoritative end-of-drag** — it fires for pointerup *and* pointercancel (mid-drag Cmd-Tab, iPad system gestures), so the shield, `user-select`, cursor, and arming state can never leak; a `visibilitychange` listener is the belt; the Esc canceler is a window-level keydown installed only while dragging.

**Drag performance** (required fix): pointermove is **rAF-coalesced** — at most one `style.setProperty('--split-a', …)` write per frame, zero React renders, zero engine renders. Because a pure track change still resizes the iframe and runs the in-iframe FIT agent's per-section observers every frame, **the FIT agent is suppressed during drag** (a `__latticeFitSuspend`/resume flag; Studio's `scaleFrame` observer likewise gated), with **one authoritative re-fit keyed on `lostpointercapture`**. On `pointer: coarse` the tracks themselves commit **on release only** (live ghost line during drag), since mid-tier tablets are the jank risk. A **measured drag-FPS trace on a large gallery deck is a merge artifact** (§Verification).

**Iframe shield**: capture is the backbone; `data-split-dragging` additionally sets `pointer-events: none` on preview iframes — belt-and-braces (Studio's preview card is already `pointer-events-none`).

**Expand re-fit** (inversion #2): after expand/reactivation, double-rAF then Playground calls `frameRef.current?.contentWindow?.__latticeFit?.()` — the proven `data-pane` reveal path (PlaygroundApp.tsx:404) — plus a call from `onFrameLoad` to close the srcdoc-loading race (graft: Rail red team); Studio re-fits via DeckPreview's `active` rising edge plus its host ResizeObserver → `scaleFrame` (single-slide-render.ts:242), with an explicit `scaleFrame` nudge for WebKit. The Playground collapsed pane keeps explicit `display`-affecting CSS driven by our own class, never a bare `hidden` attribute — Tailwind preflight is off here and the UA `[hidden]` rule loses to author `display:flex` (lesson: Rail red team).

### 9. Risk register

1. **iOS Safari blanks an expanded pane** — explicit re-fit choreography above; device pass required before merge; UNVERIFIED until then (#23).
2. **Drag lifecycle leak** — `lostpointercapture` + `visibilitychange`; e2e covers tab-switch-mid-drag.
3. **Studio grid overflow/regression** — explicit 1062px worst-case arithmetic; Playwright at 1100px; track strings unit-tested across all 8 configurations.
4. **Drag-frame jank on tablets** — FIT suppression + coarse-pointer commit-on-release; drag-FPS artifact gates merge.
5. **CodeMirror at 0-width** — pane stays mounted, `inert`; CM re-measures on expand; e2e types after restore.
6. **E2E/screenshot flake** — fixtures clear/pin `lattice-docs-split-*`; screenshots pin defaults.

### 10. Effort & scope

**M-to-L honestly** (~3–4 days including the device pass and review sweep). No engine changes; no export-pipeline bytes change (export sign-off gate not triggered).

## Impact analysis

**Surfaces**: Playground (docs site) and Studio. **Files**: new `docs/src/components/ui/split.tsx` (+ `split.test.tsx`); `docs/src/components/playground/PlaygroundApp.tsx` (grid, toPreview intent, reveal wiring, render-skip while collapsed); `docs/src/styles/playground.css` (tracks, handle/rail styles, border-right removal, ≤820px handle belt); `docs/src/components/studio/StudioShell.tsx` (three grid branches, pane headers → container queries, `active` wiring, 760px cap lift, rail); `docs/src/components/studio/CommandPalette.tsx` (the four split commands — the palette's items are hardcoded props, not a registry; checker fix); `docs/src/playground/deck-preview.js` (the `__latticeFitSuspend`/resume flag; checker fix); `docs/src/lib/single-slide-render.ts` (gating its `scaleFrame` ResizeObserver during drag; checker fix); `docs/src/pages/playground.astro` + `docs/src/pages/studio.astro` (each page's existing head pre-paint script hosts its ratio seed — ThemeProvider.astro is the docs-zone script and neither surface uses it; implementation correction to the checker's host guess); `docs/src/components/DeckPreview.tsx` unchanged (its `active` prop is consumed, not modified). **Tests**: extend `PlaygroundApp.test.tsx` (toPreview-expands-collapsed-preview; reveal path regression) and `playground.test.tsx`; extend `StudioShell.test.tsx` (track-string matrix ×8, cap lift); hook tests in the `studio.controls.test.tsx` idiom (clamp, self-heal, keyboard, deterministic Enter, focus handoff); new Playwright e2e: drag-released-over-iframe, tab-switch-mid-drag, collapse/restore + type-after-restore, reload persistence, breakpoint inertness, 1100px no-overflow, programmatic-reveal auto-expand. **Docs**: `engineering/capabilities.md` (the split primitive, on the docs-site row), `engineering/gotchas.md` (trap-catalog row: splitter drag + FIT suspension), `engineering/development.md` (the split screenshot matrix incl. dual-rail adjacency). (`design/design-system.md` covers the deck design system, not site chrome — no entry there; implementation correction.) **CHANGELOG `## Unreleased`, exact text**: `- Playground and Studio: the editor and preview panes are freely resizable by dragging the divider (keyboard: arrow keys on the separator) and either pane collapses to a labeled rail; the split persists per surface.` **Out of scope, logged as consistency follow-ups** (#18): Workbench and Drawing Board keep their fixed layouts — tracked issues, not this PR. **Design-review item**: the Studio preview-rail ⟷ Inspector-rail adjacency (46px group treatment) is a named configuration in the screenshot matrix and gets explicit reviewer eyes.

## Verification plan

Per HARD RULE #23, every claim names its surface and artifact:

- **Visual**: `tools/screenshot.js` at 1440/820/390, both surfaces, light + dark, storage keys pinned — including collapsed-editor, collapsed-preview, and the Studio dual-rail adjacency states. Reviewed against the 10/10 rubric.
- **Interaction (real browser)**: headed Chromium via `CHROME_PATH` on the locally built docs site — real mouse drags (including one released inside the preview iframe and one interrupted by a tab switch), keyboard resize with announced values, collapse/restore round-trips, programmatic reveal (pick a component with the preview collapsed → it expands and renders).
- **Performance artifact**: a drag-FPS trace (CDP tracing / DevTools performance profile) dragging across a large gallery deck, attached to the PR's evidence section — this gates the FIT-suppression claim.
- **E2E**: the Playwright list above, run against the built site; noted as exercising what they exercise, not more.
- **UNVERIFIED in sandbox**: real iOS Safari touch drag and expand-from-collapse re-fit (the FIT blank-pane trap is device-only). Playwright touch runs are emulation and will be labeled as such. **A manual iPad/iPhone pass is a required pre-merge step**; until it happens the PR carries an explicit UNVERIFIED marker.

## Rejected alternatives

**Conductor** (14/30, survivability 6/10). Genuinely boardroom in its cuts-not-tweens transitions and structurally immune to every drag failure mode — but it renegotiated "resize" into five fixed ratios asserted from no user evidence, its canonical-state unification failed its own code trace three ways, and the fix re-admits the dual-owner state machine this codebase has the most scar tissue about. We took its toolbar-budget lesson (no permanent toolbar chrome — our collapse affordance lives in the pane header) and its sharpest trace: `applyDeck({toPreview})` fires on all breakpoints, which shaped the intent-based auto-expand.

**Rail** (12/30, 6/10, one fatal flaw). The best-mannered collapse story of the field and an unusually honest engineering skeleton — but it ships zero resize against an explicit resize-and-collapse ask, and its two load-bearing mechanisms (`hidden`, the Studio refit) were specced against code that doesn't behave as claimed. Its red team gave us three of our best grafts: DeckPreview's shipped `active` prop, the explicit-display-CSS lesson, and the dual-rail adjacency problem we now design for deliberately.

**Stage** (20/30, 7/10). The strongest runner-up: delivered both halves with the best taught discoverability, and its homework was nearly craftsman-grade. It lost because its two signature mechanisms — the Esc ladder and the 180ms track animation — both fail against verifiable browser and Radix facts, and the repaired design is craftsman plus extra chrome. We took its ⌘K palette commands, its visible-affordance answer to the UX judge's ding, the 760px cap lift, and its Esc-consumer catalog (applied by scoping our Esc to the drag only).

**Adaptive** (15/30, 6/10). Its substrate — pair-share fr semantics, settle-hook re-fit, the correct hand-rolled verdict — was verified sound, and much of it independently matches craftsman's. But its identity (release-snap physics, golden stops, the 80px arming dead zone) absorbed every serious hit, moved the control after the user let go, and shipped its own kill switch; firing it buys craftsman at higher spend. We took its border-ownership fix, px floors + container-aware headers, the APG Home/End discipline, and the double-tap synthesis note.
