- **Fixed: `check:jank` reported collisions that were not there, on unmodified shipped CSS.**
  A second independent checker pass found the previous round's ink measure inventing them.
  `scrollWidth`/`scrollHeight` include the border boxes of absolutely positioned descendants,
  so every out-of-flow box the walk deliberately drops — the named anchor included — came
  back in through its own container: shipped `list-steps` reported a −219.1px collision
  against untouched CSS, and clipped text was counted as ink where nothing paints. The ink is
  the border box again, and inline escape is left to the engine's own overflow probe, which
  reports it in the same row. The same pass found the previous round only half-closed its
  headline defect — the walk stopped at the first painting box, leaving **66** positioned
  pseudos in the shipped gallery unseen with no `UNPLACED` note — and that a positioned
  pseudo's own `transform` was ignored, putting a shipped mark 15.3px from where it paints.
  Both fixed; a transform on the containing block is now refused rather than approximated.
  Three more silent exits closed: `--anchor ''`, a `--style` file that exists but carries no
  CSS, and a non-integer `--max`. The partial-anchor refusal now runs BEFORE the report, so
  `--json` can no longer emit a clean payload ahead of its own exit 2.
