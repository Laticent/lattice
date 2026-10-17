---
origin: 2739
priority: P2
recorded: 2026-10-16
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.5
source: https://github.com/Laticent/lattice/pull/2739
---

# Redesign the player's no-JS dark-mode switch so Firefox opens a large player in under a second

why now   — Firefox takes a median 32,241 ms to open the gallery player; the 326 `:root…:where(:not(.lp-js):has([id=lp-nj-flip]:checked))` rules in `#lattice-dual-mode` cost all of it (rewritten without `:has()`: 718 ms; removed: 609 ms, 15 interleaved loads each).
where     — player-core.mjs `NJ_FLIPPED` / `NJ_DARK_ROOT` and every rule built from them. Likely shape: move the token arms to a wrapper that follows the checkbox (a sibling selector), keep `:root` for what only the root can carry, and keep each flip rule's specificity equal to the rule it mirrors.
done when — the gallery player opens in Firefox within a few seconds, the no-JS flip still works in iOS Quick Look terms (scripting off) in all three engines, and the scheme matrix still passes.
evidence  — Firefox medians before/after (15 interleaved loads); no-JS flip screenshots in Chromium, WebKit, Firefox.
verify    — tier 1 checker; changes every export's bytes, so it stops for the owner's export sign-off.
