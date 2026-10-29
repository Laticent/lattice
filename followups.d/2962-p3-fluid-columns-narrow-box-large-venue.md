---
origin: 2962
priority: P3
recorded: 2026-10-29
area: inventory
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §12
deferred: large — a shared reflow rule plus a pass over every multi-column component; this PR changes tooling and docs only
---

# Six layouts keep their columns in a narrow box at a large venue, so their text crams

why now   — under the decided policy (h0-30+C with the 0.75-spacing rescue), the pages left unreadable come from component layout, not from the split: these layouts keep their desktop column count in a portrait or story box at `venue: hall`, so each column gets a few characters per line. No split policy fixes this; the slide fits or splits and the columns stay as narrow. Counts from test/fit/baseline.json (structural arm, original slides, `unreadable` / `clip`):
            agenda (lib/components/inventory/agenda) — story@hall 13 / 0, portrait@hall 2 / 14;
            legal bucket gallery (lib/components/legal/legal.gallery.md) — story@hall 3 / 22, and 2 unreadable at each of square, portrait and story at laptop;
            list-steps (lib/components/progression/list-steps) — 1 unreadable in each of five cells;
            list (lib/components/inventory/list) — story@hall 4 / 0, portrait@hall 3 / 5;
            statute-stack (lib/components/legal/statute-stack) — portrait@hall 4 / 7, story@hall 4 / 6;
            checklist (lib/components/inventory/checklist) — portrait@hall 5 / 2, story@hall 5 / 0.
where     — each layout's `*.styles.css`, plus one shared rule. Owner decisions, 2026-10-29: (1) a component reflows by TEXT ROOM in characters, not by the slide's family. Measured body characters per line: hd 111/85/74, square 66/51/44, portrait and story 43/33/28 at laptop/conference/hall, so square/hall and portrait/laptop have the same room in different families. (2) A column needs at least 24 characters of body text; CSS `ch` is the width of "0", so that is about `19ch`. (3) The shared rule is `--col-min` and `--col-max` tokens with `grid-template-columns: repeat(auto-fit, minmax(max(min(var(--col-min), 100%), calc((100% - (var(--col-max) - 1) * gap) / var(--col-max))), 1fr))`: as many columns as fit, never more than designed. Container queries on the existing `lattice` container handle shape changes (vertical timeline, vertical cycle with a drawn return to step 1, stacked pairs). (4) Narrow tables: rows become label/value cards keeping column 1's header; tables of three rows or fewer transpose; authors may mark columns to drop first. (5) Built on this branch after #2962 merges. A scratch prototype on cards-grid switched columns correctly, but component rules set `display: flex` and member widths, so each component's own stylesheet must change; an overlay cannot do it.
done when — every multi-column layout drops to fewer columns (or a stacked form) when its columns would fall under 24 characters, a lint fails any multi-column component without a narrow form, and the fit ratchet reports 0 unreadable for agenda, legal, list-steps, list, statute-stack and checklist at portrait@hall and story@hall, banked with a runner bless. Then the auto-split carousel template (the social v3 prototype) is rebuilt on top and re-judged; the independent judge put its ceiling at 8.5-8.8 without this and about 9 or more with it.
evidence  — the harness's Unreadable column for these galleries before and after, the ratchet diff in test/fit/baseline.json, and a montage of one slide per layout at story@hall before and after. Each layout change owes a demo deck (HARD RULE #9).
verify    — for g in inventory legal list-steps; do npm run fit:harness -- --only $g --sizes portrait,story --venues hall --packs none --edits none --ratchet test/fit/baseline.json; done  (`--only` matches one path substring)
