---
origin: 3095
priority: P2
recorded: 2026-11-09
area: theming
severity: medium
swimlane: engineering/decisions/2026-11-09-type-hierarchy-study.md
deferred: off-path — found while scoring type combinations; a theme ink fix restyles every indaco deck's anchors and owes its own demo deck, outside a type study
---

# Indaco's header and footer fail AA contrast on its title and divider panels

why now   — `tools/type-voice-audit.mjs` now judges each role on its worst slide. On indaco, in light and dark, the header and the footer measure 3.5:1 on the dark title and divider panels (ink rgb(124,145,172) on rgb(0,61,102)), under WCAG's 4.5:1 for 15 px text. The other 13 palette themes pass in both modes.
where     — the chrome ink indaco uses on an accent-panel anchor (`themes/indaco/indaco.css`, the anchor slide's chrome rule in the engine's divider and title styles).
done when — indaco's header and footer clear 4.5:1 on the title and divider panels in light and dark, and `node tools/type-voice-audit.mjs --theme indaco` shows no worst-slide contrast under 4.5:1 for chrome.
evidence  — `node tools/type-voice-audit.mjs --theme indaco --mode light` prints `chrome: footer … (3.5:1 on slide 1)` and `chrome: header … (3.5:1 on slide 3)`.
verify    — tier 1: the audit, plus `npm run contrast:palette-native` and a light and dark render of an indaco title and divider.
