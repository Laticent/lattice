---
status: in-progress
summary: >
  What React renders before the Studio's first slide on the phone profile, by subtree, from a React profiling build and
  a CPU profile split by React phase. React's three phases are about 0.9 s of the 4.0 s of main-thread work before the
  slide. Half of the render phase is StudioShell's own body (about 270 ms), including a boot-time deck list that
  builds a full index of every saved deck; a further ~110 ms billed to React's renderWithHooks is V8 compiling
  component code on first call, not hook work (a production trace puts V8 compile at a median 145 ms of the 249 ms
  hydration task, and ~1.04 s before the slide in all). Mounted subtrees the phone does not show cost about 70 ms,
  the tooltip wrappers on the icon bar about 25-40 ms, and a forced layout in a ref callback about 45 ms (likely moved,
  not saved). The profile itself changed no shell code. New tool: docs/scripts/react-mount-profile.mjs. A tier-1 checker
  reviewed the method and the numbers; its corrections are folded in. Levers 1 and 2 were built the same day (§5-§7):
  lever 1 removed ~50-65 ms of render before the slide; lever 2 removed ~140 ms of CPU for an author with sixteen
  saved decks and nothing measurable on a first visit, since most of row 1a's cost was a first parse that the open
  deck pays anyway.
---

# Mobile Studio: what React mounts before the first slide, ranked (2026-11-09)

Followup `2868-p1` and `2026-11-08-studio-phone-editor-after-pause.md` §6 item 1 asked for this: "a React profiling
build to find which subtrees mount before the slide and are not on screen on a phone". This note is that list. It
changes no shell code. Each lever below still needs its own measured A/B before it ships.

## 1. How it was measured

- **Build.** `LATTICE_REACT_PROFILE=1 npm run build:e2e` (from `docs/`). The flag makes `astro.config.mjs` alias
  `react-dom/client` to `react-dom/profiling` and turn minification off so components keep their names. A normal build
  never sets it and its bytes are unchanged.
- **Profile.** `docs/scripts/react-mount-profile.mjs` loads `/studio/` on startup-bench's phone profile (390x844, touch,
  4x CPU, 80 ms latency, 6 Mbit/s, a cold context each run), served by `npm run preview:e2e`. Run with
  `CPU=1 RUNS=7 DEPTH=7 MIN_MS=5`. "First slide" is the same signal startup-bench uses: the preview frame holds a
  `.lattice` document.
- **Render phase, per subtree.** The script installs a small `__REACT_DEVTOOLS_GLOBAL_HOOK__` before any page script.
  After each commit it adds every fiber that rendered in that commit to each named component above it, using the
  fiber's `selfBaseDuration`. It skips subtrees React bailed out of, as React DevTools does. That gives INCL (the whole
  subtree) and SELF (the component plus the host nodes it renders directly). `selfBaseDuration` times `beginWork` only;
  each host node's `completeWork` (creating or claiming its DOM node) is left out. The CPU profile puts that at ~16 ms
  in total, so it does not reorder the rows.
- **Commit and effects, per caller.** The fiber timings cover only the render phase. A CDP CPU profile (200 µs sampling)
  covers the rest. The script bills each sample to the innermost React phase on its stack (render, commit or passive
  effects), and within that phase to the first frame outside React DOM.
- **On screen.** When the slide appears, the script walks the tree and marks a subtree ON SCREEN if it owns a host
  element with a box inside the 390x844 viewport that is not `visibility: hidden` and not under `opacity: 0`. This
  column comes from the first run only.
- **Base.** `main` at `99009e4`, one machine, 2026-11-09.

**Overhead, measured.** The profiling build, the hook and the CPU profiler make a load slower. On the same server and
profile, `startup-bench.mjs` (7 runs) on the production build gave first slide 5,375 ms and 3.12 s main-thread busy by
the slide. The profiling run gave 6,043 ms and 4.03 s. So read the milliseconds below as about 1.3x what production
spends, and compare rows with each other rather than with Lighthouse. Two overheads were found and removed while
building the tool:

- React 19.2's profiling build logs every component to Chrome's Performance panel through `console.timeStamp`. That
  cost about 290 ms of the passive-effect phase per load, work production never does. The script hides
  `console.timeStamp` before React loads, which turns the logging off.
- A first version of the walk counted subtrees React had skipped, because a skipped fiber keeps its old "performed
  work" flag. It billed `SlidePickerImpl` 7.4 ms on every one of 14 commits. The walk now stops where a fiber's child
  pointer did not change, which is React DevTools' rule.

The script's own hook costs about 25 ms of the commit phase (`onCommitFiberRoot` in the commit table). The CPU window
ends at `profile.startTime + slideAt`, and the profiler starts a little before navigation, so it stops a few tens of ms
short of the slide (the buckets in §2 sum to ~5.96 s against a 6.04 s median slide).

## 2. Where React sits in the main-thread time before the slide

The CPU profile from navigation to the first slide, median of 7 runs, profiling build:

| Bucket | ms |
|---|---|
| React render phase (calling components, reconciling) | 661 |
| React commit phase (DOM writes, layout effects, ref callbacks) | 138 |
| React passive effects (`useEffect` bodies) | 101 |
| JavaScript outside any React phase (module evaluation, engine, first-slide render, runtime) | 1,580 |
| Native, not JavaScript (`(program)`: parse, compile, style, layout) | 1,474 |

React accounts for about 900 ms in this build. At the ~1.3x overhead in §1 that is roughly 690 ms in production, so
its closeness to the ~930 ms the 11-08 note read from Lighthouse is a coincidence, not a confirmation. The render
phase does most of its work in one commit: the island's hydration, about 3.9 s after navigation (335 ms and 176
working fibers in run 1 of the cited set; 377-387 ms and 177-187 fibers in two earlier sets of the same build). Seven
tiny commits come before it (the lazy overlays, 0-14 ms) and about 11 after it, from 0 to 50 ms each, most of them
StudioShell re-rendering as state settles.

## 3. The ranked list

Render-phase ms before the first slide, median of 7 runs (profiling build, 4x CPU). Every row below sits inside
StudioShell › `PanelNav` (`docs/src/components/ui/panel.tsx`, the panel container the shell renders into), which is
273 ms INCL; rows 2-7 are the costliest subtrees inside it. Row 1 is StudioShell's own body, outside PanelNav.

| # | Subtree or call | Cost | On screen at the slide | Source |
|---|---|---|---|---|
| 1 | **StudioShell's own body** (SELF) | 271 ms | yes | `StudioShell.tsx` |
| 1a | ↳ boot deck list: `loadDeckList()` → `metaFor` → `buildDeckIndex` for every saved deck | 40-55 ms, ~32 of it `metaFor` | no: `meta` is drawn only in the deck switcher (`StudioShell.tsx:7677`) | `StudioShell.tsx:486`, `studio-store.ts:385` |
| 1b | ↳ the body itself: ~490 hook call sites (110 `useState`, 105 `useEffect`, 98 `useCallback`, 93 `useRef`, 82 `useMemo`, 3 others) and the JSX. React's own hook bookkeeping is ~20 ms of this | ~48 ms | yes | `StudioShell.tsx` |
| 1b′ | React's `renderWithHooks` as the leaf frame, render phase (all components, not StudioShell alone). `renderWithHooks` has ~15 lines of its own; this is V8 compiling each component function on first call, which a CPU profile bills to the caller. Confirmed by a trace (§3.1) | ~105-118 ms | n/a | React DOM |
| 1c | ↳ `readTargets(source)` memo | ~12 ms | n/a | `StudioShell.tsx:1692` |
| 1d | ↳ `unknownComponents(source, lintKnown)`, computed twice by two memos | ~6 ms | n/a | `StudioShell.tsx:2120-2121` |
| 1e | ↳ `loadCheckpoints(loadBootDeck().id)` (`loadBootDeck` runs three times at boot) | ~4 ms | n/a | `StudioShell.tsx:493,495,1240` |
| 2 | **Icon-button tooltip wrappers** (`BarIcon` › `Tip` › `KeyboardFocusTip` › Radix `Tooltip`). The two `Tip` subtrees are 48.5 + 47.0 ms, but they include the button, its icon and its Slot (`KeyboardFocusTip` renders its children inside `TooltipTrigger asChild`, `ui/tooltip.tsx:142-143`), which render either way. The tooltip parts alone, by name: `Tooltip` 9.0, `TooltipTrigger` 7.4, `TooltipProvider` 6.1, plus some of `Presence` | ~25-40 ms removable | the buttons yes, the tips are not open | `studio/chrome-parts.tsx:271`, `ui/tooltip.tsx` |
| 3 | **Mounted but not on screen on a phone**: `PanelSheet` 16.6, `SlidePickerImpl` 14.6, `FeedbackSheet` 13.3, `StudioDrawer` 10.6, `CommandPalette` 9.3, `Toaster` 5.7 | ~70 ms | no | `StudioShell.tsx` children |
| 4 | **Forced layout in a ref callback** (commit phase): `previewHolderRef`'s first `measure()` reads `holder.clientWidth` mid-commit | ~44-54 ms | n/a | `StudioShell.tsx:5127-5136` |
| 5 | Dropdown menus (Radix `DropdownMenu`, plus `LensPicker`'s) | ~27 + 11 ms | triggers yes | `studio/lens-picker.tsx` and the shell |
| 6 | `SlideRail` | 24 ms (17 SELF) | yes | `studio/SlideRail.tsx` |
| 7 | `ErrorBoundary` › `FocusedPreview` › `DeckPreview` | 17.2 › 16.1 › 13.4 ms | yes | `components/DeckPreview.tsx` |

Everything else is under 7 ms per subtree.

### 3.1 The compile share, from a production trace

`docs/scripts/v8-compile-trace.mjs` records a Chrome trace with V8's compile categories on the PRODUCTION build (same
server and phone profile, 5 runs) and sums the top-level compile events inside the hydration task:

| | median | range |
|---|---|---|
| Hydration task | 249 ms | 225-326 ms |
| V8 compile inside it (`V8.CompileCode`: 170-510 lazily compiled functions per run) | 145 ms | 48-192 ms |
| V8 compile on the main thread, navigation to slide | 1,037 ms | 1,019-1,059 ms |

So the ~110 ms that the CPU profile bills to `renderWithHooks` is compilation, as the checker suspected, and
compilation is also a large part of the 1,474 ms "native" bucket in §2. The spread inside the task follows how many
functions earlier tasks in that run had already compiled.

Two things the list says:

- **No single child subtree is the cost.** The single biggest item is StudioShell's own body. Its React hook
  bookkeeping is small (~20 ms); the bigger shares are the deck list (1a) and, outside it, ~110 ms that is most likely
  first-call compilation of the island's code (1b′). Compile cost only goes away when the code is not run at boot, or
  when V8's code cache serves it on a repeat visit; these runs use cold contexts, so the cache never applies here.
- **What the phone does not show costs about 70 ms (row 3), plus the ~32 ms deck-list index (1a).** Those are the
  cheapest candidates, because skipping them changes nothing on screen at the slide.

## 4. Candidate levers, by expected size and risk (1 and 2 built, §5 and §6)

Each needs a same-machine A/B (startup-bench and Lighthouse, alternated) before it ships. Per the brief, a tier-1
checker reviews this list before any of them becomes code.

1. **Mount the closed sheets and the slide picker on first open** (row 3, ~70 ms profiled, ~55 ms production-scale).
   BUILT 2026-11-09: −47 to −66 ms of render before the slide, profiled (§5).
   Risk: first-open latency and focus return, and the e2e tests that expect them in the DOM.
2. **Compute the deck switcher's slide-count label when the switcher opens** (row 1a, ~32 ms). BUILT 2026-11-09:
   about −140 ms of CPU before the slide with sixteen saved decks, nothing measurable on a first visit (§6). Risk: low. `metaFor` is
   already memoized by source, so the switcher pays it once.
3. **Lighter tooltips on the phone's icon bar** (row 2, ~25-40 ms; the buttons themselves stay). Options: one shared `TooltipProvider` instead of one per
   tip, or mount the Radix tooltip on first hover or focus. Touch has no hover, so the tip itself rarely shows on a phone.
   Risk: keyboard-focus tips (`KeyboardFocusTip`) must keep working.
4. **Drop the synchronous first `measure()`** (row 4). The ResizeObserver delivers the first size on its own. Risk:
   the layout still has to happen in the next frame, so the net saving may be about zero. Worse, until the size arrives
   the preview box renders at `width: 100%` (`StudioShell.tsx:7196-7198`), so the late size resizes the box and the
   preview iframe and lays the slide document out again, which can cost more than it saves or move the first slide.
   The weakest lever here; measure before believing any of the ~45 ms.
5. **Run less code at boot** (row 1b′, ~145 ms of compile in the hydration task, ~1.04 s before the slide in all;
   cause measured in §3.1). Splitting StudioShell's hooks while still rendering them all saves little; what helps is
   not running (or not shipping) code a phone's first render does not need, or a warm code cache on repeat visits
   (a cold first visit never benefits). It needs a design note.

## 5. Lever 1, built: closed surfaces mount on first open (2026-11-09)

**What changed.** `StudioShell.tsx` latches eleven closed surfaces with `useLatch` (`lazy-panel.tsx`), as Share and
Workspace already were: the phone's ⋯ drawer and command palette, Send feedback, Version history, the compact Coach,
Chat, Live, Reader views and Settings sheets, and both `SlidePicker` galleries. Each mounts the first time it opens and
stays mounted after. The `Toaster` stays mounted from boot, because a toast can arrive before anything opens.
`e2e/studio-mount-on-open.spec.ts` drives each first open on a cold load (`mobile`, `webkit-phone`).

**React profile, alternated.** Profiling builds of `main` (`756c1ff`) and of this change, served side by side, measured
in turn with the order rotated each round, `CPU=1 RUNS=1` per load, 7 loads per arm, three separate sets:

| Set | Render before the slide, base → lever 1 (median ms) | The five gated components' render (SELF, summed) |
|---|---|---|
| 1 | 488 → 422 (−66) | 39.9 → 0 |
| 2 | 472 → 425 (−47) | 35.1 → 0 |
| 3 | 458 → 404 (−54) | 36.3 → 0 |

So lever 1 removes about 50-65 ms of render work before the slide on the profiling build. At the §1 overhead that is
roughly 40-50 ms in production, against the ~55 ms §4 estimated.

**startup-bench, alternated** (production builds over `serve-h2.mjs`, phone profile, 15 loads per arm, order rotated):
main-thread busy by the slide 2.91 s → 2.90 s, first slide 4,305 → 4,350 ms. Run-to-run spread is about ±0.2 s, so a
~50 ms change is below what this instrument resolves at n=15; it shows no regression and no measurable win.

**Focus on close, fixed on the way.** The first-open spec found that Escape on the phone drawer left focus on `<body>`,
on `main` too: a modal Radix sheet returns focus only to a `SheetTrigger`, and these sheets open from plain buttons.
`SheetContent` now returns focus to the opener when nothing else has taken it (`engineering/gotchas/studio-playground.md`,
"Closing a sheet leaves focus on the page body").

**Lighthouse**: see §7.

## 6. Lever 2, built: the deck switcher's label is counted when it opens (2026-11-09)

**What changed.** `loadDeckList` (`studio-store.ts`) no longer carries a `meta` label, and its `slides` are split on
first read rather than when the list loads. The switcher asks `deckMetaFor(id)` per row when it opens, through a small
`DeckSwitcherMeta` component, and `deckSourceFor(deck)` gives a row's source without splitting it to join it again.
`StudioDeck` loses its `meta` field.

**What the profile found, which corrects §3 row 1a.** The ~32 ms that row billed to `metaFor` is mostly the
slide-boundary parse (`slideBoundaryModel`) running for the first time. That kernel keeps a memo by source, and
`slidesFor` and the shell's own index of the open deck call the same kernel. Whoever calls it first pays the parse and
V8's first compile of it. Each step of this change moved that cost before it removed any: dropping `meta` moved it to
`slidesFor`; making `slides` lazy moved it to the boot `useState` that read `deckSource(first)`; `deckSourceFor` moved
it to the shell's own index of the open deck, which needs it. A review then caught one more read: the active row's
`{ ...d }` spread ran the lazy getter on every title change, and that row now forwards `slides` instead.

**A first visit (no saved decks, three built-ins).** CPU drills, profiling build, 5-7 alternated loads per arm:

| Before the slide (median ms) | Lever 1 only | Lever 1 + 2 |
|---|---|---|
| `metaFor` | 29.6 | 0 |
| `loadDeckList` | 39.1 | 4.6 |
| `slideBoundaryModel` | 26.1-26.5 | 0 |
| StudioShell's body, top 20 callees summed, two sets | 153.2 / 140.6 | 142.7 / 150.3 |

The frames leave the boot path, but the body total does not move: the two sets disagree on its sign, and its runs
spread 127-190 ms. On a first visit lever 2 has no measurable effect, because the work it skips is the open deck's
parse, which still has to happen.

**A returning author with sixteen saved decks.** `react-mount-profile.mjs` gained `SEED=<file.json>`, which writes a
localStorage map before the page loads, and `docs/scripts/seed-saved-decks.mjs` writes one: the sixteen largest
example decks (~300 KB), stored as the Studio stores edited decks. Profiling build, alternated, order rotated:

| Measure (median ms) | main | Lever 1 | Lever 1 + 2 |
|---|---|---|---|
| Render before the slide (6 loads per arm) | 854 [822-1,032] | 844 [827-872] | 783 [688-825] |
| StudioShell SELF (6 loads per arm) | 549 | 558 | 482 [409-515] |
| `loadDeckList`, CPU drill (5 loads per arm) | n/a | 181.8 | 38.6 |

So lever 2 is worth about 140 ms of CPU and 60-75 ms of render before the slide for an author with sixteen saved
decks, and nothing measurable for a first visitor. The 38.6 ms left in `loadDeckList` is mostly `titleFromSource`,
since the switcher still shows every deck's title. With this seed, lever 1's ~50 ms does not show above the noise
either (854 → 844).

## 7. Lighthouse, alternated (2026-11-09)

Production builds over `serve-h2.mjs`, `lighthouse` with the nightly's mobile settings (`lighthouserc.mobile.cjs`:
390x844, 4x CPU, 150 ms RTT, simulated throttling), `/studio/` only, arms alternated with the order flipped each round.

| Set | Arm | n | Score | TBT median [range] | LCP | FCP | JS bootup |
|---|---|---|---|---|---|---|---|
| A (3 arms) | main | 9 | 0.67 | 1,351 [1,226-1,585] | 3,013 | 2,029 | 2,789 |
| A | lever 1 | 9 | 0.67 | 1,438 [1,214-1,733] | 3,010 | 2,031 | 2,858 |
| A | levers 1+2 | 9 | 0.67 | 1,438 [1,365-1,696] | 3,010 | 1,963 | 2,758 |
| B (2 arms) | main | 12 | 0.67 | 1,517 [1,401-1,976] | 3,008 | 1,997 | 2,938 |
| B | levers 1+2 | 12 | 0.67 | 1,459 [1,285-1,572] | 3,010 | 1,965 | 2,807 |
| A+B pooled | main | 21 | 0.67 | 1,482 | 3,009 | 2,029 | 2,885 |
| A+B pooled | levers 1+2 | 21 | 0.67 | 1,438 | 3,010 | 1,964 | 2,763 |

Read it as: no regression, and a ~50-120 ms improvement that sits inside Lighthouse's run-to-run spread on this
machine (set A's medians alone point the other way for TBT). The score does not move. The React profile in §5 and §6
is the instrument that resolves these levers; Lighthouse and startup-bench only confirm nothing got worse.

## Not measured

- A production build per subtree. React's per-fiber timings exist only in the profiling build, so the absolute numbers
  carry the ~1.3x overhead in §1.
- The 1,580 ms of JavaScript outside React, and the 1,474 ms of native work beyond the compile share in §3.1. This
  note ranks React's share only.
- The CI runner, a real phone, WebKit.
