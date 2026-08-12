---
marp: true
size: 4K
theme: atelier-dark
paginate: true
header: "Lattice · Accent foreground contrast"
---

<!-- _class: title silent -->

# Text that survives a pale accent.

`Engine fix · accent / on-accent pairing`

Every accent-filled surface now pairs with its curated `--on-accent` ink — readable on a near-black lime, a warm cream, or a cool slate, in both modes.

---

<!-- _class: split-compare -->
<!-- _footer: "Recommendation bar · split-compare" -->

`Decision Required`

## Build the data layer or buy it?

Both paths are viable. The difference is where we spend the next 18 months.

- Build in-house
  - Full control over schema and roadmap
  - 2–3 engineer-quarters to reach feature parity
  - Ongoing maintenance burden stays internal
- Buy + configure
  - Ship in 6 weeks, not 9 months
  - Engineering capacity redirects to product features
  - Exit risk manageable — export contractually guaranteed

> Buy the infrastructure. Build the differentiation. Revisit in 24 months.

---

<!-- _class: cards-grid -->
<!-- _footer: "Accent corner tags · cards-grid" -->

## The fix has four moving parts.

1. One source of truth
   - `--on-accent` is curated per theme for AAA contrast against that theme's accent, in both light and dark.
2. Derived muted tiers
   - Secondary, ghost, and watermark inks mix down from `--on-accent` by opacity — no white-on-pale collisions.
3. Consumers realigned
   - The verdict bar and pinned tag now read the pair instead of a fixed light ink.
4. Projected to the web
   - The site palette generator ships `--on-accent`, so the landing CTA matches the deck.

---

<!-- _class: list-steps timeline -->
<!-- _footer: "Accent nodes · timeline" -->

## How the accent ink resolves.

1. Theme sets accent
   - _A near-black, a cream, a lime — whatever the brand calls for_
2. Theme pairs on-accent
   - _The contrast partner, tuned to AAA against that accent_
3. Tiers derive
   - _Secondary / ghost / watermark mix down by opacity_
4. Consumer fills
   - _Any surface using var(--accent) paints text from the pair_

---

<!-- _class: split-panel watermark -->
<!-- _footer: "Accent rail · split-panel watermark" -->

## The accent rail proves it

`On-accent rail`

### Where the pairing shows

The left rail fills with the raw accent. Its eyebrow rides `--on-accent` at full strength and the letterform watermark rides `--on-accent-watermark`, so the rail stays legible on a pale canvas.

1. Eyebrow
   - Reads at `--on-accent` — the curated ink itself. A muted derivation would spend the AA margin that curation buys, so size and weight carry the step down instead.
1. Watermark
   - The oversized glyph sits at 12% and never fights the content.
1. Numerals
   - Each counter chip fills with accent and stamps `--on-accent`.

---

<!-- _class: closing -->
<!-- _header: '' -->
<!-- _footer: "Accent foreground contrast · closing" -->

`One pair, every palette`

## Curated once. Readable everywhere.

> Reuse the ink the theme already trusts.
