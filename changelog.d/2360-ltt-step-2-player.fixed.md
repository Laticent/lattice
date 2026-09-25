- **Fixed: a clip that fails to decode no longer stops the exported deck's narration.** The
  player shows its caption, holds for its estimate and moves on, as it does for a sentence with
  no clip. Only an autoplay refusal stops playback now.
- **Fixed: the exported caption crawl no longer runs 46 ms ahead of the voice on every sentence**
  (it ignored the encoder silence it had skipped), **and no longer jumps to the next line during
  the hold on a sentence shorter than 300 ms.**
- **Fixed: pressing Previous during a slide's arrival hold now speaks the slide you return to at
  once,** instead of waiting out the hold of the slide you left.
- **Fixed: in WebKit, the exported player no longer skips a voiced sentence whose length the
  browser reports late.** It sought past the encoder's leading silence before the clip's duration
  was known, and WebKit then ended the clip at once. The seek now waits for the duration.
