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
