- **Added: the export now names the slides it cannot judge.** Every fit verdict is
  read against a 12px noise budget, so a slide painting up to that far outside a box
  that *crops* passed every channel while the pixels were gone. A probe deck brackets
  it exactly: 12px prints nothing, 13px prints the frame warning. The render now adds
  an advisory — `ⓘ INSIDE THE FIT TOLERANCE` — naming those slides and their exact
  overshoot, and pointing at `npm run check:chart-fit`, which measures the painted box
  against the stage with 1.5px of slack instead of asking the export. It is an
  advisory, not a verdict: no marker is drawn, no exit code moves, and the
  `overflow:check` ratchet is unchanged — measured on the shipped tree, which reports
  exactly one deck above its baseline, and that one is equally red on `main`. The
  sweep found **34 slides in the band, 18 of them losing real content**; across the
  whole corpus the truthful probe finds 28 silent cuts, so this names 18 and **ten
  stay silent, nine of them body content**. Both sets are named, and the tolerance
  recommendation recorded, in
  `engineering/decisions/2026-09-21-frame-tolerance-silent-window.md`.
- **Changed: the fit tolerance is one constant.** `FRAME_TOLERANCE` in
  `lib/core/overflow-probe.js`, read by the emulator and the browser runtime. It was a
  bare `12` in four places, with its (long-obsolete) justification in one of them.
- **Changed: `gantt`'s capacity prose says what its enforcement cannot see.** The
  component cites the render's `CONTENT CLIPPED` line as its whole budget check; both
  citations now name the blind band and the gate that adjudicates it.
