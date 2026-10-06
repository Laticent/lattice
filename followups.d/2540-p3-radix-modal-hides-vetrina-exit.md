---
origin: 2540
priority: P3
recorded: 2026-10-06
source: https://github.com/Laticent/lattice/pull/2540
---

# A Radix modal still walks into Vetrina's stage and hides Exit from assistive tech

why now   — the Share sheet's `PersistentSurface` inerted Exit through its live-region walk; that is
            fixed with `data-modal-exempt`. Review found the same shape in Radix modals: `hideOthers`
            (docs/node_modules/aria-hidden, keeps `[aria-live]`, marks the siblings on the path) sets
            `aria-hidden` on Exit, and Radix's focus trap keeps keyboard focus out of it. A pointer
            press still lands (Exit is `pointer-events:auto`), but probably also reads as a click
            outside and closes the dialog. Pre-existing; not worsened by the fix. Not yet checked
            whether any lesson or tour runs over a Radix modal (the phone's Deck sheet is a candidate).
where     — docs/src/components/ui/{sheet,dialog}.tsx (Radix modal), docs/src/lib/vetrina/stage.ts.
done when — with a Radix modal open under a running lesson, Exit is in the accessibility tree,
            reachable by Tab, and closes the lesson without closing the modal; or it is shown that no
            lesson or tour ever runs over one.
evidence  — an e2e arm over a Radix modal, or the census of lesson beats.
verify    — tier 1 checker; the stage is shared by every tour and lesson.
