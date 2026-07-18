---
status: shipped
summary: The phone Compose editor hid its grammar/register bar behind the iOS keyboard while typing (normal-flow `.cs-gutter` bottom bar; `100dvh` and `position:fixed;bottom:0` don't track the keyboard on iOS). A `design-competition` (winner Keyline) + the adversarial trio produced slice 1 — a keyboard-riding register rail — but four slices of on-device use drove the design past it. FINAL SHAPE (slice 4): there is NO separate formatting bar at all. Each slide's top divider line IS its full-width control bar, carrying, only when the caret is inside that slide, four role-tinted groups — a VS-Code-style collapse chevron, a truly CONTEXT-SENSITIVE Format group (`applicableRegisters()` returns only the registers that can validly render from the caret's block; a list offers none, so the infinite `- > > > >` vector is absent from the UI, not merely guarded), insert-below + slide-settings gear, and delete with an in-place two-step confirm. A `formatSyncPlugin` (plugin `view()` hook over a `liveSlideViews` registry) re-syncs the Format group on every caret move. The keyboard-riding rail AND the left gutter are RETIRED (with formatting on the divider there is no bottom bar to occlude); `use-visual-viewport` survives only for the typing-mode chrome collapse. Slices 2–3 (two-band consolidation, typing-mode scroll-reveal, divider→settings gear) also landed. Verified on the real surface at 1440px + 390px with real mouse clicks that move the PM selection (HARD RULE #23): Format group tracks the caret across block types (list→empty), delete-confirm, collapse toggle, and register-apply all confirmed; typecheck + 1748 docs tests + biome clean. UNVERIFIED on real iOS: the keyboard-open feel of typing-mode chrome collapse (no software keyboard in a headless sandbox).
---

# Compose mobile editor — the divider IS the control bar (Keyline → slice 4)

**Date:** 2026-07-18
**Status:** Landed. Slice 1 (keyboard rail) → slice 4 retired it: the slide divider is now the one control bar.
**Surface:** `docs/src` Studio Compose editor (`ComposeView.tsx`, `StudioShell.tsx`, `lib/compose/registers.ts`).

## Problem

On a phone the Compose editor's chrome was a "ball of mess": four stacked bands ate the top
third before any slide content, and the bottom formatting/register bar was **hidden behind the
iOS software keyboard** exactly while typing (user report + screenshots). The register bar
(`.cs-gutter`, reflowed to a bottom row at `@media(max-width:640px)`) sat in **normal flow**, and
neither `100dvh` nor a `position:fixed;bottom:0` element tracks the keyboard on iOS — so the
keyboard drew over it.

## How we got here

A `design-competition` (5 tracks → 4 finished; both judges' winner **Keyline**, fact-check clean:
99 claims confirmed, 0 refuted) picked the model, then the **adversarial trio** (red team,
Munger inversion, independent feasibility check) hardened the winner. The trio materially changed
the design — see "What the trio changed" below. User picked Keyline and chose: keep **two** top
bands (not 4→1), build slice 1 now.

## The design (Keyline, as hardened)

**One move fixes both problems:** the grammar registers stop being a normal-flow band (occluded)
and become a bar that is **always docked at the editor's bottom and lifts above the keyboard when
one is up.**

- **Absolute-coordinate pin.** A new hook `use-visual-viewport.ts` publishes `--cs-vv-top`
  (`visualViewport.offsetTop`) and `--cs-vv-height` (`visualViewport.height`). The rail sits at
  `top: calc(var(--cs-vv-top) + var(--cs-vv-height) − 52px)`, landing its bottom edge flush with the
  visual-viewport bottom (keyboard top when up, screen bottom when down). This is an **absolute
  layout-px coordinate**, so it is invariant to whether iOS resolves `position:fixed` against the
  layout or the visual viewport — the ambiguity that makes the `bottom:0 + translateY` approach
  double-count the keyboard on some iOS builds. This is why Keyline beat the other three tracks.
- **Portaled to `<body>`.** The editor pane has `container-type:inline-size` (`StudioShell.tsx`
  ~2105), which would make a `position:fixed` child anchor to the pane and clip it. The rail portals
  to `document.body` — the same clip-dodge the desktop `cs-selbar` already uses.
- **Always-docked fallback.** When `visualViewport` is absent, or the keyboard is down, or a hardware
  keyboard is attached (no inset), the CSS var defaults (`--cs-vv-height,100vh`) dock the rail at the
  editor bottom = today's always-visible bar. **Never worse than what it replaces** — the fix the
  inversion demanded, and what makes slice 1 a strict standalone improvement.
- **Render-gate.** The body portal escapes the pane's `inert`/hidden subtree, so the rail renders
  only when the compose surface is the **active, non-inert pane** (`visible` prop: mobile → the edit
  pane is selected; tablet/desktop → not the Read stop and not split-collapsed).
- **Host-rect tracking.** A `ResizeObserver` on the editor host keeps the rail's `left`/`width` locked
  to the editor column (rotation, split-drag).
- **Scope: mobile shell only (≤699px).** Tablet and desktop keep the **left** grammar gutter — there
  the registers sit on the side, which the keyboard never occludes, so moving them to a bottom rail
  would *introduce* the very occlusion we fix. This also retires the old 640-vs-699 CSS/JS breakpoint
  split onto the single `useBreakpoint` mobile authority.
- **Buttons unchanged from the shipped bar** — the register buttons keep their `mousedown`
  `preventDefault` (focus never leaves the editor); only *where the bar sits* changed. So the tap
  interaction is the shipped behavior, not new code, which de-risks the touch-focus question.

## What the trio changed (vs the raw competition winner)

- **Inversion (fatal ×2):** the raw Keyline made registers reachable ONLY with the keyboard up (a
  regression vs today's always-visible bar; blank on iPad hardware keyboards) and had **no fallback**
  if the pin misbehaved. → The rail is now **always docked and lifts**, with a coded fallback.
- **Inversion (severe):** 4→1 reverses a deliberate prior decision (2026-07-03) protecting the deck
  title and one-tap Present/Share/Architect. → **Keep two bands** (user-confirmed); slice 2 removes
  only the in-pane EDIT header.
- **Red-team M1:** a coarse iPad Pro at desktop width would get a fixed rail over the desktop layout.
  → Rail scoped by **width ≤699**, not pointer, so no desktop-width device mounts it.
- **Red-team B3 / M4:** rail floating over an open Sheet, and stale `left/width` on split-drag. →
  `visible` render-gate (rail only on the active, non-inert compose pane) + `ResizeObserver`.
- **Checker corrections (for slice 2):** reuse `onEditorCursorSlide(idx)` (not a new
  `mapFullToViewed`) for the divider→settings slide reconcile; use `setInsertOpen(true)` for insert.

## Verification

**Verified in-sandbox** (build the docs, drive the real Playground, `tools/screenshot.js`):
- Desktop (1440, fine pointer): left grammar gutter unchanged, no rail — **no regression**.
- Tablet (820, coarse): left gutter unchanged, no rail — tablet's working side-rail untouched.
- Mobile (390): rail renders **docked full-width** at the editor bottom with all six registers,
  gutter gone; typecheck clean, 1711 docs tests pass, biome clean.

**UNVERIFIED — needs a real iPhone/iPad (HARD RULE #23; a headless sandbox has no software
keyboard, so this cannot be confirmed here):**
1. The pin actually lifting the rail to the keyboard's top edge across the keyboard-open animation
   and momentum/rubber-band overscroll (red-team M5), and under Stage Manager / Split View (M6).
2. Touch focus-retention on a rail tap — that a tap keeps the editor focused and the keyboard up
   (iOS raises the keyboard only on a user gesture, so a lost blur can't be re-raised programmatically).
3. That the reserved caret space keeps the caret above the rail while typing near a slide's end (M7).

The always-docked fallback means each of these degrades to "docked bottom bar" rather than breaking.

## Follow-on: register-apply hardening (the `- > > > >` bug)

Testing slice 1 on-device surfaced a **pre-existing** correctness bug the rail made easy to hit:
tapping Key-insight (❦) with the caret in a list item nested a blockquote every tap
(`- > > > >`), unbounded. Red-team + inversion found the root cause: a register that **mutates a
different block than its detector reads** never toggles off. `insight` wrapped the *inner* block
(the paragraph inside the list item) via `wrapIn`, while `activeRegister` inspected the *top-level*
block (the list) — so `current` was never `insight` and every tap re-wrapped.

Fix: the apply/detect logic moved to a pure kernel `docs/src/lib/compose/registers.ts` with one
invariant — **a register mutates and detects the SAME top-level block, and is a strict no-op unless
that block is a type it can validly render from** (paragraph/heading; plus blockquote for insight's
toggle-off). `insight` now branches on block KIND (blockquote → unwrap; paragraph → wrap in place if
last, else move to slide end; else no-op), `h1`/`h2` guard to paragraph/heading, and a cross-slide
selection is a no-op. Every register is now an idempotent toggle that cannot nest. Guarded by
`registers.test.ts` (stress cases incl. the exact repro). Landed on this branch (HARD RULE #18 —
a defect the change's own surface exposed, fixed in place).

### Broader red-team of the whole Compose surface

The user pushed for more than the blockquote fix, so an **independent** red-teamer swept the entire
Compose interaction surface (divider structural ops, `moveToSlideEnd`, the structural guard, the
resync race, emit round-trip). Seven findings; disposition:

- **Finding 1 — MAJOR, FIXED.** The emit path keyed on `tr.docChanged`, which stays `true` even for a
  transaction the structural guard REJECTS (a keystroke in a locked slide, a cross-slide delete) —
  `state.apply` returns the unchanged state, so the emit branch ran on a no-op and nulled a **parked
  external resync** (`pendingResyncRef`), silently dropping an external `_class`/AI/undo change on the
  next blur. Fixed: guard on `next.doc !== prevDoc` (the applied doc), not `tr.docChanged`
  (`ComposeView.tsx` `dispatchTransaction`). Premise locked by a test.
- **Finding 3 — MAJOR, FIXED.** Collapse is a position-keyed node decoration; `SlideView.commit`
  rebuilds the doc via one full-content replace step, so mapping dropped it → collapsed slides popped
  open on every move/insert/delete. Fixed: the collapse plugin re-establishes decorations by **node
  identity** on a `slideOp` tr. Guarded by `compose-collapse.test.ts` (survives reorder + delete).
- **Finding 4 — MAJOR, FIXED.** Register buttons on a locked slide dispatched a doomed transaction
  (silently filtered) with no feedback — and were a vector for Finding 1's clobber. Fixed: `applyRegister`
  short-circuits to a no-op on a locked slide, and the gutter/rail buttons **disable** (`caretInLockedSlide`).
- **Finding 7 — MINOR, FIXED.** "Note" on a `— …` paragraph that wasn't the slide's last block was a
  dead-end. Fixed: it relocates to the slide end so it becomes the recognized trailing note.
- **Finding 2 — MAJOR, LOGGED (off-path).** A parked external change is dropped whenever the user types
  again, even for a NON-conflicting edit (the "favor the typing author" design nulls the parked snapshot
  instead of merging). A real fix needs a 3-way source merge — its own change, out of scope here
  (HARD RULE #18: off-path → log). **Follow-up: reconcile parked external edits by dimension.**
- **Finding 5 — MINOR, LOGGED.** Typing over a cross-slide selection is correctly prevented by the guard
  but is a silent dead keystroke. **Follow-up: a visual cue.**
- **Finding 6 — MINOR, LOGGED.** On a multi-block range selection the detector reads the first block while
  the command acts on the whole range (partial apply — no corruption; the `stable()` sweep confirms valid,
  un-nested output). **Follow-up: operate on, or no-op, the range consistently.**

Checked and sound (no action): `moveToSlideEnd` position math, `emitDeck` node-identity reuse across
move/insert/delete, the cross-slide `slideContext` bail, the `hr`/bullet serializer overrides.

## Slice 2 — consolidation + typing mode (landed)

On-device, even with the rail lifted, three persistent top bands (app header, deck-actions, the EDIT
toolbar) still ate the top half of the screen *while typing* — "not usable with so many toolbars." Two
moves fixed it:

1. **Consolidate to two resting bands.** The in-pane EDIT toolbar band is now `!mobile` (hidden on the
   phone); its actions relocated: the **Markdown⟷Compose toggle → the deck-actions bar** (edit pane —
   the default mode is Markdown, so the toggle can't be buried), and **Insert / Fix-all / Version
   history → the `⋯` menu** (edit-pane section). Phone rests at header + deck-actions, not three bands.
2. **Typing mode (the reversed decision).** When the software keyboard is up, the two remaining top
   bands **collapse** (`max-height`/opacity/transform transition) so the writing surface takes the
   screen; only the grammar rail rides the keyboard. **Scroll is the reveal driver** — `ComposeView`
   watches the host scroll + the `useVisualViewport` inset and reports `onTypingCollapse`: opening the
   keyboard collapses; scrolling UP reveals; scrolling down re-hides.

**Why this reverses the earlier "keep chrome always visible" call (and why it's safe).** The Munger
inversion had rejected the *contextual* model on the grounds that hiding chrome makes controls
reachable ONLY with the keyboard up (a trap, incl. iPad hardware keyboards). That objection is
answered by making the trigger symmetric: chrome is fully present when the keyboard is DOWN, and a
single scroll-up (or keyboard dismiss) restores it when UP — so nothing is unreachable, and a hardware
keyboard (no `inset`) simply never collapses. The user chose this after living with the dense stack.

**Verified in-sandbox:** resting phone shows two bands with a working Compose toggle and the `⋯`
Editor section; a mocked `visualViewport` keyboard collapses both bands to 0 height / opacity 0 and the
writing surface fills. Desktop/tablet unchanged; typecheck + 1732 tests + biome clean. **UNVERIFIED on
real iOS** (HARD RULE #23 — no software keyboard in the sandbox): the collapse/reveal feel across the
keyboard animation and the scroll-direction thresholds need a device pass.

## Slice 3 — the divider → slide-settings gear (landed)

The user's original ask ("I like the divider toolbar, it should house the slide settings"). The
`SlideView` bar's move zone gains a **⚙** (`sliders-horizontal`): on click it reads its own full-deck
`index()` and calls a ref-backed `onOpenSlideSettings(index)` threaded through the `nodeViews` factory.
StudioShell's `openSlideSettings(fullIdx)` binds the inspector to that slide **before** opening
(`setActiveSlide` → `setInspectorScope('slide')` → `setInspectorOpen(true)`) so it targets the caret's
slide, not the filmstrip's (`activeFullIndex` tracks the preview). **Lens −1 guard:** if the tapped
slide is filtered out of an active reader lens (`viewSlides.indexOf(slides[fullIdx]) < 0`), it drops the
lens back to `full` and selects the full index rather than silently editing the previously-active slide
(red-team M2). The mobile inspector `Sheet` moved from `side="right"` to a `side="bottom"` sheet
(thumb-reachable); tablet/desktop open the docked inspector (a free in-context shortcut — the gear shows
on every breakpoint). Reuses `SlideContextBody`/`inspectorScopeContent` verbatim (HARD RULE #15).

Verified in-sandbox (mobile 390, Compose): the gear renders in the active slide's divider and opens the
bottom settings sheet at **Slide scope** ("Editing Slide 1 only"). Typecheck + 1746 tests + biome clean.

**Follow-up (not blocking):** focus/selection restore on Sheet close (Track 4 graft) — opening the Radix
Sheet blurs the editor; on close the user taps back in. Seamless "adjust a setting, keep typing" would
snapshot the `TextSelection` on gear-tap and `view.focus()` + restore on close (a ComposeView↔shell
signal). Deferred as polish.

## Slice 4 — the divider IS the slide's control bar; retire the formatting rail (landed)

Living with slice 1–3 on-device, the user rejected the very idea of a separate formatting toolbar
("having a formatting toolbar is a horrible idea"). The direction: **fold every per-slide control
onto the divider itself.** The keyboard-riding rail — slice 1's whole mechanism — is retired; with
formatting on the divider there is no bottom bar for the keyboard to occlude, so the occlusion
problem it solved no longer exists. This is the cleanest possible resolution of the original
complaint, reached by removing the surface rather than positioning it.

**The one control bar.** Each slide's top divider line goes **full-width** and carries the slide's
controls in four role-tinted groups that sit *on* the line (each group's background masks the rule
behind it), shown only when the caret is inside that slide (`cs-slide-active`):

- **State** — the collapse toggle, now a **chevron** (▾ expanded / ▸ collapsed) that reads as state
  the way VS Code / editor folding does, replacing the old resize-look glyph that gave no indication
  of the current state.
- **Format** — the **context-sensitive** registers (below).
- **Slide** — insert-below (`+`) · slide settings (`⚙`, the slice-3 gear).
- **Danger** — delete, with an **in-place two-step confirm** ("Delete?" + ✓/✕, 4 s auto-cancel),
  matching the app's other delete actions instead of deleting on a single tap.

**Removed:** the slide **move up/down** buttons (reorder lives in the filmstrip), the persistent
left **grammar gutter** *and* the mobile **keyboard rail** (both replaced by the divider Format
group), and the whole `use-visual-viewport` *rail-geometry* path (the hook stays only for the
typing-mode chrome collapse). Net: one bar, no floating chrome, no gutter column.

**Truly context-sensitive Format.** The user asked that the format icons reflect "the needs of the
slide itself," not a fixed six-button strip. A new kernel export `applicableRegisters(state)`
(`registers.ts`) returns exactly the registers that can *validly render* from the caret's top-level
block — no-ops are **hidden, not dimmed**:

| Caret block | Format group |
|---|---|
| heading | `H1` `H2` (toggle level / off) |
| plain paragraph | `H1` `H2` `❦` `—` |
| paragraph adjacent to a heading | above **+** `·e·` (before) / `·s·` (after) |
| blockquote (Key-insight) | `❦` (toggle off only) |
| **list / table / other container** | **∅ — group hidden** |

That last row is the structural payoff of the `- > > > >` fix (slice-1 follow-on): a list can render
*no* register, so the Format group is **empty** and there is **no Key-insight button to tap** — the
infinite-nesting vector is not just guarded but absent from the UI.

Because the applicable set changes as the caret moves *between blocks within one slide* — a move no
node- or outer-decoration change signals — a small **`formatSyncPlugin`** (a plugin `view()` update
hook over a `liveSlideViews` registry) re-runs each live `SlideView.syncFormat()` on every state
change; a signature check skips DOM churn when the set is unchanged.

**On-brand group tints.** State/slide read neutral (accent on hover); danger is `--fail` red; the
Format registers are `--accent`-tinted and lit (`cs-fmt-on`, inset ring) when active — so the groups
are legible by role at a glance, per the ask for "different on-brand colors based on group/context."

**Verified on the real surface** (built docs, real Playground, real `page.mouse` clicks that move
the ProseMirror selection — a DOM range does not, HARD RULE #23), at **1440 px and 390 px**:
- Format group tracks the caret across block types — heading→`[H1,H2]`, paragraph→`[H1,H2,❦,—]`,
  code-label-after-heading→`[H1,H2,·s·*,❦,—]`, blockquote→`[❦*]`, **list→`[]` (hidden)**.
- Delete shows the in-place "Delete?" confirm; cancel restores it (slide count unchanged).
- Collapse toggles `cs-collapsed` and flips the chevron (down→right).
- Clicking `H2` on a plain paragraph turns it into an `h2` heading (apply works end-to-end).
- Delete a **locked** slide: injected a table slide (locked in Compose), the trash now shows the
  "Delete?" confirm and confirming removes it (2→1 slides) — see the maker-checker fix below.
- Divider renders full-width with grouped, role-tinted controls; touch targets enlarge to 26–28 px
  on the phone. `registers.test.ts` 18 cases (incl. context-sensitivity + locked-slide) pass.

### Maker-checker pass (fixes folded in before merge)

An independent checker bug-hunted the diff (the `liveSlideViews` sync plugin, `applicableRegisters`
vs `applyRegister`, the signature-gated rebuild, the inline-confirm delete, removed-code residue).
Core machinery came back clean — no leak in the module-level `liveSlideViews` Set (constructor adds,
`destroy()` removes, and `EditorView.destroy`/`updateState` retire node views synchronously), no
cross-view corruption (each `syncFormat` reads its *own* `this.view.state` and early-returns when
inactive), no stale-`active` signature collision (`active` is part of the sig), and no dispatch loop
(`syncFormat`/`resetDelete` are read-only DOM ops inside `ignoreMutation`'s guarded `ctrl`). Fixes:

- **Locked-slide delete was a dead button (regression) — FIXED.** `askDelete` early-returned on a
  locked slide, so its trash rendered but did nothing — and *worse*, the pre-divider bar could delete a
  locked slide (a whole-slide removal is a structural `slideOp`, waved through by the guard *before* its
  locked check, not a content round-trip). Removed the guard; verified on the real surface (above).
- **Dead `caretInLockedSlide` export removed** (registers.ts) — its only consumer (the gutter/rail
  disable) is gone; the divider now expresses "locked → no registers" through `applicableRegisters`
  returning `[]`. (HARD RULE #18 — a window the change itself broke.)
- **Orphaned `--cs-vv-top` / `--cs-vv-height` writes removed** from `use-visual-viewport.ts` — their
  only consumer was the retired rail's `top: calc(…)`. The hook now publishes only `--cs-kb-inset`
  (caret reserve + typing-mode collapse); comments updated to match.

**Logged, not fixed (checker MINOR, off the clean path):** a code-label paragraph adjacent to *no*
heading (`\`code\`` as a whole paragraph after its heading is deleted) renders as neither eyebrow nor
subtitle, so `applicableRegisters` offers neither and its code mark can only be cleared in Markdown
mode. Not a correctness bug; adding a positionally-mislabeled toggle risks its own wart, so it's a
**follow-up:** offer a "clear label" affordance for an orphan code label rather than an `·e·`/`·s·`
button that wouldn't match how the engine renders it.
