---
origin: 2687
priority: P3
recorded: 2026-10-26
area: engine
severity: low
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
source: https://github.com/Laticent/lattice/pull/2910
---

# A plugin fence can still return a <select>, whose base-select picker opens in the top layer

```text
  P3 · [no ticket] decide whether the fence door keeps <select>
       why now   — PR 2910 made doorFinishFence drop popover/command attributes, because the
                   top layer escapes contain:paint. The checker found <select> still passes,
                   style="appearance:base-select" included. In Chromium 135+ a base-select picker
                   opens in the top layer on a click. UNVERIFIED: the sandbox has Chromium 131.
       where     — lib/core/door-attr.mjs doorFinishFence.
       done when — <select> is dropped from fence output, or a measured note that the picker
                   stays inside the plugin's box on the Chromium the exports target.
       verify    — tier 1 checker on a Chromium >= 135.
```
