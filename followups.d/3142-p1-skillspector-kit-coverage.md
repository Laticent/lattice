---
origin: 3142
priority: P1
recorded: 2026-11-11
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-11-skillspector-nightly.md §5
deferred: large — ~230 first-scan findings across four folders, each to be read and either fixed at source or excused by a narrow rule; a review pass of its own, not a fold-in
source: https://github.com/Laticent/lattice/pull/3142
---
# Extend the SkillSpector nightly to the rest of the agent kit

why now   — The nightly scans every skill and every file an agent loads on its own, plus the
            paste-in folders (`start`, `paste`, `render`, `authoring`, `examples`). Four kit
            folders an agent can also be handed are not scanned yet: `components/` (83 files),
            `reference/`, `upload/` and `review/`.
what the first scan found (2026-11-11, v2.13.4, static) —
            `components`, `reference` and `upload` share generated catalog prose: AR2 on
            "no warning" (`_chart-family.md:685`, `bar.md:43` and their copies) and EA2 on
            "without checking" / "without asking" (`gantt.md:34`, `list-steps.md:41`,
            `team-profile.md:46` and copies). `review/check.mjs` (the bundled deck checker)
            raised 221: 212 MP2 on runs of `0, 0, 0…` (a numeric table), 7 RA2 on `pList`,
            2 P6 on `return rules`.
how       — Prefer rewording the generated source (the component `.docs.md` and the manifest
            prose) over a baseline rule, as PR #3142 did for ΔE and "no warning". `check.mjs` is
            bundled code: scan its unbundled source instead, or excuse its MP2/RA2/P6 hits by
            path and phrase with the reason recorded.
done when — `tools/scan-skills.sh` lists the four folders as targets and a local run reports
            0 unexcused findings.
verify    — `npm run scan:skills` exits 0; the decision note §5 drops the "not yet" line.
