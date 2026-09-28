---
origin: 2393
priority: P2
recorded: 2026-09-26
source: https://github.com/Laticent/lattice/pull/2393
---

# On an iPhone, the Guide's underline sometimes runs past its text

Narrowed 2026-09-27: the second half of this item (the resting cursor covering words at phone
scale) is fixed — the rest solver now avoids every painted word, chart labels included (17 of 66
resting hands on the Guide test deck covered a label at 393 px in WebKit and Chromium; 0 after).

why now   — owner, on an iPhone 15 Pro in the Studio (2026-09-26): "sometimes i see the gesture
            underline extends beyond the actual text". Only expressive's top moment draws ink.
not reproduced — in Playwright WebKit 26 at devices['iPhone 15 Pro'], through the Studio's own
            path (`guideCueFor` over the frame bridge, the slide scaled to 377 px): every one of
            the test deck's 13 underlines ended within 0 px of its last glyph, and the drawn stroke's
            pixels ended there too; the glow reaches ~2 CSS px past the stroke, before and after a
            trial change that scaled it, so the glow is not it. Chromium matches. What the harness
            cannot do is what iOS Safari does and WebKitGTK does not: the toolbar collapsing mid-
            stroke (a viewport resize the ink re-measures through), text autosizing, and pinch zoom.
where     — docs/src/lib/vetrina/stage.ts `underlineGesture` (the live re-measure in `inkNode`),
            docs/src/components/studio/present-guide.ts `guideCueFor`.
done when — reproduced on a real iPhone (or Simulator) with the ink box logged against the text
            box during a stroke, and fixed; or shown not to occur on a device and closed.
evidence  — the probe scripts that measured the WebKit numbers above live in the session's
            .scratch/ios-underline/ (probe.mjs, probe2.mjs, ink.mjs); a device screen recording.
verify    — maker-checker; iOS Safari stays UNVERIFIED until a device drives it.
