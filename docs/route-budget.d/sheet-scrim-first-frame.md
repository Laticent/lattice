studio: +538
playground: +538
home: +538
getting-started: +538
`ui/sheet.tsx` (eager on every route that mounts a sheet) now reads a scrim tap from the finger's pointerdown and pointerup, so a tap made before Radix arms its outside-tap listener, or one that lands on a lazy panel's replacement sheet, still closes the sheet. The pointer bookkeeping and the hand-off to the caller's own outside-tap handlers are the 538 bytes; without them `back-gesture.spec.ts:172` failed 3 in 100 on webkit-phone at four workers, and in iOS Simulator Safari the Library stayed open on 4 of 10 deck taps (#3278, run 44008585425).
