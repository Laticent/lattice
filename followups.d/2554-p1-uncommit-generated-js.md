---
origin: 2554
priority: P1
recorded: 2026-10-06
area: infra
severity: high
swimlane: engineering/decisions/2026-10-06-conflict-reduction.md
source: engineering/decisions/2026-10-06-conflict-reduction.md
---

# Uncommit the lib/**/*.generated.* files (owner go-ahead 2026-10-14)

```text
  P1 · [no ticket] Stop committing the 40 lib/**/*.generated.* files — owner go-ahead
       2026-10-14, after the DOMPurify bump.
       why now   — committed generated JS was in 6 of 19 real conflicts (2026-09-30..10-06).
                   Each resolves mechanically with `npm run build`, but each still costs a
                   catch-up, which re-runs the PR's CI and its queue run.
       where     — tools/build.js (mark the producing steps `uncommitted: true`), .gitignore,
                   `git rm --cached` the files. Precedent:
                   decisions/2026-08-17-generated-bundles-uncommitted.md.
       unblocked — 2026-10-14, the owner picked it as the next step: a committed bundle
                   also blocks every Dependabot bump of a bundled package, and the DOMPurify
                   security fix sat red for two months behind it
                   (decisions/2026-10-14-dependabot-prs-never-merge.md §4–§5). The desktop
                   app's engine intake is still unknown: the PR that does this must say how a
                   checkout without `npm install` would fail, so the app's build can plan
                   for it.
       done when — none of the 40 files is tracked; a fresh clone + `npm ci` builds them;
                   every workflow that imports one runs root `npm ci` first.
       evidence  — `git ls-files '*.generated.*'` empty under lib/; the added `npm install`
                   time (measured 2026-10-06: up to ~27s, full build 39s vs 12.5s for the
                   already-uncommitted steps).
       verify    — tier 1: CI green; docs-build green from a clean checkout.
```

Measured 2026-10-06. Every CI workflow that loads these files runs root `npm ci`, whose
`prepare` already runs `tools/build.js --only-uncommitted`. The two that do not
(`labels.yml` → `tools/sync-labels.js`, `sync-backlog.yml` → `tools/sync-backlog.js`)
import none of them, checked by walking their relative imports.
