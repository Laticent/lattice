---
status: shipped
summary: >
  Recommendation 8 of the 2026-09-20 narration audit, built. Every component whose manifest
  declares data plus an svg/spatial figure now reads its numbers aloud through one generic
  narrator, in three list shapes plus a markdown table — so the bar chart that said "Revenue ·
  FY26. Growth is concentrated in two regions." and stopped now names all four regions and all
  four values. Mean coverage 0.674 to 0.839 across 71 components, 11 improved, none regressed,
  measured through the real CLI. It computes NOTHING: the floor reads what the author typed and
  a hand-written narrator stays the upgrade. The roster is derived from the projection catalog,
  not hand-listed. An independent checker pass blocked the first version and found five real
  defects — a red gate, a deleted eyebrow on a shipped deck, a deleted data row, a table
  narrating a value the chart never draws, and a class-token collision that fired the floor on
  two components it does not model — plus ten surviving mutants, one of which was the whole
  feature being unwired. All fixed; the mutation table is in the PR.
companion:
  - ./2026-09-20-narration-audit.md
  - ./2026-07-09-cadenza-narration-quality.md
  - ./2026-09-13-projected-rosters.md
---

# A floor under every picture-bound chart (2026-09-21)

**The symptom, quoted from the audit it answers.** A bar chart narrated
*"Revenue · FY26. Growth is concentrated in two regions."* and stopped. The four regions and
their four values are in an `<svg>`, `SPEECH_SKIP_SELECTOR` skips the picture, and nothing
replaced it. Nineteen components scored 0.09–0.28 of their source characters while
HTML-substance ones reached 0.80–1.07.

**What shipped.** `narrateDataSeries` in `lib/core/chart-narration.js`, LAST in `NARRATORS`,
covering every component whose manifest declares `data: true` and a `figure` of `svg` or
`spatial` — 14 names, three of which already have a hand-written pilot that wins on order.

| | before | after |
|---|---|---|
| line | 0.09 | 1.19 |
| map | 0.12 | 1.25 |
| slope | 0.14 | 1.19 |
| piechart | 0.16 | 1.03 |
| word-cloud | 0.16 | 0.88 |
| stacked-bar | 0.19 | 1.14 |
| heatmap | 0.22 | 1.26 |
| waterfall | 0.23 | 1.38 |
| bullet | 0.26 | 1.47 |
| bar | 0.28 | 1.33 |
| scatter | 0.35 | 1.83 |
| **mean, 71 components** | **0.674** | **0.839** |

Re-derive with `node tools/measure-narration-coverage.mjs`. Eleven components moved, none
regressed.

## The argument for it is different from the pilots', and that is the point

`chart-narration.js`'s own policy said a narrator earns its place *"when the render computes a
fact a listener needs and the raw text doesn't say"* — funnel's stage-over-stage conversion is
the model. `2026-07-09-cadenza-narration-quality.md` §7 used that to refuse the rest: a
component that TYPES its numbers (piechart's `46%`, word-cloud's rank) had nothing to add.

**That is true of insight and false of coverage.** A typed number nobody hears is not "already
narrated". So §7's second half is retired in place, the file's opening docblock now states two
bars rather than one, and the floor's bar is the lower one on purpose: the numbers reaching the
voice at all. A pilot remains the upgrade on top, and `bullet` is the obvious next one — its
manifest declares the measure/target grammar in prose, so a narrator could say
"sixteen percent below the plan line" where the floor honestly reads two numbers in order.

## What it refuses to say

The floor computes nothing and names nothing the slide does not. A `scatter` row binds each
value to the axis its eyebrow legend names; a `bullet` row's two pills read in authored order,
because nothing in the Markdown says which is the measure. Inventing that from pill position is
the defect class the audit is about.

## The roster is derived, and the class gate reads the component

The 14 names come from each manifest's own `projection` block via the generated catalog, so a
new SVG chart is covered the day it declares itself. `2026-09-13-projected-rosters.md` records
what a hand-kept roster costs — four separate literals held the same twelve names and not one
went red when a chart was missing.

The gate reads the **first** `_class:` token, not any token, and that is a fix rather than a
style: three roster names are also modifiers of a different component. `list … bullet`,
`journey heatmap` and `radar quadrant` all appear in shipped decks, and membership matching
fired the floor on all three. The cost is a false negative on a deck that writes a modifier
ahead of its component, which is the safe direction — a miss costs coverage, a false positive
costs a sentence that misstates the slide.

## The checker pass is the substance of this note

A tier-1 independent checker ran on the first version and **blocked it**. Five real defects,
every one confirmed by running code rather than reading it:

1. **`npm test` was RED.** `narrator-note-leak.test.js` enumerates `module.exports` and demands
   a fixture per narrator precisely so a new one cannot join unchecked. The new export had
   none, and the throw took a second cell down with it — so the "base flattener leaks no note"
   check was covering zero narrators.
2. **A shipped deck's eyebrow was deleted.** `examples/proposal-charts-expansion.md` authors a
   caption AND an axis legend on separate lines. The legend regex used `\s*` between pills,
   `\s` matches a newline, so one match spanned both lines — and the code then consumed the
   line unconditionally whether or not the names bound. Re-derived by hand: the consumed index
   was the CAPTION's, so `Tooling spend review` was read by nobody.
   *A note on the evidence:* the checker proved this by grepping the emitted `.vtt` for the
   phrase and finding zero. That instrument is unsound — a multi-word cue carries karaoke
   `<timestamp>` tags BETWEEN its words, so the phrase never greps whether it is there or not.
   The conclusion held anyway, established a second way. Strip the tags before grepping a
   `.vtt`.
3. **A data row was consumed and then filtered out**, i.e. deleted. A row whose whole label
   sits inside the code span (`- ``residency`` ``1```) peels to an empty label. Now the filter
   runs before the consume, so the flattener still reads it.
4. **The table narrated a value the chart never draws.** `heatmap.transform.js` parses the
   RENDERED table, and markdown-it reconciles a ragged row against the header: a cell past the
   header count is dropped, a short row is padded. The narrator read the raw row, so an extra
   cell announced "column 3, three" for something not on the slide, and a short row fell
   silent about a cell the chart paints as unmeasured. It reconciles the same way now. A
   one-column table bails, and an authored cell note (`` `# rollout paused` ``) is split off
   the value and spoken beside it rather than read into it.
5. **A three-level list was flattened.** `radar`'s `quadrant` variant is group > sub-group >
   axis; the floor read it as *"G: Axis, nine. H: Axis, seven. Sub. Sub."*, tearing every
   sub-group name off its data. `narrateRadar` refuses that shape in exactly those terms, and
   the floor now does too.

**And ten surviving mutants, which is the finding that mattered most.** Deleting
`narrateDataSeries` from `NARRATORS` entirely left all 192 tests green — the whole feature
could be unwired with CI passing. Four separate deletions of a `consumed.add(…)` also survived,
each making a slide say everything twice. One dispatch test was vacuous by construction: the
floor's output for the radar sample is byte-identical to the pilot's, so that arm passed even
with the floor moved to the FRONT of `NARRATORS`. The suite was rewritten around those holes
and the battery re-run: **17 of 19 mutations now fail at least one test.**

Two survive and are recorded rather than papered over, because both are genuinely equivalent
under the current design: relaxing `p.data === true` to `p.data !== undefined` changes nothing
while all 14 svg/spatial components declare data (the test pins that premise instead), and
relaxing the eyebrow scanner's `[ \t]` back to `\s` changes nothing now that the loop tests one
line at a time (the per-line iteration is the guarantee; a comment says not to collapse it
back).

**One of my own tests was tautological**, and it is worth naming: the roster test looped the
catalog and built its `expected` with the same predicate as the implementation, so widening the
filter changed both sides together and it could not fail. It is a snapshot of the derived
membership now — the derivation is still the mechanism, the snapshot is the tripwire a reviewer
sees in a diff.

## What is NOT verified

**How any of it sounds.** Every number here is the emitted `.vtt` bytes or a value computed in
process. No synthesis ran, so the strings this produces — `"M1, sixty-two (rollout paused)"`,
`"no data"`, a nine-sentence word-cloud — are unheard (HARD RULE #23).

**The browser read-along and Present surfaces.** Only the CLI export path was driven. The
narrator is bundled to the browser through `tools/build-read-along-core.js` (whose hand-kept
re-export list was missing this narrator, and `narrateJourneyMood` before it — both added), but
the Studio was not built and served for this.

**Whether a nine-row word-cloud read as nine short sentences is the right shape** for a
listener, as against one semicolon-joined run. Flat rows read one sentence each, matching
funnel's proven model; that is a judgment nobody has heard tested.
