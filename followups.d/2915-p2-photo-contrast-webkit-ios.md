---
origin: 2915
priority: P2
recorded: 2026-10-26
area: website
severity: medium
swimlane: engineering/decisions/2026-10-26-photo-contrast-coach.md
source: https://github.com/Laticent/lattice/pull/2915
---

# The photo-contrast pin is unverified on a real iPhone

why now   — The Coach's pin simulation toggles `dark` / `light` on the preview section, reads computed
            colors in the same task with transitions off, and puts the classes back. Only Chromium
            was driven at first (HARD RULE #23); Playwright's WebKit then passed the light-mode case on the `webkit-tablet` (1440) and `webkit-phone` (iPhone 15 Pro profile, 390) projects on 2026-10-26. WebKit may serialize `color-mix` / `oklab` computed values
            differently from what the canvas probe parses, and a canvas read of the photo is the other
            engine-specific step.
where     — `docs/src/components/studio/coach/photo-contrast-read.ts` (`rgba`, `readPinned`),
            `docs/e2e/photo-contrast-coach.spec.ts`.

done when — The warning and the pin are exercised on a real iPhone (an emulated WebKit engine is not the device), and the result is recorded here.

## Where it stands (2026-10-27)

Still UNVERIFIED on a device: no agent session can reach a real iPhone, so only the owner can close this.

What an emulated engine did pass on 2026-10-27, on the branch that added the card-ink fallback: all 31 runs of
`docs/e2e/photo-contrast-coach.spec.ts` across the `desktop`, `webkit-tablet` (1440) and `webkit-phone` (iPhone 15 Pro
profile, 390) projects, including the pin case and the new "no pin clears, **Set card ink light** is offered" case in
both WebKit projects.

## Tap script for the owner (about two minutes)

Open the PR's Cloudflare preview link (the sticky comment on the PR) in Safari on the iPhone, open the Studio, and use
light mode.

1. Paste this deck as the source:
   `---` / `title: Photos` / `---` / blank / `<!-- _class: image spotlight card-clear -->` / blank / `## A quiet harbor.` / blank / `![bg](sample:photo-wide.svg)`
2. Open the Coach. Expect a **photo-contrast** finding that reads "Pinning the slide dark lifts it to …" and a
   **Pin this slide dark** button. Tap it. Expect the source to gain `dark` and the finding to go.
3. Undo, then add the line `The words sit right on the photo.` under the heading. Expect "Neither a dark nor a light slide
   clears it; setting the card ink light …", a **Set card ink light** button and no pin button. Tap it. Expect `ink-light`
   in the source and the finding to go.
4. Record here: the iOS version, pass or fail for steps 2 and 3, and the ratios the messages showed. A finding that never
   appears means a read came back empty, which is the engine-specific failure this file is about.
