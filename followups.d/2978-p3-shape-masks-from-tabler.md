---
origin: 2978
priority: P3
recorded: 2026-10-30
area: engine
severity: low
swimlane: engineering/decisions/2026-10-18-checks.md
deferred: large — every chrome mask and its export bytes change, and each surface needs a rendered before/after; #2978 kept to the status marks
---

# Draw the `--shape-*` chrome masks from Tabler

why now   — #2978 drew the status marks (`--mark-*`) from Tabler and generated them. The `--shape-*` chrome
            masks (arrows, chevrons, refresh, pause, spark, warning) are still hand-written data-URI SVGs in
            `lib/base/base.tokens.css`, and Tabler draws all of them (HARD RULE #15).
where     — `lib/plugins/_icons-source/marks.json` (add the fits), `tools/build-icons-data.js` (it already
            bakes a fit into bare paths and writes a generated block), `lib/base/base.tokens.css`. The two
            `SANCTIONED_GLYPH_CHROME` files read these masks for the grayscale shape channel; keep them.
done when — Every `--shape-*` token sits in a generated block, `build:check` fails on a hand edit, and the
            calco-refusals, calco-pseudo and status-marks-tabler tests still pass.
evidence  — Rendered before/after of every surface that uses a shape mask, light and dark.
verify    — tier 1 checker, because it changes every chrome mask and the PPTX lift reads them.
