# Cascade architecture

How Lattice's CSS cascade is structured, why `@layer` is
declared-but-inert **by design**, and why partial activation is a trap
the build now gates against (HARD RULE #26).

> **TL;DR** — The bundle names a 7-layer order but wraps **no rule** in a
> layer: plain **source order** decides the cascade. That is a reasoned,
> gated position, not an unfinished migration. The layer-addressable
> `!important` cleanup already shipped (Stage 1, PR #435); full activation
> is **vetoed** while export-to-Marp exists (R-PATH,
> `decisions/2026-06-18-layer-activation-scope.md`). Wrapping one file in
> `@layer` while the rest stay unlayered silently breaks it — so
> `checkCascadeLayers` fails the build on any layer block.

## The current cascade

`lattice.css` is the bundled output of `tools/build-css.js`. Sources
concatenate in this order (the file-header docstring is canonical):

```text
1.  lib/_theme.css                              (Marp @theme directive)
2.  lib/base/base.tokens.css                    (:root tokens)
3.  lib/base/base.elements.css                  (semantic HTML defaults)
4.  lib/integrations/markdown-it/scaffold.css     (section, header, footer, pagination)
5.  @layer declaration (declared, but no source wraps itself in any layer)
6.  lib/components/<bucket>/<name>/<name>.styles.css   (alphabetical)
7.  lib/base/base.modifiers.css                 (cross-cutting modifiers)
8.  lib/integrations/highlight-js/highlight-js.css
9.  lib/components/chart/_chart-family/chart-family.css
10. lib/base/base.treatments.css                (tint-* / mark-* utilities)
11. lib/shared/shared.styles.css
12. lib/base/base.variants.css                  (state markers, tone, chrome)
13. lib/integrations/mermaid/mermaid.css        (Mermaid SVG theme overrides)
```

The **bundle order IS the cascade order**: at equal specificity, later
sources beat earlier ones via natural CSS source-order resolution.
Modifiers come AFTER components so equal-specificity collisions
resolve to modifier defaults; component-specific overrides bump
specificity in their own file. Variants come last so state markers
(archived, redacted, etc.) compose over everything else.

## The `@layer` declaration is inert — by design

`tools/build-css.js` emits this near the top of the bundle, with a
machine-checked inert-note sentinel directly above it:

```css
/* LATTICE-LAYERS-INERT — the @layer order below is RESERVED, NOT ACTIVE. … */
@layer base, root, scaffold, components, semi-universal, universal, diagram-overrides;
```

…but **no source file wraps itself in any layer.** The declaration
reserves the layer order for a future activation that
`decisions/2026-06-18-layer-activation-scope.md` shows is currently
**not achievable** (see the veto below). **Today every rule is
unlayered.** `grep -c '@layer .* {' dist/lattice.css` returns zero.

The `LATTICE-LAYERS-INERT` comment exists so a reader of the raw bundle
(human **or** agent) is not misled by a declaration that reads active but
governs nothing. Both the comment and the "no layer blocks" invariant are
enforced by `checkCascadeLayers` (HARD RULE #26); see the gate section.

## Why partial `@layer` activation is a trap

A first instinct is to wrap each source file in its matching layer.
That's blocked by a subtle interaction between the `@layer` cascade
rules and `!important`.

### CSS `@layer` cascade rules (the surprises)

1. **Cross-layer normal declarations:** later-declared layers beat
   earlier-declared layers, REGARDLESS of specificity. A rule in
   `@layer universal` with selector `section.x` (specificity 0,1,1)
   beats a rule in `@layer components` with selector
   `section.x > ul > li` (specificity 0,1,3).

2. **Cross-layer `!important` declarations:** the cascade INVERTS —
   earlier-declared layers beat later-declared layers. A `!important`
   rule in `@layer components` (declared earlier) beats a `!important`
   rule in `@layer universal` (declared later).

3. **Unlayered vs layered:** unlayered declarations beat layered
   declarations at the SAME importance level, regardless of
   specificity. An unlayered `section h1` (specificity 0,0,2) BEATS a
   layered `section.title h1` (specificity 0,1,2).

Rule 3 is **the trap**. Phase 3.5b of the layer-activation investigation
wrapped ONLY component CSS in `@layer components` and left shared files
unlayered. Result: every component rule lost to whatever generic rule
existed in `base.modifiers.css` or `scaffold.css` at lower specificity.
100% of canary pages diverged. The change was reverted. **The lesson:
layering is all-or-nothing — a half-layered bundle is a broken bundle.**

### A fourth surprise: `@layer` cannot beat *inline* styles

`@layer` reorders **author-origin selector rules**. It does nothing to an
inline `style=""` attribute: a normal inline declaration outranks any
normal author rule (layered or not), and only an author `!important`
beats it. This is why the vast majority of Lattice's `!important` — the
Mermaid / KaTeX / SVG library-overrides that defeat inline styles those
tools emit — **would remain `!important` even under full activation.**
Layers are simply the wrong tool for that job; `!important` is the
spec-correct one.

## Why full activation is vetoed (not merely deferred)

`decisions/2026-06-18-layer-activation-scope.md` scoped the "full
coordinated rewrite" and reached a firm end:

- **Stage 1 SHIPPED (PR #435).** The ~12 cascade-workaround `!important`
  in `base.variants.css` — the state-marker `::after` blocks that used to
  need `!important` to beat the pagination pseudo — were removed by
  raising the marker to a **doubled class** (`section.silent.silent::after`,
  specificity 0,2,2, no ancestor dependency, path-agnostic across the
  engine and emulator render paths). This is the **only** cleanup layer
  activation would have delivered, and it was captured **without** layering,
  at a fraction of the risk. `base.variants.css` now carries essentially no
  cascade-workaround `!important`.
- **Stage 2 (full layering) VETOED by R-PATH.** Export-to-Marp
  (`lib/core/marp-bundle.js`) and the marp-vscode preview style decks with
  **marp-core's own unlayered scaffold CSS, which Lattice does not emit and
  cannot wrap.** Layering `lattice.css` while marp-core's scaffold stays
  unlayered re-creates the rule-3 trap with **marp-core winning** → a broken
  preview for every exported deck. Since export-to-Marp is a first-class,
  supported feature, all-or-nothing layering is **not achievable across all
  consumers from Lattice's side.**

So "layer nothing" is a **traced architectural constraint**, revisitable
only if (a) export-to-Marp is retired, or (b) someone proves the marp
consumer can be safely excluded from layering. Until then the inert
declaration stays inert.

## The `!important` inventory (why layers don't help)

`grep -o '!important' dist/lattice.css | wc -l` was **426** as of
2026-07 (recompute rather than trust this number). The shape, not the
exact count, is the durable fact:

- **The dominant block is library-override**, led by `mermaid.css`
  (~258 of the 426), then print-textures, math, and the KaTeX / SVG /
  emoji overrides. Every one defeats an **inline** style emitted by an
  external tool → correct per spec, **must** stay `!important`, and
  **cannot** be replaced by `@layer` (see the fourth surprise above).
- **The intra-author cascade-workaround block is essentially gone** —
  Stage 1 moved the scaffold-vs-variants competition onto selector
  specificity.

Net: full activation would retire ~zero `!important` today (Stage 1
already banked the win) while breaking export-to-Marp. The cost/benefit
is not close.

## The Lattice Layer Contract

The recognized `@layer` best practices, and Lattice's **deliberate**
stance on each. Read this **before** proposing any `@layer` change — the
danger (rule 3) comes first for a reason.

| Best practice | Lattice's stance |
|---|---|
| **Never half-layer** — layer everything or nothing (rule 3). | **FOLLOWED, gated.** We layer *nothing*. `checkCascadeLayers` fails the build on any layer block, so the broken middle state can't ship. |
| Declare the layer order once, up front, in one statement. | **PARTIAL.** We emit the single ordered declaration (reserved), but it governs nothing today. |
| Meaningful, ordered layer names. | **FOLLOWED.** `base → root → scaffold → components → semi-universal → universal → diagram-overrides` — pinned by the gate; ready if activation ever unblocks. |
| Put low-priority / third-party CSS in early layers; overrides in late layers, to retire specificity hacks. | **DELIBERATELY NOT ADOPTED.** Blocked by R-PATH (can't wrap marp-core's scaffold) and low-value (our overrides fight *inline* styles layers can't touch). Cascade is resolved by source order + specificity instead. |
| Import third-party CSS into a dedicated `layer()`. | **NOT ADOPTED.** Same reasons; most vendor overrides are inline-targeted `!important`. |
| Use layers to end the `!important` arms race. | **NOT APPLICABLE.** The arms race is against inline styles, which `@layer` cannot arbitrate; the layer-addressable slice was already retired via specificity (Stage 1). |

**The one rule that is permanent regardless of activation: do not
introduce a partial/isolated layer.** Even after a hypothetical full
activation, a lone unlayered (or lone layered) file is still a rule-3
regression. That is what HARD RULE #26 protects — not "layers are
forbidden forever," but "the bundle is never *half*-layered."

## The gate — HARD RULE #26 (`checkCascadeLayers`)

`tools/check-ownership.js` (run by `npm run build:check`) enforces the
contract, in the budget-0 + allowlist shape of #20/#3:

1. **No layer block** in `lib/` source OR the built `dist/lattice.css` —
   named `@layer x {`, anonymous `@layer {`, or `@import … layer()`, the
   three ways a layered rule reaches a browser. Comments are stripped and
   the match is case-insensitive, so prose mentions and `@LAYER` don't
   slip through. Budget 0, `SANCTIONED_LAYER_BLOCKS` empty by design.
2. **Order pin** — the emitted `LAYER_DECLARATION` must parse to
   `CANONICAL_LAYER_ORDER`; a silent reorder/rename fails.
3. **Inert-note sentinel** — `build-css.js` must emit the
   `LATTICE-LAYERS-INERT` warning adjacent to the declaration (checked in
   source, so minification can't strip the guarantee).

Activating layers later is therefore a **deliberate, reviewed** change —
add sanctioned entries with justification in the same coordinated pass —
never an accidental file wrap.

## What Phase 3.5 actually delivered (history)

The May–June 2026 investigation is preserved for the next contributor so
Phase 3.5b isn't redone:

| Phase | Outcome |
|---|---|
| 3.5a baseline harness | Established that pixel-diff against an in-sandbox build is the only safe verification; diffing against committed PDFs is misleading because of Chromium-version drift. |
| 3.5b component-layer wrap | **Reverted.** Wrapping only components broke 100% of canary pages (rule 3). |
| 3.5c retire 7 cascade-workaround `!important` | **Shipped.** Removed 7 defensive `!important` across `anchor/title`, `comparison/verdict-grid`, `progression/list-criteria` (×2), `progression/list-steps` — each overkill natural specificity already wins. 0 pixel deltas across 35 pages. |
| Stage 1 (`2026-06-18`) | **Shipped (#435).** The scaffold-vs-variants `!important` retired via the doubled-class; the practical win banked with no rule-3 exposure. |
| Stage 2 | **Vetoed** by R-PATH — marp-core's unlayered scaffold can't be wrapped. |

## What changing the cascade now would require

1. **Snapshot in-sandbox pixel baselines first.** Committed PDFs are a
   false baseline (Chromium-version drift): the committed `gallery.pdf`
   and a fresh in-sandbox rebuild are produced by different printers.
2. **Pixel-diff per-component after every change** (`tools/pixel-check.js`);
   treat > ~250 px/page as a real signal (Mermaid mmdc adds up to ~200 px
   of Puppeteer noise per affected page).
3. **Don't wrap any file in `@layer` in isolation** — the gate will fail
   the build, and rightly: it's the rule-3 trap. Activation is one
   coordinated pass that wraps every browser-reaching source at once
   (`2026-06-18` lists the seven), or nothing.
4. **Library-override `!important` stays.** Any rule whose selector
   targets a class emitted by Mermaid, KaTeX, or another external library
   needs `!important` to defeat the library's inline styles. That's not a
   cascade workaround.

## Related references

- `engineering/decisions/2026-06-18-layer-activation-scope.md` — the
  staged plan, Stage 1 outcome, and the R-PATH veto (canonical on *why
  not*)
- `engineering/decisions/2026-07-17-layer-footgun-gate.md` — this gate's
  rationale (HARD RULE #26)
- `engineering/decisions/2026-05-18-important-audit-phase-35-prep.md` —
  the original `!important` audit
- `tools/build-css.js` — `LAYER_DECLARATION`, `LAYER_INERT_NOTE`, bundle
  order
- `tools/check-ownership.js` — `checkCascadeLayers`, `layerBlocksIn`,
  `CANONICAL_LAYER_ORDER`
