---
status: shipped
summary: >
  SPIKE (#1751) closed with a partial split, not a registry. Measured: of
  StudioShell's ~600KB gz eager JS, ~24% is recoverable by splitting one
  named feature at a time (another ~12% is held jointly by 2-3 features and
  only falls out when the last one splits), and a bare majority is genuinely
  shared infrastructure no per-feature registry would touch. Prototyped and
  shipped the one safe, tested candidate — PresentOverlay behind React.lazy,
  gated on first open — for a measured -23.8KB gz (-3.7%, 649.5 -> 625.7KB,
  59 -> 57 chunks), zero regressions across 29 real e2e tests. The two
  highest-leverage-looking source-level findings both turned out NOT to be
  safe one-line fixes on closer inspection — recorded here so nobody
  re-discovers them and ships the same mistake. Recommendation: partial
  split, no general registry. StudioShell.tsx's own source is ~9% of the
  eager bundle and irreducible by any import strategy.
---

# The StudioShell coupling spike: registry, partial split, or leave it

**Status:** shipped — the decision, the one prototyped-and-kept split, and the ledger
update. Closes #1751.

This is a spike. The deliverable is this decision, not a refactor. Per the issue's own
acceptance criterion 4: "Leave it is a legitimate outcome if the measured win doesn't
cover the mount-ordering risk... say so and close this card." The measured win **does**
cover the risk for exactly one candidate (PresentOverlay), which is shipped in this same
PR. It does not for the rest, including the two findings that looked like the biggest
levers at first read. No general registry is being built.

---

## The short version

`StudioShell.tsx` is 5,025 lines (was 4,757 when #1751 was filed) with 100 static
top-level imports feeding an eager JS bundle that — after #1727's seven fixes — sits at
649.5KB gz against a 661.3KB budget, 11.8KB of headroom. The issue's thesis: "the eager
set is the shadow of [StudioShell's] import list, so eager is the default for every new
feature." That is directionally true but the magnitude is smaller than it looks:

- **~24% of eager JS is recoverable by splitting one named feature at a time** (measured
  against today's real static closure, source-byte estimate calibrated against two real
  built chunks). Splitting **all 19** of StudioShell's directly-imported feature/picker
  modules would recover at most **~36%** — but a third of that gap (~12 points) is held
  **jointly** by 2-3 features and doesn't fall out until the *last* holder is also split,
  which breaks the premise of an independent opt-in registry.
- **7 of the 19 named imports recover literally nothing standalone** — each is also
  reachable through a different eager path that survives any single split (§3).
- **`StudioShell.tsx`'s own source (~161KB code, ~9% of eager raw bytes) is irreducible**
  by any import-list strategy — it doesn't go away no matter what gets lazy-loaded out of
  it (§3).
- One candidate — **PresentOverlay** — was genuinely safe to split (no imperative handle,
  no synchronous-gesture API, tour/command-palette paths already tolerate async). **It is
  shipped in this PR**: -23.8KB gz measured, -2 chunks, 29 real e2e tests green (§4).
- Two more candidates looked like bigger, cheaper wins on a first source-level read.
  **Both were wrong once checked against how the byte gate and the code actually work**
  (§5) — the more interesting finding of this spike, and the reason "prototype and
  measure" beat "read the import graph and recommend."

**Recommendation: partial split, not a registry.** §6.

---

## 1. Current shape, re-verified

Measured on this branch at `b03b3bd` (current `main` at spike time), before any change
in this PR:

| | #1751 filing (`695dcd7`) | Today (`b03b3bd`) |
|---|---:|---:|
| `StudioShell.tsx` lines | 4,757 | **5,025** |
| Static top-level imports | 96 | **100** |
| `React.lazy` boundaries | 3 (Fabricate, Editor, ComposeView) | **3** (same three) |
| Studio route eager JS (gz) | — | **649.5KB** / 661.3KB budget |
| Studio route chunks | — | **59** |

The file grew ~270 lines and gained 4 more static imports in the six days since #1751 was
filed — consistent with "eager is the default," not a one-time debt.

**Feature modules StudioShell names directly** (line, current length):

| Module | Line | Lines |
|---|---:|---:|
| WorkspaceSheet.tsx | 103 | 1,281 |
| PresentOverlay.tsx | 78 | 1,412 |
| SlideContext.tsx (`SlideContextBody`) | 83 | 843 |
| SlidePicker.tsx | 84 | 650 |
| Library.tsx | 71 | 620 |
| ArchitectChat.tsx | 42 | 549 |
| CommandPalette.tsx | 46 | 543 |
| StudioDrawer.tsx | 85 | 500 |
| LensesPanel.tsx | 69 | 385 |
| ShareSheet.tsx | 82 | 249 |
| CrashReportSheet.tsx | 48 | 309 |
| AcronymEditor.tsx, CatalogSelect.tsx, FinishPicker.tsx, IntentTag.tsx, LanguageSelect.tsx, ReshapePicker.tsx, ThemePicker.tsx, lens-picker.tsx | various | smaller (30-150) |

**Scope correction carried over from the issue** (already narrowed there, restated so
this doc doesn't need the audit open beside it): of #1727's seven fixes, only three
(chat-highlight, the Fabricate cores, ComposeView) were coupling in this sense. The other
four were a data-placement decision (the 312KB catalog inlined into the HTML) and a
declaration problem (`@font-face` + `settleFonts` force-loading every declared face). No
amount of import-list decomposition would have found those, and this doc's scope is the
JS eager set only.

---

## 2. Method: walking the static closure, and where a naive walk is wrong

`docs/dist/chunk-graph.json` (Rollup's own `OutputChunk` metadata, emitted by
`astro.config.mjs`'s `chunkGraphPlugin`, deleted by `inject-modulepreload.mjs` during
`npm run build`) gives chunk-level `imports` / `dynamicImports` / `moduleIds` — but
`moduleIds` is a **flat array per chunk with no per-module edges**. Nearly the entire
eager set bundles into **one** chunk (`StudioIsland.<hash>.js`, ~600KB gz), because it's
all reachable from one `client:only` island entry with no other consumer forcing a split.
A chunk-level walk therefore cannot answer "how much of the eager set is attributable to
feature X" — that question has to be answered at the **source** level: for each named
feature, read its own imports and classify each dependency PRIVATE (reachable only
through that one feature) or SHARED (also reachable from StudioShell directly, another
feature, or non-Studio code), by grep-searching all importers.

**Two mechanisms a naive source-level walk misses, both of which mattered here:**

1. **`eagerDynamicImportSuffixes`.** `inject-modulepreload.mjs`'s walk is static-imports-
   only, *except* one explicit allowlist entry: `src/playground/authoring-core.generated.js`
   (CodeMirror's lint kernel), because `Editor.tsx`'s `linter()` extension loads it
   automatically on every real mount — not gated by user action, so excluding it the way
   every other dynamic import is excluded would misrepresent what actually ships. Anything
   reached by a **dynamic** import of that one module, from **any** chunk already in the
   static closure, gets walked in too. A source-graph estimate that only follows static
   edges will not know this and can overstate what a static→dynamic conversion recovers
   (§5.1).
2. **Rollup's own chunk-splitting decision.** A module reached by both a static and a
   dynamic importer usually gets its own chunk (so the dynamic path keeps working) — but
   not always; see §5.2, where the module stayed inlined into the monolith because nothing
   else forced a split.

Both are exactly the kind of thing "prototype and measure" catches and "read the import
graph" does not.

---

## 3. Attribution: how much is feature-named vs. genuinely shared

Source-level closure over `docs/src/**`, deleting one `StudioShell → feature` edge at a
time and recomputing reachability (excludes type-only imports, which erase at build time
and would otherwise mis-classify 7 modules). Calibrated to gz via two real built chunks
(PresentOverlay 114,098 code bytes → 26,310 gz; Fabricate 126,942 → 29,953 gz; **0.233 gz
per code byte**, both first-party JSX-heavy subtrees — the factor is less reliable for a
vendor-heavy split, flagged per-row below).

| Feature | own lines | recoverable (est gz) | private deps | shared deps touched |
|---|---:|---:|---:|---:|
| ShareSheet.tsx | 249 | 52.4KB | 9 | 86 |
| WorkspaceSheet.tsx | 1,281 | 30.0KB | 11 | 102 |
| **PresentOverlay.tsx** | 1,412 | 26.6KB (est) / **23.8KB measured** | 13 | 99 |
| SlideContext.tsx | 843 | 14.3KB | 3 | 34 |
| SlidePicker.tsx | 650 | 7.4KB¹ | 2 | 65 |
| LensesPanel.tsx | 385 | 3.6KB | 0 | 17 |
| StudioDrawer.tsx | 500 | 2.6KB | 0 | 13 |
| CommandPalette.tsx | 543 | 2.2KB | 1 | 9 |
| CrashReportSheet.tsx | 309 | 1.8KB | 0 | 8 |
| ReshapePicker.tsx | 118 | 1.1KB | 0 | 42 |
| AcronymEditor.tsx | 143 | 0.9KB | 0 | 3 |
| IntentTag.tsx | 30 | 0.3KB | 0 | 1 |
| Library, ArchitectChat, ThemePicker, lens-picker, CatalogSelect, LanguageSelect, FinishPicker | — | **0 each** | 0 | reached elsewhere |

¹ Under-counts by ~6KB: SlidePicker's private `@/lib/component-search` carries
`fuse.js` + a stemmer as its own chunk, measured 13.4KB gz — bigger than the source-byte
model predicts, because that chunk is nearly all vendor code the calibration factor
under-weights.

**Marginal sum (split one at a time): ~143KB gz, ~24% of the ~588KB eager baseline used
for this table.** (Baseline here is pre-PresentOverlay-split, 587.9KB gz measured — very
close to, but not identical to, the route-budget gate's 649.5KB, which counts a few
additional non-Studio-Shell-sourced eager chunks the source graph doesn't attribute to any
feature.) **All 19 split together: ~212KB gz, ~36%** — but ~69KB gz of that (~12 points)
is held by **two or more** features simultaneously (the narration/speech/export stack:
`read-along-core.generated.js`, `read-aloud.ts`, `share-export.ts`, `lib/suono/*`,
`lib/cadenza/*`, `narration-store.js`, `tts-voice-catalog.ts` — held between PresentOverlay,
WorkspaceSheet's TTS settings, and ShareSheet's NarrationExportOptions) and shows **zero**
payoff until the *last* holder of each module is also split. That is a real problem for an
"opt-in registry" model, which implicitly assumes each entry is independent: splitting
PresentOverlay alone, as shipped here, does **not** touch this shared tier at all (confirmed
in §4 — none of the 14 modules that left the eager set are in this joint-held group).

**Seven of the nineteen recover nothing standalone** because each is reachable through a
second eager path: `Library` via `WorkspaceSheet.tsx:27`; `ArchitectChat` via
`coach/FindingCard.tsx:4` (itself a **direct** `StudioShell.tsx:52` import, so
`ArchitectChat` stays eager even after full decomposition of everything else);
`CatalogSelect`/`FinishPicker` via `SlideContext.tsx:27,29`; `LanguageSelect` via
`WorkspaceSheet.tsx:26`; `lens-picker` via `PresentOverlay.tsx:29`; `ThemePicker` via
`StudioDrawer.tsx:43`. Rewriting StudioShell's own import list to a registry is a no-op
for these unless the shared holder is *also* converted.

**`StudioShell.tsx` itself is 348,890 bytes / ~161KB code — ~9% of eager raw source — and
none of it is recoverable by splitting anything else out of it.** The next-largest
irreducible survivors: `architect.ts` (104KB), `lib/single-slide-render.ts` (100KB),
`lib/crash-sentinel.ts` (94KB), `lib/vetrina/stage.ts` (92KB), `studio-store.ts` (60KB).
This is the ceiling on what any import-strategy change can achieve: the file is genuinely
large on its own terms, not only because of what it names.

**Caveats.** Except for PresentOverlay (measured) and Fabricate (measured, used only for
calibration) every gz figure in this table is an estimate from source bytes, not a
measurement — Rollup tree-shaking isn't modeled (the built eager closure ran ~9% smaller
than the naive prediction for the same state, so these figures skew high) and vendor
weight is absorbed only proportionally (footnote 1 is the one place that broke). Treat the
percentages as directionally right, the KB figures as ballpark.

---

## 4. The prototype: PresentOverlay behind React.lazy — shipped

**Why this one.** Already `if (!open) return null` (line 1143) — the pattern Fabricate,
Editor and ComposeView already established. Checked for the hazards those three splits
had to handle, and PresentOverlay has none of them:

- **No `forwardRef`/`useImperativeHandle`.** Unlike Editor (`editorRef`) and ComposeView
  (`composeRef`), StudioShell never holds a ref into PresentOverlay — it's plain
  props-in/callback-out. Nothing to forward across the lazy boundary.
- **No synchronous browser-gesture API.** Opening Present is a plain `setPresentOpen(true)`
  state flip (`StudioShell.tsx:568`). The one thing in this feature that touches a
  gesture-gated browser API — the presenter window, `window.open()` in
  `present/presenter-window.js:465` — fires from a **separate**, later user action
  (opening the presenter view once already inside Present), not from the initial click, so
  deferring the initial mount cannot break it.
- **Tour and command-palette paths already tolerate async.** `CommandPalette`'s `onPresent`
  is just `openPresent` (a state setter) — mount timing is invisible to it. The
  self-driving tour's `present()` step (`tours/tour-kit.ts:206-209`) clicks, then
  **`settle: 2000`** before advancing — already built to tolerate a chunk load, since it
  was already tolerating Editor/ComposeView/Fabricate's identical pattern.

**The change.** `PresentOverlay` becomes `React.lazy`, matching the existing three. Unlike
Editor/ComposeView (which mount unconditionally on Studio load because they're the default
pane, deliberately warming their chunk early — see `2026-07-19-defer-editor-hydration.md`),
PresentOverlay had no reason to warm early: most sessions never open Present. So the render
site is gated on `presentOpen || presentEverOpened` (a one-way latch that flips true on
first open and never resets, added beside the existing `presentOpen` state), wrapped in
`<React.Suspense fallback={null}>`. First "Present" click fetches the chunk; every
subsequent open/close reuses the already-resolved module, matching Editor/ComposeView's own
"cached after first load, never re-suspends" behavior. `StudioShell.tsx` diff: +22/-2
lines. (This PR's `chrome-parts.tsx` change is unrelated — an off-path `EditorSkeleton`
a11y fix, not part of this split.)

**Measured delta** (same-session interleaved measurement, full `npm run build` pipeline,
both arms):

| | Before | After | Δ |
|---|---:|---:|---:|
| Studio eager JS (gz) | 649.5KB | **625.7KB** | **-23.8KB (-3.7%)** |
| Studio route chunks | 59 | **57** | -2 |
| Own-source modules in eager closure | 221 | **207** | -14 |

The 14 modules that left the eager set: `PresentOverlay.tsx`, `PresentCaption.tsx`,
`PresentRail.tsx`, `ReadAloudOverlay.tsx`, `SlideOverview.tsx`, `present-guide.ts`,
`present-rail-tiers.ts`, `present-sections.ts`, `present/presenter-window.js`,
`present/rehearsal.js`, `readiness-window.ts`, `studio-presenter.ts`, and — a genuine
surprise — `diagnostics/Sep.tsx` and `diagnostics/diagnostic-overlay.tsx`, pulled in only
through `ChartDetailLayer`, which turns out to be reached in the Studio eager graph
*exclusively* through PresentOverlay's chart-detail overlay. **Zero modules joined the
eager set** — the change didn't accidentally pull anything new in.

23.8KB is smaller than this doc's own §3 estimate (26.6KB) and much smaller than the
original audit's `(est)` figure for "Present mode" (~44KB, §6 of
`2026-08-17-studio-dynamic-loading-audit.md`) — both were source-byte projections; this is
the real number.

**Real-surface verification** (HARD RULE #23 — not a unit test): built the docs site with
this change, ran the actual e2e suite against the real built Studio —
`present.spec.ts`, `present-beat.spec.ts`, `present-guide.spec.ts`, `presenter-zoom.spec.ts`
(19 passed, 3 skipped — mobile/touch-only project variants not run here), plus
`demo.spec.ts`, which drives the **real self-driving tour end to end**, including the
`present()` step specifically (10 passed). **29 real e2e tests, 0 failures, 0 skips beyond
project-scoped variants.** `check:studio-shell` (pre-paint skeleton) and `typecheck` both
clean.

**`docs/route-budget.json` ratcheted down** per the repo's own stale-budget convention:
`studio.eagerJsGz` 677,200 → 659,985 (measured 640,762 + ~3% headroom), so the win is
banked and the gate's 5% stale-slack doesn't immediately re-trip. Verified green:
`eagerJsGz 625.7KB / 644.5KB budget`.

**Conclusion: this one is shipped, in this PR, as the concrete answer to the issue's
acceptance criterion 2** ("does a registry pay for itself" — for this one feature, yes,
cleanly).

---

## 5. Two findings that looked bigger and cheaper — and were wrong

The source-level attribution in §3 surfaced two apparently very cheap, very high-value
fixes. Both fell apart on verification. Recorded here in detail so nobody re-discovers
them from the source graph alone and ships the same mistake — this is the actual
highest-value output of "prototype and measure" over "read the import graph and
recommend."

### 5.1 `PrintOptionsPanel.tsx:36` statically imports `authoring-core.generated.js` — looks like 78KB gz, recovers 0

`PrintOptionsPanel.tsx:36` (`import { notesCore } from '@/playground/authoring-core.generated.js'`,
reached via `ShareSheet.tsx:14`) looked, on a first source-graph read, like a single cheap
static→dynamic conversion away from recovering the whole chunk — real and large:
**198,368 raw / 78,409 gz, independently measured** off the built `dist/` (not an estimate).

**It doesn't work — this module is held eager by two independent mechanisms, not one.**
First: it is **not** actually PrintOptionsPanel's alone. `architect.ts:18`
(`import { deckCanon } from '@/playground/authoring-core.generated.js'`, used at `:77`) is
a second, ordinary **static** value import of the same module — and `architect.ts` is
itself statically imported at `StudioShell.tsx:43` and is §3's largest irreducible
survivor in its own right. Converting only PrintOptionsPanel's import would leave
`architect.ts`'s static edge in place and recover nothing. Second, independently:
`coach/coach-core.ts` — also statically imported, at `StudioShell.tsx:51` — dynamically
imports the same module (`coach-core.ts:29`), and that suffix is the **one entry** in
`inject-modulepreload.mjs`'s `eagerDynamicImportSuffixes` allowlist, specifically because
CodeMirror's linter loads it automatically on every real mount. Verified directly against
`chunk-graph.json` (not inferred): the built monolith chunk's `imports` (its static-only
edge set) already includes `authoring-core.generated.<hash>.js` outright, and its
`dynamicImports` separately carries three more edges to it. **Fixing PrintOptionsPanel's
import — or even PrintOptionsPanel's *and* architect.ts's — would not move the eagerJsGz
number**, because the allowlist mechanism holds the chunk eager regardless. It would be a
legitimate style-consistency cleanup (matching `share-export.ts:327,868` and
`Editor.tsx:21`, which already use dynamic `import()` for the same module), but the byte
case is nil under current policy, and the allowlist itself is a deliberate,
already-justified decision (`inject-modulepreload.mjs:54-60`) — not something to casually
unwind here.

### 5.2 `WorkspaceSheet.tsx:3` statically imports `architect-model.js` for one predicate — real, but not a one-liner

`WorkspaceSheet.tsx:3` imports `orSupportsCache` from `@/components/studio/ai/architect-model.js`
— the AI provider/model layer, otherwise always reached dynamically (`architect.ts:251`,
`import('@/components/studio/ai/architect-model.js')`, cached in a module-level
`modelPromise`). Unlike §5.1, this module is **not** on the `eagerDynamicImportSuffixes`
allowlist and is **not** protected by any other static edge — confirmed against
`chunk-graph.json`: it's inlined directly into the monolith chunk's `moduleIds` with no
separate chunk, and no import edge to it exists anywhere else in the static closure. This
one is real.

**But it isn't a safe one-line swap.** `orSupportsCache(ai.modelId ?? '')` is called
**synchronously**, inside a render-path computation at `WorkspaceSheet.tsx:273`
(`cacheUsable = ai.openRouterReady && orSupportsCache(...)`), to decide what the Workspace
settings UI shows on first paint. `architect.ts`'s own dynamic-import pattern works
because callers of `architectModel()` already expect a `Promise`; `orSupportsCache` is a
plain synchronous predicate with no async-tolerant caller today. Making the import dynamic
means either (a) splitting `orSupportsCache` out of `architect-model.js` into its own
tiny, provider-network-free module (real, bounded refactor — the predicate is almost
certainly a pure string/pattern check that doesn't need the rest of the file) or (b)
restructuring `WorkspaceSheet`'s render to tolerate an async-resolved `cacheUsable`,
risking a flash of the wrong badge state on first paint. Neither is a "prototype in an
afternoon" change, and this spike's job was to measure, not to open a second feature
branch.

**Logged, not fixed here** (HARD RULE #18, off-path for this PR): filed as #1773 with
this exact scoping, rather than shipped speculatively.

---

## 6. What genuinely shared state would an async mount boundary reorder

The issue named the hard cases directly: imperative handles (`composeRef`/`editorRef`-style)
and anything a tour or command-palette action drives.

- **Imperative handles.** Checked all 19 named feature/picker imports for
  `forwardRef`/`useImperativeHandle`: **none of them carry one.** The only match anywhere in
  this set is an *internal* `forwardRef` inside `StudioDrawer.tsx:124` (a local `Door` button
  primitive) — StudioShell holds no ref into `StudioDrawer` itself. The imperative-handle
  hazard that made Editor/ComposeView's splits non-trivial (needing the "a `React.lazy` over
  a `forwardRef` component still forwards `ref`" reasoning, `StudioShell.tsx:122-124`) simply
  does not apply to any of the remaining candidates. That hazard is already-solved territory.
- **Tour actions.** Verified directly (§4): the self-driving tour's `present()` step already
  budgets a 2000ms settle after its click, and the full walkthrough passed live against the
  actual lazy-loaded PresentOverlay. Nothing in `tours/tour-kit.ts` assumes synchronous
  mount for any of the other named features either — every tour step that opens a panel goes
  through the same `act: (a) => a.openXxx(true)` + `settle` shape. The one piece of state
  StudioShell shares with every docked panel — `ActivityRailState`'s `assistant`/`settings`
  slots (`chrome-parts.tsx:223-231`) — is only the panel's *open/closed identity*, orthogonal
  to whether the panel's own component is lazy-loaded.
- **Command palette.** Every `onXxx` callback the palette drives (`onPresent`, `onShare`,
  `onLibrary`, `onWorkspace`, ...) is a plain state setter (`CommandPalette.tsx:13,64`,
  `StudioShell.tsx:4022`) — none of them read anything back from the panel component itself,
  so none are sensitive to when the panel's module resolves.

**Net finding: the "what breaks" risk named in the issue is real for Editor/ComposeView
specifically (already handled, already shipped) and does not generalize to the remaining
candidates.** The actual constraint turned out to be §3's joint-ownership problem and
StudioShell's own irreducible size, not mount-ordering hazards.

---

## 7. Recommendation

**Partial split. No general opt-in registry.**

- **Ship PresentOverlay's `React.lazy` split** (§4) — done, in this PR. Real, measured,
  tested win; zero identified regression; matches an already-3x-proven pattern in this
  exact file.
- **Do not build a registry abstraction** for the remaining 18 named imports. The evidence
  against it: 7 of 19 recover nothing standalone (§3) so a registry entry for them is a
  no-op without also touching their shared holder; ~12 points of the theoretical 36% total
  is held jointly and only pays off on full, coordinated multi-feature migration, which is
  a materially larger and riskier program than "wrap each in `React.lazy`"; the two
  apparently-cheapest wins outside PresentOverlay both failed verification (§5); and
  StudioShell's own source is 9% of eager bytes and untouched by any of this. A registry's
  main promise — "eager stops being the default" — would still leave `StudioShell.tsx`
  itself, `architect.ts`, `single-slide-render.ts`, `crash-sentinel.ts` and `vetrina/stage.ts`
  (the five largest survivors, §3) exactly as eager as today, because they aren't imports of
  a feature, they're infrastructure the features and the shell both depend on.
- **Follow-up filed: #1773** for §5.2 (`orSupportsCache` / `architect-model.js`) — real,
  bounded, but needs its own scoping (split the predicate out, or restructure the sync
  read), not a speculative fix in a spike PR.
- **Leave §5.1** (`PrintOptionsPanel` → `authoring-core.generated.js`) as a documented
  non-issue — no byte win available under the current allowlist policy; a style-consistency
  cleanup only, not worth its own issue.
- **Leave the other 16 named imports alone.** Each is individually small (0.3-14KB gz,
  §3), and per the original audit's own §8 con column, "each boundary needs a loading state
  that doesn't feel broken" — not worth the per-feature Suspense/skeleton UX cost for
  single-digit-KB wins with no coordinated joint-ownership payoff.

This closes #1751.
