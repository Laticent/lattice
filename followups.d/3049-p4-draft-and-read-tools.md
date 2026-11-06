---
origin: 3049
priority: P4
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §4
deferred: blocked — needs the action registry from 3049-p3-action-registry-and-create-deck
source: https://github.com/Laticent/lattice/pull/3049
---

# Add set_theme, set_finish, render_slide and chart_from_data to the chat

why now   — the chat restyles by hand-editing front matter, cannot look at a slide, and has no data-to-chart path.
where     — the action registry; BUILTIN_PALETTES and the finish catalog for enum schemas; the chart kinds' docs.
done when — each tool has a schema, a tier (draft, or read for render_slide) and a per-turn cap where it costs an
            image; PURPOSE no longer says the chat cannot see slides once render_slide ships.
evidence  — one real turn per tool.
verify    — tier 1 per tool, plus a test that Talk cannot call the draft ones.
