# marp

Lattice's compatibility layer for [Marp](https://marp.app/). **Marp is not the
engine and not a dependency** — `lib/engine/` natively re-implements the Marpit
pipeline and is the only first-party render path
(`engineering/marp-independence.md`).

What this folder holds is the seam where Lattice's own render meets *Marpit's
file format*, which LFM is deliberately compatible with (`---` separators, YAML
front matter, `<!-- _class: -->` directives), plus the override layer a deck
needs when it is rendered by REAL marp-core — the Export-to-Marp bundle
(`lib/core/marp-bundle.js`).

> **Corrected 2026-08-02.** This page used to open "Marp is the framework
> Lattice is built on … **Marp is the foundation**. Every component, every
> render path, every slide assumes Marp," and described the deleted
> `marp.config.js` as a live config — while contradicting itself thirty lines
> later. It was the most misleading Marp doc in the tree and sat in a KEEP
> bucket. See `engineering/decisions/2026-08-02-marp-reference-register.md` §6.

**External dep:** `@marp-team/marp-cli` — **BYO** (no longer bundled; P4 retired
it). The owned engine
(`lib/engine` / the `lattice` CLI) needs no marp.

**Files in this folder:**

| File | What it implements |
|---|---|
| `scaffold.css` | Marp Core override layer. Two rules using `!important` to win the cascade fight against real marp-core's scaffold defaults, which load after the theme in an Export-to-Marp render. NOT wrapped in `@layer` — engine CSS layers nothing (HARD RULE #26). |

Two related files live elsewhere (intentionally, with reason):

- **`lib/_theme.css`** — declares `@theme lattice` + `@size` directives
  at the top of the bundle, registering `lattice.css` as a Marp theme.
  Stays at `lib/` root because it's about the bundle's identity rather
  than Marp integration plumbing.

---

## `scaffold.css` — the override layer

Two CSS rules, both using `!important`:

1. **Header/footer paragraph reset.** Marp Core's default `p { margin }`
   stomps Lattice's chrome alignment. We re-assert font/size/margins
   so the header and footer render with Lattice's mono label
   typography.

2. **`section::after` positioning.** Marp's scaffold sets
   `padding: inherit` on the pagination pseudo-element, which inherits
   the section's bottom padding (~88px) and pushes the page number
   above where Lattice wants it. We re-position with absolute
   coordinates.

Both rules use `!important` because Marp Core's scaffold CSS loads
AFTER the theme in the cascade, so equal-specificity rules lose to
Marp. (An earlier version of this page claimed the rules live in `@layer scaffold`; they do not, and HARD RULE #26 bars a partial layer.) Cascade order would be flipped by layers when
`!important` is present.

This is the only file in Lattice that uses `!important` for
non-pedagogical reasons. Every other override works via specificity or
cascade order. The Marp Core scaffold is the exception that forces
the exception.

---

## Lattice as a Marp theme

The bundled `lattice.css` IS a Marp theme — specifically a palette-less
theme named "lattice". Authors *could* set `theme: lattice` in deck
front matter and render structurally-correct slides with no colors.
Useful for verifying palette `var()` fallback behavior; not used in
production.

The palette themes (`themes/indaco.css`, `themes/cuoio.css`, and 20+
more) each:
1. Declare their own `@theme <name>` directive at the top.
2. Declare their own `@size` directives (Marp doesn't propagate these
   through `@import`).
3. Do `@import 'lattice';` to pull in the structural layer.
4. Define palette tokens that override or supplement Lattice's
   structural tokens.

The chain:

```
themes/indaco.css   declares @theme indaco; imports 'lattice' (which is registered as lattice.css)
                                                  ↓
lattice.css         (bundled output) declares @theme lattice via lib/_theme.css
                                                  ↓
                    contains all of: lib/base/, lib/shared/,
                                     lib/integrations/{mermaid,highlight-js,marp}/,
                                     lib/components/chart/_chart-family/chart-family.css,
                                     and every lib/components/<bucket>/<name>/<name>.styles.css
```

Marp registers `lattice.css` and all the palette themes via
the engine's theme set. Authors pick a palette via
front-matter `theme:` directive.

---

## What the Export-to-Marp bundle wires

`marp.config.js` was DELETED in P4 — there is no config file at the repo root
and no marp-cli render path. What follows describes the config
`lib/core/marp-bundle.js` GENERATES into an exported bundle, for the recipient's
own marp-cli to read:

- **`themeSet`**: list of `.css` files Marp registers as themes
  (lattice.css + every palette).
- **`html: true`**: allow raw HTML in markdown (Lattice uses it
  sparingly for slot-label lifts).
- **`allowLocalFiles: true`**: allow images / scripts from local paths.
- **`imageScale: 1`**: default PNG rasterization scale (3× via CLI
  flag for retina output).
- **`math`**: KaTeX enabled.
- **Engine plugins** that wrap Marp's `render` output:
  - `deckClassPropagate` — propagates front-matter `class:` to every
    section (Marp's native semantic discards it on per-slide `_class:`).
    APPEND-ONLY: the register is filtered where it is read, so a component
    name or a color token superseded by `color-mode:` is never stamped and
    nothing has to be taken back (`lib/core/deck-class-register.js`).
    sections at build time (theme reads via `attr()`).
  - `applyChartFamilyToHtml` — the chart-family post-processor.
  - `applySplitPanelsToHtml` — the split-list post-processor.

Plus the highlight.js + Mermaid registrations described in their own
integration docs.

---

## See also

- `lib/_theme.css` — the `@theme lattice` declaration that turns the
  bundle into a registered Marp theme.
- `themes/README.md` — palette authoring contract.
- `design/theming.md` — how palettes map their tokens onto Lattice's
  structural surface.
- (the BYO marp-cli config has been retired — the owned engine is the only render path)
- Marp upstream: <https://marpit.marp.app/> for the Marpit core spec
  Lattice extends.
