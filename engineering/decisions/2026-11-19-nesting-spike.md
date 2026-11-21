---
status: shipped
summary: >
  Phase 4.1 of the bundle plan: lib/base/base.table-reflow.css is now written with native CSS nesting and
  tools/build-css.js lowers it (esbuild, nesting only) to the flat rules every shipped file carries. Its
  source is 57% smaller without comments and repeats its long slide prefix 35 times instead of 277; every
  minified shipped file is byte-identical and the unminified bundle is rule-for-rule identical. A hand-written
  :is() alternative needs no build step but saves only 13%. Verdict: adopt, per file, behind the
  NESTED_SOURCES list, the equal-specificity guard and a rule-equivalence proof.
---

# Nesting spike: base.table-reflow.css written nested, shipped flat (2026-11-19)

**Owner's ask (D4 in `2026-11-19-bundle-legibility-and-slimming.md` §4):** try it, and let the
numbers decide its value against the alternatives.

## What changed

- `lib/base/base.table-reflow.css` is written with native CSS nesting. Its rules mostly target the
  same table twice, once under the content stage and once directly on the slide, and each of those
  two selectors carried a 92-character slide prefix. Each `&` block now names the pair once.
- `tools/build-css.js` lowers the files in `NESTED_SOURCES` (only this one) with esbuild at target
  `esnext` and `supported: { nesting: false }`, so nothing but nesting is rewritten. Every other
  source still reaches the bundle byte for byte.
- **Guard G6.** A nested rule under a two-selector parent lowers to a leading `:is(A, B) rest`, which
  `distributeLeadingIs` later splits into `A rest, B rest`. That split keeps the cascade only when A
  and B are equally specific. `assertEqualIsArms` refuses the build otherwise. It lives in the build,
  not in `lib/core/leading-is.js`, because that kernel also runs in the browser over an author's own
  CSS, where it has no parser and must not throw. Today's 166 source files hold 1,216 leading
  `:is()` selectors and none has unequal arms, so the guard costs nothing on current sources.
- `tools/lib/css-specificity.js` holds the one specificity function, now shared by
  `build-marp-vscode-css.js` and the guard. `tools/css-rule-equiv.js` proves two sheets carry the
  same rules in the same order.

## The measurements

Three candidates, all producing the same shipped rules: **flat** (today), **A: nested** (shipped
here), and **B: hand-written `:is()`**, one `:is(P1, P2)rest` per rule. B needs no new build step,
because `distributeLeadingIs` already splits leading `:is()` in every bundle.

| Measure | Flat (today) | A: nested | B: `:is()` by hand |
|---|---|---|---|
| Source bytes | 81,656 | 42,511 | 72,372 |
| Source bytes without comments | 69,458 | 29,750 (−57%) | 60,191 (−13%) |
| Source gzip (Node zlib, level 9) | 7,551 | 6,796 | 7,048 |
| The 92-character slide prefix, written | 277 times (24.7 KB) | 35 times (3.1 KB) | 277 times |
| Longest line | 478 | 327 | 386 |
| Lines | 663 | 611 | 658 |
| `dist/lattice-min.css` (raw / gzip) | 1,172,119 / 143,511 | **byte-identical** | **byte-identical** |
| `dist/styles-min/*`, `lattice-vscode*-min.css`, `lattice-default-min.css` | | **byte-identical** | **byte-identical** |
| `dist/lattice.css` (raw / gzip) | 3,118,271 / 857,968 | 3,106,871 / 854,100 | 3,118,183 |
| Rules in `dist/lattice.css` that differ (`css-rule-equiv`, 5,605 rules) | | 0 | 0 |
| `css:build` median of 5 (ms) | 1,890 | 2,048 and 2,276 (two sets) | 1,812 |
| The lowering step alone, with G6 (median of 21) | | 20 to 28 ms | |

`dist/lattice.css` shrinks only because esbuild drops this file's comments on the way. They stay
in the source, where people edit; the plan's Phase 1.1 strips prose comments from the bundle anyway.
The `css:build` medians vary by about 400 ms between sets on this machine, while the step itself
measures 20 to 28 ms, so most of that gap is noise.

**Specificity.** `css-rule-equiv` compares every selector's specificity, and the lowered,
distributed file equals the flat one on all 153 rules (0 differing). Mutating one declaration makes
it report 1 and exit 1, so the check can fail.

**Computed style on every deck.** Every minified sheet the renderers load is byte-identical, so no
deck can compute a different style through them. To check that on real renders, the 8 table-heavy
decks (`responsive-tables`, `reflow-legal`, `table-component`, `table-outer-edge`,
`universal-table`, `list-tabular-responsive`, `chart-phone-responsive`, `adaptive-sweep`) were
rendered through `lattice.js` on the flat build and on the nested build: all 8 HTML files are
byte-identical. No browser computed-style pass was run, since identical documents leave nothing to
compare. `dist/slides.css` and `lattice-default.css` (the unminified packed forms) are rule-for-rule
identical (0 of 5,612 differ).

## Verdict

**Adopt nesting for sources where a selector prefix repeats, file by file.** It removes 57% of
this file's source and almost all of its repetition, and it ships nothing new: the minified bytes
do not move. Hand-written `:is()` is the cheaper machinery but buys little, because each rule still
writes both long selectors.

Conditions for 4.2 (the chart-family generated sheet, the `figure` dual-surface arms):

1. A file joins `NESTED_SOURCES` explicitly. Nothing is detected from content.
2. Its PR shows `node tools/css-rule-equiv.js <flat> <nested> --lower` at 0 differing rules, and
   `dist/lattice-min.css` byte-identical (or a diff that is only whitespace or quoting, explained).
3. The guard stays: a rule that starts with `&` under a parent list of unequal specificity refuses
   the build. (`.y &` under such a list is fine: it lowers to an `:is()` that is never split.)
4. Every gate in `tools/check-ownership.js` reads CSS through `readCssSource`, which lowers each
   `NESTED_SOURCES` file first. A nested file a gate read raw would show it selectors starting
   with `&`, and `checkSectionBoxOwnership` would miss `section.chart-frame { &.x { … } }`.
   `test/unit/cli/css-nesting.test.js` pins that no gate reads a CSS file raw.
5. A generated sheet (`chart-family.styles.generated.css`) is nested by changing its generator,
   not by hand.

**What it does not buy.** Shipped bytes. Nesting is a source-readability change; the bundle stays
flat for Marp. The byte work is the plan's Phases 1, 2 and 6.
