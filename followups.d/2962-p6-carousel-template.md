---
origin: 2962
priority: P6
recorded: 2026-10-29
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §5
deferred: blocked — waits on responsive components (followups.d/2962-p3-…), without which the template tops out near 8.5
---

# Auto-split becomes a carousel: cover, content-only pages, ending

why now   — the owner judged today's auto split bunk: the four-slide test deck splits into 25 pages, the repeated title takes up to half of each page, and words hide under the "next" pills. Owner's rules: the title and eyebrow appear on the cover only; content pages carry content and nothing else (no header, footer, repeated title, "(cont.)" or pill); an ending page carries the key insight or below-note when the slide has one; components keep their own styling; on brand in every theme. Three prototypes were judged; the social track won. An independent judge scored it 7.4 (v2) and 8.1 (v3), with a ceiling of 8.5-8.8 until components scale to the box. Owner rulings: no navigation control on content pages (swipe cue on the cover only); the key insight keeps its own callout styling; keep the prototype's vertical timeline and vertical cycle, with the cycle drawing its return to step 1 so it reads as one loop.
where     — the split envelope (lib/core/split-envelope.js, lib/core/carousel.js, the `.lat-split-native` rules in lib/base/base.modifiers.css). The prototype's density rules to carry over: one content start line per carousel, pages 60-85% full, never split a paired unit (compare before/after, a decision's points), never leave one item alone, a slide that fits whole stays a normal slide, one type scale per carousel with a floor of about 17pt on a phone.
done when — the auto split renders as cover / content / ending in the engine, built on responsive components; the four-slide deck and the second test deck both pass the export probes with 0 clipped, unreadable or lost; and an independent judge, comparing it with today's split, scores it 9 or higher.
evidence  — judged contact sheets of both decks in a light theme, its dark variant and a second theme, at portrait and one other box; the fit ratchet diff; a demo deck (HARD RULE #9).
verify    — npm run fit:harness -- --sizes square,portrait,story --venues laptop,hall --packs none --edits none --ratchet test/fit/baseline.json
