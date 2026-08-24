- **Present goes full screen.** A toggle in the Present overlay's top bar (and
  the `f` key) hides the browser and the OS around the deck, so a laptop or an
  iPad on a lectern shows only slides. Escape leaves full screen; a second
  Escape exits Present. Closing Present hands the window back.
- The button appears only where the browser can actually do it — shown on
  desktop and iPad, absent on iPhone Safari, which ships no Fullscreen API for
  anything but native video. The capability is detected, so nothing needs
  updating if that changes.
- If a browser refuses full screen, Present says so — carrying the browser's own
  reason — instead of leaving a button that appears to do nothing. Where the
  refusal is structural the button retires itself for the session, which is what
  happens in Firefox, Chrome and Edge on iPad: those are WebKit shells, and the
  API is off by default for non-Safari apps however capable the engine reports
  itself to be. Safari on iPad is unaffected.
- **Present's staging controls read as one set.** Slides, Rehearse, Fullscreen
  and Presenter screen are now the same pill, and all show their labels at the
  same width, collapsing to bare icons together below it. They used to disagree
  three ways — one hid its label early, one never hid it, and Presenter screen
  was not even a pill. Presenter screen also keeps a stable label instead of
  swapping to "Presenter on", which a screen reader announced as the control
  becoming a different control.
