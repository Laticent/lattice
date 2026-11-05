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
what      — §4.3 of the note: one `__latticeEvents` on the parent (like `installPreviewDrawHost`, frozen), reached through `window.parent` inside the runtime's existing try; the runtime passes its own window, and the host maps it to a per-frame record `{ frameId, role }` and drops unknown windows; it answers capture frames (unlike `__latticeDrawHost`). `rev` is stamped per write or patch, not per frame: a full write already has `data-lattice-write` (`deck-render.js:566`, `:584`), and the two patch paths (`single-slide-render.ts:274-279`) need a NEW per-section `data-lattice-patch` id, since they stamp nothing today. Host side: copy, closed schema, host-stamped origin/frame/rev, delivered on a host microtask. Events: `render.*`, `figure.*` (with `failed`, `reclaimed`), `plugin.library-*/diagnostic/degraded/used`, `chart.*`, `view.*`, `fonts.settled`, `fit.*`, the in-frame code-block copy. `waitForDiagrams` stays a state read and gains the event as its wake-up; its budgets and terminal release stay.
done when — the diagram poll is gone (replaced by state read + wake-up), its wait is measured before and after, a preview's figure never satisfies a capture frame's wait (a test with both frames open), and a figure patched in at one rev that settles after the next patch is stamped with its own rev, and a demo deck is signed off dark and light.
