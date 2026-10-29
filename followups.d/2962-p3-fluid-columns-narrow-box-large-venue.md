---
origin: 2962
priority: P3
recorded: 2026-10-29
area: inventory
severity: medium
swimlane: engineering/decisions/2026-10-28-fit-everywhere-model.md §12
deferred: large — six layouts each need a Fluid reflow for narrow boxes; this PR changes tooling and docs only
---

# Six layouts keep their columns in a narrow box at a large venue, so their text crams

why now   — under the decided policy (h0-30+C with the 0.75-spacing rescue), the pages left unreadable come from component layout, not from the split: these layouts keep their desktop column count in a portrait or story box at `venue: hall`, so each column gets a few characters per line. No split policy fixes this; the slide fits or splits and the columns stay as narrow. Counts from test/fit/baseline.json (structural arm, original slides, `unreadable` / `clip`):
            agenda (lib/components/inventory/agenda) — story@hall 13 / 0, portrait@hall 2 / 14;
            legal bucket gallery (lib/components/legal/legal.gallery.md) — story@hall 3 / 22, and 2 unreadable at each of square, portrait and story at laptop;
            list-steps (lib/components/progression/list-steps) — 1 unreadable in each of five cells;
            list (lib/components/inventory/list) — story@hall 4 / 0, portrait@hall 3 / 5;
            statute-stack (lib/components/legal/statute-stack) — portrait@hall 4 / 7, story@hall 4 / 6;
            checklist (lib/components/inventory/checklist) — portrait@hall 5 / 2, story@hall 5 / 0.
where     — each layout's `*.styles.css` (agenda, list, checklist, list-steps, statute-stack, and the legal components the bucket gallery exercises): the column count and track sizes at narrow boxes and large venues.
done when — each layout drops to fewer columns (or a stacked form) when its box is too narrow for readable lines at the deck's venue, and the fit ratchet reports 0 unreadable for these galleries at portrait@hall and story@hall, banked with `--bless`.
evidence  — the harness's Unreadable column for these galleries before and after, the ratchet diff in test/fit/baseline.json, and a montage of one slide per layout at story@hall before and after. Each layout change owes a demo deck (HARD RULE #9).
verify    — for g in inventory legal list-steps; do npm run fit:harness -- --only $g --sizes portrait,story --venues hall --packs none --edits none --ratchet test/fit/baseline.json; done  (`--only` matches one path substring)
