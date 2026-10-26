---
status: in-progress
summary: >
  Every component that shows a status paints it the way the chart family does: a status MARK is the deck's status
  solid with its drawn mark in the one ink (`--on-mark`), and at risk and blocked wear the signal ring; a status
  LINE or TEXT is the slide ink (`--pass` … `--mute`); a status GROUND is the theme's `--pass-bg` / `--warn-bg` /
  `--fail-bg`. The deck's intensity register (`chart-finish: … muted | vivid`) moves from the chart family to the
  base, so it sets every status fill on the slide. Owner's picks on #2887.
---

# Status is one system (2026-10-24)

## 1. The question

The chart family paints a status as a deep flat fill, white text, a drawn mark and, on the two exceptions, a signal
ring (`engineering/chart-styling.md` §3). Eight other components (kpi, checklist, verdict-grid, obligation-matrix,
roadmap, policy-recommendation, regulatory-update, redline) and five base surfaces (`state-cells`, `.lat-state`,
`heat`, `note-warn`, the `tone-*` and stamp variants) read only the slide inks and mix their own tints: 4%, 8%, 9%,
12% and 14%, with the drawn mark knocked out to the slide (`--bg`). So a "blocked" pill on a chart and a "blocked"
disc in a checklist were colored by two different rules. The owner asked for one system
(`2026-10-24-chart-color-token-ledger.md` §6) and picked, after prototype renders in indaco dark, cuoio light and
deuteranopia dark:

- **Solids and marks** for every status mark, not the ink alone.
- **Theme tokens** for every status ground, no local mixes.
- **One intensity per deck**: the vivid register sets the components' fills too.
- **The ring on every exception**, at every size.

## 2. The rules

A status has three jobs, and each job has one token family.

| Job | What it is | Paints | Example |
|---|---|---|---|
| **Mark** | a shape that says the status: a disc, a pill, a badge, a bar | the deck's status solid (`--state-X-hue`, which is `--X-mark` or `--X-vivid-mark` by the register), its drawn mark in `--on-mark`, and on warn and fail the signal ring inside the edge | a checklist disc, a verdict badge's disc, a kpi status pill, a gantt bar |
| **Line or text** | a status drawn as a stroke or written as a word on the slide | the slide ink `--pass` … `--mute` | a checklist row's rail, a roadmap cell's label, a kanban header |
| **Ground** | a tinted background behind body content | `--pass-bg` / `--warn-bg` / `--fail-bg` | a checklist row, a heat cell, a policy's closing ask |

**Text on a status ground is neutral text.** A slide ink on a 10% tint of itself misses 4.5:1 (amber on amber: 4.31 on
carbone light, twelve palette-modes below the bar), and a status solid is a mid-tone on the dark face, so neither can
be text on its own ground. A caption or label that sits on a status ground (policy's "The ask", a roadmap `status`
cell's label) takes `--text-heading`; the ground, the rail and the mark carry the color. Under `heat` the ground
follows the inverted role, like the mark and the rail.

The mark's knockout changes from the slide (`--bg`) to the one ink. On a deep fill the two match on a light slide;
on a dark slide the slide is navy or black and the ink is white, so the knockout follows the chart family. The
unsettled answers (`[ ]` todo and `[?]` unknown) stay hollow rings, and `[/]` skip stays a neutral disc: none of
them is a status solid.

## 3. Where it lives

- **The intensity pointer** `--state-pass-hue` … `--state-mute-hue` moves from `.chart-frame` to `:root` and every
  top-level `section` in the base (`section:not(section section)`, so an author's nested `<section>` inherits the
  slide's intensity instead of resetting it), with the `chart-finish-vivid` remap. Every component on the slide inherits it. No new token: the pointer
  already existed, chart-family only.
- **The disc recipe** is carried five times (checklist, verdict-grid, obligation-matrix, `state-cells`,
  `.lat-state`). Each class mapping now sets four ROLE colors on the leaf, in one line: `--state-color` (the fill),
  `--state-ink` (the rim, the rail, the outline variant's ring and mark), `--state-signal` (the exception ring,
  left unset with `initial` otherwise) and `--state-glyph-mark` (the knocked-out mark: the one ink on a finding, the
  slide on a neutral state). The readers of color, ink and glyph mark take no fallback, because every generated disc
  carries a mapped class; a bare `.badge` written by hand gets the neutral roles from its own rule. The signal is
  read with one, and that is what it is unset for: the default disc reads `var(--state-signal, transparent)` for its
  ring layer, and `checks-outline` / `checks-tonal` read `var(--state-signal, var(--state-ink))` for their inner ring,
  so on warn and fail that ring IS the signal. One visible inset ring is a native shape in the office export
  (Calco); the first cut drew the signal as a second inset ring over the ink ring, which Calco keeps as a picture.
  The `checks-*` variants keep working on the same scalar knobs, and every variant keeps an edge in the ink.
- **A mark on a tinted ground keeps a rim in the status ink.** The first cut dropped the disc's rim, since a
  status solid clears 3:1 off the slide. The composed-contrast gate then failed 82 pairs, and the cause is
  arithmetic, not tuning: on a dark slide a fill deep enough for white text at 4.6:1 tops out near 0.18
  luminance, and any tint lifts the ground to about 0.03 or more, so no such fill clears 3:1 against a tinted row
  (at most about 2.85). So the default disc wears a hairline rim in its slide ink, the color of its row's rail,
  as a gantt bar does, and a kpi pill wears a 1px outer ring in the ink. Every `checks-*` variant keeps an edge in
  the ink: bold and knockout keep the rim, and outline and tonal draw their ring and mark in the ink, not the
  solid (a checker measured the solid ring at 2.40:1 on a dark pass row, against 10.91 for the ink).
- **A caption on a status ground is a heading.** Policy-recommendation's "The ask" moved from the stance ink to
  `--text-heading`: amber text on the 10% amber ground missed 4.5:1 on twelve palette-modes, and the old 9% tint
  was tuned as the knee for exactly that pair. The ground and the bar's border still carry the stance.
- **kpi's pill is built for the office export.** Calco lifts a border plus one OUTER ring as a native shape, but not a
  border plus an inset ring, so the kpi pill cannot wear the chart pill's inset signal. Its 1px border carries the
  role instead: the pill's own fill on pass (so it reads as no border) and `--warn-signal-mark` on warn, 1px wide
  rather than the chart ring's `--state-signal-w`. The ink rim is the one outer ring
  (`box-shadow: 0 0 0 1px var(--kpi-pill-rim)`). Its mark is masked centered in a box 0.3em wider than the mark,
  and the pill gives the 0.15em that lands before the mark back from its own leading padding.
- **kpi's status pill draws its mark.** The status solids share one lightness, so a label in one ink on a status
  fill carries the status by hue alone; under achromatopsia the trio collapsed from 0.1174 to 0.034 the last time
  it was measured. The row-position hooks that pick the pill's color pick its mark (check, dash) too.

## 4. Measured

- `tools/composed-contrast.js`: 0 regressions, 0 unlisted; the frozen sub-AA baseline drops from 14 to 10 (the
  four policy amend/oppose badge rows went stale when the badge became a status mark).
- Before and after renders: checklist, verdict-grid, kpi (ops, trajectory) in indaco, cuoio and
  a11y-deuteranopia, light and dark; policy-recommendation, obligation-matrix `heat`, roadmap `status` and
  regulatory-update `priority` in indaco, light and dark.

## 5. What does not move

- **Redline.** Its colors mean inserted and deleted text, not a status. `ins` and `del` already read
  `--pass-bg` / `--fail-bg`; the old/new blocks keep their 4% grounds. Retinting them to the 10% status ground
  would turn a quiet diff into a traffic light.
- **Stamps and `tone-*`.** These are document classification (CONFIDENTIAL, DRAFT) and a slide's tone rail, not
  status marks.
- **Positional status.** kpi and regulatory-update assign status by item position. The positions stay; only the
  paint changes.
