---
origin: 2540
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2540
---

# Studio route budget: decide whether to raise the soft target, or give bytes back

why now   — the first version of this item assumed #2540 left the Studio UNDER its soft target, so a
            routine rebaseline could bank the saving. Measured 2026-10-06 on main at 281e9e0
            (`measure-route-base.sh`): studio eagerJsGz is 654,240 B against a soft target of
            636,788 B, 17,452 B OVER. #2540's −17.4 KB offset part of the growth the ~25 files in
            docs/route-budget.d/ declare since the 2026-09-29 reset; it did not bring the route under.
            So there is no saving to bank: setting soft to the measured figure is a RAISE, which the
            script refuses without `--raise` and the owner's OK (scripts/check-route-budget.mjs §rebaseline).
where     — docs: `npm run route-budget:rebaseline -- --raise --reason "…"`, in a reset PR of its own;
            or a give-back pass on the Studio's eager chunks.
done when — the owner has chosen: (a) raise studio eagerJsGz soft to the measured figure (ceiling
            stays 700,467 B), folding the pending route-budget.d files into the history; or
            (b) give back enough eager JS that the route is under its soft target again.
evidence  — the rebaseline output and the history row, or the before/after bytes of the give-back.
verify    — the route-budget gate on that PR.
