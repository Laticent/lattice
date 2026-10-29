---
origin: 2927
priority: P20
recorded: 2026-10-29
area: infra
severity: medium
swimlane: engineering/decisions/2026-10-27-slide-structure-strip.md
deferred: off-path — red on main's scheduled nightly too; this PR touches none of these paths
---

# The nightly e2e job fails on main: a 45-minute timeout and four stale specs

why now   — Found while driving the strip work. Studio E2E nightly run 40824231070 on `c18a4db` failed, and so did main's scheduled runs on 2026-10-27 and 2026-10-28.
where     — (1) The `e2e` job's "Run Studio E2E" step times out at 45 minutes. It started 2,208 tests on 2 workers and reached about 495 of them. (2) `docs/e2e/journeys/author-export.spec.ts:31,46,65,89` and `docs/e2e/journeys/chart-export.spec.ts:22` expect `PDF ready.`, `Markdown ready.` and `Marp bundle ready.`. Since 090205e (#2904), `ShareSheet.tsx:178` adds the file size, for example `PDF ready (105 KB).`. (3) `docs/e2e/anima-motion-frames.spec.ts:247` and `docs/e2e/command-palette.spec.ts:139` fail on desktop with a retry, on a build of main too.
done when — the nightly `e2e` job finishes inside its timeout (by sharding, or by a timeout the owner sets) and the five specs pass.
evidence  — 2026-10-29, local production build of `c18a4db`: author-export and chart-export fail with `unexpected value "PDF ready (105 KB)."`. The job log of run 40824231070 shows the timeout and the anima/command-palette retries.
verify    — `cd docs && npx playwright test e2e/journeys/author-export.spec.ts e2e/journeys/chart-export.spec.ts e2e/anima-motion-frames.spec.ts:247 e2e/command-palette.spec.ts:139 --project=desktop`
