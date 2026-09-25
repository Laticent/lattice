---
origin: 2339
priority: P5
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2339
---

# Hash a deck segment's emphasis spans, as the tour recorder already does

why now   — LTT step 4 settled that emphasis goes with a segment's text in its hash
            (`segmentHashInput(text, inputs, emphasis)`), and the tour recorder does it. The deck
            producer does not: `narrationPayload` receives each slide's text, track and clips, and
            no emphasis spans, so an emphasis-only edit to a deck leaves its segment `hash`
            unchanged. Nothing calls `isStale` on a deck yet, so nothing is wrong today; the first
            caller that does would call a re-timed slide fresh.
where     — lib/export/player-core.mjs `narrationPayload` → lib/core/ltt-deck.mjs `deckLtt`
            (the hash), and the Studio's bake in docs/src/components/studio/share-export.ts, which
            holds the spans (PresentOverlay's `projected.emphasis`).
done when — the bake passes each slide's spans, `deckLtt` hashes them through
            `segmentHashInput`, a deck with no emphasis keeps byte-identical hashes, and a test
            re-weights one span and sees exactly that slide's hash move.
evidence  — the golden export of a deck with no emphasis unchanged; one with emphasis shows only
            the hash field moving. It changes export bytes, so it stops for the owner's sign-off on
            a demo deck in dark and light mode (CLAUDE.md §Quality Bar).
verify    — tier 1 checker, because it changes an export's bytes.
