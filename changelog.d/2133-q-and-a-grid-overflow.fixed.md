- **Fixed: the `q-and-a grid` slide in `examples/q-and-a.md` no longer overflows its frame.** Two
  of its four questions wrapped to a second line, and the grid's equal-height rows carried that
  cost twice — 59px past the stage at every size. The two questions are shortened to one line
  each; the answers are unchanged.
- **Fixed: `examples/overflow-guards.md` is recorded in the overflow-corpus baseline.** The deck
  ships to DEMONSTRATE the guard, and its pages 2 and 4 clip on purpose — the slides say so in
  their own body text. They were never recorded, so the ratchet failed on `main` for every branch
  that ran a sweep. Recorded with its pages listed, the same way `examples/overflow-fix-me.md`
  already is.
