---
origin: 2687
priority: P4
recorded: 2026-10-14
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-14-plugin-inline-door.md §11
source: https://github.com/Laticent/lattice/pull/2687
---

# A zip plugin's `@kind{…}` spans stay code on the 38 layouts a shipped pass rebuilds

why now   — the inversion lens on #2687: the door shadows any slide a shipped pass rebuilds from its text
            (`fence-door.generated.json` `rebuilt`: every chart-family class, kanban, roadmap, timeline-list,
            progress, matrix-grid, team-profile), so a plugin's spans there are never drawn, while the built-in kinds
            draw. Those are the layouts where status marks, people and flags live. Decide before phase G freezes LPM.
where     — lib/packages/code-door-fence.mjs `claimedFences` (the `rebuilt` shadow), lib/transformers/rebuilt-classes.js.
            The owner rejected a declarative template tier (note §10): plugins are live code, so the answer is code kinds.
done when — the owner has chosen between a pass order that lets the door draw a span before a shipped pass rebuilds the
            slide (the pass reads the drawn markup, not the plugin's text) and the shadow kept and documented in LPM; and the
            choice is built or recorded in LPM.
evidence  — a deck with `@kind{…}` on a `kanban` slide, drawn or explained, in the Studio and the CLI.
verify    — tier 1 checker; the real Studio for any visible change.
