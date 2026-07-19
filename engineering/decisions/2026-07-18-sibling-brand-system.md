---
status: shipped
summary: >
  A shared BRAND SYSTEM for the spin-off sibling libraries (Vetrina, Cadenza, Lente, Suono, Anima),
  locked against the LATTICE mark as the quality bar. Each library gets its own SVG mark + Fraunces
  lockup that (1) shares the lattice family DNA — a 128 viewBox, precise geometry, a ringed center
  "hub" node with a pale halo, rounded caps, ONE theme palette, dark-mode-aware via an inline
  `@media(prefers-color-scheme)` swap, and the Fraunces wordmark — and (2) tells that library's OWN
  relevant story through the mark's metaphor. SUONO is the first one built to the bar and is the
  reference: a radial "sound-clock" (a bloom of bars = sound, a warm crown bar = the live onset, a
  centered base-gap = the tuned breath, the ringed hub = the owned clock), on a locked GREEN palette
  that matches the /suono demo. Assets: `docs/public/suono-{mark,mark-min,lockup}.svg`. This doc is
  the template the family follows; the fan-out (2026-07-18) then built marks + lockups for Lente,
  Vetrina, and Cadenza on it — Anima stays staged (WIP).
companion:
  - ./2026-07-12-suono-audio-library.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
---

# The sibling brand system — one family, five voices (2026-07-18)

**Date:** 2026-07-18 · **Status:** shipped; Suono set the bar, then Lente/Vetrina/Cadenza were built
on it in the fan-out. Anima staged (WIP).

> **Goal (the architect's words).** Craft a logo for each spin-off library on par in quality, craft,
> and relevance with the Lattice mark, and *lock in* the first one — Suono — as the reference for
> "what great looks like" before we pivot to the rest.

## The bar — what the Lattice mark establishes

`docs/public/lattice-mark.svg` is a **crystal lattice**: a 45°-rotated bond grid with jewel-tone
"atom" nodes, each ringed by a pale halo, a larger **ringed center node**, on the theme's categorical
palette, dark-mode-aware via an inline `<style>` `@media` swap. It is a *literal name → precise
geometry* mark: calm, exact, and meaningful. That is the bar. The system also ships a **min** variant
(fewer, chunkier elements for favicon scale — `lattice-mark-min.svg`) and a **lockup** (mark + a
Fraunces serif wordmark — `lattice-lockup.svg`).

## The system — shared DNA + a per-library metaphor

Every sibling mark MUST share the family DNA, so the five read as one house:

- **Canvas:** `viewBox="0 0 128 128"`, `fill="none"`.
- **The hub:** a filled center **node** with a **pale halo** (the paper color) behind it and a faint
  concentric **inner ring** — the direct echo of lattice's ringed center atom. This is the single
  strongest family tie; every sibling keeps it.
- **Geometry:** precise, computed coordinates; `stroke-linecap="round"`; restraint over decoration.
- **One palette, dark-mode-aware:** an inline `<style>` with an `@media(prefers-color-scheme:dark)`
  swap of the mark's few color classes (never a second file for dark). Each library owns ONE accent
  family + one warm "live" accent, drawn from its theme.
- **Lockup:** mark + the wordmark in **Fraunces** (`font-family:Fraunces,'Cormorant Garamond',
  Georgia,serif`, size 70, weight 600, letter-spacing −1), mark scaled `0.9375` at `translate(4 4)`,
  text baseline-centered — identical construction to `lattice-lockup.svg`.
- **Three assets per library:** `<name>-mark.svg` (full), `<name>-mark-min.svg` (favicon scale),
  `<name>-lockup.svg`.

And every mark MUST earn its own **relevance** — the metaphor has to *be* the library, the way the
lattice is a crystal lattice. Uniform DNA, five distinct stories.

## Suono — the reference (built)

**Metaphor: a radial sound-clock.** Suono's thesis is *"a clip is bytes; the clock is the
library's"* — an owned clock emitting a timed sequence of sound with tuned breath-gaps. The mark
encodes exactly that:

- **the bloom of rounded bars** radiating from the hub = sound / amplitude (a circular waveform);
- **the warm crown bar** at 12 o'clock = the **live onset** — the clip playing *now*;
- **the centered gap at the base** = the **tuned breath** between phrases;
- **the opacity falloff** from crown into the gap = amplitude fading to silence (the family's
  "halo depth", expressed as tonal gradient);
- **the ringed hub** = the **owned WebAudio clock**, and the family tie to lattice's center atom.

**Locked palette** (one system with the `/suono` demo page):

| Token | Light | Dark | Role |
|---|---|---|---|
| bar | `#2f6d5b` | `#63c9a6` | the sound (deep green / mint) |
| onset | `#c67a12` | `#f6b64a` | the live clip (warm) |
| hub | `#2f6d5b` | `#63c9a6` | the owned clock |
| ring | `#123528` | `#0c1512` | the hub's inner ring |
| halo | `#f6f3ec` | `#101613` | paper (separation) |
| ink (wordmark) | `#1b2b25` | `#e6ede9` | Fraunces "Suono" |

**Assets:** `docs/public/suono-mark.svg` (27 bars, full), `suono-mark-min.svg` (15 chunky bars,
favicon — legible to 16px), `suono-lockup.svg`. Worn by the `/suono` demo header + favicon.

## The fan-out — three more built, one staged

The fan-out (2026-07-18) built marks + Fraunces lockups for the three remaining SHIPPED libraries,
each on the DNA above with its own metaphor + accent. Assets: `docs/public/<name>-mark.svg` +
`-lockup.svg` (cadenza also `-mark-min.svg`, its caption being dense small; lente/vetrina hold at
16px on the full mark).

- **Lente** ("lens", reader lenses) — **built**. A camera **iris/aperture** (blue `#2f5fa6` /
  `#6fa3e6`): tangent blades frame the aperture around the hub, one blade warm (the focal lens). Worn
  by the `/lente` demo (built to the storyboard standard) + favicon.
- **Vetrina** ("shop window", the walkthrough engine) — **built**. A framed **vitrine** (rose
  `#a8446a` / `#e08aa8`): a rounded-rect window around the hub with a self-driving **cursor** aimed at
  it — theater over real state. Worn by `/vetrina-tour` + favicon.
- **Cadenza** (the caption timeline) — **built**. A **caption with the current word lit** (indigo
  `#3f3d8f` / `#9491f2`, matching its demo): the hub is the lit word (warm ring), spoken word-bars
  behind, upcoming dimmed ahead. Worn by `/cadenza` + favicon.
- **Anima** (animation) — **staged** (WIP library). Direction: *motion made legible* — a rotation /
  arc-sweep around the hub; "information a still frame cannot carry." Its mark lands with its build.

All four demos are surfaced in the site's **Libraries** nav group (`nav.mjs` `librariesNav`).

## How the marks are produced

The Suono mark is generated from a small parametric script (radial math + envelope + the DNA hub),
kept out of tree (`.scratch/`); the committed SVGs are the source of truth. Promoting that to a
committed `tools/` generator parameterized per library (palette + metaphor primitives), so all marks
stay byte-consistent in construction, remains a follow-up (not a blocker).

## Non-goals

Not a full brand book (typography scales, spacing tokens, usage rules beyond the mark). Not touching
the Lattice mark. Not building **Anima's** mark yet (WIP — it lands with its build). This doc locks
the *system* + the *Suono reference*; the Lente/Vetrina/Cadenza marks were then built on it.
