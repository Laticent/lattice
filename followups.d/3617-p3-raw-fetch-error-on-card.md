---
origin: 3617
priority: P3
recorded: 2026-11-28
area: website
severity: low
swimlane: engineering/decisions/2026-11-28-hung-first-render-card.md
deferred: off-path — #3617 adds the hung-render card and does not touch the `ok: false` path; the raw message is that path's, older than #3617
source: https://github.com/Laticent/lattice/pull/3617
---

# A render that fails on a network error shows the browser's raw message on the card

why now   — the checker on #3617 aborted the Studio's theme request and the card read "This preview couldn't render —
            Failed to fetch." The engine-load failure deliberately keeps the browser's message off the card (a module URL,
            wider than a phone) and says what to do; an `ok: false` render passes `status.error` through as it is.
where     — docs/src/components/DeckPreview.tsx, the status branch of `renderOnce`: `setFailedWhy(String(status.error))`.
            The renderer's own authoring errors ("renders as 2 slides…") are the reason worth showing; a network error
            from a theme or chunk fetch is not.
done when — a fetch or chunk-load error on the card reads as a plain instruction (check the connection, then Retry), the
            raw message goes to the console, and the authoring errors keep their wording.
evidence  — the checker's run on #3617's branch build, desktop Chromium; docs/e2e/preview-hung-render.spec.ts's theme arm
            reaches this card after `h.fail()`.
verify    — a unit arm for each kind of error, and the e2e theme arm reading the card's text.
