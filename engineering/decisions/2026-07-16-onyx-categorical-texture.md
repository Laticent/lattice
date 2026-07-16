---
status: shipped
summary: >
  onyx is a single-hue (pure black↔white) brand, so its categorical cycle can't
  separate categories by hue — its 12-slot ramp was 12 near-identical greys. Fix:
  give onyx a non-color channel — a distinct repeating TEXTURE per slot — reusing
  the CVD texture machinery (lib/core/accessibility-textures.js), but with a NEW
  scheme-aware pattern set (latt-onyx-tex-*) that flips light chips + dark ink ⟷
  dark chips + light ink with the deck color-scheme, keeping onyx's pure-inversion
  identity. The luminance ramp stays as a redundant channel (and the surface the
  contrast gate verifies). Tracked follow-up from the 2026-07-15 categorical
  token-contract fix, where onyx was explicitly deferred. concrete (also near-
  monochrome) rides the same mechanism with a BESPOKE raw-concrete motif set.
companion:
  - ./2026-07-15-categorical-token-contract.md
  - ./2026-06-16-cvd-redundant-encoding.md
---

# onyx categorical distinctness — texture, not hue

**Date:** 2026-07-16 · **Status:** shipped · **Owner:** Sharmarke

## Problem

The categorical fix of 2026-07-15 recolored ten collapsed themes so `--cat-N-fill`
≠ `--cat-N-mark` and categories separate by hue. **onyx couldn't be fixed that way**:
its brand is a single hue (pure black on white, inverted to pure white on black), so
every categorical slot is a shade of grey. Its ramp (`#e8e8e8 … #868686`) packs 12
greys into a narrow luminance band — adjacent slots are near-indistinguishable, and
at small sizes the whole cycle blurs. Colour is not available as the separator.

## Decision — a scheme-aware TEXTURE channel

Distinctness gets a second, non-colour channel: a distinct repeating **texture** per
slot (diagonal / vertical / horizontal / dots / cross-hatch / …), the same idea the
CVD (colour-vision-deficiency) a11y themes already use
(`2026-06-16-cvd-redundant-encoding.md`). The luminance ramp is **retained** as a
redundant channel and remains the surface the `checkCatContrast` gate verifies;
texture is the primary separator.

**Why a NEW pattern set, not the a11y one.** The a11y sets paint with LITERAL hex in
presentation attributes — deliberately, because `var()`/`<style>` in the page-level
`<defs>` rendered the pie all-black on real iOS Safari (the `:root`→`:where(section)`
relocation). Those sets are **light-only** (a11y themes have no dark mode). onyx has
BOTH modes and a symmetric identity, so it needs the chips to FLIP: light chips + dark
ink (light) ⟷ dark chips + light ink (dark). Since dark mode is selected by the CSS
`color-scheme` PROPERTY (not `prefers-color-scheme`), and only `light-dark()` reads
that property — and `light-dark()` does NOT accept `url()` (verified in Chromium) —
the flip can't be selected in the wiring. Instead the flip lives INSIDE a single
scheme-aware set: each pattern's rect fill and overlay ink use `light-dark()` in a
`<style>` rule (verified flipping in Chromium under `color-scheme:dark`). This is a
new mechanism kept SEPARATE from the literal a11y sets, so the shipped CVD textures
are byte-for-byte unchanged.

**Light-mode ink is a mid-grey (`#8a8a8a`), not near-black.** onyx light chips carry
BLACK label text; a near-black texture ink would compete with it. The mid-grey lets
the texture whisper while the black label stays the dominant, easily-read mark. Dark
mode keeps the crisp light ink (`#f5f5f5`) — white text on dark chips has no such
conflict.

## Wiring — specificity, not just selectors

Mermaid mindmap fill lands on the `.node-bkg` path inside
`g.node.mindmap-node.section-N`, and `mermaid.css` already paints it `!important` at
(0,2,2). The a11y wiring targets `.section-N` at LOWER specificity, so it LOSES — a11y
mindmap texturing was in fact silently dead (a pre-existing gap, logged, not fixed
here). onyx's wiring adds the `.node` class the group also carries → (0,3,2), winning
on specificity, order-independent. Pie slices (`.pieCircle`) have no competing
`!important` host rule, so the a11y-shape selector suffices. Scope is the `--cat`
categorical cycle (mindmap + pie); the native chart-family (`--chart-cat` wedges /
funnel) is not textured here.

## concrete — same mechanism, bespoke motifs

**concrete** hit the same wall from the other side: its light-mode chips are 12
near-identical greys (`#DFDDDD…`, distinguishable only by the muted edge tint), so a
fill-only component collapses and even the mindmap leans entirely on subtle edge
hues. It gets the SAME scheme-aware treatment — a separate `latt-concrete-tex-*` set
mirroring concrete's own ramp (near-white chips ⟷ muted-tint dark chips) — but with a
**bespoke raw-concrete motif vocabulary** instead of the generic geometric set:
board-form plank lines, shutter diagonals, form-tie holes, fluted ribs, herringbone,
waffle coffers, rebar grid, control joints, aggregate speckle, bush-hammered stipple.
Ordered so the common first-6 differ maximally. `schemeAwarePatternSet` was
parameterized to accept a geometry array so onyx keeps the generic set and concrete
gets its own. In dark mode concrete is now DOUBLE-encoded (muted hue + texture).

## Graceful degradation (folded from maker-checker)

The scheme-aware sets reintroduce a CSS-function (`light-dark()`) dependency into the
page-level `<defs>` — the exact class of thing the literal a11y sets avoid. To keep
the all-black-pie regression from returning, the CSS class now carries ONLY the
colour flip; every static attribute AND a **literal light-mode fallback** live in
presentation attributes on the rect/`<g>`. A renderer without `light-dark()` drops
the class and paints the fallback — a light chip, never black.

## Verification

Rendered to PDF, both modes, onyx + concrete: mindmap + pie categories are
texture-distinct and the sets flip correctly. `checkCatContrast` still passes both
(luminance-ramp tokens unchanged). Unit tests cover both new sets, the literal
fallback attribute, and re-assert the a11y sets stay byte-literal. An independent
maker-checker pass confirmed the a11y sets are untouched and the specificity /
substring / pie mechanics are correct.

**Known limitations (from the checker):**
- **iOS Safari UNVERIFIED** — `light-dark()` in an SVG `<defs>` `<style>` may behave
  differently on WebKit; it now degrades to (light chips, no flip) rather than black,
  but re-verify on a real iPhone before relying on it. (HARD RULE #23.)
- **Deck-wide scheme only.** The pattern resolves `color-scheme` from `:root`, so a
  per-slide `<!-- _class: dark/light -->` override (or `color-system`/`auto`) flips
  that slide's canvas + labels but NOT the texture polarity — use theme `onyx` /
  `onyx-dark` (and light/dark concrete decks) for correct polarity. Documented in the
  module comment; a full fix would emit per-scheme literal sets selected by the
  `.dark`/`.light` section class.
- **Print band asymmetry.** In the `class: print` band the onyx/concrete mindmap
  wiring (0,3,2) out-specifies the literal `section.print .section-N` set (0,2,2)
  (pies defer correctly). Practical impact is small — the scheme-aware light chips are
  themselves B&W-safe — but the two paths are not symmetric.

## Follow-ups

- **a11y mindmap texturing is dead** (specificity loses to `mermaid.css`). ~~Off the
  path of this change; logged for a separate fix~~ — **FIXED** in
  `2026-07-16-a11y-mindmap-texture.md` (adds the same `.node.mindmap-node` specificity
  boost to `a11y-base.css`).
- **Native chart-family texturing** (`--chart-cat` wedges/funnel/radar) for onyx +
  concrete is not covered here — a bounded follow-up.
- **Per-slide scheme correctness** and **print-band symmetry** — the per-scheme
  literal-set variant above, if mixed-scheme onyx/concrete decks become common.
