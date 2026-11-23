---
origin: 3453
priority: P3
recorded: 2026-11-23
area: infra
severity: low
swimlane: engineering/decisions/2026-11-22-lighthouse-13-measurement-shift.md
deferred: off-path — pre-existing on main, and #3453 changes no collection code
---

# `astro preview` outlives `lhci collect`, so a later local run can measure an old build

`astro preview` now starts a background server and exits ("Preview server running … Stop: astro preview stop"). The
`startServerCommand` in `docs/lighthouserc*.cjs` therefore leaves the server on `:4399` after `lhci collect` ends. Seen on
2026-11-22: a `perf-collect.mjs` run from a `main` worktree left its server up, and the next run from another checkout
started its own server on `:4400` ("already running at http://localhost:4400") while Lighthouse measured `:4399`, which was
still the first checkout's build. CI is unaffected (each job is a fresh runner); `npm run perf` on a laptop is not.

done when — `npm run perf` twice in a row, the second after a rebuild, measures the second build, and leaves no server
            running.
evidence  — `ps aux | grep 'astro.mjs preview'` before and after, and the build hash in each run's LHR.
verify    — tier 0: self-review with the gates.
