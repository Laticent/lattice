---
origin: 2375
priority: P3
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2375
---

# Close the slide keyline's three known low-risk gaps

why now   — #2375 shipped the engine keyline and listed these as accepted gaps. None was seen by the owner, and each is small, but they are real on some surface.
where     — (1) `docs/src/playground/deck-preview.js`: the lift `drop-shadow` filter sits on `.lattice`, which clips, so WebKit may cut its side shadows (the keyline is unaffected). (2) `docs/src/lib/single-slide-render.ts`: a full iframe rewrite drops `--slide-edge-k` for about one poll (~100ms), so the keyline blinks. (3) The overflow and illegible alarm rings in `lib/base/base.modifiers.css` draw over the keyline instead of yielding to it.
done when — (1) the Playground lift paints whole in WebKit; (2) the keyline is present on the first painted frame after a full rewrite; (3) an alarm ring and the keyline never double up on a side.
evidence  — WebKit (Playwright) and Chromium screenshots of the Playground filmstrip; a frame capture across a forced full rewrite; a close-up of an overflowing slide's edge.
verify    — tier 1 checker, because each touches a shared host or engine rule, but the blast radius is one surface each.
