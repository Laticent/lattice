# examples/ — single-feature demo decks

Small decks that each exercise one engine feature, committed together with
their rendered PDFs (HARD RULE #9: every feature ships a demo deck).

Conventions:

- Filenames are lowercase-kebab (`feature-name.md`); the pre-commit hook
  auto-rebuilds `feature-name.pdf` when the source is staged.
- The PDFs are committed on purpose — reviewers read them without
  building.
- Subfolders: `assets/` (sample images), `chart-theme-gallery/` and
  `token-contrast/` (own docs inside).

To render one by hand: `node lattice-emulator.js examples/<name>.md
examples/<name>.pdf` (set `CHROME_PATH` first; see
`engineering/development.md`).

Note for tooling: this file is prose, not a deck — the repo deck linter
walks every markdown file in this folder, so keep slide markup out of it.
