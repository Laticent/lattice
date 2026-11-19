---
origin: 3232
priority: P2
recorded: 2026-11-16
area: theming
severity: low
swimlane: engineering/decisions/2026-11-16-status-triplets.md §7
deferred: large — the Studio's theme generator solves status fills in its own pass and needs the triplet solver ported to it, with its own tests
---

# A theme the Studio derives gets the status triplet, not the pre-triplet one ink

why now   — The 14 brand themes now curate a status triplet (deep fills on light, glowing on dark, each fill
            4.5:1 off its slide as painted). `lib/theme/derive.js` still solves the old set under one white
            ink, so a derived theme reads correctly but at the back of a lit hall its dark-face status marks
            fall under 3:1, as the shipped dark faces did before (2.1-2.6:1).
where     — lib/theme/derive.js (the semantic list near `on-mark`, and its status solve); the solver to reuse
            is tools/curate-status-triplets.js `solve` / `tokens`.
done when — a derived theme declares `--X-on-mark` / `--X-edge-mark` / `--X-vivid-edge-mark` and its fills
            meet the contract `curate-status-triplets --check` applies to the brand themes.
evidence  — the base defaults keep a derived theme on the pre-triplet pair today (decision §3).
verify    — derive a theme in the Studio, run `npm run check:glance` on a status deck in it, both faces.
