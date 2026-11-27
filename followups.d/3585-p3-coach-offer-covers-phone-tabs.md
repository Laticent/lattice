---
origin: 3585
priority: P3
recorded: 2026-11-27
area: website
severity: low
swimlane: docs/src/components/studio/StudioShell.tsx
deferred: off-path — #3585 fixes the e2e test the toast broke; where a first-open offer sits on a phone is a UX call for the owner, and the offer predates #3585 (#3492)
source: https://github.com/Laticent/lattice/pull/3585
---

# On a phone, the first Coach offer covers the pane tabs

Opening the Coach for the first time raises "New to Coach? A short lesson shows you around."
(`StudioShell.tsx`, FIRST-OPEN OFFERS). Below the narrow-screen breakpoint the Toaster sits
top-center (`docs/src/components/ui/sonner.tsx`, `usePlace`), over the pane tabs, so the first tap
on "Markdown source" hits the toast instead. Sonner pauses the 6 s timer while the stack is
expanded (`sonner/dist/index.mjs:605`), so a toast the viewer touched stays until they tap away.

Seen as `photo-contrast-coach.spec.ts:399` at 390px, red on the nightly (#2035) until #3585 started
that test with the offer already shown. A real viewer still meets it once per device.

Options: show the offer inside the Coach sheet instead of as a toast on a phone, place it at the
bottom on narrow screens, or keep it and accept one covered tap.

done when — a phone viewer's first Coach open leaves the pane tabs tappable, checked at 390px on
webkit-phone with no lesson-offer state seeded.
