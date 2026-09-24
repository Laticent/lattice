---
origin: 2329
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2329
---

# Put the Studio preview's section count on the shared walker

why now   — #2329 fixed the Studio refusing a slide that quotes a section tag with
            `maskInert` in lib/diagnostics/slice-equivalence-core.mjs, a local mask over
            comments and closed `<style>`/`<script>`. It does not cover a `<section` inside a
            quoted attribute value, and it is a second reading of the document beside
            `splitSections` (HARD RULE #1).
where     — lib/diagnostics/slice-equivalence-core.mjs `sectionsOf` / `sectionOpenCount`;
            lib/core/split-sections.js and lib/core/top-level-h2.js are CommonJS and not on
            the browser engine bundle, which is why the module stayed off them.
done when — `sectionsOf` and `sectionOpenCount` are `splitSections`, a
            `<p title="<section>">` slide previews in /studio, and `maskInert` is gone.
evidence  — docs/e2e/studio-section-walk-traps.spec.ts extended with the attribute shape,
            green at 1440/820/390.
verify    — tier 1: the change is a bundle-surface change for the docs site.
