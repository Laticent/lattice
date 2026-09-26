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
