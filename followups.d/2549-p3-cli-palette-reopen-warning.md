---
origin: 2549
priority: P3
recorded: 2026-10-06
area: engine
severity: low
swimlane: engineering/decisions/2026-10-05-reopenable-exports.md
source: https://github.com/Laticent/lattice/pull/2549
---

# Warn when `--reopenable` ships a deck whose theme came from `-p`, not the deck

why now   — `-p` / `--palette` themes one render without editing the deck, and the `.lattice`
            carries the deck as written. A deck with no `theme:` line therefore re-opens in the
            Studio in the default theme, not the one the PDF shows (decision doc
            2026-10-05-reopenable-exports.md §8, "Known gap"). Today it is documented, not said.
where     — `lattice.js` › `reopenableLattice` (compare `paletteName` with the deck's
            front-matter `theme:`).
done when — `--reopenable -p X` on a deck whose `theme:` is not X prints one warning naming
            both themes and the fix (put the theme in the deck). Or the owner decides the payload
            should carry the theme line instead.
evidence  — an arm in `test/integration/export/reopenable.test.js` asserting the warning, and
            one asserting its absence when the deck names the theme.
verify    — tier 0 gates, because it is one warning on one flag's path.
