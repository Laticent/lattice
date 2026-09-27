---
origin: 2335
priority: P3
recorded: 2026-09-27
---

# `flowchart` is missing from the modifier-effects oracle

why now   — `lib/core/modifier-effects.generated.json` has no `flowchart` entry, so the editor falls
            back to the derivation, which lacks `chart-marks` — `motion-*` is not offered on a
            flowchart slide although its Mermaid diagram builds under motion. Running
            `check-modifier-effects --only=<chart bucket>` reports the drift
            `flowchart: oracle null → measured {"surfaces":["chart-marks","eyebrow","heading"]}`,
            identically with the old and the new motion selector, so it predates #2335's fix.
where     — lib/core/modifier-effects.generated.json (blessed by tools/check-modifier-effects.js)
done when — `node tools/check-modifier-effects.js --only=flowchart --bless` records flowchart, a
            full run reports no drift, and the editor offers `motion-*` after `_class: flowchart`
