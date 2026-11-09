---
status: in-progress
summary: >
  What React renders before the Studio's first slide on the phone profile, by subtree, from a React profiling build and
  a CPU profile split by React phase. React's three phases are about 0.9 s of the 4.0 s of main-thread work before the
  slide. Half of the render phase is StudioShell's own body (about 270 ms), including a boot-time deck list that
  builds a full index of every saved deck; a further ~110 ms billed to React's renderWithHooks is most likely V8
  compiling component code on first call, not hook work. Mounted subtrees the phone does not show cost about 70 ms,
  the tooltip wrappers on the icon bar about 25-40 ms, and a forced layout in a ref callback about 45 ms (likely moved,
  not saved). Measurement only; no shell code changed. New tool: docs/scripts/react-mount-profile.mjs. A tier-1 checker
  reviewed the method and the numbers; its corrections are folded in.
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
| 1b′ | React's `renderWithHooks` as the leaf frame, render phase (all components, not StudioShell alone). `renderWithHooks` has ~15 lines of its own; this is most likely V8 compiling each component function on first call, which a CPU profile bills to the caller (the checker reproduced the attribution in Node; not confirmed in this page's trace) | ~105-118 ms | n/a | React DOM |
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

Two things the list says:

- **No single child subtree is the cost.** The single biggest item is StudioShell's own body. Its React hook
  bookkeeping is small (~20 ms); the bigger shares are the deck list (1a) and, outside it, ~110 ms that is most likely
  first-call compilation of the island's code (1b′). Compile cost only goes away when the code is not run at boot, or
  when V8's code cache serves it on a repeat visit; these runs use cold contexts, so the cache never applies here.
- **What the phone does not show costs about 70 ms (row 3), plus the ~32 ms deck-list index (1a).** Those are the
  cheapest candidates, because skipping them changes nothing on screen at the slide.

## 4. Candidate levers, by expected size and risk (none built)

Each needs a same-machine A/B (startup-bench and Lighthouse, alternated) before it ships. Per the brief, a tier-1
checker reviews this list before any of them becomes code.

1. **Mount the closed sheets and the slide picker on first open** (row 3, ~70 ms profiled, ~55 ms production-scale).
   Risk: first-open latency and focus return, and the e2e tests that expect them in the DOM.
2. **Compute the deck switcher's slide-count label when the switcher opens** (row 1a, ~32 ms). Risk: low. `metaFor` is
   already memoized by source, so the switcher pays it once.
3. **Lighter tooltips on the phone's icon bar** (row 2, ~25-40 ms; the buttons themselves stay). Options: one shared `TooltipProvider` instead of one per
   tip, or mount the Radix tooltip on first hover or focus. Touch has no hover, so the tip itself rarely shows on a phone.
   Risk: keyboard-focus tips (`KeyboardFocusTip`) must keep working.
4. **Drop the synchronous first `measure()`** (row 4). The ResizeObserver delivers the first size on its own. Risk:
   the layout still has to happen in the next frame, so the net saving may be about zero. Worse, until the size arrives
   the preview box renders at `width: 100%` (`StudioShell.tsx:7196-7198`), so the late size resizes the box and the
   preview iframe and lays the slide document out again, which can cost more than it saves or move the first slide.
   The weakest lever here; measure before believing any of the ~45 ms.
5. **Run less code at boot** (row 1b′, ~110 ms, cause PLAUSIBLE). If first-call compilation is the cost, splitting
   StudioShell's hooks while still rendering them all saves little; what helps is not running (or not shipping) code a
   phone's first render does not need, or a warm code cache. Confirm the cause first: a trace with V8's compile events
   (`v8.compile`, `V8.CompileLazy`) on the hydration task. Then it needs a design note.

## Not measured

- A production build per subtree. React's per-fiber timings exist only in the profiling build, so the absolute numbers
  carry the ~1.3x overhead in §1.
- The 1,580 ms of JavaScript outside React and the 1,474 ms of native work (§2). This note ranks React's share only.
- The CI runner, a real phone, WebKit.
