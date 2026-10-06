---
origin: 2554
priority: P3
recorded: 2026-10-06
source: engineering/decisions/2026-10-06-conflict-reduction.md
---

# Uncommit the lib/**/*.generated.* files once the desktop app's engine intake is known

```text
  P3 · [no ticket] Stop committing the 34 lib/**/*.generated.* files — owner: after the
       Tauri desktop app lands.
       why now   — committed generated JS was in 6 of 19 real conflicts (2026-09-30..10-06).
                   Each resolves mechanically with `npm run build`, but each still costs a
                   catch-up, which re-runs the PR's CI and its queue run.
       where     — tools/build.js (mark the producing steps `uncommitted: true`), .gitignore,
                   `git rm --cached` the files. Precedent:
                   decisions/2026-08-17-generated-bundles-uncommitted.md.
       blocked   — the owner deferred it until the desktop app lands, because how that app
                   takes in the engine is not visible from this repo. If it uses a git
                   checkout without `npm install`, these imports would break there.
       done when — none of the 34 files is tracked; a fresh clone + `npm ci` builds them;
                   every workflow that imports one runs root `npm ci` first; the desktop
                   app's build is confirmed to run the engine's `prepare` (or `prepack`).
       evidence  — `git ls-files '*.generated.*'` empty under lib/; the added `npm install`
                   time (measured 2026-10-06: up to ~27s, full build 39s vs 12.5s for the
                   already-uncommitted steps).
       verify    — tier 1: CI green; docs-build green from a clean checkout.
```

Measured 2026-10-06. Every CI workflow that loads these files runs root `npm ci`, whose
`prepare` already runs `tools/build.js --only-uncommitted`. The two that do not
(`labels.yml` → `tools/sync-labels.js`, `sync-backlog.yml` → `tools/sync-backlog.js`)
import none of them, checked by walking their relative imports.
