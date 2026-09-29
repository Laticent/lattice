---
origin: 2439
priority: P3
recorded: 2026-09-28
---

# `--html`, `--fluid` and `--read` exports link KaTeX's stylesheet by a `file://` path

why now   — `lattice-emulator.js` (`katexCssLink`) writes `<link rel="stylesheet"
            href="file:///…/node_modules/katex/dist/katex.min.css">` into every CLI page, and
            the HTML deliverables keep it, so a copy opened on another machine loses the link.
            The sibling defect of the function-plot library link fixed on the plugin-exports
            branch; found there by the tier-1 checker, off that item's path. Measure before
            fixing: a moved export of `examples/plugin-system-phase-b.md` with every request
            outside its directory refused still drew its fractions correctly, so the math may
            already be styled by the engine CSS and the link may only be dead weight.
where     — `lattice-emulator.js` (`katexCssAbsPath`, `katexCssLink`), `lib/export/player-core.mjs`
            (the player already inlines KaTeX's CSS and subsets its fonts).
done when — a moved `--html` / `--fluid` / `--read` export renders math identically with the
            link refused, proven by extending `test/integration/export/moved-export-draws-plots.test.js`
            to a deck with display math; the link is dropped or inlined.
evidence  — the test, and before/after screenshots of a moved export with math.
verify    — tier 1 checker (export bytes change; export sign-off applies).
