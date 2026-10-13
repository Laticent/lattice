---
origin: 2633
priority: P1
recorded: 2026-10-13
area: website
severity: medium
swimlane: engineering/decisions/2026-10-06-studio-live-collaboration.md
source: https://github.com/Laticent/lattice/pull/2633
---

# Drive the iOS wake lock, the connection-log copy and the speaker picker on a real iPhone

why now   — #2633 shipped all three with desktop-engine and unit evidence only: a locked phone suspending the host is the suspected cause of "Nobody answered", and the log copy was rebuilt after a checker said Safari refuses a write that starts after an await.
where     — WakeKeeper in docs/src/components/studio/live/live-wake.ts; copyLog in live-controller.ts; the speaker picker in LivePanel.tsx YourAudio.
done when — On a real iPhone: the screen stays on while a session is live and sleeps after Leave; Copy connection log puts the text on the clipboard; choosing a speaker changes where a call plays (iOS has no picker, so the note shows). Each result is written into §12.3 of the live-collaboration note.
evidence  — the log text pasted from the phone; a before/after of the screen-lock behavior.
verify    — tier 3 on a real device; the owner's hands.
