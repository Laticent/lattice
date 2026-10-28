---
origin: 2923
priority: P8
recorded: 2026-10-27
area: engine
severity: medium
swimlane: engineering/decisions/2026-10-27-fluid-layout-library.md §12
---

# Raw HTML can forge a top-level section's data-lattice-slide

why now   — found by the Fluid P0 checker: a quote opened in one raw-HTML token and closed in the next (`</section><section title="` then a later `'"…data-lattice-slide=9 x'`) yields a top-level `<section>` whose `data-lattice-slide` the author chose. The split, the rail and the Studio's page pick all find slides by that attribute. It predates Fluid; P0 only closed the `data-split-*` / `data-fluid-*` half.
where     — lib/core/reserved-attrs.mjs (the same rename could cover `data-lattice-`), or a structural fix: refuse a raw `</section>` in author HTML.
done when — the cross-token repro in test/unit/core/reserved-attrs.test.js, retargeted at `data-lattice-slide`, renders no author-chosen value, and no shipped deck changes.
evidence  — the repro and the split golden (npm run split:golden:check) unchanged.
verify    — npm run build:check; node --test test/unit/core/reserved-attrs.test.js
