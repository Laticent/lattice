---
status: shipped
summary: Why the Studio scored 0 on Total Blocking Time with the slide map open, and what fixed most of it. Each live map tile is a whole engine document (the 857 KB runtime parsed, the 1.35 MB stylesheet styled), and a returning reader's map mounted seven of them on every load. Map posters are now kept across visits in IndexedDB, a tile with a fresh poster shows it and mounts no frame ("stills stay stills"), posters are captured with the slide's own fonts so they match the slide, and the rail promotes live tiles one at a time after load. Measured with the new `npm run perf:load` at 4x CPU, a returning reader's load went from TBT 4.8 s to 3.7 s, Speed Index 4.1 s to 2.8 s and TTI 9.4 s to 6.7 s. Slow promotion on its own measured no gain, and is recorded here as such.
---

# Studio load cost: the slide map's live frames

**Date:** 2026-11-15 · **Status:** shipped · **Scope:** the Studio's slide map (`docs/src/components/studio/StudioMap.tsx`,
`docs/src/components/map-rail/`), its poster capture (`studio/pool-capture.ts`) and the load benchmark
(`docs/scripts/load-bench.mjs`).

## 1. The answer

A Lighthouse run on lattice.style/studio/ (desktop, November 2026) scored Performance 59, **TBT 2,956 ms** and **Speed
Index 4.4 s**. The run carried saved data, so it was a reader coming back with the slide map open. That reader's map
mounted **seven live preview frames** on every load, and each is a whole engine document. Those frames were about
2 s of the blocking time and most of the Speed Index tail, because the filmstrip kept changing as tiles filled in one by one.

What shipped:

1. **Posters persist** (`map-rail/poster-store.ts`). The map's captured pictures go to IndexedDB under their
   content-addressed key. The key already hashes the slide, the look and the engine build (`options.themeBase` is
   the hashed `/playground/v/<hash>/themes/` URL), so a stored picture can never answer for a different one.
2. **Stills stay stills** (`StudioMap.tsx` `live`). A tile with a fresh poster shows the poster and mounts no frame.
   A frame mounts only to make a poster: a first visit, an edited slide, a new look, a new build.
3. **Posters carry the slide's fonts** (`pool-capture.ts`, `playground/font-embed.js` `buildFamilyFontCss`). The capture
   used to skip fonts, which was fine while a live frame always replaced the poster. Once the poster stays on screen it
   must match the slide, so the capture embeds the families the slide draws in, and only those.
4. **The ramp** (`MapRail` `ramp`). A mount starts with no live tiles and promotes one per idle step, nearest the focus
   first, after the page's `load`. This keeps first paint free of frames and gives IndexedDB time to answer before
   any tile would go live.
5. **The benchmark** (`npm run perf:load`). This is Lighthouse's desktop preset (the nightly's settings), median of N
   cold-cache runs, plus how many frames the page holds once settled. `MAP=1` seeds the map-open key, `RETURN=1` runs
   one full visit first and clears only the HTTP cache, and `CPU=4` slows the CPU.

## 2. How it was measured

The sandbox CPU is faster than most readers' laptops. At `CPU=1` a returning load blocks for ~250 ms. At `CPU=4` the
benchmark reproduces the report's shape: TBT ~4.8 s, SI ~4 s, TTI ~9.4 s. So every comparison below is at 4x, with
the old build and the new one served from copies side by side, run one after another with nothing else on the machine.

Where the time went, from one Lighthouse run at 4x with the map open, against the same run with it closed:

| Source | Map closed | Map open |
|---|---:|---:|
| `lattice-runtime.js` (each frame parses it) | 467 ms | 2,555 ms |
| Unattributable (frame style and layout) | 2,893 ms | 6,057 ms |
| `client.js` (React) | 2,839 ms | 4,834 ms |
| `capture-ribbon` (poster capture) | 0 | 466 ms |
| **TBT** | **2,176 ms** | **4,685 ms** |

So the map is about half of the blocking time, and nearly all of it scales with the number of mounted frames.

## 3. Results

4x CPU, median of 5 cold-cache runs, before → after:

| Load | TBT | Speed Index | TTI | Map frames |
|---|---:|---:|---:|---:|
| Returning, map open | 4,765 → **3,671 ms** | 4,066 → **2,764 ms** | 9,378 → **6,706 ms** | 7 → **0** (1 frame: the stage) |
| Returning, map open, 1x CPU | 246 → 194 ms | 1,537 → 1,426 ms | 2,290 → 2,260 ms | 7 → 0 |
| Map closed | 2,024 → 2,156 ms | 2,616 → 2,638 ms | 7,456 → 7,990 ms | 0 → 0 |
| First visit, map open (9 runs, alternated) | FIRST_VISIT_TBT | FIRST_VISIT_SI | FIRST_VISIT_TTI | 8 → 4 at settle |

With the map closed the numbers sit inside run-to-run noise: that path loads none of this code.

## 4. What did not work, and why it is recorded

**Slow promotion alone measured no gain.** The approved plan was "show stills first and promote map tiles to live
slowly". Built alone, the ramp moved TBT from 4.9 s to 4.5 s, inside the noise, and Speed Index slightly worse. Promoting
slowly only reorders the same frames: each still costs its runtime parse and its stylesheet, and Lighthouse counts
every task until the page goes quiet. The saving came from mounting fewer frames, which needed the poster to be good
enough to stay. The ramp stays because it gives IndexedDB time to answer before a tile goes live, and keeps first
paint free of frames.

**Stills captured without fonts were not good enough to stay.** The first prototype of "stills stay stills" kept the
fallback-font posters: titles re-wrapped and a dense two-column slide overlapped itself. That went to the owner as a
decision with screenshots, and the answer was to embed the fonts first. Measured afterward against the slide at full
size (mean pixel difference at tile size), the font-embedded poster was closer to the slide than the live tile on four
of five gallery slides, and level on the fifth. The live tile is a shrunken frame; the poster lays the slide out at its
real 1280 px width and then scales the picture.

**Embedding the export's whole font block made a rare, very long task.** The first font-embedded build matched the
old one at the median on a first visit, but had a tail: one run blocked for 10.3 s, with a 1.39 s task. The export's
`buildFontEmbedCss` base64-encodes every vendored face in one go, and the first capture paid for all of them.
`buildFamilyFontCss` encodes only the families the slide draws in, once per face.

## 5. Not done, and why

- **The Studio's own mount** (React and the island, ~2 s of TBT at 4x with the map closed) is untouched. It is the next
  lever and a different piece of work.
- **Out-of-process preview frames.** A frame on another origin gets its own renderer process in desktop Chrome, which
  would take its parse and layout off the Studio's main thread. It is an architecture change: capture, `slotShows` and
  the pool read `frame.contentDocument` directly, and HARD RULE #22 governs these frames. Worth a measured prototype on
  the stage frame alone before anything else.
- **A worker pool for capture.** The clone and style inlining need the live DOM, and Chrome already encodes
  `canvas.toBlob` off the main thread. The measured capture (62–207 ms wall at 1x) does not justify it.
