---
origin: 2419
priority: P3
recorded: 2026-09-27
updated: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2419
---

# Fixed-size rail and status-pill boxes do not grow with `venue: hall`.

Rendered on 2026-09-29 (PR #2493 session) — each component's gallery with `venue: hall`
added, slide 2 (list-steps: the `timeline` slide, 7), at 60 and 150 dpi. The earlier entry was
inferred from CSS; this one is observed. Handed off rather than fixed in #2493: five separate
components, each owing its own visual review, and none of them is a card tag.

```text
  P3 · [no ticket] Rail and status markers keep fixed-cqi boxes while their text grows.
       why now   — at hall the text is 1.5x; the boxes are fixed cqi, so:
                   · timeline-list date pill: the "Q1"…"Q4" text is taller than the pill's
                     outline (CONFIRMED at 150 dpi);
                   · list-steps `timeline` disc: the step numeral reads larger than its
                     disc (seen at 60 dpi, not zoomed);
                   · roadmap header meta pills ("Q2 2026"): a raw-cqi font that ignores
                     venue, so they stay laptop-size and near-unreadable at hall;
                   · .chart-status pills (progress): text fills the pill edge to edge but
                     fits — tight, not broken;
                   · kanban size letters and journey mood discs: fine.
       where     — timeline-list, list-steps (timeline), roadmap styles.css;
                   chart-family.css (.chart-status).
       done when — each marker's box is sized in em of its own text (the card-tag kernel's
                   --card-tag-pad-* pattern), so it grows with venue; hall renders clean.
       evidence  — before/after hall renders of the four galleries named above.
       verify    — tier 0 gates + a hall render per component, light and dark.
```
