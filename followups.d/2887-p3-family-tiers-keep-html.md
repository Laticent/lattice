---
origin: 2887
priority: P3
recorded: 2026-10-25
area: infra
severity: low
swimlane: tools/check-family-tiers.js
source: https://github.com/Laticent/lattice/pull/2887
---

# `check:family-tiers` crashes: the CLI no longer keeps the HTML it reads

```text
  P3 · the family-tiers oracle dies on ERR_FILE_NOT_FOUND before it measures anything
       why now   — running it for #2887 crashed on main and on the branch alike:
                   `net::ERR_FILE_NOT_FOUND at file:///tmp/vf-hd-<pid>.html`. The tool renders
                   `<base>.pdf` with lattice.js and then opens `<base>.html`, but the CLI now keeps
                   that HTML only with `--keep-html` or LATTICE_KEEP_HTML=1 (lattice.js, the
                   keep-html note near line 3173). With LATTICE_KEEP_HTML=1 it runs, and main and
                   the branch then report the same drift: new clips on compare-code, matrix-2x2,
                   roadmap, timeline-list and list-tabular, FIXED entries to re-bless, and a roster
                   change (+contact, wifi, -state-chart). That drift is main's, not #2887's.
       where     — tools/check-family-tiers.js, the two execFileSync renders (`fs-…`, `vf-…`); the
                   nightly loop in .github/workflows/integration-nightly.yml.
       done when — the tool passes `--keep-html` to every render it then opens, and the drift above
                   is triaged (each clip verified or fixed, then a justified re-bless).
       evidence  — the two runs on 2026-10-25, branch and main, identical reports.
       verify    — `npm run check:family-tiers` runs to a report with no environment variable set.
```

Off the path of #2887: the crash and the drift reproduce on main without this PR.
