---
origin: 3037
recorded: 2026-11-05
area: website
swimlane: engineering/decisions/2026-11-05-fuoco-event-channel.md
priority: P4
severity: medium
deferred: blocked — needs build 1, a trace of what the diagram poll costs, and the owner's export sign-off (a runtime change alters exported bytes).
---

# Fuoco event channel, build 4 (slice 2): the per-frame bridge, render, figure, plugin, chart and view events

where     — lib/runtime/index.js; the host's frame builders; docs/src/components/studio/export/deck-export.js.
what      — §4.3 of the note: one `__latticeEvents` on the parent (like `installPreviewDrawHost`, frozen), reached through `window.parent` inside the runtime's existing try; the runtime passes its own window, and the host maps it to a per-frame record `{ frameId, role }` and drops unknown windows; it answers capture frames (unlike `__latticeDrawHost`). `rev` is the rev of the content an event is about, not of the frame. Design the mechanism here, covering every writer the note's §10.4 lists: the Playground and Studio full writes (only the Playground's stamps an id today), `patchSections` (both branches), `restyleDocument`, the virtual mount (`applyWindow`), `patchSlideBody`, the export's capture frames and the Print frame (the bake, prune, runner and draw-host frames are out of scope); the Studio's render call must be handed the hub rev; `emit` carries the id; ids are written before insertion. Host side: copy, closed schema, host-stamped origin/frame/rev, delivered on a host microtask. Events: `render.*`, `figure.*` (with `failed`, `reclaimed`), `plugin.library-*/diagnostic/degraded/used`, `chart.*`, `view.*`, `fonts.settled`, `fit.*`, the in-frame code-block copy. `waitForDiagrams` stays a state read and gains the event as its wake-up; its budgets and terminal release stay.
done when — the diagram poll is gone (replaced by state read + wake-up), its wait is measured before and after, a preview's figure never satisfies a capture frame's wait (a test with both frames open), a figure patched in at one rev that settles after the next patch keeps its own rev, a section mounted by scrolling after a patch carries that patch's rev, a restyle does not reset it, and a frame cannot claim another frame's id, and a demo deck is signed off dark and light.
