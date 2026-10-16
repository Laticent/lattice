# examples/ — single-feature demo decks

Small decks that each exercise one engine feature (HARD RULE #9: every
feature ships a demo deck).

Conventions:

- Filenames are lowercase-kebab (`feature-name.md`).
- A pull request commits the `.md` only. CI renders `feature-name.pdf` and
  links it on the PR, and the nightly bless bot commits it to `main` after
  the merge, so reviewers read it without building.
- Subfolders: `assets/` (sample images), `chart-theme-gallery/` and
  `token-contrast/` (own docs inside).

To render one by hand: `node lattice.js examples/<name>.md
examples/<name>.pdf` (set `CHROME_PATH` first; see
`engineering/development.md`).

Note for tooling: this file is prose, not a deck — the repo deck linter
walks every markdown file in this folder, so keep slide markup out of it.
