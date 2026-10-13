---
origin: 2633
priority: P3
recorded: 2026-10-13
area: website
severity: low
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2633
---

# Withdraw an already-sent chat "typing" post when the person turns typing off

why now   — The second #2633 review found that turning off "Show when I'm typing" stops new chat typing posts but leaves one already sent showing "X is typing" for up to 4 s (TYPING_SHOW_MS).
where     — chatTyping and the typing receiver in docs/src/components/studio/live/live-controller.ts; the typing line in the chat panel.
done when — A typing post sent just before the switch is cleared on the others' screens at once, with a controller test.
evidence  — a controller test over the in-memory network: after setShare({ typing: false }) the other side's typing list empties without waiting 4 s.
verify    — tier 1; unit.
