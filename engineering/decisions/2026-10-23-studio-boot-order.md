---
status: proposed
summary: >
  A first slice of the Studio's boot order, measured against the 2026-09-22 build on one machine. On the phone
  profile the first slide moves from 5.00 s to 4.45 s (the 2026-09-22 build: 4.20 s). Two changes carry it: the
  code editor builds after the first slide instead of beside it (-0.28 s alone), and the engine, base theme and
  preview runtime start downloading from the island's first module (-0.25 s more, once the CPU is free). Three
  things that looked like wins did nothing: starting the engine from the HTML, removing the runtime prefetch on
  its own, and fetching the base theme early. What is left is main-thread work (about 0.25 s to the baseline) and
  the Lighthouse score, which first-slide work does not move: the largest paint is the Nacre loader, and its
  simulated time went from 5 s to 13 s. The next moves and their measured ceilings are in section 4.
---

# The Studio's boot order: what the first slide waits for

**Where this sits.** `2026-10-22-studio-startup-regression.md` measured the regression and §6 ranked the fixes. This
note is the first slice of item 1 there ("preview-first boot"): what the slide waits for that it does not need, and
what changed. Follow-up: `followups.d/2868-p1-studio-startup-back-to-baseline.md`.

## 1. How this was measured

- **Builds.** `npm run build` in `docs/` for the production shape (the one that injects `modulepreload` hints; the
  `build:e2e` shape does not, and its numbers are 0.1-0.2 s apart). One build of this branch, one build of main on
  2026-09-22 (`d07eb78`) in a second worktree, served on two ports of one machine, run back to back.
- **The phone profile** is the note's: Chromium, 390 px, touch, 4x CPU slowdown, 80 ms latency, 6 Mbit/s, a cold
  profile per run. "First slide" is the first moment the preview frame holds a `.lattice` document.
  `docs/scripts/startup-bench.mjs` (`npm run perf:startup`) is that harness, committed so the next run is the same
  run. Medians of 5-9 loads; the spread inside a build is about 0.1 s here.
- **The machine is faster than the one behind the October 22 note**, so absolute seconds differ (that note has the
  2026-09-22 build at 3.25 s and main at 6.46 s). The comparison that carries is the same-day ratio: here the
  baseline build is 4.20 s and main was 5.00 s, a gap of 0.8 s where the note's was 3.2 s. The October 22 run had
  more going on at once than this one (PR #2870's warm-ups have landed since); the gap is smaller, not gone.

## 2. Where the time goes

Main thread, one load, 250 ms buckets, phone profile, before this change:

| Window | What the thread does |
|---|---|
| 0 - 0.75 s | busy: parsing the HTML, compiling the first scripts |
| **0.75 - 2.25 s** | **idle: waiting for the island's 136 module requests** (the link is not full, 26-80 KB per 250 ms against about 190 KB of capacity; the throttle limits requests per second, so the count is the cost) |
| 2.25 - 5.0 s | busy, continuously: React, the shell, the editor's CodeMirror, the engine, the first render |
| 4.6 - 5.0 s | the frame: runtime evaluation, then the slide |

Two readings follow. The first 2.5 s is waiting, and nothing in it is the slide's to give back. After 2.5 s the
thread is the bottleneck, so only removing work helps, and fetching sooner does not (the engine already lands at
3.2 s and the frame is created at 4.6 s).

## 3. What changed, and what each part measured

| Build | First slide (median) |
|---|---|
| 2026-09-22 `d07eb78` | **4.20 s** |
| This branch's base (PR #2870 included) | 5.00 s |
| + the engine, theme and runtime started from the island (`studio-boot.ts`) | 4.90 s |
| + the editor built after the first slide | **4.47 s** |
| the editor change alone, no `studio-boot.ts` | 4.72 s |
| the full change, rebuilt | 4.45 s |

- **The editor after the first slide, on a phone** (`StudioShell.tsx`, `first-slide.ts` › `useFirstSlideShown`). The phone opens on the preview with the editor pane hidden, so nothing visible waits; where the editor is on screen (the desktop split, the phone's edit pane) it still mounts at once. The inversion review of the first cut, which deferred it everywhere, found that the desktop split would show a skeleton for the whole startup, unmeasured, and the narrower rule keeps the whole phone win (4.50 s, 9 runs, after the change). CodeMirror's
  module evaluation and its view were 190 ms of main thread, in the window before the frame is created. Until the
  slide is shown the hidden pane holds `EditorSkeleton`; the existing backstop (6 s) and the hidden-preview release
  (`StudioShell.tsx` › `editorSlotVisible`) still open the gate. `editorRef` is read with `?.` everywhere except the
  demo's `editorReady` probe, which is a readiness test by design.
- **`studio-boot.ts`**, the island's first module, starts `ensureEngine`, the base theme fetch and the runtime
  prefetch once the island's code has arrived. Alone it moved nothing (5.00 s to 4.90 s); with the editor change it
  is worth 0.25 s, because the engine's arrival was behind the editor's work and is now ahead of the frame.
  `RuntimeWarm` is gone from `studio.astro` (the Playground and the home page keep theirs): the runtime is used last,
  and the prefetch now begins when the island's code is in.

**Tried and not shipped**, same harness:

| Try | First slide | Why |
|---|---|---|
| `import()` of the engine from an inline script at HTML time, with the chunk preloads | 4.45 s vs 4.45 s | the thread is the bottleneck after 2.5 s |
| the same, 600 ms later | 4.43 s | same |
| a runtime with the chart builders stubbed out (708 KB, the 2026-09-22 size, against 1,289 KB) | 4.68 s vs 4.87 s | the ceiling of the runtime split: **0.2 s** |

## 4. What is left, with the numbers

The baseline is 0.25 s away on this machine. Ordered by measured impact:

1. **Split the chart builders out of the preview runtime.** Ceiling 0.2 s (the stubbed run above). The runtime
   grew from 702 KB to 1,289 KB since 2026-09-22; `lib/components/chart` is 487 KB of that. The engine builds charts
   as HTML before the frame exists, so the builders run only for a Marp preview. The design question is the
   fallback: a preview runtime that omits them needs a safe path when one is asked for, and it must leave the
   exported runtime (`dist/lattice-runtime-min.js`, embedded in exports) byte-identical, or the export sign-off in
   CLAUDE.md applies. Recommendation: a second output built from the same entry, used by the docs site only, with
   the builders behind a sibling script loaded on first use, the way dagre is today (`lib/runtime/index.js`
   `ensureDagre`). **Default if no one answers: not built.**
2. **A real largest paint in the main page** (§6 item 2 of the regression note). Lighthouse, local, mobile, three
   runs each: the 2026-09-22 build scores 53-59 with an LCP of 4.6-5.2 s (the element is the pre-paint shell's deck
   title); this branch scores 53-56 with an LCP of 13.3-13.6 s (the element is `span.nacre-loader.is-done`, and the
   simulation places its paint after the whole script graph). The score is unchanged because the first-slide work
   does not touch the metric. Reaching 90 needs the largest paint to be a main-page element that exists in the
   HTML, which is a design change to the pre-paint shell, not a boot-order one. **Default if no one answers: not
   built; the next session designs it with a decision card.**
3. **Fewer requests before the island evaluates.** The 136 requests take 2 s on this harness while the thread
   idles; the 2026-09-22 build had 76 hints and evaluated 0.25 s sooner. The grouping experiment in the audit
   (323 to 186 requests) did not move the first slide when the thread was the bottleneck; with the editor change
   the island's evaluation start matters more. Measure again before deciding.
4. **Time budget in CI** (§6 item 7) and **hosting** (item 8) stay the owner's calls.

## Review of this change

The tier-2 trio (red team, Munger inversion, independent checker) ran on the first cut. It found two defects, both fixed
before this note's numbers were taken: a unit test (`RuntimeWarm.test.ts`) still expected the Studio's HTML prefetch, and
deferring the editor on every viewport would have shown a skeleton on the desktop split for the whole startup, and for 6 s
when the engine fails to load. The editor now defers only where it is hidden. Both were found by review and are closed:

- Crossing the 700 px breakpoint before the first slide used to unmount a live editor and rebuild it at the 6 s
  backstop. The editor is now latched once wanted (`editorWanted` in `StudioShell.tsx`); `studio.editor-hold.test.tsx`
  pins it, and the arm fails when the latch is removed.
- "Format code blocks" in the palette did nothing, with no message, when the editor was not built yet. It now says so.

Measured and accepted, from `AFTER=1 npm run perf:startup` (5 loads, three rounds, base against head, phone profile):
in the 3 s after the first slide the main thread is busy 0.95 s against 0.68 s, and 4 long tasks (over 50 ms) against
2 to 3. The longest task is no worse (185-202 ms against 191-289 ms), so a first tap waits no longer than it did. The
work moved from before the slide to after it; it did not grow. A pause-gated build (the way the panel warm-ups wait for
3 s of quiet) would lower it, at the price of a cold editor chunk when someone taps Source early; not done, because the
measured worst case is unchanged.

Still true: on a phone, a source change made before the editor is built (only reachable from the chat or Compose, in the
few seconds before the slide) becomes the editor's starting document, so undo cannot take it back. The runtime prefetch
finishes 120-400 ms before the frame asks for it on this harness; a slower link was not tried.

## What was not measured

- A real phone, Safari or Firefox: the profile is emulated Chromium (HARD RULE #23: UNVERIFIED on those surfaces).
- Time until the editor is usable (a `firstEditor` column), the desktop split and a warm service-worker cache: the bench blocks the worker and the desktop profile has no latency, so a returning user's load is unmeasured.
- The deployed site: these runs are the local production build. Lighthouse against the deployed pages is not run.
- Returning visits with a warm HTTP cache and a service worker (the harness blocks the worker).
