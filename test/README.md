# test/ — the test tree

Node's built-in runner (`node:test`) — no Jest/Mocha/Vitest.

- `unit/<scope>/` — the inner loop; each scope dir maps to an npm script
  (`test/unit/palette/` → `npm run test:palette`). Full suite: `npm test`.
- `integration/` — the cross-renderer + PDF tier. The PR-blocking slice is
  `npm run test:integration:pr`; the render-heavy slice runs nightly
  (`test:integration:nightly`). Baseline decks live in `baseline-decks/`.
- `benchmark/` — the tinybench perf harness + the committed
  `baseline.json` ratchet (`npm run bench` / `bench:bless` / `bench:check`,
  HARD RULE #19).
- `quality/` — the committed quality-assessment ratchet baseline
  (`npm run quality:bless` / `quality:check`;
  see `engineering/quality-assessment.md`).
- `fixtures/`, `helpers/` — shared inputs and render/PDF helpers.

**Gotcha:** run one file with `node --test <file>`; the bare-directory
form (`node --test test/unit/core`) errors — use the glob
(`node --test 'test/unit/core/*.test.js'`).
