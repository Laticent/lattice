---
origin: 2314
priority: P2
recorded: 2026-09-23
source: https://github.com/Laticent/lattice/pull/2314
---

# Move finishes to recipe-sourced packages (phase 2)

Spec: `engineering/decisions/2026-09-23-portable-packages.md`.

```text
why now   — removes the four-place hand registration and the duplicated preset definitions.
where     — lib/finishes/<name>/; finish-generate.ts moved into lib/; FINISH_REGISTER, finish-catalog.ts, PRESET_RECIPES, the preset bodies in base.finish.css.
done when — all 9 presets are generated from recipes, a pixel-diff against the hand CSS is within tolerance or each gap is an explicit gated exception.
evidence  — the pixel-diff table in the PR.
verify    — export change — owner sign-off.
```
