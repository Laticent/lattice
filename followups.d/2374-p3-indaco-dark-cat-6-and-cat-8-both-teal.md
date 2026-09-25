---
origin: 2374
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2374
---

# indaco dark: cat-6 and cat-8 fills are both teal

why now   — a mindmap past six branches now colors every branch (#2374), so the
            seventh and eighth categories show up side by side. On a dark slide,
            indaco's `--cat-6-fill` (#006D60) and `--cat-8-fill` (#006A79) read as
            the same teal: ΔE_ok 0.045, hues 181° and 212°. See the 8-branch dark
            slide of examples/mindmap-branch-colors.pdf (Support and Iterate).
where     — themes/indaco.css, the dark arm of `--cat-6-fill` / `--cat-8-fill` (and
            their marks and inks, which the generators derive from them).
done when — the two dark fills are distinct categories by the repo's own separation
            check, and every contrast gate on the cat tokens still passes.
evidence  — measured in chat on PR #2374; pre-existing on main and not caused by it.
verify    — node tools/chart-mark-separation.js, then npm run build:check (checkCatContrast).
