- **Present goes full screen.** A toggle in the Present overlay's top bar (and
  the `f` key) hides the browser and the OS around the deck, so a laptop or an
  iPad on a lectern shows only slides. Escape leaves full screen; a second
  Escape exits Present. Closing Present hands the window back.
- The button appears only where the browser can actually do it — shown on
  desktop and iPad, absent on iPhone Safari, which ships no Fullscreen API for
  anything but native video. The capability is detected, so nothing needs
  updating if that changes.
- If a browser refuses the request, Present now says so — with the reason the
  browser gave — instead of leaving a button that appears to do nothing.
