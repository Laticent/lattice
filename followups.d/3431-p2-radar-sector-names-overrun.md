---
origin: 3431
priority: P2
recorded: 2026-11-23
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-22-tall-canvas-retired.md
deferred: large — the phone form must reserve room for sector names and the wrap must bill them at the size they paint; both move every radar quadrant on a phone page and need their own before/after sweep
source: https://github.com/Laticent/lattice/pull/3431
---

# A radar quadrant's sector names run off the canvas on a dense radar (phone pages)

```text
  P2 · radar quadrant: sector names clip at the canvas edge, and break mid-word, on dense radars
       why now   — PR 3431's review generated 120 seeded random radars (2 to 5 sectors, up to 18 axis names) and
                   measured the painted sector names in Chromium. On main, 80 of them clip a name at story and mobile
                   (78 at 4:5, 54 at square), by up to 60 units: TECHNOLOGY cut to "NOLOGY" at the left edge. Names
                   also break mid-word (TECHNO-LOGY at square). PR 3431 adds no clip and fixes none of these.
                   The gallery and every deck in the tree are clean; this is dense input.
       where     — lib/plugins/chart-family/kinds/radar/radar.transform.js:
                   · `radarForm` sizes its pad with `rimPad`, which reserves room for the axis names only;
                   · `fsSector` wraps a name at the TITLE role with 0.04em tracking, while the phone stylesheet
                     (chart-family.styles.css) paints it at the REGION role with 0.06em: about 17% wider;
                   · `upperAdvance` (svg-label.js) bills tracked capitals short too (GO TO MARKET by 9%).
                   Wrapping at the painted size alone made things worse (PROCES-S): the wrap budget
                   (AXIS_LABEL_MAX_W) is too narrow for a region-size name, so it has to change with it.
       done when — on the 120 seeded radars at 4:5, story, mobile and square, no sector name's painted box leaves
                   its svg, and no name breaks inside a word.
       evidence  — the generator and the Chromium edge check are in PR 3431's review round (seed 7, 120 cases).
       verify    — the same sweep, main against the branch, reports 0 clipped and 0 mid-word breaks.
```
