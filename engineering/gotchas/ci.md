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
  CI's `unit` job right after the full build, re-checking all 38 generated
  artifacts. It is meaningful *only* there — on a freshly built tree it asks
  whether each generator wrote what its own `--check` recomputes, and whether a
  later step clobbered an earlier one. Do not confuse it with the `lint` job's
  `build:check`, which asks the opposite-facing question ("did you commit the
  regenerated artifact?"), must therefore run *before* any build, and skips
  `dist/` entirely via `--exclude-uncommitted`. By hand, `npm run css:check` is
  the same check narrowed to the CSS, in about half a second. A unit test asking
  it was removed in #1783: vacuous in CI, which full-builds first, and spuriously
  red locally after the rebase the repo requires.
- **Triggered by:** #1783, found while pushing #1779.
