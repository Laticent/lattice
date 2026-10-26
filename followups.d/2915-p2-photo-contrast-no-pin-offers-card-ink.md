---
origin: 2915
priority: P2
recorded: 2026-10-26
area: website
severity: low
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2915
---

# When no pin clears the floor, the Coach could offer the card ink

why now   — On `photo-wide` with `card-clear` and a body paragraph, pinning dark leaves the theme's muted
            body ink at about 3.7:1, so no pin is offered and the message only names the options. For a
            spotlight card the existing `ink-light` / `ink-dark` classes (the thin-card feature) would clear
            it, and `pickCardInk` in `lib/core/card-ink.mjs` already chooses between them. The owner's
            agreed design was the dark pin only, so this is left as a decision, not built.
where     — `lib/core/photo-contrast.mjs` `judge` (candidate list), `photo-contrast-read.ts` `readPinned`.

done when — The owner decides whether a failing slide offers `Set card ink light/dark` alongside the pin; if yes, `judge` tries those candidates and the e2e "no pin" case changes to expect a button.
