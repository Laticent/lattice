---
origin: 3463
priority: P2
recorded: 2026-11-23
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34
deferred: blocked — 0 of 30 failures in this sandbox; #2988's box fails 1 in 5 at --workers=4, and a trace from there is promised
source: https://github.com/Laticent/lattice/pull/3463
---

# icon-font-studio.spec.ts:104 never sees the Lattice Icons face on gecko

why now   — red on main and on #2988 for #2988's session: 1 in 5 at --workers=4 on gecko. The failure is :117
            `expect.poll(() => font.glyph.evaluate(drawnInOurFace)).toBe(true)`: the glyph was visible, but the page
            never reported the Lattice Icons face loaded and used within 15 s. The command center routed it under #33.
where     — docs/e2e/icon-font-studio.spec.ts:104 and its `drawnInOurFace` helper (awaits `document.fonts.ready`, then
            looks for a loaded 'Lattice Icons' FontFace), on the exported webpage opened from file://.
measured  — 0 of 30 here: ×10 at --workers=4, and ×20 at --workers=4 with 4 CPU-burning loops added. Nothing touching
            the area landed between #2988's failing tree (84bb080) and main 60cc086.
done when — the `document.fonts` state at the timeout is read from a trace, the cause is fixed, and the #34 runs pass.
evidence  — a retain-on-failure trace from #2988's box (promised after its load comparison).
verify    — tier 0 plus the #34 runs on gecko.
