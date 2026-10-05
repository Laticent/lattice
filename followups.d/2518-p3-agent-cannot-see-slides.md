---
origin: 2518
priority: P3
recorded: 2026-10-05
source: https://github.com/Laticent/lattice/pull/2518
---

# Give the Studio chat agent a way to see whether its slides fit

why now   — check_deck is lint, review and Mermaid's parser. The agent cannot tell a slide
            that overflows, crowds or clips from one that fits, so its "the checker reports
            0 errors" is the only verification it can claim. The preview frame already
            measures fit.
where     — docs/src/components/studio/architect-agent.ts (check_deck),
            docs/src/components/studio/StudioShell.tsx (checkDraft), the preview frame's fit
            measurements.
done when — check_deck (or a sibling tool) reports per-slide fit for the DRAFT from a real
            render, and a deliberately overfull slide comes back flagged.
evidence  — a draft with one overfull slide, before/after, rendered in the real Studio via
            tools/screenshot.js at 1440.
verify    — tier 1 checker, because it puts the render path behind a model-facing tool.
