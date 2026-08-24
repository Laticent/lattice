- **Fixed: `contrast:player:bless` could quietly record a surface getting worse.**
  It wrote whatever the sweep measured, in both directions, so a bless could
  answer the gate's only question — "did tonight make something worse" — by
  moving the goalposts. Blessing is ratchet-only now: a measurement below the
  committed value is held, printed with both numbers, and left for a human, so
  the nightly stays red until someone explains it. `--allow-loosen` is the one
  way down and still reports every row it writes. New findings, improvements and
  findings that no longer reproduce are unaffected.
- **Fixed: the player-contrast sweep sampled animated slides mid-flight.**
  Making a frame active is what STARTS its scene — the runtime begins playing,
  the play control flips to `⏸`, and its chrome fades to rest — and the audit
  waited a flat 120 ms before reading. The three `anima-scene` pause controls
  were recorded at 3.20 / 3.19 / 3.20 and re-measured anywhere between 1.93 and
  4.27, with the values shuffling between pages run to run. Each slide is now
  settled before it is read: fonts awaited, finite animations finished, infinite
  ones paused at a fixed phase, repeated until nothing new starts. Three
  consecutive runs of `anima-scene` now report identical rows, and the three
  "as exported" findings turn out not to be findings at all — they were the fade
  being caught halfway.
