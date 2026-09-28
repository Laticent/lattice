- **Present's caption no longer lights a sentence before Kokoro speaks it.** Kokoro starts every
  clip with about 0.3 s of near-silence, and Present started each caption when the clip started.
  Present now measures where the speech begins in each decoded clip, by the same rule the narrated
  export trims with, and starts the caption there. The first word stays lit through the silent head,
  so the caption never blanks.
