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
  token-contract fix, where onyx was explicitly deferred.
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

## Verification

Rendered to PDF, both modes: mindmap + pie categories are texture-distinct; the set
flips correctly (light chips + dark ink ⟷ dark chips + light ink). `checkCatContrast`
still passes onyx (luminance-ramp tokens unchanged). Unit tests cover the new set
(scheme-aware `light-dark()` in a `<style>`, 12 slots) and re-assert the a11y sets
stay literal.

**iOS Safari is UNVERIFIED here** — `light-dark()` in an SVG `<defs>` `<style>` could
behave differently on WebKit (the reason the a11y sets avoid it). The literal a11y
sets remain the belt-and-suspenders path for accessibility themes; onyx is a brand
theme whose primary target (Chromium / PDF export) is confirmed. Re-verify on a real
iPhone before relying on onyx categorical texture there.

## Follow-ups

- **a11y mindmap texturing is dead** (specificity loses to `mermaid.css`). Off the
  path of this change; logged for a separate fix that raises the a11y wiring the same
  way (or refactors both onto a shared partial).
- **Native chart-family texturing for onyx** (`--chart-cat` wedges/funnel/radar) is
  not covered here — a bounded follow-up if onyx charts need it.
