---
origin: 3021
priority: P15
recorded: 2026-11-08
area: chart
severity: high
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: large — a type change across every chart kind at every page size; the owner chose "next PR" on #3088 (2026-11-09), design note first for the owner's review
source: https://github.com/Laticent/lattice/pull/3088
---

# Chart text on the deck's type ladder: two tiers, a floor, and layout that gives instead of type

why now   — on an iPhone 15 Pro (a 1080px page drawn ~393pt wide, x0.36) the owner found every chart
            but the pie and roadmap "unfit". Measured on examples/fluid-chart-redraw.md at mobile, page px
            -> phone pt: the deck's own `--fs-meta` is 30px (10.9pt), `--fs-body-compact` 40px (14.6pt),
            `--fs-body` 47px (17pt). The pie key prints at 42px (15pt, readable); quadrant and risk-matrix
            at 28-30px (~10-11pt); line, waterfall, heatmap and tower at 20-23px (7-8pt); stacked-bar at
            17-18px (6pt). The deck's portrait ladder already sits on the phone's readable tiers; the charts
            are not on it. Each kind sizes its labels in its own viewBox units (tower 6.5-8, cartesian 7-8,
            quadrant 11-13, risk-matrix 6-7), so their px size is an accident of canvas width.
decided   — the owner, 2026-11-09, on #3088:
            (1) TWO TIERS from the deck ladder. Read tier = `--fs-body-compact` (key entries, data labels,
                mark names, layer names; the token's documented role already names chart keys). Reference
                tier = `--fs-meta` (axis ticks, axis titles, secondary notes such as a layer's size).
            (2) A FLOOR: no chart text below `--fs-meta`, any chart, any page size, any venue (`--fs-scale`).
            (3) DENSITY MOVES THE LAYOUT, NEVER THE TYPE: the Fit Spine's order (collapse -> shed -> split,
                never scale): fewer ticks, names into the key, data labels to the hover card (reported as
                label drops), then split across slides. A dense chart never prints smaller.
            (4) NEXT PR after #3088, design note first.
where     — the spine #3088 built: lib/plugins/chart-family/shared/chart-box.js (box shape),
            cartesian.js `viewFor` / `fitViewToBox`, svg-legend.js `pickKeyLayout`; the per-kind label sizes
            in each `<kind>.styles.css` and the FS mirrors in each transform; lib/runtime/chart-redraw.js
            `canvasFor` (the phone redraw already sizes its canvas from the slide's body text, the same rule);
            the TYPE FLOOR export warning.
how       — one function sets the canvas WIDTH from the tier tokens (a label of N units prints at the token's
            px), the way `canvasFor` does for the phone redraw. At phone page sizes that lands most charts in
            their narrow forms (tower's stacked labels, quadrant's narrow plane, risk's key under), so the
            export on a phone matches the phone redraw. Label sizes in units become two shared constants, not
            per-kind numbers.
done when — every chart's smallest text >= `--fs-meta` and its read text = `--fs-body-compact` at hd, square,
            portrait, story and mobile (measured, per kind, a table in the PR); the TYPE FLOOR warning is
            silent on every gallery; no chart scales its type for density (what it shed or split is reported);
            the decision doc records the tiers and the measure; the owner signs off the PDFs.
evidence  — per kind x per size: smallest text px before/after, share of the box filled, pages added by splits;
            the owner's iPhone check of the mobile PDFs.
verify    — the measure script that produced the tables above (Playwright: each chart's drawn rect against its
            stage, and every SVG text's rendered px); `npm test`; the fluid-chart-redraw integration test.
