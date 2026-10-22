---
status: proposed
summary: >
  The Studio opens twice as slowly as a month ago and no page of the site is Lighthouse-green. Measured on one
  harness: the first slide on a throttled phone profile went from 3.25 s (main, 2026-09-22) to 6.46 s (main,
  2026-10-22), requests from 146 to 324, main-thread work before the slide from 2.4 s to 4.7 s. Typing did not
  regress. Lighthouse mobile scores the production Studio 46-48, the Playground 43-44 and the home page 66-81; the
  Studio's largest-contentful-paint element is the Nacre skeleton loader, because the slide lives in an iframe
  Lighthouse does not count. No single commit did it: a bisect found two steps (#2387 +0.9 s, #2376 panes +0.5 s) and a
  month of smaller additions. Defines the follow-up: back to the 2026-09-22 baseline, then Lighthouse green.
---

# The Studio's startup regression, 2026-09-22 to 2026-10-22

**Why this note exists.** The owner reported that the Studio is "still very slow", slower than a month ago, and set
two targets: get back to baseline, and get the site green on Lighthouse, initial load first. This note is the record
behind `followups.d/2868-p1-studio-startup-back-to-baseline.md`: every number, how it was measured, and what each one
does and does not prove. The audit it extends is `2026-10-22-studio-performance-audit.md`.

## How it was measured

- **Builds.** Each one built from a clean worktree (`npm ci`, `npm run build`, `npm run build:e2e`) and served by its
  own `docs/scripts/preview-e2e.mjs` (gzip on). Main on 2026-09-22 (`d07eb78`), 09-29 (`e2c15d8`), 10-06 (`29e402c`),
  10-22 (`433fee7`), and PR #2870 at `531d189` and `696ce6c`.
- **The phone profile.** Chromium through Playwright, 390 px, touch, 4x CPU slowdown, 80 ms latency, 6 Mbit/s. A cold
  load each run (new browser profile). "First slide" is the first moment the preview frame holds a `.lattice`
  document. It stands in for a mid-range phone; it is not an iPhone. Medians of 5 runs on an idle machine; run-to-run
  spread is about ±0.5 s, so a step smaller than that is not resolved.
- **Typing.** One character typed eight times at the end of a prose bullet and inside a Mermaid label; latency is from
  the keystroke to the first and to the last change in the preview's DOM.
- **CPU attribution.** A V8 CPU profile and a Chrome trace for the same loads, attributed by script (inclusive time,
  so nested frames are counted in each script on the stack).
- **Lighthouse 12.8.2**, mobile, simulated throttling, performance only, three runs per page: against the local builds
  and against the real deployments (Cloudflare, Brotli).

## 1. Startup, month over month

| Build | First slide (median of 5) | Requests |
|---|---|---|
| 2026-09-22 `d07eb78` | **3.25 s** | 146 |
| 2026-09-29 `e2c15d8` | 5.18 s | |
| 2026-10-06 `29e402c` | 5.56 s | 237 |
| 2026-10-22 `433fee7` | **6.46 s** | 324 |
| PR #2870 `531d189` | 6.50 s | 303 |
| PR #2870 `696ce6c` | 6.15 s | 303 |

Main-thread work before the first slide, one representative trace each: 2.4 s on 2026-09-22, 4.7 s on 2026-10-22.

**What grew**, inclusive main-thread time before the slide, medians of three loads:

| Script | 2026-09-22 | 2026-10-22 |
|---|---|---|
| React (`client`) | 0.90 s | 1.17 s |
| The engine (one `lattice-playground.js` then; `esm/engine.js` + chunks now) | ~0.3 s | ~1.2 s |
| Theme registration and the render it drives (`theme-fetch`) | 0.01 s | 0.45 s |
| The Studio island (`StudioIsland`) | 0.29 s | 0.56 s |
| Third-party packages (`dist.*`: CodeMirror, Radix, Motion) | 0.39 s | 0.55 s |
| The lint core (`esm/lint.js`) | 0 | 0.32 s |
| The Editor | 0.21 s | 0.34 s |
| The preview pipeline (`single-slide-render`) | 0.01 s | 0.22 s |

**What was added to the load**, by request: the engine went from one file to `chunks.json`, `engine.js` and 35 chunks
(37 requests for one); about 143 more small Studio files (one per lucide icon, panel shells, the Live panel's pieces,
Radix controls, settings, the engine warm-up script); the base theme stylesheet grew from 662 KB to 985 KB.

## 2. Where it happened: a bisect of the first week

Bisected on main's first-parent history, 5 runs per build:

| Build | First slide |
|---|---|
| 2026-09-25 `3f38db1` | 3.29 s |
| 2026-09-26 `bc1c48d` | 3.29 s |
| **2026-09-26 `1f21c66` (#2387)** | **4.16 s** |
| 2026-09-26 `fa1521b` | 4.11 s |
| **2026-09-26 `a325105` (#2376, panes engine)** | **4.61 s** (7 runs) |
| 2026-09-26 `133ac54` | 4.82 s |
| 2026-09-27 `6767902` (#2402) | 4.86 s |

- **#2387 (web images blocked by default) cost about 0.9 s.** Each render began awaiting a dynamic import of
  `lib/core/remote-ref.js` between the engine's output and the frame. Between the engine arriving and the frame being
  built, the main thread went from 0.8 s busy to 1.7 s: the re-registration of `lattice.css` with its KaTeX faces
  (triggered by the welcome deck's `` `$math$` `` in inline code) and the slide picker's fuzzy search now ran in that
  window, before the slide, instead of after it. PR #2870 removes the false KaTeX trigger and starts the import when
  the module loads (6.50 s to 6.15 s).
- **The panes engine (#2376, `a325105`) cost about 0.5 s**, near the noise floor: about 1,100 lines of engine code
  (`pane-css`, `panes`, `pane-spec`) that every render installs, for decks with and without panes.
- **The rest, about 1.6 s from 2026-09-27 to today, is not one commit.** Further steps were the same size as the noise,
  so the bisect stopped; the attribution table above says where the time went instead.

## 3. Typing did not regress

| Keystroke | 2026-09-22 | 2026-10-06 | 2026-10-22 |
|---|---|---|---|
| Prose, desktop, to settled | 180 ms | 181 ms | 183 ms |
| Diagram, desktop, to settled | 372 ms | 391 ms | 375 ms |
| Prose, phone profile, to settled | 274 ms | 305 ms | 291 ms |
| Diagram, phone profile, to settled | 598 ms | 551 ms | 652 ms |

## 4. Lighthouse

Mobile, simulated, three runs.

| Page | Score | FCP | LCP | TBT | Requests |
|---|---|---|---|---|---|
| Studio, local 2026-09-22 | 53-55 | 2.3-2.7 s | 5.4-6.2 s | 0.75-1.14 s | 148 |
| Studio, local 2026-10-22 | 48-50 | 2.1-2.6 s | 11.2 s | 1.0-1.2 s | 326 |
| Studio, production | 46-48 | 1.5-2.4 s | 7.2-9.3 s | 1.5-2.1 s | 326 |
| Studio, PR #2870 preview | 48-53 | 1.8-4.0 s | 7.1-8.3 s | 0.5-1.4 s | 226 |
| Playground, production | 43-44 | 1.8-4.4 s | 12.2-12.8 s | 0.8-1.8 s | 152 |
| Home, production | 66-81 | 1.2-1.5 s | 1.9-4.5 s | 0.76-0.78 s | 149 |

What Lighthouse says about the production Studio (one run):

- **The largest-contentful-paint element is the Nacre skeleton loader** (`span.nacre-loader.is-done`): 3.7 s load
  delay and 4.9 s render delay. The slide is inside an iframe, and LCP does not look inside frames, so the page's LCP
  is whatever the loader paints last. Making the first slide fast does not, by itself, move this metric.
- **Unused JavaScript, 1 MB**, of which 825 KB is the preview runtime (`lattice-runtime.js`, 1.25 MB), and 84 KB of the
  engine's 129 KB.
- **Total blocking time** is mostly React (`client`, 1.28 s of script) and unattributable work (2.2 s).
- 270 scripts, 42 fonts, 5,522 tasks; the longest critical request chain is 5 deep.

## 5. The two questions the owner asked

**Was splitting into many files a mistake?** Partly, and not where it looks. Merging the Studio's small files cut
requests from 323 to 186 and did not move the first slide on the phone profile, because the phone was short of CPU,
not network. Preloading the engine's chunks from the HTML did not move it either. Where splitting costs is the engine:
one file then, 37 now, and the engine's main-thread time rose from about 0.3 s to about 1.2 s over the same month; how
much of that is the module graph and how much is the code the engine gained (panes, chart family, plugins, Segno
grammars) is not yet separated. Lighthouse does count the 270 scripts against the page.

**Can the Studio be optimized like the Playground?** On our harness the Playground shows a live slide in 1.5 s against
the Studio's 6.5 s, with the same engine, because it boots less interface first. On Lighthouse it scores lower than the
Studio (43-44), for the same reason the Studio does: its largest paint is not the slide. So the Playground's lesson is
the boot order, not the metric.

## 6. What getting back would take

Ranked by measured or bounded impact. The audit note's list (`2026-10-22-studio-performance-audit.md` §3) still holds;
this adds what the regression and Lighthouse show.

1. **Preview-first boot**, so the slide does not wait for the interface. Bounded by the Playground's 1.5 s.
2. **A real largest paint in the main page**: the first slide, or its baked image, painted by the page itself so
   Lighthouse can see it; the loader must not be the largest element. The Playground already bakes a first slide
   (`2026-09-28-playground-virtual-filmstrip.md`).
3. **The preview runtime split**, so the 825 KB the first slide does not use loads on demand.
4. **The engine back to one file on the Studio's startup path**, or its chunk graph measured against one file on the
   same harness before deciding.
5. **Panes and other feature subsystems installed on demand** in the engine, not on every render.
6. **React work before the slide**: fewer components mounted at startup; measure each.
7. **A budget that measures time**: first slide on the phone profile and Lighthouse score, per route, with the 2026-09-22
   numbers as the floor to return to. Adding it is a CI change, so the owner decides.

## What was not measured

- A real iPhone, Safari or Firefox.
- Commits between 2026-09-27 and today one by one; the steps there are smaller than the noise.
- The Lighthouse numbers after PR #2870's last commit on the deployed preview (`696ce6c`).
