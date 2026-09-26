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

## 5. Preview posters — a surface that closes no longer strands its frames on WebKit

`followups.d/2391-p3`, confirmed on real WebKit (Playwright WebKit 26.0, production docs build).
The preview pool (`2026-09-13-gallery-preview-memory.md`) stops churn *inside* an open grid, but
a surface that closes takes its pool with it, and WebKit never gives a closed preview document
back. The Add Slide dialog had the same cost as the deck panel's new preset tiles:

| 6 open/close cycles, WebKit RSS over baseline | frames per open | cycles 1 → 6 |
|---|---:|---|
| deck panel, before | 5 | +128 → +132 → +161 → +185 → +246 → +276 MB |
| deck panel, after | 5, then **1** | +178 → +155 → +158 → +174 → +172 → +173 MB |
| add slide, before | 9 | +169 → +219 → +271 → +371 → +391 → +367 MB |
| add slide, after | 9, 3, then **1** | +267 → +383 → +404 → +336 → +307 → +329 MB |
| Chromium, before | 5 | flat, −16 to +18 MB |

Read the MB with the ±200 warning of the 09-13 note; the frame count is the deterministic
signal. "1" is the Studio's own main preview: a reopened surface mints **no** preview document.

**Two cheaper designs were tried on paper and fail on WebKit.** Parking the pool's frames
between opens needs a state-preserving DOM move; `Element.moveBefore` exists in Chromium and
not in WebKit (measured), and any other move reloads the frame. Keeping a surface mounted but
hidden fails on Radix: a force-mounted modal runs `hideOthers` on mount, hiding the whole Studio
from assistive tech while "closed", and keeps the scroll lock.

**What shipped: posters.** When a pool slot finishes rendering a tile, `lib/slide-poster.ts`
(lazy) captures that live document — serialized into an SVG `foreignObject`, CSS in CDATA, the
loaded font faces inlined as data URIs, drawn to a canvas at the slide's own size, encoded WebP
(2–11 KB) — and `lib/poster-cache.ts` keeps it in memory, LRU, 240 entries. A tile whose key has
a poster shows an `<img>` and never registers with the pool. The key is every prop the render
reads, the host's palette and mode, and a 160-px width bucket of the tile's LAYOUT width
(`offsetWidth`: a rect measured mid-zoom-animation crossed a bucket at 2×, and no poster was ever
found — measured, 10 frames and 0 posters on reopen, before that fix).

Fidelity, measured against the live tile: mean per-channel difference 2–4 of 255 on Chromium,
3–9 on WebKit, most of it a 1-px border that the live frame's compositor thickens at a 0.19
scale and a canvas downsample does not. Checked by eye at 1440, 820 and 390 on both engines.
The capture refuses — the tile stays live — whenever it cannot be faithful: an image, video,
canvas or embedded frame; a non-data `url()` background; a loaded face it cannot embed; Mermaid
(which settles late); more than one slide in the document.

HARD RULE #22: the serialized markup and CSS are the frame's own, already sanitized; the result
is decoded as an IMAGE, which runs no script and fetches nothing. A `]]>` in author CSS is split
so it cannot end the CDATA early.

Cost: +1,043 bytes gz on the Studio's eager route (the lookup must precede the pool request, so
it is eager by construction); the budget went 742,600 → 744,400 with the paired measurement in
`docs/route-budget.json`.
