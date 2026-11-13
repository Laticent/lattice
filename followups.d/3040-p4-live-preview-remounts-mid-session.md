---
origin: 3040
priority: P4
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-04-ci-flake-audit.md §3
deferred: off-path — a preview remount PR #3040 found and did not cause; the undo doorbell covers its effect on iOS undo
---

# The live preview rebuilds its frame mid-session, with several full writes in the same millisecond

Every iOS undo wipe the `ios-safari-undo` probe's frame tracker caught after PR #3040 added it came with a SECOND live frame:
`added iframe#2` followed by 5 to 9 `srcdoc` writes in the same millisecond (e.g. dispatch 42102243993 iPad cycle #8:
`512:added iframe#2` and eight `512:srcdoc iframe#2`). `single-slide-render.ts` creates an `iframe.live` only when its host
holds none, so the preview's host lost its frame and the renderer mounted a fresh one, then wrote it several times over.
Typing alone takes the in-place patch path and never does this.

On iOS that remount empties WebKit's undo list, which the undo doorbell now re-arms. Whether the remount itself is needed
is open: it costs a full write (hundreds of ms on a phone) where a patch would do, and the burst of writes on one frame
suggests queued renders that should have collapsed into one. Leads, not verified: something re-keys `DeckPreview` or
replaces its host mid-session (a pane or mode switch, a late setting), or a render sig that resolves asynchronously.

2026-11-12 (PR #3156): the probe now records every removal of a node holding an `iframe.live`, with what went (the
frame or the ancestor, by class) and the call stack that removed it (the step "live preview frames removed"). Its first
dispatch (43241110666) saw none: 0 on the iPad and 0 on the iPhone, and 0 of 8 undo cycles on each saw a frame event, so
the remount did not happen in that run. The nightly carries the recorder from now on.

done when — the probe (or a Studio trace) names what drops the old frame, and the remount is removed or shown to be needed,
with the burst collapsed to one write.
