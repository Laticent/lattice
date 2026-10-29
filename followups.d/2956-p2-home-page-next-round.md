---
origin: 2956
priority: P2
recorded: 2026-10-28
area: website
severity: medium
swimlane: engineering/decisions/2026-10-28-home-positioning-audit.md §14
source: https://github.com/Laticent/lattice/pull/2956
---

# Home page: the next round toward 9.5 (final scores 7.9 visitor, 8.0 craft)

```text
  P2 · [no ticket] take the home page from ~8 to 9+
       why now   — the final independent rescore on PR 2956 put the page at 7.9 (visitor lens) and
                   8.0 (craft lens), up from 6.4 / 6.2 on main. Both reviewers named the same next gaps.
       what      — (1) the hero: the $4M big-number is readable but sparse, and the page's
                   strongest proof is the memo-to-waterfall before/after one section down. Both
                   reviewers propose moving that transformation into the hero.
                   (2) repeats: "renders what you wrote" (hero + proof band), "one command renders
                   PDF/PPTX/PNG/HTML" (three places), the Studio pitched three times; merge the
                   drift cards into the brand section.
                   (3) the blank-canvas contrast is told, not shown: a small drift visual
                   (mismatched hand-made slides vs matching Lattice slides).
                   (4) the Marp/Slidev engineer dropped to ~6.5-7.5: one "Coming from Marp or
                   Slidev?" line in For builders, linked to /comparison.
                   (5) room cards describe layouts, not outcomes; give each one before/after line.
                   (6) the palette carousel can open on "A11y Deuteranopia"; label the a11y
                   palettes in plain words ("Color-blind safe") or start the cycle on the brand palette.
       status    — items (1)-(6) landed in PR 2956 itself (audit §15); what remains is the
                   rescore and real-user proof.
       blocked   — a 9.5 also needs real-user proof (a quote, a named pilot, a measured outcome);
                   the page has none and must not invent one.
       done when — a rescore with the same two-lens rubric reads 9+ on both, and the page passes
                   tools/screenshot.js at 390/820/1440 with no horizontal overflow.
```
