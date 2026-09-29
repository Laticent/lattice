---
origin: 2462
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2462
---

# The library boundary gates accept `./../x` as an in-folder import

why now   — the gates exist to keep each library zero-dependency, and a `./../` path starts
            with `./`, so an import that leaves the folder passes silently. #2462's checker
            found it in the new Segno gate, which #2462 fixed; the sibling gates it was
            copied from still have it.
where     — tools/check-ownership.js: the other boundary checks that skip a specifier on
            `spec.startsWith('./')` (grep that string; Suono's and Lente's among them).
            Copy the Segno fix — resolve the path and reject one outside the folder.
done when — a planted `import x from './../y'` in each guarded library is reported, and the
            clean tree still passes.
evidence  — the probe run before and after, in the PR body.
verify    — tier 1; `npm run check:ownership` plus a planted-import probe per library.
