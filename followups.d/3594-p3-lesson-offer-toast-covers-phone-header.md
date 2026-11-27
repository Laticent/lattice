---
origin: 3594
priority: P3
recorded: 2026-11-27
area: website
severity: low
swimlane: engineering/decisions/2026-09-13-one-status-pill.md
deferred: off-path — toast placement on a phone is Studio chrome; #3594 only fixes a test that met it
source: https://github.com/Laticent/lattice/pull/3594
---

# The first-open lesson toast covers the editor header on a phone

## What happens

The first time a panel with a lesson opens (the Coach, Slide settings), `StudioShell.tsx` FIRST-OPEN OFFERS raises an
action toast ("New to Coach? A short lesson shows you around.", **Show me**). Sonner places it at the top center. On a
390px phone that is over the editor header, including the **Markdown source** button. Sonner holds a toast open while
the pointer or a finger is on it, so a tap aimed at the button under it keeps the toast up instead of reaching the
button. `ACTION_DURATION` is 6 s, but it never runs out while the touch stays.

## How it was found

`docs/e2e/photo-contrast-coach.spec.ts:399` (390px) closed the Coach sheet and clicked **Markdown source**, and the click
was refused for its whole 15 s timeout, on `main` at 3cbae578. #3594 gives that test a viewer who has already been
offered the lesson. The overlap itself is untouched.

## What a fix decides

Where an action toast goes on a phone: below the header, at the bottom, or anchored away from the controls it would
cover. #3559 recorded the same shape for the Share failure toast over the Download button, so a fix should cover every
action toast, not this one offer.

done when — at 390px, with the Coach opened for the first time, a tap on **Markdown source** opens the source while the
lesson offer shows (an e2e arm on `webkit-phone` with no `lattice-studio-lessons-offered` seed passes).
