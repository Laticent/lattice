---
origin: 3043
priority: P2
recorded: 2026-11-05
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: off-path — the same 30 tests fail on `main` (fb7c3f1c) in the cloud sandbox; PR #3043 touches no export, print, offline or paint code, so the fix belongs to whoever owns those suites
source: https://github.com/Laticent/lattice/pull/3043
---

# 30 desktop e2e tests fail in the cloud sandbox, on `main` as well

why now   — a full `npx playwright test --project=desktop` run in a cloud session ends 1,238 passed, 30 failed. The
            same 30 fail again with `--last-failed`, and the same 30 fail on `main` (fb7c3f1c), so they are not
            flaky and not caused by a branch. Most are export paths: "PDF ready." never appears within 15 s
            (journeys/author-export, chart-export, scenarios/exec-board-update), along with the Marp bundle, print
            preview, the raster/PPTX exports, warm-offline, kpi-pill paint, first-paint size, studio-instant-shell
            and visual. A session that runs the full suite cannot tell its own regressions from these.
where     — docs/e2e/journeys/author-export.spec.ts, print-preview-documents.spec.ts, studio-warm-offline.spec.ts,
            playground-kpi-pill.spec.ts, studio-instant-shell.spec.ts and 14 more specs (the full list is the
            30 titles in PR #3043's evidence); first suspect is what the sandbox lacks for export (the PDF
            export server or `CHROME_PATH` in the preview server's environment).
done when — `npx playwright test --project=desktop` on a fresh cloud session of `main` ends with 0 failed, or each
            remaining test skips with a stated reason the sandbox cannot meet.
evidence  — the full-suite summary line before and after, on `main`.
verify    — tier 1, self-review with the gates.
