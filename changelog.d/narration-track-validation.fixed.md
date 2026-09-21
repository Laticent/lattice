- **Fixed: one broken caption track no longer silently zeroes every later slide.** The
  deck-level `.vtt` accumulates `offset += track.durationMs`, so a single non-finite duration
  poisoned the running sum and every subsequent slide serialized as
  `00:00:00.000 --> 00:00:00.000` — a perfectly valid WebVTT file in which every caption after
  the bad one fires at time zero, with nothing anywhere saying so. Measured on an unguarded
  three-slide deck. Cadenza's `validateTrack` now runs at the serializer, so no `.vtt` this
  pipeline writes can carry a poisoned timeline, and the CLI names the slide it dropped and
  why. A sound deck's sidecars are byte-identical to before.
- **Added: the Studio's webpage-export panel warns when the chosen voice does not speak the
  deck's language.** Neither speech engine takes a language parameter, so for both model rungs
  the voice IS the language — and a `lang: es` deck read by an English voice was silent about
  it. `voiceLanguageMismatch()` shipped as the answer and had no caller; it has one now, on
  the surface where the voice is baked into every copy the recipient opens.
