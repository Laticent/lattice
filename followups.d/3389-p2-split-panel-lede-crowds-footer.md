---
origin: 3389
priority: P2
recorded: 2026-11-21
area: statement
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §8
deferred: off-path — an engine layout fix; #3389 adds the gate and corpus that found it
source: https://github.com/Laticent/lattice/pull/3389
---

# split-panel's lede sits on the running footer

`split-panel` bottom-anchors its featured panel, so the last line of the panel (the lede) ends
about 3.5 px (CSS) above the running footer whatever its length. Shortening the corpus slide's
heading from four lines to two and its lede from two lines to one moved the gap by 0 px. Both
judges of the first §8 round named it the worst slide of every preset (22 to 26 px at 2560 wide).
`node tools/check-jank.js split-panel --anchor footer --front-matter 'footer: Confidential'
--max 12` reports it only as advisory CROWDING (9.5 px into the bottom padding at step 12).

done when — on the preset corpus (`test/fixtures/preset-corpus.md`, slide 5) the panel's last line
clears the footer by the same band every other layout keeps, measured on the rendered slide, in
classic and brand, light and dark.
