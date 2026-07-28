---
status: shipped
summary: Typography becomes three curated per-orientation coefficient sets (landscape/square/portrait), one manifest (lib/typography/scale.js) emitted by lib/typography/emit.js, selected per slide off the data-orientation stamp. Retires the single --canvas-scale type multiplier (spacing still uses it); landscape stays byte-identical. Phase 1 ships whole-slide categories + the --pill-fs fix + a raw-cqi-font drift guard; Phase 2 (true nested box-local via @container + a per-box cqi stamp) is scoped for when a cell shadows container-name:lattice.
version: 1
supersedes: none
builds-on: 2026-06-16-social-mobile-portrait-sizes.md, 2026-06-18-component-adaptive-sizing.md, 2026-05-19-typography-token-refactor.md
---

# Typography categories — curated per-orientation font scales

**Date:** 2026-06-20
**Status:** Adopted (Phase 1 shipped; Phase 2 scoped below)
**Supersedes the type half of:** the single `--canvas-scale` multiplier from
`2026-06-16-social-mobile-portrait-sizes.md` (spacing still uses it).

---

## The disease

Font sizes were `landscape_coefficient × cqi × --canvas-scale`, where
`--canvas-scale` was ONE uniform multiplier the engine set per deck (≈1.0
landscape, 1.65 square, ≈2.19 story). Two failures fell out of that:

1. **A uniform stretch is not a curated scale.** Portrait was just the landscape
   hierarchy photo-enlarged — the `h1` ballooned toward overflow while nothing
   was tuned for a tall frame. There was no portrait *design*, only portrait
   *magnification*.
2. **Anything off the exact formula fell out of the system.** A raw `cqi`
   font-size (pills, corner tags) never saw `--canvas-scale`, so it rendered at
   its landscape size on a narrow portrait box (~9–12 px). Fine-print bugs by
   construction — "corner tags can't be read."

The review feedback was blunt: the portrait type was small, **inconsistent**
across layouts, and not thought through from a UI/UX standpoint. The fix is not
more patches on the multiplier — it is to retire the multiplier for type and
**curate**.

## The model

Font size stays **`coefficient × cqi`** — width-relative, so a category
self-normalises across the SIZES inside it (4k ↔ hd ↔ standard share landscape;
story ↔ mobile share portrait, all ≈1080 wide). What `cqi` cannot bridge is
*across* orientations (landscape width = the long edge; portrait width = the
short edge), so **each orientation gets its own curated coefficient set** — never
one set × a multiplier. Three categories:

| Category | Aspect | Sizes | Reference width |
|---|---|---|---|
| `landscape` | `> 1.05` | hd · standard · 4k | 1280 (1cqi = 12.8 px) |
| `square` | `0.95–1.05` | 1:1 social | 1080 (1cqi = 10.8 px) |
| `portrait` | `< 0.95` | portrait · story · mobile | 1080 (1cqi = 10.8 px) |

(Boundaries above are the `data-orientation` stamp's, from `orientationFor`
(`lib/engine/css.js`). The Phase-2 `@container` form in the manifest uses the
`lib/adaptive/families.js` canonical `0.9` split instead — a pre-existing
engine/container seam to unify when Phase 2 lands.)

The coefficients are **curated to target px on each category's reference
width**, documented per role in the manifest. They are NOT derived from one
another by a constant: portrait `h1` is pulled *down* relative to a uniform
stretch so a two-line title fits, while portrait body stays generous — a
relationship a single `--canvas-scale` cannot express.

**Single source of truth:** `lib/typography/scale.js` (the manifest) +
`lib/typography/emit.js` (the emitter). `tools/build-css.js` bundles the emitted
`--fs-*` blocks into `dist/lattice.css` right after `base.tokens.css`. A role's
size lives in exactly one place; the three scales can never drift apart by
hand-edit. The old hand-written block in `base.tokens.css` is gone (it now
points here).

## Three confirmed decisions

1. **Box-local selection, via `@container` — as the target architecture.** A
   component placed in a narrow cell should eventually reflow to *that cell*, not
   the whole slide. See "§11 reality" + Phase 2 below for why the live Phase-1
   selector is the `data-orientation` stamp, not `@container`, and when that
   changes.
2. **Square is its own third category** (not folded into portrait). A 1:1 box has
   limited height, so its titles stay smaller than portrait's to leave room for
   content — `landscape → square → portrait` is a genuine three-point ramp.
3. **A separate foundation PR.** This is the type foundation; it does not carry
   the structural portrait *reflows* (those are the adaptive-sweep work). Keeping
   them apart keeps each reviewable.

## The §11 reality — how a category is selected today

A `@container` rule **cannot style its own container element** (HARD RULE §11): a
`section`'s nearest query container is its *parent*, never itself, so a slide can
never restyle its OWN `--fs-*` via `@container`. Since the section's font-size is
the inheritance root for all plain prose, the whole-slide category MUST key off
something that can target the section itself — the **`data-orientation` stamp**
the slide pipeline already writes (`engine/slides.js` · `runtime` · the
emulator, all via `orientationFor`). Landscape stays UNSTAMPED.

```css
:root, section                       { --fs-*: <landscape> }   /* default */
section[data-orientation="square"]   { --fs-*: <square> }
section[data-orientation="portrait"] { --fs-*: <portrait> }
```

Because the tokens are set ON the section, every descendant inherits ONE
section-computed value per role — **fonts are consistent across the whole slide
by construction**, the property the previous ad-hoc mix of tokens + raw `cqi`
lacked. Each token keeps `var(--_sec-1cqi, 1cqi)` (the runtime-stamped section
1cqi) and `× var(--fs-scale)` except the §7-exempt `h1`/`h2`, so the per-slide
size knob and preview path are unchanged.

## Byte-safety

The `landscape` coefficients are **identical** to the historical hand-written
values, and landscape sections stay unstamped, so the only change to a landscape
render is the removal of `× var(--canvas-scale, 1)` — which was always `× 1` in
landscape. Verified: rendering a landscape deck before/after this change produces
a **byte-identical slide DOM**, and the computed font px are unchanged.

The one deliberate landscape change: a handful of sub-readable **raw-`cqi` corner
tags / mono labels** (compare-prose, cards-grid, cards-stack, kpi.spotlight) were
migrated to `var(--fs-meta)` so they become orientation-aware. That nudges them a
few px in landscape too — a readability improvement, not a regression. A
drift-guard test (`test/unit/tokens/fs-cqi-guard.test.js`) now bans new raw-`cqi`
font-sizes; legitimately decorative or shape-fitted ones carry a `cqi-ok:` marker.

## Scope of Phase 1 (this PR)

- Manifest + emitter + build wiring; `--canvas-scale` retired from the type
  formula (spacing `--sp-*` still uses it — type-first, per the brief).
- `--pill-fs` moved from `:root`-only to `:root, section` so every pill follows
  the per-section override (was baking in the landscape size → fine-print pills).
- Readable raw-`cqi` labels migrated to `var(--fs-meta)`; drift-guard added.

**Explicitly NOT in Phase 1:**

- **Chart-internal labels** (roadmap corner tags, state-chart index/edge labels,
  journey actor initials) stay raw `cqi`: they are sized to a `cqi`-proportional
  diagram/shape, so bumping the font alone would break their fit. They become
  readable when the chart *layouts* get portrait reflow (the adaptive-sweep
  track), not here.
- **Spacing categories.** `--sp-*` keeps `--canvas-scale`. Type first.

## Phase 2 — true nested box-local typography

> **`CATEGORY_QUERY` was deleted on 2026-07-27** (#1218). The `@container` form
> this section reserves measures the container's CONTENT box, which the section's
> asymmetric padding makes proportionally wider than the deck — the defect that
> left the whole `square` structural tier inert. It was never emitted, so nothing
> broke, but keeping a reserved twin of a retired mechanism would have re-seeded
> it. **The Phase 2 GOAL below still stands**; its trigger would now be the
> `data-family` stamp (a nested cell stamping its own), not a container query.
> The `--_box-1cqi` problem this section identifies is unchanged and is still the
> real blocker. See `2026-07-27-family-stamp-replaces-container-queries.md`.

`CATEGORY_QUERY` in the manifest is the `@container` form of the same boundaries
(canonical `lib/adaptive/families.js` thresholds), reserved for when a component
shadows `container-name: lattice` on a cell. Doing it correctly needs a per-box
cqi stamp (a `--_box-1cqi` analogue of `--_sec-1cqi`) so a nested cell's
descendants resolve their `cqi` against the *cell*, not the section — otherwise
the section's `--_sec-1cqi`-based prose and the cell's bare-`cqi` headings drift
apart by the section padding ratio, reintroducing the very inconsistency this
work removes. Until a cell opts in, **the section IS the box** and the
attribute path covers every real deck, so Phase 2 lands when there is a consumer
for it.

---

## Addendum — portrait recuration for on-device legibility (2026-06-21)

Phase 1 shipped the three-category machinery, but the **portrait** coefficients
were still curated for *presentation distance* (boardroom/projector), not for the
device portrait is actually consumed on. On a phone the 1080-wide frame maps
≈×0.36, so the old `body` (≈36px in-frame) rendered at **≈13px** — below the iOS
caption size. The emailed-link reader (the persona the reflow work serves) could
not comfortably read body prose.

The portrait set was **recurated as one ramp** (not patched token-by-token —
cherry-picking is how the "inconsistent across layouts" smell crept in):

- **Anchor `body` on the device** — `body` = ~47px in-frame ⇒ **≈17px on a phone**
  (the iOS body floor). Every readable tier (`meta`, `body-compact`, `body`,
  `h5`/`h6`) rises with it.
- **Compress the title ramp** — display tiers (`message`…`hero`) rise *less* than
  body, so the `body→h1` span tightens 2.44×→2.08×; a two-line `h1` still fits a
  9:16 frame. This generalises the existing "portrait `h1` pulled down" rule to
  the whole upper ramp.
- **Re-lock the role aliases** — `h6=meta`, `h5=body`, `h4=message`, matching the
  landscape/square scales and the base contract. The old portrait set had drifted
  (`h4` 44 < `message` 46) — the exact inconsistency this system exists to kill.

`landscape` and `square` are untouched (byte-identical exports). The full
coefficient table lives in `lib/typography/scale.js` (the single source of truth).

**Consequence — device-legible type means sparser slides.** Three of the four
portrait personas already author sparse; the recuration makes that the default
rather than a workaround. A handful of content-dense demo slides authored against
the old ~36px body overflowed the frame at ~47px and were trimmed to fit. The
engine-owned **content-autofit / re-pagination** that would absorb over-dense
decks automatically is the Part-II P2/P3 work
(`2026-06-20-native-to-reflow-feasibility.md`), still ahead.
