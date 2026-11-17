studio: +487
playground: +500
home: +487
getting-started: +487
The sheet's scrim now counts a tap from the sheet's first frame, read from the finger's down and up rather than from a
click (components/ui/sheet.tsx, in the eager overlay-back chunk on every route that can open a sheet). A small tracker
outside any one sheet records which pointers are down on a scrim, with their event times, so a tap that starts on a
loading sheet's scrim and lifts on the real sheet's still closes it; a second finger, a long press, a moved finger and a
stale entry do not. The tap goes through the caller's own outside-tap handlers, and a later Radix report of the same tap
is prevented. That is the 487 bytes. The Playground's other 13 are its pick being remembered when it is made
(PlaygroundApp.tsx `rememberComponent` and the in-flight branch of the URL sync). Both fix product defects that e2e
tests and the iOS Simulator met (back-gesture:172, the iOS deck-tap probe, playground-state:52).
