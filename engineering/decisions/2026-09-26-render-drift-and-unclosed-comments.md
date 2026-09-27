---
status: shipped
summary: The render tier had drifted 25–50% over its blessed baseline on the blessing machine, and an unclosed `<!--` made the render and the linter quadratic (one 250 KB line: 148 s render, 89 s lint). Bisecting found no single culprit; profiling found two repeat-work costs and five comment readers that rescan from every unclosed opener. What was fixed, what was measured, and what the rest of the drift is.
---

# Render drift since 2026-09-08, and the unclosed-comment quadratics

**Status:** shipped 2026-09-26 on `claude/performance-follow-ups-i9ye53`, from
`followups.d/2248-p2` (re-bless the stale bench rows) and `followups.d/2328-p4` (lint
super-linear on untrusted input). Every number below is one sandbox, `linux/x64, 4× Intel
Xeon @ 2.10GHz, node v22` — the fingerprint `baseline.json` was blessed on, so its wall clock
gates.

## 1. The bench was red for a reason nobody had looked at

`bench:check` on `main` (a325105) failed WORKLOAD on four rows, as the follow-up said: `charts`
rendered 23 slides against a blessed 22, and the CLI page counts were 15/33/43 against
5/9/30. It also failed TIMING, which the follow-up did not mention: `normal` +25%, `math`
+24%, `stress` +50%, confirmed on the second pass. Re-blessing over that would have recorded
a slowdown as the new normal.

## 2. There is no culprit commit

The render tier was last blessed at a2397b0 (2026-09-08, #2129). With the three dataset decks
pinned to today's copies, so only engine code moves, the `stress` row climbs across ~150
commits: ~170 ms → ~185 → ~210 (#2250) → ~230 (#2270 window) → ~260 at HEAD. `charts` climbs
57 → 63 → 68 → 73 → 83 → 86 ms over the last ~50. A `git bisect run` on a threshold landed on
noise (the "bad" commit measured 215.2 ms against a 215 threshold). Each step is inside the
±12% band on its own, so no single PR ever showed a regression.

## 3. Where the time went (CPU profile, a2397b0 vs HEAD, per cold render)

| cost | a2397b0 | HEAD | cause |
|---|---:|---:|---|
| section walk (`split-sections.mjs` DIRTY scan + fallback) | ~6 ms | ~16 ms | #2345 moved every walker onto the tokenizer-backed walk; a render calls it 16–22 times, and 9–10 of those are on a string it already walked |
| CSS comment walk (`eachCssRun`) | ~1.6 ms | ~4 ms | one `urlTokenStart` call per character of a 2.3 MB bundle |
| `lib/engine/css.js` pack + compose | ~15 ms | ~19 ms | the bundle grew 14% (2.02 → 2.30 MB) — feature weight, not code |
| `top-level-h2.mjs` tokenizer | — | ~3.6 ms | nearly all of it is the section walk's own fallback path |

Fixed: the walk memoizes its section-tag offsets for the last four strings (never the pieces,
which callers own), and the CSS walk jumps between the four characters that can open a run.
Same-session means of three alternating runs, `main` → branch: charts 81.2 → 69.0 ms (−15%),
math 75.4 → 63.7 (−16%), stress 261.8 → 224.5 (−14%), normal 74.5 → 72.6 (−3%). All 225
example decks render byte-identical.

**Not fixed, deliberately:** the CSS growth is the price of what shipped; the remaining gap to
a2397b0 is that plus new transforms (panes, pagination, section index). The baseline was
re-blessed at the new numbers, so the ratchet guards them from here.

## 4. The unclosed-comment quadratics

`/<!--[\s\S]*?-->/` scans to the end of the text from every opener that never closes. So do an
alternation with that arm first, a `(?![\s\S]*?-->)` lookahead, a fresh `indexOf('-->')` per
opener, and markdown-it 14.1.1's own `html_inline` comment arm (which it matches against the
rest of the paragraph from every `<`).

| input | render before | lint before | after (each) |
|---|---:|---:|---:|
| one 250 KB line of `<!--` | 148 s | 89 s (1 MB) | 0.1–0.4 s |
| 280 KB of `a <!--` lines | 17 s | 3.7 s | 0.1–0.3 s |
| 250 KB of `<!-- `, one `-->` at the end | — | 2.6 s | < 0.1 s |
| 280 KB of `a <!--` lines + `---->` | 16.8 s | — | 0.2 s |

`lib/core/closed-comments.js` holds the one idea — the next closer, found once and reused
while the scan is behind it — and the lint, masthead, panes, auto-split and layout-gate sites
use it. `scanTags` caches the same way inline. `lib/core/html-inline-guard.mjs` skips
upstream's rule only where its comment arm provably cannot close: `closable[i]` is filled in
one right-to-left pass, because the arm's tokens cannot land on every `-->` (`---->` holds one
and fails). The first cut only asked "is there a `-->`?" and the independent check defeated
it with those five characters.

Every rewrite is fuzzed against the regex or the unguarded parser it replaced
(`test/unit/core/closed-comments.test.js`), and three timing arms pin the linearity, each
proved by reverting the fix it covers.

**Left alone:** `chart-family.js` `proseAttr` keeps its regex — it reads a subtitle's
*rendered* HTML, where markdown-it has already escaped any unclosed `<!--`.

## 5. The WebKit reopen cost: one frame dock for the whole Studio

`followups.d/2391-p3`, confirmed on real WebKit (Playwright WebKit 26, production docs build) and
wider than recorded. The preview pool (`2026-09-13-gallery-preview-memory.md`) stops churn
*inside* an open grid, but the pool lived in the grid, so closing a surface destroyed its frames
and WebKit never gives a destroyed preview document back. Add slide stranded ~45 MB per reopen
(9 frames), the deck panel's preset tiles ~30 MB (4 frames); Present's overview and Reshape share
the pattern. Chromium reclaims and stays flat.

### What shipped

`docs/src/components/studio/frame-dock.tsx`: ONE set of preview frames for the Studio's lifetime,
mounted once (`FrameDockHost`) in a layer at the end of `<body>`. A pool BORROWS slots and gives
them back on unmount with their documents intact, so the next open re-points them through
`single-slide-render`'s patch path. A frame stays on its tile through CSS anchor positioning
(`anchor-name` on the tile, `anchor()` / `anchor-size()` on the frame), so scrolling needs no
script — the property the in-grid layer had, which a JS scroll sync would have lost.

Four conditions, each found by measurement, each written into the module:

1. **Tree order.** An anchor resolves only if it precedes the positioned element; Radix portals a
   dialog to the end of `<body>`, after the dock. So the dock creates `#lattice-surfaces` before
   itself, and the pooled surfaces portal there (`container` on DialogContent / SheetContent /
   PopoverContent / PanelSheet). Their own menus and tooltips still portal to the end.
2. **Viewport containing block.** An anchor outside the positioned element's subtree resolves
   only when that element's containing block is the viewport, so the frame is `position: fixed`
   and nested `overflow: hidden` wrappers cannot clip it (they resolved nothing, both engines).
   The clip is a `clip-path: inset()` on the slot's viewport-sized root, set to the tile's
   scrollports — which do not move when the grid scrolls; it is recomputed on resize, on an
   animation settling (a phone sheet measured mid-slide clipped to nothing), and on any scroll,
   patching only a clip that moved (the nested looks panel is the case that moves).
3. **No transforms.** Anchor positioning ignores transforms: Add slide's dialog, centered with
   `translate(-50%, -50%)`, put every frame ~630 px off its tile. It is centered with
   `inset-0 m-auto` now (same box, measured at 1440/820/390). A pool under a lasting transform —
   Reshape's popover, which Radix positions by transform — keeps its own frames (`canDock`).
4. **Stacking.** A slot takes the z-index of its tile's outermost stacking ancestor (Present's
   overlay is z-102) and paints above that surface by being later in tree order.

Where anchor positioning is missing (Safari before 26, jsdom) or a pool is not placed before
the dock, `canDock` is false and the pool keeps its frames in its own layer, exactly as before.

### Measured

Real WebKit, 1440×900, a production build, `main` and the branch on the same box:

| | main | frame dock |
|---|---|---|
| new preview documents per Add slide reopen (iframes + srcdoc writes) | 12 + 14, every cycle | **0 + 0** after the first |
| Add slide, open + scroll all + close, RSS over baseline | +291 → +445 → +535 → +732 → +884 MB | +383 → +374 → +371 → +510 → +549 → +550 → +604 → +597 MB |
| deck panel, 6 open/close cycles | +128 → +132 → +161 → +185 → +246 → +276 MB | +129 → +86 → +95 → +110 → +124 → +109 MB |
| dock slots after each of 8 full-scroll cycles (Chromium) | — | 13, every time |

Read the MB with the 09-13 note's ±200 warning; the document counts are exact. The Add slide
row still rises ~30 MB per cycle with zero new preview documents, so that residue is something
else — recorded, not chased here. One refinement came out of the counts: a pool with no free
slot of a tile's SHAPE takes an exact-shape dock slot (or a new one) rather than rewriting one
of the other shape — the gallery's Mermaid tile had cost two fresh documents per reopen.

Every surface checked at 1440, 820 and 390 on Chromium and WebKit: each docked frame sits on its
tile to the pixel, clipped by its scroller. The pool oracles (`gallery-preview-budget`,
`gallery-preview-metamorphic`, `preview-shared-sheet`) now find a surface's frames through
`docs/e2e/pool-frames.ts`, since a docked frame is not inside the surface it serves; MR-3's
"closing releases every document" is restated as what it guarded — no per-open residue — and the
WebKit-phone test now asserts that a reopen mints none.

**Unverified:** a real iPhone. Whether anchored frames track momentum scrolling there without lag
cannot be driven from this sandbox.

### Tried first, and why they failed

- **Posters** (capture a settled frame into an SVG `foreignObject`, show a WebP on reopen): built
  and reverted. Each capture is itself an SVG-image decode that WebKit also keeps (~3.5 MB), so a
  scrolled gallery grew as on main (+493 → +1097 MB against +391 → +1070 MB).
- **Parking frames between opens:** needs a state-preserving DOM move; `Element.moveBefore` is
  Chromium-only (measured absent on WebKit 26).
- **Keeping a surface mounted but hidden:** a force-mounted Radix modal runs `hideOthers` on mount,
  hiding the whole Studio from assistive tech while "closed", and keeps its scroll lock.
