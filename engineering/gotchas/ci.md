# Gotchas — CI and the cloud sandbox

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## The `CodeQL` check reports a verdict BEFORE its `Analyze` jobs finish

- **Symptom:** A push lands, the `CodeQL` check goes red within seconds naming a
  security alert, and the alert points at code that does not exist — a line
  number landing on test data, or on a construct you already removed. You "fix"
  it, push, and the same red check reappears against the new head.
- **Cause:** `CodeQL` is an aggregate check run, not a job. It is posted early
  and summarizes the alerts *known at that moment*, which on a fresh push are the
  ones uploaded by the PREVIOUS commit's analysis. The jobs that actually
  recompute them — `Analyze (javascript-typescript)` and friends — are still
  running, and finish a minute or two later. Observed on #1427: the `CodeQL`
  check started 11:18:27 and concluded `failure` at 11:18:30, while the two
  JavaScript analyses ran until 11:19:34 and 11:19:45. The check was never
  refreshed afterwards.
- **How to tell:** compare `completed_at` on the `CodeQL` check against
  `completed_at` on the `Analyze (…)` jobs. If the check finished first, its
  verdict predates the evidence. A three-second `CodeQL` check is always stale.
- **Fix:** wait for every `Analyze` job to complete before reading the check, and
  before changing anything read the annotation's file at the reported line. A
  successful `Analyze` run with no matching code in the diff means the alert is
  from the previous head. `rerun_workflow_run` will NOT help — a run whose jobs
  all succeeded cannot be retried, so the only way to refresh the aggregate is a
  new commit.
- **Cost of not knowing this:** four force-push rounds on #1427, three of them
  chasing an alert that had already been fixed. The general rule it belongs to is
  the same one the two-pass bench gate encodes: **a check-run conclusion is not
  evidence until its inputs have completed.**
- **Triggered by:** #1427.

## Rendering in the cloud sandbox needs `CHROME_PATH`

- **Symptom:** Rendering a deck in a Claude Code on Web session fails
  with "No suitable browser found. Please ensure one of the following
  browsers is installed: chrome, edge, firefox." A new session might
  conclude no browser is available and skip rendering entirely.
- **Cause:** The headless-Chromium browser auto-detection (the owned
  engine's Puppeteer launch, and anything marp-cli-based) looks in the
  standard system locations
  (`/usr/bin/google-chrome`, etc.) and doesn't know about the
  puppeteer-cached chromium binary that the sandbox ships with. The
  binary IS present at
  `/root/.cache/puppeteer/chrome/linux-<version>/chrome-linux64/chrome`
  — auto-detection just can't find it on its own.
- **Mitigation:** Set `CHROME_PATH` in the env before rendering. The
  canonical render is the owned emulator:

  ```bash
  CHROME_PATH=$(ls /root/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome | head -1) \
    node dist/lattice-emulator.js <deck>.md <deck>.pdf
  ```

  The integration test helper at
  [test/helpers/render.js](../test/helpers/render.js) inherits
  `process.env`, so the same env var works for tests too. If you
  install marp-cli yourself (`npm install @marp-team/marp-cli`) to
  render an Export-to-Marp bundle — marp-cli is **no longer bundled**
  (P4 retired it as a render path; the owned engine renders every
  first-party path) — the identical `CHROME_PATH` discovery issue
  applies to that `npx marp` invocation.
- **Triggered by:** Any render (owned emulator, or an ad-hoc marp-cli
  invocation) in a fresh cloud-sandbox session.
- **Removable when:** The launcher adds puppeteer-cache discovery, or
  the sandbox ships chromium at one of the canonical system paths.
- **Commits:** documentation-only — captured here so future sessions
  don't conclude no browser is available.

## A generated `dist/` artifact goes "stale" after a rebase, and that is not a defect

- **Symptom:** You rebase on `origin/main` (HARD RULE #16 requires it right
  before every push), the pre-push hook runs the unit suite, and a test fails
  saying an artifact is stale — naming a subsystem you never touched. Meanwhile
  `npm run build:check` says every artifact is up to date, so two gates appear to
  contradict each other over the same file. `--no-verify` is banned (HARD RULE
  #14), so the push is genuinely stuck until you work out what happened.
- **Cause:** `dist/` has been gitignored since #1742, so everything in it is
  whatever your last local build wrote. The SessionStart hook builds once, at
  session start. Any source that arrives afterwards — a rebase, a `git pull`,
  your own edit — leaves the artifacts behind the sources, and a test that
  recomputes from current sources and compares to disk then differs for a reason
  that has nothing to do with your change.
- **The fix is a FULL `npm run build`. Not `npm run css:build`.** This is the
  part that costs a second round: `css:build` refreshes `dist/lattice.css` and
  `dist/lattice.min.css` and stops there, while `dist/marp-kit/` is built by a
  later step from `dist/lattice.min.css`. Run it alone and you trade one stale
  artifact for an internally *inconsistent* `dist/`, and
  `test/unit/tools/marp-kit.test.js` goes red instead — same shape, one artifact
  over. An independent reviewer of #1783 hit exactly this, following an earlier
  version of this entry that recommended `css:build`.
- **Note what the SessionStart hook actually runs.** `.claude/hooks/session-start.sh`
  runs a full `npm run build`, with stdout and stderr discarded and `|| true` so a
  failure cannot abort the hook. `node tools/build.js --only-uncommitted` is
  reached earlier and separately, as the `prepare` lifecycle of that script's
  `npm install`, and the full build supersedes it. So there are two ways to end a
  session start with a partly-built tree: sources moving afterwards, or that full
  build failing behind a one-line notice.
- **`--only-uncommitted` is NOT a second producer,** which is where this wastes
  the most time — #1783 was filed on that reading. `build-css.js main()` writes
  `bundle()` verbatim to `dist/lattice.css`, the same step runs in both modes, and
  the two emit byte-identical CSS from the same sources. Only the clock differs.
- **Why the two gates disagreed, and why both were right:** `build:check` runs
  `--exclude-uncommitted`. It deliberately does not look at `dist/`, because
  `dist/` is generated rather than committed and so is not what that gate is
  asking about.
- **How to tell:** the delta is entirely content from commits you just pulled in.
  On the instance that produced this entry, `bundle()` returned 1,595,126
  characters (1,636,862 bytes — the numbers `.length` and `wc -c` give you differ,
  and this file is full of multi-byte punctuation) against 1,594,354 on disk. The
  whole 772-character difference is one hunk of
  `lib/components/chart/journey/journey.styles.css` that `fbb6287` changed: a
  nine-line comment added above `section.journey .journey-mood-key-label`, less
  the `opacity: 0.85` line the same commit deleted from the rule.
- **What checks this properly, and where:** `npm run build:check:all` runs in
  CI's `unit` job right after the full build, re-running all 39 generators' own
  `--check`. It is meaningful *only* there, and it is the one CI gate that looks
  at the 25 built-not-committed artifacts. Do not confuse it with the `lint`
  job's `build:check`, which asks the opposite-facing question ("did you commit
  the regenerated artifact?"), must therefore run *before* any build, and skips
  `dist/` entirely via `--exclude-uncommitted`. By hand, `npm run css:check` is
  the same question narrowed to the CSS, in about half a second. A unit test
  asking it was removed in #1783: vacuous in CI, which full-builds first, and
  spuriously red locally after the rebase the repo requires.
- **What `build:check:all` does NOT catch — and don't "fix" it:** it delegates to
  each generator's own `--check`, and some are deliberately weaker than a
  byte-diff. `build-decisions-index` asserts every note has one correctly-formatted
  row rather than comparing to a regeneration, which is what lets two decision-doc
  PRs share the merge queue (#1547); `build-component-docs` checks an *authored*
  `*.gallery.md` for existence only. Both were measured: reversing the index's sort
  and appending to an authored gallery each leave the gate green. Rebuilding the
  tree and git-diffing it would catch them and has already re-opened #1547 once.
  A generator wanting a true byte-diff says so in its own `--check`.
- **Triggered by:** #1783, found while pushing #1779.

## A docs test passes in declaration order and fails under `--sequence.shuffle.tests`

- **Symptom:** A `docs/` test file is green in every ordinary run and red the
  moment test order is shuffled — `npx vitest run <file> --sequence.shuffle.tests
  --sequence.seed=11`. It reproduces on the file ALONE in seconds; no full run is
  needed. The failure text is an element that cannot be found, or a boolean that
  is the exact opposite of what the test set up.
- **Cause:** Three mechanisms, each of which makes a case silently depend on a
  sibling having run first. Neither is the cross-file state leakage the flaky-docs
  cards hypothesize — these are *intra*-file, deterministic given a seed, and a
  different class from the load-dependent timeouts in
  `engineering/decisions/2026-08-23-jsdom-suite-timeout-budget.md`.
  - **`vi.resetModules()` does not reach the MOCK registry.** A hoisted `vi.mock`
    factory is evaluated once and its result cached for the whole file, so a case
    needing an import to FAIL gets the previous case's successful resolution back.
    `vi.doMock` in `beforeEach` re-registers the factory per test — it is not
    hoisted, so it runs *after* `resetModules` — giving each case a fresh module
    under test AND a fresh dependency resolution.
  - **`React.lazy` memoizes on a module-scope object.** The Studio code-splits its
    heaviest panes ([StudioShell.tsx:113](../docs/src/components/studio/StudioShell.tsx)
    `Fabricate`, `:127` `Editor`, `:137` `ComposeView`). Only the FIRST case in a
    file to mount one pays the cold Vite transform and sees the Suspense fallback;
    every later case finds it resolved. So a synchronous `getByLabelText('Deck
    source')` or `getByRole('button', { name: /Component/ })` passes or fails on
    which case vitest happened to schedule first — in `studio.controls` that was
    49 of 50 green and whichever drew the short straw red.
  - **`vi.doUnmock` removes the file's HOISTED mock too**, not just the local
    `vi.doMock` it was written to undo — the registration is keyed by resolved
    path, and `doUnmock` deletes the entry rather than popping a layer. This is
    the INVERSE of the first mechanism and it was `read-aloud.test.ts`'s (#1814,
    fixed). **It only bites a dependency reached by DYNAMIC `import()`**, which is
    why it can hide for so long: a static import is bound once at file load, while
    `read-aloud.ts` reaches `voice-model.js` only through `import()` (its
    `getVoice()` singleton, `listTtsCatalog`, `listTtsModels`), so each call
    re-resolves against the *current* registry and quietly got the REAL module.
    The failures read as a spy called 0 times or a highlight that never advanced —
    they do not look like a mocking problem at all. The fix is to **restore**, not
    unmock: extract the hoisted factory to a named `function` (declarations hoist,
    so `vi.mock`'s own hoisting still finds it) and `vi.doMock(path, thatFactory)`
    in `afterEach`. Note that *not* cleaning up is not an option either — the local
    `doMock` would then outlive its describe.
  A file's own comments can point at the wrong one of these: `read-aloud.test.ts`
  blamed the module-level singleton in `read-aloud.ts`, which is the reason those
  describes call `vi.resetModules()` at all but is NOT what leaked across cases.
  Attribute by mutation, not by reading — breaking each of that file's two restores
  separately reproduced exactly one of the two failing seeds each (999 → 10 failed,
  3001 → 8 failed), which is what proved both load-bearing and the singleton a decoy.
- **Do NOT read a red full-suite shuffle run as "another ordering bug".** All three
  mechanisms above are *intra*-file and DETERMINISTIC given a seed, so the diagnostic
  that separates them from everything else costs seconds: **run the one file alone at
  that seed.** If it is green alone and red in the suite, ordering is not your
  problem — you are looking at the separate load-dependent `asyncUtilTimeout` flake
  (#1324/#1471), which is intermittent, moves between tests run to run, and **appears
  in UNSHUFFLED runs too**. Measured while closing #1814: four consecutive full runs
  failed a *different* test each time (`studio.findings-fix` ×2, then
  `studio.controls` "deterministic Coach chips"), and the last of those was on clean
  `main` with no shuffle flag at all. So one green full shuffled run is not evidence
  the suite is order-independent, and one red one is not evidence it isn't; the
  per-file runs are what carry the claim.
- **Mitigation:** Wait for the pane in the shared setup helper (`editorReady`,
  `openFabricate` in
  [studio.controls.test.tsx](../docs/src/components/studio/studio.controls.test.tsx)),
  with an **explicit** per-call budget rather than Testing Library's 1000 ms
  `asyncUtilTimeout` default. That wait is not waiting on a state update — it is
  waiting on Vite transforming CodeMirror, measured at **420 ms cold / 46 ms warm
  idle but 1070–1424 ms cold under 2x CPU oversubscription**, i.e. over the
  default on every contended run. #1806 characterizes this class and asks for
  exactly this narrow per-call fix instead of a global bump; note its "the only
  one waiting on a `React.lazy` boundary" refers to the *Fabricate* wait, which
  stays under 600 ms because it resolves a much smaller module than the Editor.
- **Worth knowing:** a mocked dependency's cache also makes call-COUNT assertions
  lie in the other direction. A repeat `import()` of an already-resolved module is
  a registry cache hit that never re-runs the factory, so a counter incremented
  inside the factory cannot see a loader that lost its memo entirely — that
  assertion was vacuous and passed under mutation. Count namespace reads through a
  getter instead.
- **Before you push a `docs/` test change, run `cd docs && npm run typecheck`.**
  The pre-push hook runs `lint`, `lint:deck:all`, `build:check` and the root
  `npm test` — it runs **neither `typecheck` nor the docs vitest suite**, both of
  which live only in CI's `docs-build`. So a TypeScript-only error under `docs/`
  passes every local gate and every hook, and first appears as a red required
  check. Making one `setup()` helper `async` did exactly that: four sibling
  helpers typed `user: ReturnType<typeof setup>` silently became
  `Promise<UserEvent>`, which no test run can see because it is types-only. The
  fix is `Awaited<ReturnType<typeof setup>>`; the lesson is that `npm test` green
  is not evidence about `docs/`.
- **Triggered by:** Any run with `--sequence.shuffle.tests`; otherwise latent.
  Found while working #1324.
- **Removable when:** Nothing upstream — this is a test-authoring hazard, not a
  dependency defect.
