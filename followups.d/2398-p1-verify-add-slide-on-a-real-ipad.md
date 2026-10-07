---
origin: 2398
priority: P1
recorded: 2026-09-27
area: website
severity: medium
swimlane: engineering/decisions/2026-09-13-gallery-preview-memory.md
source: https://github.com/Laticent/lattice/pull/2398
---
# Finish the real-device check of Add slide after #2398: memory, VoiceOver, rotation (Safari 26+)

Narrowed 2026-09-27 by #2416: the owner opened, scrolled and closed the deck settings about
20 times on an iPad (branch preview) and Safari never reloaded the tab, and did the same with
Present's overview on an iPhone. What is left is below;
a Mac is NOT available, so Safari's Web Inspector is not an option — use the reload test.

why now   — #2398 keeps Add slide mounted between opens so WebKit stops stranding ~45 MB per
            reopen. The owner checked it on an iPad against the preview deploy of `bbe4b31`:
            fast scrolling shows no bounce, and closing shows no flash. What no device has shown
            yet is the memory itself, VoiceOver on the phone's second open, and a rotation.
where     — the deployed Studio. Open Add slide from the Edit pane's drawer, fling-scroll hard,
            close with the back gesture and with the Deck button, reopen, fling again; tap a tile
            and confirm it inserts. Rotate the phone with the gallery open and closed. With
            VoiceOver on, open it twice from the drawer and confirm it is announced as a dialog
            both times and the Studio behind it is not reachable. Touch-scroll the gallery while
            the drawer's Radix scroll lock may still be active beneath it.
            The deck settings and Present's overview (`g`) now stay mounted the same way: open,
            fling-scroll and close each three times too, and on the iPad drag the docked
            settings' handle while it is open and scroll it hard (the panel is drawn over its
            column, not in it — `settings-dock.tsx`). On the phone, close Settings with a tap and
            confirm no hint pops up over the toolbar.
            Record: engineering/decisions/2026-09-26-render-drift-and-unclosed-comments.md §5.
done when — Safari does not reload the tab over ~20 open/scroll/close cycles of Add slide, as
            it did not for the deck settings and the overview; ideally the same run on the live
            site DOES reload, as the control,
            VoiceOver announces the gallery as a dialog on the phone's second open, and a rotation
            with the gallery open keeps every preview on its tile.
evidence  — the owner's report of the reload test per surface (and the live-site control),
            and a VoiceOver recording, attached to the PR that deletes this file.
verify    — tier 0 plus a human on the device, because the surface cannot be driven from the
            sandbox (#23).
