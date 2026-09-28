---
origin: 2445
priority: P3
recorded: 2026-09-28
source: https://github.com/Laticent/lattice/pull/2445#issuecomment-5863010023
---

# The "Content clipped" tag sits on the frame keyline in exports

#2445 draws the frame keyline on top of the finish and moves it out to 1.1–1.32 section-cqi.
On an overflowing slide in an export, the overflow marker's "Content clipped" tag now touches
the bottom keyline. It is cosmetic and appears only on a slide that is already flagged broken.

```text
why now   — low: only a slide that overflows shows it, and that slide is already an authoring
            error. It matters once framed finishes are common in the gallery.
where     — lib/base/base.finish.css (the .backdrop-mask::after ring and its overflow offset);
            the overflow marker's tag placement in the base overflow CSS.
done when — an overflowing gallery slide, exported through the CLI and Studio Images, shows the
            tag clear of the keyline, with no change to non-overflowing slides.
evidence  — before/after crops of that slide via SendUserFile; tools/pixel-check.js on the
            finish demo decks showing only the overflow slide moves.
verify    — tier 0 gates plus a visual look, because it is one placement rule on an error state.
```
