- **Added: the export names the slides it cannot judge.** Every fit verdict is read
  against a 12px noise budget, so a slide painting up to that far outside a box that
  *crops* passed every channel while the pixels were gone — bracketed on a probe deck at
  12px silent, 13px reported. The render now prints an advisory, `ⓘ INSIDE THE FIT
  TOLERANCE`, naming those slides and their overshoot. It is an advisory, not a verdict:
  no marker is drawn, no exit code moves, the `overflow:check` ratchet is unchanged, and
  the text says plainly that it cannot tell a cropped glyph from empty space. Across the
  335 shipped decks it fires on 34 slides in 21 of them; of the 27 silent cuts the
  truthful content probe finds corpus-wide it names 18, and the nine it misses are listed
  by name in `engineering/decisions/2026-09-21-frame-tolerance-silent-window.md`.
- **Changed: the fit tolerance is one constant.** `FRAME_TOLERANCE` in
  `lib/core/overflow-probe.js`, read by the emulator and the browser runtime. It was a
  bare `12` in six places with its (long-obsolete) justification in one of them. The
  tolerance itself is **not** lowered: it feeds `buildSplitVerdict`, so lowering it
  re-decides autosplit corpus-wide and banks 34 unfixed slides in the ratchet. The
  measured case for doing it anyway is in the decision note.
- **Changed: `gantt`'s capacity prose says what its enforcement cannot see.** The
  component cites the render's `CONTENT CLIPPED` line as its whole budget check; both
  citations now name the blind band and the gate that adjudicates it.
