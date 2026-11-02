---
origin: 2997
priority: P2
recorded: 2026-11-02
area: engine
severity: high
swimlane: engineering/decisions/2026-11-02-regia-narrator.md
deferred: large — step 3 of the gated order (regia-narrator §8): a new library replacing the 6,543-line chart-narration.js
source: https://github.com/Laticent/lattice/pull/2997
---

# Build Regia and port narration to it, word for word

why now   — narration re-parses Markdown and can say things the figure never drew (the word-cloud case)
where     — a new workspace library (Regia); each kind's manifest phrases and typed fact functions; Cadenza beat
            metadata; the LTT `actions` layer gains `{ unit, id }` targets (spec/LTT-1.0.md, owner-approved)
done when — chart-narration.js is deleted; goldens over the gallery decks match today's narration word for word (one
            phrasing per act); typed facts prototyped on line, funnel and sequence first; the player's guide side
            channel is gone; an independent a11y oracle stays
evidence  — the golden diff (empty); the byte plan met (lintCoreGz, engineJsGz, Studio eager)
verify    — tier 3 trio, because it replaces a shipped engine kernel
