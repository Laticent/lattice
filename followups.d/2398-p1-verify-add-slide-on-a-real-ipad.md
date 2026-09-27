---
origin: 2398
priority: P1
recorded: 2026-09-27
source: https://github.com/Laticent/lattice/pull/2398
---
# Drive Add slide on a real iPhone or iPad after #2398 (Safari 26+)

why now   — #2398 keeps Add slide mounted between opens so WebKit stops stranding ~45 MB per
            reopen. Its previews are back inside the gallery's scroller, where main had them, so
            momentum scrolling should be unchanged. The design before it (a frame dock) was
            removed because on the owner's iPad its previews trailed their cards and snapped
            back. That this one does not has not yet been seen on a device.
where     — the deployed Studio. Open Add slide from the Edit pane's drawer, fling-scroll hard,
            close with the back gesture and with the Deck button, reopen, fling again; tap a tile
            and confirm it inserts. With VoiceOver on, confirm the gallery is announced as a
            dialog and the Studio behind it is not reachable.
            Record: engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md §5.
done when — no preview trails its card during a fling, a reopen starts at the top with every
            preview on its tile, the back gesture closes only the gallery, and Safari's Web
            Inspector (Timelines → Memory) shows no step on reopens 2 and later.
evidence  — a screen recording of the fling and the memory timeline over three reopens,
            attached to the PR that deletes this file.
verify    — tier 0 plus a human on the device, because the surface cannot be driven from the
            sandbox (#23).
