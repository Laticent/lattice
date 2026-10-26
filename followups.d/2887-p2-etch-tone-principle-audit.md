---
origin: 2887
priority: P2
recorded: 2026-10-25
area: chart
severity: medium
swimlane: tools/build-marks-css.js
source: https://github.com/Laticent/lattice/pull/2887
---

# Etch and tone fall short of their own stated principles in five places that predate #2887

```text
  P2 · an audit of etch and tone against chart-styling.md §3 and tone-is-the-third-finish.md
       why now   — the owner asked whether etch and tone meet their principles. Two audits
                   (the session's own, then an independent reviewer that worked cold) measured
                   the indaco renders on main and on #2887. The items below are the same on
                   main; #2887's own regression (tone stripping line names) is fixed in it.
       where     — tools/build-marks-css.js; engineering/chart-styling.md §3;
                   engineering/decisions/2026-09-07-chart-design-language/tone-is-the-third-finish.md
       done when — each item below is fixed or the principle it breaks is rewritten on purpose:
         1. Tone cannot tell categories apart on a mark that carries text. Tower and
            matrix-grid bodies step 0.016 OKLab L apart on light and about 0.012 on dark
            (the family floor is 0.06), and every edge is one ink. On a tower a share
            prints only a percentage, so a reader cannot recover its reinsurer. The
            per-category tone edge in 2887-p2-chart-finishes-as-token-swaps.md addresses
            part of this; measure tower again after it.
         2. Tone loses value where value is the datum. The heatmap's top step against its
            empty cell is 1.71:1 under tone and 1.57:1 under etch on dark (pigment 6.29:1),
            and etch's map runs 1.17-1.55:1 against land on dark. Tone's premise is "value
            is the datum", so the ramp should be the last thing it flattens.
         3. A neutral becomes the loudest mark. Under etch and tone the hub-spoke hub is
            near-black on light and near-white on dark, louder than the blocked and at-risk
            discs, which drop to pale tints. Etch and tone also paint the hub identically.
         4. Finishes converge. Tone and etch sit 0.04-0.06 apart on text-bearing marks
            (tower, matrix-grid, journey). Tone and pigment sit 0.045 apart on single-series
            charts on light (0.053 on main); #2887's flat pigment brought dark to 0.027 (0.083
            on main). The design note calls a finish that paints like another a defect.
         5. Etch's "letter" half (values, category labels in the category ink) is not
            built; the design note explains why two of the four classes cannot be done on
            today's substrate.
         Docs: tone-is-the-third-finish.md says a status body joins the one hue, while §3
         and the code keep the status hue; its "92% louder than pigment's 82%" is stale
         (pigment is the flat solid now).
       evidence  — closest-pair OKLab distance per chart and finish, both modes, main vs
                   branch: the session's .scratch/finish-audit.mjs probe (re-create it: per
                   section, read each [data-hue] mark's computed fill and stroke under each
                   marks-* class and compare). Reviewer numbers are quoted above.
       verify    — re-run the probe and node tools/chart-finish-reach.mjs --all-themes; each
                   item above moves past its floor, or its principle is rewritten with the
                   owner's sign-off.
```

Design first: items 1, 2 and 4 are one question (what tone is for), so put options to the owner
before the generator changes. Fold into the token-swap PR where it touches the same rules.
