---
status: shipped
summary: >
  Why the chart finishes kept see-sawing on #2908. Measured over 32 themes x 2 modes x 3 finishes, text contrast does
  not hold any chart under 9: on those charts the worst text run is the same in all three finishes. What binds is
  CHANNELS: a single-ink mark (a word, a line) has one color channel, and etch's trait needs two (a wash and an ink
  edge). AA binds in one place, text on its own ground inside a body: a kanban card's inline code caps the card wash
  at 8%, and etch and tone exceed it today (4.07:1 and 4.19:1 on carbone light). Per chart class, which constraints
  bind, the measured ranges, and the exceptions put to the owner.
---

# The finish invariant: a finish needs as many color channels as its trait has parts

**Proposed** 2026-10-28, from `followups.d/2908-p3-finish-invariant-study.md`. **Decided** 2026-10-29: the owner
picked the cap for item 2 and, for item 1, etch's line weight on a slope with the word-cloud fallback named
(decision card D1 A, D2 B)
and did not veto item 3. All three shipped in PR #2960; item 4 is the open taste call.

## 1. The answer

#2908 went through several fix-and-revert rounds on the same charts: tone progress went to one hue and back, the
pigment kanban tint went in and came out for AA, and the status levels went up and came down. The owner's question was
whether a constraint underneath cannot be satisfied, so that tuning is chasing its tail.

There is one, but it is not the one the follow-up guessed. The hypothesis named three constraints:

1. **AA**: text on a mark clears 4.5:1.
2. **Trait**: the mark shows its finish's trait (pigment a solid body, etch a pale wash plus an ink edge, tone a shade
   of one hue).
3. **Consistency**: one level per class (one status level per finish), and a category hue only where it means
   something.

Measured, **(1) binds in exactly one place: text that sits on its own ground inside a finished body** (a kanban
card's inline code), where etch and tone fail it today (§4). Everywhere else the worst text run on every chart clears
4.5:1 in every finish, and on the charts still under 9 the worst run is the same number under pigment, etch and tone
(§3), so no finish is trading contrast for its look there. The collision that remains is between **(2) and the number of
paint channels a mark has**. A finish trait is a recipe of parts: etch is a body AND an edge. A mark with one channel
(a word is one fill; a line is one stroke) can carry one part. On those marks etch either drops its trait (today: it
renders exactly as tone does) or spends the text's only channel on it (outlined letters), which reopens (1).

That is the invariant, and it is structural: **a finish can only show a trait on a mark with as many channels as the
trait has parts.** No tuning of levels changes a mark's channel count, which is why rounds of level changes on these
charts moved scores without settling them.

## 2. How it was measured

- **Every text run, every chart.** `tools/chart-finish-reach.mjs` renders the chart gallery
  (`lib/components/chart/chart.gallery.md`, one or more slides per chart) per theme and mode and measures every text run with the
  repo's contrast probe (`tools/check-slide-contrast.js` `PROBE`) under no finish and under each finish. A scratch copy
  wrote every run to JSONL instead of only the regressions: 175,360 runs over 32 themes (every shipped palette but
  `a11y-base`) x light and dark x {none, pigment, etch, tone}. The shipped tool, in `--check` mode on the same tree
  with `print` added, reported **0 regressions** in all three finishes.
- **Status solids.** OKLab lightness and chroma of `--pass-mark` / `--fail-mark` (muted) and the `-vivid-` pair, read
  from each brand theme's `light-dark()` declarations (14 brand themes; the a11y themes and `*-dark` aliases declare
  these elsewhere or inherit them), and each one's WCAG contrast against the theme's own slide.
- **Kanban card tint.** One kanban slide with inline code on plain cards, rendered per theme and mode, the card
  background swept from 0% to 30% of the first hue over the slide, then measured again under each shipped finish;
  every `<code>` run read with the same probe.
- **Scores** are #2908's blind scorers' (r15, mean of 2, on cdf3de6). They are the reason a chart is on this list, not
  part of the measurement.

## 3. Per chart class: which constraints bind

Worst text run per chart over all 64 theme x mode pairs (ratio : 1, need 4.5):

| chart | none | pigment | etch | tone | what sets the floor |
|---|---|---|---|---|---|
| kanban | 4.58 | 4.58 | 4.58 | 4.58 | a column title on concrete dark: the member's ink, not the finish |
| word-cloud | 4.65 | 4.65 | 4.66 | 4.66 | a word on concrete light |
| slope | 4.67 | 4.67 | 4.67 | 4.67 | the axis year, the theme's muted ink |
| bullet | 4.67 | 4.67 | 4.67 | 4.67 | the target label, the theme's muted ink |
| risk-matrix | 4.60 | 4.64 | 4.67 | 4.67 | a risk number on a11y-deuteranopia dark |
| flowchart | 4.67 | 4.60 | 4.67 | 4.67 | a node name, the per-body ink pick (pigment) |
| progress | 4.60 | 4.60 | 4.67 | 4.67 | the status word beside the bar |
| roadmap | 4.55 | 4.55 | 4.55 | 4.60 | the phase-date pill on laguna light, a member color |
| heatmap | 4.60 | 4.60 | 4.58 | 4.60 | a cell value, the per-body ink pick |

Two numbers recur. **4.58** is the floor of `inkOn` (`tools/build-marks-css.js`): a mark that picks black or white
from its own body clears at least 4.582:1 by construction, so wherever a finish moves a body under text, the text
cannot fail and cannot do much better than that on a mid-tone body either. **4.67** is the theme's own muted ink on
concrete light, which no finish touches. The finish is not the binding term on any row.

By class:

- **Text-bearing bodies** (gantt bar, state tile, flowchart node, matrix cell, heatmap cell, status pill). (1) cannot
  bind: `inkOn` holds 4.58:1 on any body. (2) and (3) are free to choose. A score under 9 here (tone flowchart 8.5) is
  a taste call about the level, not a constraint, and a level change can settle it.
- **Text-free bodies** (bar, wedge, disc, progress fill, a roadmap status disc). No text, so (1) does not apply; the
  3:1 graphical floor is carried by the ink edge every finish draws (`engineering/chart-styling.md` §3, floor 1). (3) is
  the only rule left, and #2908's "one status level per finish" settled it. Nothing collides.
- **Single-ink marks: a word, a line, a dot on a line** (word-cloud, slope, line, ep-curve). One channel. Pigment's
  trait (a colored body) is one part, so pigment shows it. Tone's trait (a shade of one hue) is one part, so tone shows
  it. **Etch's trait is two parts**, and today `build-marks-css.js` gives etch the same rules as tone on a word cloud
  and a slope (`if (tone || name === 'etch')`), so an etch word cloud is a tone word cloud. The blind scores say so:
  etch word-cloud 6.5, etch slope 7.5. The one way to give a word two parts is an outlined letter (a pale fill and an
  ink stroke), and then the fill is the text color a reader reads against the slide, which fails (1) at any wash pale
  enough to read as etch. **This is the invariant.**
- **A body under nested text with its own ground** (a kanban card carrying an inline code chip). The chip's text and
  ground are solved against the card the member ships. A finish that tints the card moves the chip's backdrop without
  moving its ink, so here (1) and (2) do collide, at a measured tint: 8% (§4). This is the one place AA binds, and
  etch and tone cross it today.
- **Status solids across modes** (pigment dark: reds read louder than greens on flowchart, hub-spoke, waterfall,
  progress). Not a collision: it is the hierarchy the status solver asks for (§4), seen from the dark face.

## 4. The measured ranges

**Kanban card tint under pigment** (the highest tint that keeps inline code at 4.5:1 on every theme):

| card tint (first hue over the slide) | 0% (shipped) | 4% | 6% | 8% | 10% | 12% | 14% | 16% | 20% | 24% | 30% |
|---|---|---|---|---|---|---|---|---|---|---|---|
| worst inline code | 4.52 | 4.82 | 4.66 | **4.52** | 4.35 | 4.19 | 4.07 | 3.91 | 3.65 | 3.38 | 3.04 |

Every row's worst is carbone light, except 0%, where it is the card's own ground on cuoio dark. **The ceiling is 8%.**
12% reproduces #2908's 4.19:1 on carbone exactly, which is why pigment's card takes no tint.

**The same collision is live under etch and tone today.** Their kanban cards take a wash (tone 12%, etch 14% on a light
slide, `build-marks-css.js` § KANBAN), above the 8% ceiling. Measured on the same slide with the shipped finish:

| finish | worst inline code | under 4.5:1 on |
|---|---|---|
| pigment | 4.52 | none |
| etch | 4.07 | carbone, carbone-dark, cuoio, cuoio-dark, indaco, indaco-dark, laguna, laguna-dark (light mode each) |
| tone | 4.19 | carbone, carbone-dark (light mode) |

The gallery sweep in §3 missed it because the gallery's kanban puts its inline code on cards the finish does not wash
(a status card or a `keyline`/`tinted` board), so its code runs read the same in every finish. A defect #2908
shipped; fixed in PR #2960 by capping the light-slide card wash at 8% under every finish.

**Status solids, fail minus pass** (OKLab; contrast is against the theme's own slide; 14 brand themes):

| set | face | lightness | chroma | contrast off the slide | fail louder on both counts |
|---|---|---|---|---|---|
| muted | light | +0.067 (0.061 to 0.071) | +0.109 (0.097 to 0.117) | -1.44 (-1.56 to -0.81) | 0 of 14 |
| muted | dark | +0.057 (0.046 to 0.066) | +0.135 (0.097 to 0.155) | +0.40 (+0.27 to +0.61) | 14 of 14 |
| vivid | light | +0.072 (0.068 to 0.072) | +0.077 (0.062 to 0.099) | -1.44 (-1.56 to -0.79) | 0 of 14 |
| vivid | dark | +0.066 (0.053 to 0.075) | +0.085 (0.066 to 0.121) | +0.40 (+0.28 to +0.58) | 14 of 14 |

The solver (`STATUS_BAR` / `DARK_SPREAD` in `lib/theme/chart-solids.js`) puts done deepest so that "a settled status
is the quietest mark on the slide". On a dark slide, deepest IS quietest, and the exceptions stand 0.4 further off the
slide with more chroma: the red is louder on purpose, in every brand theme. On a light slide the same order runs the
other way (deepest is the most contrast against white), and the chroma gap is what keeps red from reading quieter.
So the reviewers' "reds louder than greens in pigment dark" is the intended hierarchy, and what is uneven is the
light face, where done stands 1.4 further off the slide than fail.

## 5. What to do with it

The first two needed the owner's call because they set what a finish promises. **Outcome, PR #2960:** item 1 shipped
as the card's D2 B rather than (c) as written above: a slope's status and signal lines keep the member's own status
ink at etch's 2.6 weight, its slopegraph dots take etch's wash and an ink edge, quiet lines keep tone's one-hue step,
and the line chart was already at 2.6; the word cloud takes (a); item 2 as the 8% cap (`KANBAN_CODE_CAP`, worst inline code now
4.52:1 under every finish); item 3 is recorded in `chart-styling.md` §3. Item 4 stays open.

1. **Name the etch exception on single-ink marks.** Etch cannot show its trait on a word or a line. Options: (a) keep
   the tone rules under etch and SAY so in `chart-styling.md` §3, "What a finish does not reach": etch on a single-ink
   mark falls back to tone's one-hue steps (cost: nothing; the 6.5 stays, now explained); (b) draw etch words as
   outlined letters and exempt the word cloud's text from (1) (cost: a published AA exception on the word cloud's text); (c) give etch its own single-ink look, the category ink at full strength with the etch line weight
   (2.6) on lines and a heavier weight on words, so etch keeps "the line and the letter" without a body (cost: a design
   round and a render review). **Recommendation: (c) for slope and line, (a) for the word cloud.** A line has a
   weight to spend; a word's weight is its data.
2. **Fix the kanban card under etch and tone, then name the exception.** No finish can wash a card that carries
   inline code past 8% on a light slide (§4), and etch and tone do today. Options: cap the light-slide card wash at 8%
   under every finish (a one-line generator change; etch and tone cards read quieter), or re-solve the code chip's
   own ground so it stops depending on the card (a member change and a contrast re-solve on every theme).
   **Recommendation: the cap, now, in its own PR**; pigment keeps its accent bar and no tint, recorded as the exception.
3. **Leave the dark status hierarchy as it is**, and record in `chart-styling.md` §3 that red reading louder than
   green on a dark slide is the solver's order, not a defect. If the owner wants the light face to match ("exceptions
   louder" on both), that is a solver change in `lib/theme/chart-solids.js`, its own PR with the CVD floor re-run.
4. **Settle the remaining sub-9 text-bearing charts by level, not by rule** (tone flowchart and progress 8.5, risk-matrix
   7.5, bullet 8). §3 shows nothing structural blocks them; a level change is a taste call the blind scorers can grade.
