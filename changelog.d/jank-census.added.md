- **Added: `tools/jank-census.js` — the jank sweep, pointed at the whole catalog.**
  `check-jank` answers one question about one component; nothing had ever asked it
  across the catalog, so the only jank evidence in the repo covered essentially one
  component. The census runs `--anchors` over every manifest class and variant (272),
  ranks what moves, and reports a class it could not measure as UNMEASURED rather than
  as clean.
- **Added: `--marks`, which sweeps the running marks a component census cannot reach.**
  `mark-orbit`, `stamp-seal` and the rest are base MODIFIERS, not manifest variants, so
  a catalog sweep never renders one — and a `section::before` running mark is the
  archetype `check-jank` was built from. All 23 hold position across the sweep; that is
  the first time it has been measured.
- **Added: `engineering/jank-census.md` — the committed table**, regenerable by the one
  command printed at the top of it.
