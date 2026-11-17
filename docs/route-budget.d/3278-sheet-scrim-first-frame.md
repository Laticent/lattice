studio: +536
playground: +582
home: +536
getting-started: +536
The sheet's scrim now counts a tap from the sheet's first frame, read from the finger's down and up rather than from a
click (components/ui/sheet.tsx, in the eager overlay-back chunk on every route that can open a sheet). A small tracker
outside any one sheet records which pointers are down on a scrim, with their event times, so a tap that starts on a
loading sheet's scrim and lifts on the real sheet's still closes it; a second finger, a long press, a moved finger, a
right-click or ctrl-click, a tap while a menu opened from inside the sheet sits above it, and a stale entry do not, and
the tracker forgets every finger once the last open scrim unmounts. The tap goes through the caller's own outside-tap
handlers, and a later Radix report of the same tap is prevented. That is the 536 bytes. The Playground's other 46 are its
pick being remembered when it is made, and put back if the pick's plan fails to load (PlaygroundApp.tsx
`rememberComponent`, the in-flight branch of the URL sync, and `startWalk`'s `revertTo`). Both fix product defects that
e2e tests and the iOS Simulator met (back-gesture:172, the iOS deck-tap probe, playground-state:52), and the checker's
review of them (PR 3278). Read from CI's per-PR allowance block on d246f659d.
