---
origin: 2772
priority: P1
recorded: 2026-10-18
area: chart
severity: medium
swimlane: engineering/decisions/2026-10-17-meta-record.md
source: https://github.com/Laticent/lattice/pull/2772
---

# Regenerate the chart gallery: `bucket-galleries` fails on `main`.

`test/integration/components/bucket-galleries.test.js` › "chart: source .md matches manifests" fails on `main` at `adba03a`
(checked in a clean worktree): `lib/components/chart/chart.gallery.md` says 24 components, the manifests say 28, and the
histogram and ep-curve slides from #2767 are missing. Found while running the integration tier for #2772; off that PR's
path, and a gallery regeneration belongs in its own post-review commit (HARD RULE #8).

```text
  P1 · [no ticket] Run `npm run build:bucket-galleries` and commit the chart gallery as its own commit.
       why now   — it keeps the integration tier red for every PR.
       where     — lib/components/chart/chart.gallery.md
       done when — `node --test test/integration/components/bucket-galleries.test.js` passes.
       evidence  — the test output.
       verify    — tier 0.
```
