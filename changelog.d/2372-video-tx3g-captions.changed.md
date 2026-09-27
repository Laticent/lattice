- **`lattice video` muxes its captions as `tx3g`**, the 3GPP timed-text format QuickTime, iOS
  and macOS use for subtitles, in place of the WebVTT-in-MP4 (`wvtt`) track no player offered.
  The track is off until the viewer picks it, and each caption shows exactly while its sentence
  plays and clears between sentences. It suggests an on-brand look: light bold text on the
  deck's own dark color at 86% opacity, both from the theme. iOS applies the colors and opacity;
  the viewer's caption style keeps its own font and weight. The `.vtt` sidecar is unchanged.
  Whether QuickTime on a Mac, PowerPoint and Keynote offer the track is not yet verified.
