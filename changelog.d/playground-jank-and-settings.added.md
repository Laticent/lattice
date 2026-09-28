- **Fixed: a palette or light/dark change in the Playground no longer blanks the preview
  or throws you back to slide 1.** The preview used to rebuild its whole document for a
  theme change, which hid every slide until the new one loaded and reset the scroll. It
  now swaps the stylesheet in place and keeps your place. Decks with a Mermaid diagram
  still rebuild, and the preview then reopens at the slide you were reading.
- **Fixed: in Explore, Next and Prev land the whole slide in view.** A step placed the
  slide 16px too low, so a strip of the previous slide showed above it and the bottom of
  the one you asked for was cut off. Slides now center in the pane.
- **Fixed: in Edit, the preview follows what you type.** Typing or moving the caret into
  another slide scrolls the preview to it, so an edit no longer lands off screen. Scroll
  the preview yourself and it stays put until you type again.
- **Fixed: typing in the Playground costs less per keystroke.** The status line no longer
  flips to "Rendering…" and back on every key, the toolbar re-renders once when you pause
  instead of on every key, and the preview's fit step rewrites only the slides whose size
  changed. Measured against `main` on the built site, five alternating runs of a 31-key
  burst at 4x CPU slowdown: the page's own JavaScript fell from a median 817ms to 608ms,
  and the preview frame's from 477ms to 401ms. Long-task totals stayed within run-to-run
  noise.
- **Added: Look settings in the Playground's Deck settings.** Preset, headline
  alignment, heading rule, eyebrow, slide corners and venue join theme, finish and size.
  The sheet is grouped into Look, Format, On every slide and Editing, and each
  control now sits under its label at full width, so values like "HD · 1280×720 (16:9,
  default)" no longer cut off. The trigger reads "Deck settings" (it read "Deck
  Setting").
