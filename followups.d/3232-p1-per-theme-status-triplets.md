---
origin: 3232
priority: P1
recorded: 2026-11-16
area: theming
severity: high
swimlane: engineering/decisions/2026-10-24-status-is-one-system.md
deferred: blocked — the owner picks the contrast policy for status fills before any theme is re-solved
---

# Each theme curates its own status triplet (fill, ink, edge), and every dark face reads at the back row

why now   — `npm run check:glance` (PR 3232), at the hall back row in a lit room, over three shipped
            themes (mustard, indaco, crepuscolo): 48 of 54 dark-face status marks fall below the 3:1
            floor (2.1–3.1:1); 0 of 54 light-face marks do (4.1–7.0). The other 11 themes are unmeasured. Separately, the
            status fills are near-identical across themes (warn `#854A00` in 8 of 14) because one shared
            white ink at 7:1 pins every fill's lightness.
where     — themes/*/*.css (`--X-mark`, new `--X-on-mark`, new `--X-edge-mark`); the disc recipes, the chart
            status pill and progress fill, the kpi pill and the checklist rail and ground; the solids and
            one-ink tests (`chart-solids`, `chart-one-ink`, `cvd-trio-floor`).
done when — every theme carries a curated fill + ink + edge per status, anchored on its own brand and
            chart colors; every status mark clears 3:1 at the hall back row in `check:glance --room=lit`;
            ink on fill clears 4.5:1; the trio's CVD separation does not drop below today's frozen values.
evidence  — five prototype rounds in session_01DPMMjFU4wtx8WDHVJM1BLQ: a fill needs about 4.5:1 against the
            slide AS PAINTED to keep 3:1 in a lit room; light-face fills that pale fail at hall (2.5–2.8)
            even when they clear 3.3:1 static.
verify    — `npm run check:glance -- <status demo deck> --venues=conference,hall` on every theme, both
            faces; renders sent to the owner for sign-off.
