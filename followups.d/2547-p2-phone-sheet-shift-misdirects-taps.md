---
origin: 2547
priority: P2
recorded: 2026-10-06
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-phone-chrome.md
source: https://github.com/Laticent/lattice/pull/2547
---

# A phone sheet moves under the finger when a field loses focus, so a tap on a button below it lands on the field

why now   — `MOBILE_HEIGHT` (docs/src/components/ui/panel.tsx) makes a phone sheet 54px taller while a text field in it has focus. A tap on a button below the field blurs it first, the sheet shrinks back, and the click lands on whatever slid under the finger. Found on the Live panel's Start button at 390 px (Chromium touch emulation): the tap hit the name field and nothing started. The Live panel now keeps focus through the tap (`onMouseDown` preventDefault); every other phone sheet with a field above a button is exposed the same way.
where     — docs/src/components/ui/panel.tsx (`MOBILE_HEIGHT`), or each sheet's buttons below a field.
done when — a sweep of phone sheets with a field above a button (deck setup, workspace settings, library forms) taps each button after typing and the tap lands, with the fix in the primitive if one change covers them.
evidence  — a touch-emulation run per sheet (the `.tap()` after `.fill()` pattern), and the owner's real iPhone, since iOS may hit-test differently (UNVERIFIED there).
verify    — tier 1 checker, because the primitive is shared by every phone sheet.
