---
origin: 3313
priority: P10
recorded: 2026-11-19
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-19-bundle-legibility-and-slimming.md §4 D1
deferred: off-path — tooling and a pre-push hook; #3313 is the plan and touches no tool or hook config
source: https://github.com/Laticent/lattice/pull/3313
---

# Sort knip's unused-code findings, then hold them with a pre-push ratchet

why now   — test/quality/baseline.json says 0 unused files and 0 unused exports, but knip reported 20 unused files and 16 unused packages on 2026-11-19, and nothing runs it, so nobody saw the drift. The owner chose a pre-push hook (D1).
where     — knip.json (entries for files loaded indirectly: draw frames, browser builds, bundling shims, packages used only by docs/), the truly dead files, test/quality/baseline.json, lefthook.yml pre-push.
done when — every finding is either deleted or explained in knip.json, the baseline is re-blessed, and a pre-push job fails only when unused files, exports or packages grow (measured cost: knip 6.7 s against a pre-push of about 73 s).
evidence  — the before and after knip counts, each finding's verdict, and a push that the hook blocks after adding an unused export.
verify    — tier 1 checker, because a wrong knip entry hides real dead code and a deleted file may be loaded by a string path.
