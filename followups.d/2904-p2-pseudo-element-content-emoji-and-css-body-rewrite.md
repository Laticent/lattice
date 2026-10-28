---
origin: 2904
priority: P2
recorded: 2026-10-27
area: engine
severity: low
swimlane: engineering/decisions/2026-10-26-fonts-policy.md
source: https://github.com/Laticent/lattice/pull/2904
---

# Emoji set through a pseudo-element's `content:` are missed by the emoji slice picker, and the camera rewrites `body` inside CSS strings

why now   — Two edge cases the red-team pass on PR 2904 confirmed in the shared camera and the font-embed picker. Neither is a regression of that PR.
where     — `docs/src/playground/font-embed.js` (`slicesFor(body.textContent)`) and `lib/core/slide-camera.mjs` (`unusedRangeFaceUrls` reads `textContent`; `pageCss` rewrites `html` and `body` selectors with a regex that also matches `content:" body "`).
done when — An emoji that appears only in `::before{content:"🎉"}` keeps its slice in the player and the camera, and a CSS string containing the word body is left as written. A unit test pins each.
evidence  — Confirmed on a minimal page in puppeteer Chrome 131: `content:" body "` drew as ` .__lc-body `.
verify    — `node --test test/unit/core/slide-camera-faces.test.js` with two new cases.
