---
origin: 2595
priority: P3
recorded: 2026-10-08
area: infra
severity: low
swimlane: engineering/decisions/2026-10-07-first-npm-release.md
---

# golden-diff reports main's stale goldens as "changed" on a dependency change

why now   — on #2595 the golden-diff comment listed 46 "changed" slides across 17 gallery·moods; a
            same-machine A/B (main vs branch) was byte-identical, and #2583 got the identical table.
            Any PR that edits package.json/package-lock.json (tools/golden-diff.mjs `depChange`)
            gets main's staleness attributed to it, which trains reviewers to ignore the comment.
            #2593 exempted scripts-only package.json edits; a lockfile change that installs the same
            versions (#2595 only moved packages between dependencies and devDependencies) is not.
            Separately, the legal goldens are stale on main (14 slides, 295–4,591 px at 3% fuzz;
            last blessed at 281e9e0 / #2538).
where     — tools/golden-diff.mjs (depChange, ~:408–420); the nightly bless for the legal goldens.
done when — a dependency change whose resolved versions are unchanged runs the base-vs-head
            comparison and reports 0 changed for #2595's diff; the legal goldens re-blessed.
evidence  — golden-diff run on a replay of #2595's package.json/lockfile change: 0 slides changed.
verify    — tier 1 checker, because it changes what a CI comment attributes to a PR.
