---
origin: 2360
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/issues/2360
---

# Build a publish path for the workspace libraries (ltt and Cadenza together)

why now   — the libraries are packaged to be published (`@laticent/ltt`, Cadenza, Suono, Lente,
            Vetrina; each typechecks in a nodenext consumer since the step-2 PR), and Cadenza's
            published types import `ltt`'s, so the two must reach npm together. Nothing
            publishes any of them: `release-publish.yml` and tools/release.js publish none.
where     — .github/workflows/release-publish.yml, tools/release.js, the five
            docs/src/lib/*/package.json files (versions, `files`, `exports`).
done when — the owner decides whether the libraries publish at all and on what cadence (a new
            CI job or step is the owner's call — CLAUDE.md second filter, row 2), and if so, one
            release publishes ltt before Cadenza at matching versions, gated on
            test/unit/tools/package-nodenext-types.test.js.
evidence  — a dry-run publish (`npm publish --dry-run`) of ltt and Cadenza from the workflow.
verify    — maker-checker: it adds a release step and an external, irreversible surface.
