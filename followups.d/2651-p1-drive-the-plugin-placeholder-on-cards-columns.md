---
origin: 2651
priority: P1
recorded: 2026-10-14
area: website
severity: medium
swimlane: engineering/decisions/2026-09-27-plugin-system.md
---

# Drive the plugin placeholder in the real Studio on `cards`, `columns` and the fluid view

why now   — #2651's merge confidence held at `high` on one gap: the placeholder (`div[data-lattice-plugin-off]`)
            was seen in the real Studio on a plain slide with five plugins, and in `plugin-fence-ui.spec.ts`
            at 1440, 820 and 390, but never inside a `cards` or `columns` cell, and never in the fluid
            (reflowing) view at 820 and 390. A `figure` placeholder sized in `cqi` of its container may
            read differently when the container is a grid cell.
where     — `lib/base/base.modifiers.css` (the placeholder paint), `lib/packages/code-door-fence.mjs`
            (`fencePlaceholder`), `docs/e2e/plugin-fence-ui.spec.ts`.
done when — each of the three placements (`chip`, `figure`, `stage`) is seen in a `cards` cell, a `columns`
            column and the fluid view at 820 and 390 in the real Studio, with a screenshot of each, and any
            clip, overflow or collapse found is fixed.
evidence  — screenshots from `LATTICE_EVIDENCE_DIR=<dir>` runs of the Studio e2e spec at 820 and 390.
verify    — the real Studio (HARD RULE #23); a unit or emulation pass does not count.
