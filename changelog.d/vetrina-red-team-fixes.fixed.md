- **Vetrina — `bounds: 'host'` no longer strands Exit off screen.** The chrome is now confined to
  the VISIBLE part of the host (intersected with the window), falling back to the window when the
  host is scrolled out of view. A host taller than the window — a panel in a scrolling page, which
  is the case the option exists for — previously seated Exit up to 638px above the top of the
  window, where it could not be pressed; Exit is pointer-only, so that removed the only escape
  from a running tour.
- **Vetrina — a voiced narrator now docks the caption at the edge** rather than anchoring it to the
  cursor. A voice removes the reading trip the balloon exists to save, and what is left is a
  subtitle, which belongs at a fixed screen position. It also removes a stale anchor: a voiced
  caption never hides, so it was placed once per beat and then sat up to 493px from the pointer it
  was speaking for.
- **Vetrina — a self-dismissing caption is budgeted by reading time, not by the pacing model.**
  `caption: 'cursor'` against the default `pacing: 'legacy'` erased an 8-word line after 1900ms
  where a reader needs 3500ms. The new `Pacing.dwellMs` is the grounded rate under both models.
- **Vetrina — a caption never outlives its beat.** `instant` and word-cued (`at`) beats left their
  line standing, and the balloon then re-anchored beside the cursor on every later beat with
  nothing to say. A hold no longer survives a throwing `act` either.
- **Vetrina — `Narrator` gained an optional `dispose()`**, and `voicedNarrator` implements it,
  closing the `AudioContext` only when it created one. Building a voiced narrator per run leaked
  one context per run against a per-document cap. Both track caches are now bounded.
- **Vetrina — `gesture` records what it aimed at**, so the caption's avoid list holds the ink just
  drawn rather than the previous beat's target. `setVoiced` is now `destroyed`-guarded like every
  other stage verb.
- **Vetrina — the caption no longer comes back carrying the previous beat's line.** `say()` swaps
  the words 140ms after the call, and a performance ending inside that window revealed the bubble
  still holding the last caption, beside the new beat's cursor — measured at 96% opacity for 134ms.
  Intermittent, because it is a race against a timer.
