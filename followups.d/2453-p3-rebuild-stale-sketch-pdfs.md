---
origin: 2453
priority: P3
recorded: 2026-09-28
area: infra
severity: medium
swimlane: engineering/decisions/2026-09-28-inline-sparks.md
source: https://github.com/Laticent/lattice/pull/2453
---

# Rebuild the committed PDFs of the sketch-mode example decks

why now   — PR #2453 fixed sketch mode's hand-drawn ink landing one section-border-width
            (4px) low, so every committed PDF of a sketch deck now shows its table, ledger
            and masthead rules 4px below where a fresh render puts them. Those PDFs were
            ALREADY stale against main before that PR: a fresh render of
            examples/table-component.pdf differs on slides with no sketch at all (row
            striping). Rebuilding them inside #2453 would have put unrelated drift under that
            PR's name, so they were left alone there.
where     — examples/{card-tags, matrix-grid-rendering-jank, mermaid-sketch-labels,
            mindmap-branch-colors, mode-frontmatter, panes-sketch, sketch-ledger, sketch,
            table-component}.pdf (each is a sketch deck or has a sketch slide).
done when — each PDF is re-rendered from main in one PR whose golden-diff comment shows the
            accumulated drift, reviewed as such.
evidence  — the pixel diff in the #2453 session: 1 to 17 changed pages per deck, including
            non-sketch pages.
verify    — `node dist/lattice-emulator.js examples/<deck>.md examples/<deck>.pdf` for each,
            then read the golden-diff comment on the PR.
