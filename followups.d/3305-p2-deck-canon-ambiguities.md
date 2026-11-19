---
origin: 3305
priority: P2
recorded: 2026-11-19
area: docs
severity: medium
swimlane: engineering/decisions/2026-11-17-agent-pack.md §4.5
deferred: off-path — the remaining ambiguities live in the deck canon the Studio sends its own model (`lib/authoring/deck-canon.js`) and in layout manifests; rewording them changes the Studio's prompt, its eager-JS route budget and every layout file, which is a canon change of its own, not the pack's
---

# Settle the deck-canon ambiguities a model reading start.md alone reported

why now   — #3305's no-spend stand-in eval (an Opus agent given only `start.md`, then only the
            solo paste text, writing decks from the nightly eval's three briefs) passed all six
            decks after the pack's own gaps were fixed. It still reported places where the canon
            leaves a model guessing. The nightly eval will meet the same ones with a real model.
where     — `lib/authoring/deck-canon.js` (quoted in start.md §2 and in the Studio's prompt):
              - "ONE sentence plus a signature": "signature" is never defined, and the closing
                skeleton has no slot for one.
              - "Every `##` heading is a COMPLETE DECLARATIVE SENTENCE": the divider and agenda
                skeletons are labels; say whether dividers and agendas are exempt.
              - "~1–2 minutes per slide" against the restraint rules: a 30-minute lesson reads as
                15–30 slides.
              - "aim ~70 words of body" against the `content` skeleton's "under forty words".
              - "a human beat (a quote)": say to skip it when the brief has no quote, never invent one.
            Layout manifests and start.md §4:
              - `big-number` and `quote` skeletons carry no `##`; say whether one is allowed.
              - Heading periods: skeletons type them, while `with-period`/`no-period` suggest the
                engine adds one.
              - `timeline-list`'s trailing `` `decision` `` / `` `live` `` spans are unexplained.
done when — Each item above is either settled in the canon or the manifest, or answered in
            start.md, and a fresh stand-in run (or the nightly eval) no longer reports it.
