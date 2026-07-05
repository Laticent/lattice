# tools/ — the script library

Every build generator, gate, linter, renderer, scaffolder, and release
script. **The catalog lives in `engineering/capabilities.md`** (generated
from these files' headers + `package.json` scripts, and gated so it can't
drift) — check there BEFORE writing anything new (HARD RULE #15).

Categories at a glance: build/generate (`build-*.js`), check/gate
(`check-*.js`, `affected-tests.js`), lint/audit (`lint-deck.js`,
`quality-assessment.js`, `theme-scorecard.js`, contrast audits),
render/visual (`preview.js`, `screenshot.js`, `regression-gate.mjs`,
`rasterize-for-review.sh`), release, scaffolding (`new-*.js`), and the
project queue (`sync-*.js`). `tools/lib/` holds shared helpers.

Conventions for a new tool: give the file a one-line header description
(the capabilities gate fails a TODO otherwise), register any npm script in
`SCRIPT_META` in `tools/build-capabilities.js`, and re-run
`npm run capabilities:build`.
