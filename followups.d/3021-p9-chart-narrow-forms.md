---
origin: 3021
priority: P9
recorded: 2026-11-03
area: chart
severity: medium
swimlane: engineering/decisions/2026-11-03-responsive-tables.md
deferred: blocked — the mechanism is the owner's call: a second drawing per chart changes every HTML export's bytes and admits a post-sanitize markup swap (HARD RULE #22)
source: https://github.com/Laticent/lattice/pull/3021
---

# Charts draw a narrow form when their box narrows after the render

why now   — on a slide each chart is already drawn for its box (orientation, `paneView`; the pane catalog refuses a pane narrower than the kind can draw in), so no paged slide shows a shrunk drawing. The gap is a box that changes after the render: the fluid view on a phone, a resizing live preview, a continuous host. There the wide drawing scales like a picture and its labels shrink with it. quadrant and risk-matrix (from p7) are part of this: risk-matrix's key needs to go below the grid, quadrant's corner labels need room.
where     — lib/transformers/chart-frame.js (a second drawing at a narrow view, about 110 × 200 chart units, in an inert `<template>`); lib/runtime (swap it in below a width, back above it); the kinds whose view-following geometry is not enough (risk-matrix, quadrant, and the three that take a table as data: heatmap, matrix-grid, roadmap).
done when — the owner picks the mechanism (decision doc §Charts lists the costs: ~2× chart markup in HTML exports, ~2× chart render time with a bench run under HARD RULE #19, a sanctioned runtime markup sink under #22), and then each kind draws a narrow form in the fluid view at 390px.
evidence  — the fluid view of every chart gallery at 390 × 844, before and after; `npm run bench` before and after; the HTML export size before and after.
verify    — npm run check:chart-fit; the fluid render at phone width; npm run lab:build (charts no longer collapse there, as of this PR).
