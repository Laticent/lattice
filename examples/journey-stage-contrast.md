---
marp: true
theme: indaco
paginate: true
header: "Lattice · journey stage contrast"
acronyms:
  CI: continuous integration
---

<!-- _class: title -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Title slide · title" -->

# The stage ribbon takes the canvas it is painted on

`journey · stage-label contrast · #1702 · 2026-08-17`

The section bar on every journey board was inked for a dark surface it only reaches in dark mode. Here is the fix, the four variants that carry it, and the gate that stops the class recurring.

---

<!-- _class: content -->
<!-- _footer: "The defect · content" -->

`Defect · #1702`

## White labels on a surface that was never actually dark.

The stage bar fills `--bg-alt` deepened toward `--surface-inverse`, so it follows whatever canvas it sits on — dark in dark mode, a mid slate in light. Its ink was pinned to always-white on the strength of a comment claiming the fill was "always dark". Light mode shipped 1.87:1 against a 3:1 floor, in every palette.

---

<!-- _class: journey -->
<!-- _footer: "Classic board · journey" -->

## A team's first month runs from pain to belief, in that order, twice.

- Onboard
  - Kickoff workshop `@team` `@strategy` `:2`
  - Taxonomy training `@team` `:2`
  - Intake setup `@team` `@platform` `:1`
- Operate
  - First signal scored `@team` `:4`
  - First decision logged `@team` `:4`
- Believe
  - First calibration review `@team` `@strategy` `:5`

---

<!-- _class: journey heatmap -->
<!-- _footer: "Mood-tinted chips · journey heatmap" -->

## Tinting the chips surfaces the same month's emotional contour.

- Onboard
  - Kickoff workshop `@team` `@strategy` `:2`
  - Taxonomy training `@team` `:2`
  - Intake setup `@team` `@platform` `:1`
- Operate
  - First signal scored `@team` `:4`
  - First decision logged `@team` `:4`
- Believe
  - First calibration review `@team` `@strategy` `:5`

---

<!-- _class: journey weighted -->
<!-- _footer: "Volume-weighted chips · journey weighted" -->

## Chip width shows where the traffic in that month actually went.

- Onboard
  - Kickoff workshop `@team` `@strategy` `:2` `+45`
  - Taxonomy training `@team` `:2` `+18`
  - Intake setup `@team` `@platform` `:1` `+12`
- Operate
  - First signal scored `@team` `:4` `+10`
  - First decision logged `@team` `:4` `+8`
- Believe
  - First calibration review `@team` `@strategy` `:5` `+7`

---

<!-- _class: journey swimlane -->
<!-- _footer: "Per-actor rows · journey swimlane" -->

## Lanes show who was carrying each step, and where it handed off.

- Onboard
  - Kickoff workshop `@team` `@strategy` `:2`
  - Taxonomy training `@team` `:2`
  - Intake setup `@team` `@platform` `:1`
- Operate
  - First signal scored `@team` `:4`
  - First decision logged `@team` `:4`
- Believe
  - First calibration review `@team` `@strategy` `:5`

---

<!-- _class: content -->
<!-- _footer: "The fix and the gate · content" -->

`Fix · Ink follows the fill`

## The ink now follows the fill, and a gate now watches every gallery.

`--journey-stage-fg` becomes `--text-heading`, the ink the canvas already solves for: clear of 4.5:1 on all sixty-four palette and scheme pairs, worst 5.63:1. Behind it, `tools/check-slide-contrast.js` stops being on-demand — it now gates three rendered galleries in CI.

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _paginate: false -->
<!-- _footer: "Closing bookend · closing" -->

`What This Change Leaves Behind`

## A measurement that fires without being asked.

`One tool already found every contrast defect we have shipped. It needed wiring to CI, not more cleverness.`
