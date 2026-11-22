---
origin: 3410
priority: P1
recorded: 2026-11-22
area: theming
severity: medium
swimlane: engineering/decisions/2026-11-20-deck-preset-study.md §5–§8
deferred: blocked — waits on #3410 (the spectrum keys, which supply `spectrum: solid left band`) merging first
source: https://github.com/Laticent/lattice/pull/3410 — the coordinator's Wave 1 brief, 2026-11-21
---

# Deck presets, Wave 1: Earnings, Annual Report, Strategy House, Museum, raised Editorial

Branch `claude/presets-wave-1` (commit `185f3a3e`, no PR yet) holds a stopgap: every preset stamps
`preset-<name>`, and `lib/base/base.presets.css` carries the preset rules. The owner then decided
(decision S8 in `engineering/decisions/2026-11-21-spectrum-keys.md`): each preset gets its own folder,
`lib/presets/<name>/<name>.css` plus `<name>.preset.json`, read through a generated data module, with no
script writing CSS. External (user-made) presets come later.

Steps, in order:
1. After #3410 merges, cut a fresh branch from `main` (do not stack on the old one; HARD RULE #17) and
   carry `185f3a3e`'s plumbing over, converted to the per-preset folders.
2. Build the five presets. Strategy House and Earnings use `spectrum: solid left band`; the cover
   compositions come from `cover:`; marks use `marks: tone ink|accent` (#3349, merged).
3. Ask the owner the three open gaps from the study, with visuals: G2 (heading size and weight, they want
   a scalable mechanism), G3 (Museum's accent hue), G4 (cover sizes). G1 is solved by #3410's weight axis.
4. Gates from the brief: the overflow guard; `preset-gate`; two blind judges (one `checker`, one
   `red-team`, Opus, `--packet`), ship floor 8.5, at most two rounds; demo deck, changelog, docs, HARD
   RULE #34 evidence, maker-checker. Agent budget for the wave: 5, of which #3410 used 3; ask the owner
   before more.
5. Report to the coordinator (session_015KSkL7nmyGLB3eqQgaSLAb) at the gap stop, at PR open and at the card.

done when — the five presets ship from `lib/presets/<name>/` in one PR, each judged 8.5 or better by both blind judges, with `preset-gate` and the overflow guard green.
