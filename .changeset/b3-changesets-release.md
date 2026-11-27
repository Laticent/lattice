---
"@laticent/lattice": minor
---

Lattice now releases with Changesets: the engine and twelve libraries publish to npm, each on its own version line, with one changelog per package.

`tools/release.js` runs `changeset version` in the release PR and `changeset publish` after it merges, in dependency order and with provenance. Pending `changelog.d/` fragments still work: the release converts each into an engine changeset. The first release ships the engine at 1.0.0 and each library at 0.1.0 without bumping them. Decision `engineering/decisions/2026-10-07-first-npm-release.md` §11.
