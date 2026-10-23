---
status: proposed
summary: >
  A measured audit of where the Studio spends time, on main at bff35ea. On a throttled phone profile the
  first slide appears at 7.3 s after 323 requests; the Playground shows a live slide from the same engine in
  1.5 s with 86. The 5.8 s difference is the Studio shell booting before it asks for the engine: the main
  thread is busy for 6.0 of those 7.3 s, and preloading the engine earlier changed nothing. After the slide,
  idle warm-ups keep the thread 75-83% busy for 3 s with long tasks up to 0.5 s. A prose keystroke costs
  about 99 ms of CPU on desktop; a diagram keystroke in the page triggers 204 style recalculations. Proposes
  a preview-first boot, warm-ups gated on the first interaction, a smaller shell and a time-to-first-slide
  budget, ranked by measured or bounded impact.
---

# Where the Studio spends its time (2026-10-22)

**The answer.** The Studio is slow to open because it boots its whole interface before it asks for the
engine that draws a slide. On a throttled phone profile the first slide appears at **7.3 s**. The Playground,
which uses the same engine and the same preview runtime, shows a live slide in **1.5 s**. The 5.8 s difference
is the Studio shell. The request count (323) is a symptom of the same thing, not the cause: merging the small
files cut requests to 186 and did not move the first slide.

After the first slide appears, the Studio is still busy: for the next 3 s the main thread works 75-83% of the
time, with single tasks up to half a second, because warm-ups for panels nobody has opened start immediately.
That is why the first taps and keystrokes feel stuck.

## How this was measured

- **Build:** `origin/main` at `bff35ea`, built from a clean worktree (`npm ci`, `npm run build`,
  `npm run build:e2e`) and served by `docs/scripts/preview-e2e.mjs`.
- **Browser:** Chromium driven by Playwright, with a Chrome trace (timeline, V8 and loading categories) and,
  separately, a V8 CPU profile. Per-keystroke costs come from traces taken **without** the profiler: the
  profiler itself added about 80 ms per keystroke of source-position collection.
- **Profiles:** *desktop* (1440 px, no throttling) and *phone* (390 px, touch, 4x CPU slowdown, 80 ms
  latency, 6 Mbit/s). The phone profile stands in for a mid-range phone; it is not an iPhone. A real iPhone
  was **not** measured.
- **Default deck:** the Studio's own welcome deck, opened cold (new browser profile, empty caches) unless a
  row says warm (second load in the same profile).
- Each startup row is three runs; the range is shown. Run-to-run noise is about ±0.5 s on the phone profile.

## 1. Startup

| | Phone, cold | Phone, warm | Desktop, cold | Desktop, warm |
|---|---|---|---|---|
| First paint of the page | 0.5-0.7 s | 0.3 s | 0.2-0.3 s | 0.2 s |
| Editor on screen | 4.0-4.3 s | 2.8 s | 1.0-1.1 s | 1.1 s |
| Preview frame created | 6.2-6.4 s | 3.0 s | 1.3-1.6 s | 1.6 s |
| **First slide** | **6.2-7.3 s** | **3.7 s** | **1.3-1.6 s** | **1.6 s** |
| Requests | 323 | 323 | 322 | 321 |

**The Playground on the same phone profile:** a live slide at **1.4-1.6 s**, 86 requests.

### What happens, in order (phone, cold)

1. **0-0.15 s:** the HTML arrives.
2. **0.2-1.1 s:** about 100 JavaScript module requests for the Studio island arrive. The preview runtime
   (`lattice-runtime.js`, 1.25 MB) is prefetched from the HTML and lands by 1.6 s.
3. **1.1-4.1 s:** the main thread compiles and runs the island: React, the 7,864-line `StudioShell.tsx` and
   its ~160 static imports, and CodeMirror. **No engine or theme request starts in this window.**
4. **4.15 s:** the preview mounts and asks for the engine (`esm/engine.js` and its chunks) and the theme CSS.
   They arrive by 4.6 s.
5. **4.6-6.2 s:** the engine renders the deck and the preview frame is built. The lint core (`esm/lint.js`,
   256 KB) also loads at 6.0 s, before the slide.
6. **6.2-7.3 s:** the frame parses and runs the runtime and paints the first slide.
7. **7.3-10.3 s:** the warm-up queues load Compose, Present, the reading view (`player-prune`, 1.6 MB, and
   `player-core`, 547 KB), deck export and `layout-core`, plus 21 KaTeX font files.

### Where the main thread's time goes before the first slide (phone, cold)

Busy for **6.0 s of 7.3 s**, in 4,088 tasks; 17 tasks over 50 ms add up to 3.3 s.

| Kind of work | Time |
|---|---|
| JavaScript callbacks (React rendering, effects, timers, the render pipeline) | ~3.4 s |
| Compiling scripts | 1.35 s |
| Running module top-level code | 1.07 s |
| Garbage collection | 0.52 s |
| Style and layout | 0.54 s |
| Parsing HTML | 0.15 s |

By script (CPU profile, inclusive): React ~1.4 s, the engine ~0.8 s, third-party packages bundled as `dist.*`
(CodeMirror, Radix, Motion and others) ~0.7 s, the Studio island ~0.64 s, theme loading ~0.42 s, the editor
~0.36 s, the lint core ~0.32 s.

### Why so many requests

The site build emits 593 JavaScript files; 234 are under 4 KB. A Studio load fetches 233 of them: 137 under
4 KB and 75 under 1 KB. Most of the tiny ones are single `lucide-react` icons (35+) and small shared modules
(settings preferences, probes, helpers). The bundler gives each icon, and each module shared by a different
set of pages, a file of its own.

### Experiments, measured

| Change | Requests | First slide, phone cold |
|---|---|---|
| None (baseline) | 323 | 6.9-7.7 s |
| Group icons and small shared modules into two chunks | 186 | 7.1-7.5 s |
| Preload the engine, its 25 chunks and the theme CSS from the HTML | 323 | 6.1-7.7 s |

Neither moved the first slide beyond the noise. The phone is limited by the CPU, not the network, so fetching
sooner or in fewer files does not help while the main thread is busy booting the shell. The grouping also
produced a 1.95 MB shared chunk, which would cost every route that loads it, so it is not shippable as tried.

### Why the heavy modules load at startup

A static walk of the island's imports (about 301 source modules) contains **none** of `player-prune`,
`player-core`, `layout-core`, `PresentOverlay`, `ComposeView`, `WorkspaceSheet`, `registers` or the lint core.
Their lazy splits hold. They load early because three warm-up paths fire `import()` when the Studio mounts:

- `StudioShell.tsx:1507`: the Editor warm.
- `StudioShell.tsx:1511`: `warmPanels(STUDIO_PANELS)` (Workspace sheet, Share, Slide settings).
- `StudioShell.tsx:1518` → `studio-warm.ts:60-62`: Compose, Present (with `player-core`), and the reading
  view (with `player-prune`, `player-core`, deck export and `layout-core`), then KaTeX CSS and, if used
  before, Mermaid and Fabricate.

They run on `requestIdleCallback` with a 3 s timeout (a 1 s timer on Safari), at mount
(`lazy-panel.tsx:180-198`), not after the first slide. `2026-09-26-studio-panel-lazy-loading.md:93` describes
them as running "after first paint"; in code that is the page's first paint, not the slide's. The trace shows
them landing just after the first slide on the phone profile, where they keep the thread busy.
`tools/build-player-prune.js:13-14` says `player-prune` is "never part of the initial Studio load", which the
warm-up makes false in practice.

**A false positive loads KaTeX.** `single-slide-render.ts:1464` loads the math fonts when
`sourceHasMath(markdown)` is true, and in deck context `markdown` is the whole deck. The welcome deck mentions
`` `$math$` `` inside inline code, and `sourceHasMath` (`lib/plugins/math/math.syntax.mjs:159-203`) does not
skip code spans. So a deck with no math fetches 21 font files and re-registers `lattice.css`.

### After the first slide

| | Main thread busy in the next 3 s | Long tasks | Longest |
|---|---|---|---|
| Phone, cold | 2.2-2.5 s (75-83%) | 4-10 | 388-506 ms |
| Phone, warm | 1.5 s | 4 | 147 ms |
| Desktop, cold | 0.7 s | 2 | 111 ms |

## 2. Editing

| Keystroke | First change in the preview | Preview settles | Main-thread CPU per keystroke |
|---|---|---|---|
| Prose slide, desktop | 28 ms | 181 ms | ~99 ms, 116 tasks |
| Diagram slide, desktop (Mermaid in the page) | 28 ms | 391 ms | ~172 ms, 169 tasks |
| Prose slide, phone | 152 ms | 315 ms | not traced |
| Diagram slide, phone | 198 ms | 778 ms | not traced |

- **Prose:** style and layout are negligible (about 5 ms). The cost is JavaScript: input handling in
  CodeMirror, a React re-render of the shell, the render pipeline and the preview patch. 116 separate tasks
  per keystroke is the sign that work is scattered across timers and microtasks rather than batched.
- **Diagram, in the page:** 204 style recalculations and 26 layouts per keystroke inside the preview. Mermaid
  measures text one label at a time, and each measurement forces the browser to recompute style. #2822 moves
  this measuring into the sandboxed draw frame; its own numbers are in the baseline note on
  PR #2860.
- **"Settles"** includes the preview's 150 ms render debounce; the first change arrives in about 30 ms on
  desktop.

## 3. How to make it truly fast, ranked

Each item says what it would buy and whether that number is **measured**, **bounded** (an upper or lower
limit measured another way) or **estimated**.

1. **Preview-first boot.** Paint the slide before the rest of the Studio boots, the way the Playground does.
   The preview needs the engine, the theme and the runtime; it does not need the shell, the panels or the
   editor's extensions. Two shapes, which can be combined:
   - (a) a small preview entry that starts the engine from the HTML and renders the current deck, with the
     shell hydrating after it;
   - (b) a snapshot of the last rendered slide, stored on render and shown at once on the next visit, then
     replaced by the live render.

   *Bounded:* the Playground reaches a live slide in 1.5 s on the same profile, so (a) should land near
   1.5-2 s against 7.3 s. (b) would paint at HTML time on a return visit (about 0.5 s). This is the change that
   matters most and also the largest; it needs a design round.
2. **Warm-ups after the first slide and the first interaction, with a budget.** Start the panel, Compose,
   Present, reading-view and lint warm-ups only once the slide is on screen and the user has interacted or the
   page has been quiet for a few seconds, one at a time, each yielding. *Measured cost they add today:*
   2.2-2.5 s of main-thread work in the 3 s after the slide on the phone profile. *Estimated effect:* the
   first keystrokes stop competing with 1.6 MB of reading-view code. Small and contained.
3. **Fix the KaTeX false positive.** Make `sourceHasMath` skip code spans, or test the visible slide instead
   of the whole deck. *Measured:* 21 font files and a `lattice.css` re-registration on a math-free deck. A
   one-function fix.
4. **Lint after the first slide.** The lint core (256 KB) loads and runs before the slide (~0.3 s of CPU on
   the phone profile). Gate the first lint pass on the first render. *Measured cost removed from the path:*
   about 0.3 s on the phone profile.
5. **A smaller shell.** `StudioShell.tsx` is 7,864 lines with about 160 static imports, and its closure pulls
   in `markdown-it`, `dompurify`, `fuse.js`, the narration library and a stemmer. Make the slide picker's
   fuzzy search, the settings search, the demo narration and the Coach lazy. *Estimated:* part of the ~1.4 s
   React and ~0.6 s island cost on the phone profile; each split needs its own measurement.
6. **Keystrokes: one batched update instead of 116 tasks.** Keep the source text in a store the preview and
   the editor subscribe to directly, so a keystroke does not re-render the whole shell. This is where the
   Fuoco focus hub could carry state (the follow-up on PR #2860). *Estimated:* most of
   the ~99 ms per prose keystroke on desktop.
7. **On-demand theme CSS in the Studio.** The Playground already splits `lattice.css` into 187 modules and
   loads the ones a deck uses (`2026-10-18-on-demand-styles.md`); the Studio still loads all ~560 KB.
   *Estimated:* part of the 0.42 s theme cost.
8. **Fewer, larger chunks, done properly.** Group `lucide-react` into one chunk and leave the shared modules
   alone. *Measured:* no first-slide gain on this profile; it helps high-latency connections only. Lowest
   priority.
9. **Split the preview runtime.** `lattice-runtime.js` is 1.25 MB; its flowchart, state-chart and graph code is
   chart-only (`lib/runtime/index.js:51-58`). *Estimated:* part of the 1.1 s between frame creation and the
   first slide.

## 4. Keeping it fast

The route budget (`docs/route-budget.json`) measures gzip bytes of the scripts the HTML references and their
static imports. It does not follow `import()`, so it cannot see the warm-ups, and nothing measures time. A
budget for **time to first slide** and **main-thread busy time before it**, on the phone profile, would have
caught all of this. Adding it is a CI change, so it is the owner's call; the harness used here runs in under a
minute per profile.

## What was not measured

- A real iPhone or iPad, and Safari's or Firefox's own numbers. The phone profile is a Chromium stand-in.
- Phone-profile CPU traces of keystrokes (only latency was measured there).
- Decks larger than the welcome deck at startup.
- Which bundler chunk holds which source module: the chunk names were mapped by reading the code, not from
  `chunk-graph.json`.
