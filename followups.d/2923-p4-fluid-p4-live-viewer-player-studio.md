---
origin: 2923
priority: P4
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §8 P4
---

# Fluid P4: Fluid on the HTML viewer, the player (baked pages + template re-plan) and the Studio (authored size + device toggle)

why now   — this is where a phone reader of a shared deck gets pages; index-keyed consumers break unless anchors land with it.
where     — engineering/decisions/2026-10-27-fluid-layout-library.md §8, row P4.
done when — no-JS player shows baked pages; live re-plan from the template; Studio has the device toggle; Present, player, narration and comments use anchors; panes decks keep their authored count with dotted numbering; the template has its HARD RULE #22 entry; owner signed off the HTML export bytes and the numbering.
evidence  — dark and light export artifacts and three-width screenshots.
verify    — npm run build:check; the gate named in the §8 row for P4.
