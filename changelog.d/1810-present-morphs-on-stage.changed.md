- **Present stays Present until you open a Stage.** The presenter view — speaker notes, the
  next slide and the talk clock — now arrives when you send the deck to a second screen and
  leaves when you close it, instead of being present from the moment you hit Present. With no
  Stage there is nothing to be a *presenter view* of: one button changes the room and your own
  screen together, and closing it puts everything back.
- **The Stage can be driven from the Stage.** Keyboard, mouse wheel and swipe all move the
  deck on the projected window, not just on the console — for the presenter standing at the
  machine the deck is on. Both surfaces run the same input kernel, and the console remains the
  single writer, so the two can never disagree about which slide is up.
- **The Stage has controls.** An auto-hiding bar — previous, slide counter, next, and a real
  full-screen button — appears on a mouse move or a key and fades again after a couple of
  seconds. Full screen from a button is more reliable than the old `f` key, because the browser
  wants the gesture to happen in that window. `f` still works.
- **The progress rail is now a toggle** on the Present bar, beside Captions and Guide. It
  governs the rail wherever the room is looking — the Stage when one is open, the console's own
  dock when there is not. On by default.
- **The Stage's controls answer to the keyboard.** Space and Enter now press the control-bar
  button you tabbed to, instead of moving the deck past it — previously Space on *Previous
  slide* advanced the deck, and Space on the full-screen button advanced it rather than filling
  the screen. Arrow keys still drive the deck while a button holds focus.
- **A pinch on the Stage no longer turns the deck.** Two-finger pinches and trackpad
  (`ctrl`+wheel) zoom gestures were being read as swipes; the Stage now uses the same
  finger-counting rule as every other slide surface. A one-finger swipe still turns the deck.
- **The talk clock starts when the Stage does**, not when Present opens — rehearsing before you
  project no longer counts against the talk.
- **A Stage that gets navigated away can no longer drive the deck**, and can be reopened. A deck
  link inside the projected window could carry it to another page that stayed able to move the
  presenter's slides; that window is now refused and closed, so pressing Stage opens a fresh one
  instead of silently doing nothing. Links inside the Stage are ignored in every form (including
  SVG links and image maps, which were previously followed).
