---
origin: 2457
priority: P1
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2457
---

# Owner's call on #2457: split panels on a finish deck — frosted veil (shipped) or dark field with the finish painted on it

#2457 lets a `finish:` show on split slides by frosting the feature panel (a `--bg-alt` veil +
seam, canvas inks). The inversion pass (HARD RULE #25) showed the engine already has a
precedent that goes the other way: `title` / `divider` / `closing` / `topic` KEEP their dark
field and paint the finish on it (`--fin-canvas: var(--surface-inverse)`, base.finish.css
§#1656). The owner's report reads either way, so the call is theirs. A/B renders are on #2457.

```text
  P1 · Pick A (veil, shipped) or B (dark field + finish painted on it) for split panels
       why now   — it decides whether split slides on a finish deck keep their dark
                   anchor; #2457 cannot merge until the owner picks.
       where     — split-panel.styles.css / split-compare.styles.css finish blocks.
                   B needs BOTH finish writers to re-evaluate on the panel: the
                   shipped-preset writer (lib/finishes/preset-css.js, selector
                   `section.finish-<name>`) and the Studio writer
                   (lib/finishes/finish-generate.js, `section.finish.finish-<name>`)
                   emit their rule for the panel too, with `--fin-canvas` and
                   `--field-accent` re-pointed there; the OPAQUE FLIP in
                   base.finish.css must also match the panel, or the PDF face mixes
                   toward the light canvas (the #1656 defect). The prototype was a
                   render-only `style:` override, not a build.
       done when — the picked option ships; for B, a finish deck's split panel keeps
                   `--surface-inverse` with the finish texture on it in BOTH the
                   screen face and the exported PDF, on all 8 presets and a Studio-
                   generated finish, light and dark.
       evidence  — rendered PDF (not only PNG — the opaque face is export-only) of
                   examples/split-panels-jank.md on strata, halo and ledger, light +
                   dark, via SendUserFile; tools/check-slide-contrast.js on it.
       verify    — tier 2 for B (it changes the finish compositor both writers
                   feed, and the export face), tier 0 for A (already trio-reviewed).
```
