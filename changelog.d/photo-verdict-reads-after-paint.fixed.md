- **Fixed: the Coach's photo-contrast finding no longer goes missing when the preview paints late.** The Studio measured a
  slide's photo once, 900 ms after the last change. On a phone, typing in Source and then opening Preview could run that
  measure before the preview had drawn the slide, so it came back empty and was never taken again. A slide that could not be
  measured is now measured again when the preview paints.
