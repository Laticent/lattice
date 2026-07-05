# lib/core — pure transform kernels

Structural primitives any component can opt into, shared by all three
render paths. Everything here is pure string/data transforms — no `fs`, no
DOM — so the browser bundles can pull any of it.

Grouped tour:

- **Fit Ladder / splitting:** `auto-split.js`, `carousel.js`,
  `bake-splits.js`, `split-slides.js`, `split-sections.js`,
  `split-panels.js`, `heading-split-core.js`, `resolve-split.js`
  (see `engineering/decisions/2026-06-22-the-fit-spine.md`).
- **Directive resolvers** (`_class`/front-matter → classes):
  `resolve-finish.js`, `resolve-mode.js`, `resolve-claim.js`,
  `resolve-stamp.js`, `resolve-palette.js`, `resolve-spectrum.js`,
  `resolve-tone-style.js`, `resolve-token-expr.js`.
- **HTML walking:** `html-lists.js` (top-level `<li>` / first-list
  extraction), `section-walk.js` (`mapSections` — the shared `<section>`
  walker every applyToRenderedHtml uses), `collections.js`,
  `match-section.js`, `slot-label-lift.js`, `below-note.js`,
  `overflow-probe.js`.
- **Images:** `image-aspect.js`, `image-dimensions.js`, `bg-image.js`,
  `accessibility-textures.js`.
- **Export-to-Marp:** `marp-bundle.js` — the one remaining Marp surface,
  a one-way export target.
- **`transform-dsl/`** — the declarative component-transform DSL and its
  safety gate (`schema.js`); treat `interpret.js` as untrusted-input
  surface.

**The direction rule (enforced by the quality assessment's
dependency-cruiser config):** components import core; core NEVER imports a
component. If a component kernel has something generic, move it here.

*(File lists here are a snapshot — `ls` is the truth if they ever disagree.)*
