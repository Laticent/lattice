---
status: shipped
summary: >-
  #1676 gave the slide a `corners:` register but left two export questions open, and the
  artifacts turned up a third nobody had: the two raster paths DISAGREED. The Studio shipped
  genuinely transparent corners into PPTX (where the hole fills with the RECIPIENT's PowerPoint
  template background, since neither exporter writes a <p:bg>), while the CLI baked white into
  PNG and WebP it could have kept transparent — so the same deck exported rounded from one door
  and square from the other. Owner's rule, decided from rendered dark+light artifacts: only a
  format that can carry a transparent background gets rounded corners; everything else degrades
  to SQUARE. Measured per target on both surfaces: png/webp/html/screen carry it, jpeg/pdf/pptx
  cannot. Implemented as a capability kernel (lib/core/corner-export-capability.mjs, its own .mjs
  because rollup cannot take named imports from the CJS register) that both exporters consult to
  EVICT the corners-rounded token before capture rather than undo the clip afterwards; unknown
  targets square, which caught an unwired call site during implementation. Two traps hit and
  recorded: the corner rides on BOTH clip-path (the deck's, which a border-radius reset cannot
  clear) and border-radius (the capture frame's own 6px preview chrome, which html-to-image DOES
  honor and which must never reach an artifact); and lossy is not the same axis as alpha-less, so
  the image-set underlay had to branch on the capability table rather than on meta.lossy or WebP
  would have lost its corner. Square decks are byte-identical.
---

# A rounded corner is a capability of the target, not a preference of the deck

**2026-08-17** · follows #1676 / #1649 (the `corners:` register) · closes the two
export questions that PR deferred, and one it did not know it had.

## The rule

> Only an export format that can carry a transparent background — and where the
> corner actually reads — gets rounded corners. Everything else degrades to square.

Owner's call, made with rendered artifacts in hand. What follows is the measurement
that produced it and the shape of the implementation.

## Why a corner is a capability

A rounded corner is a **hole**: the slide stops painting there and whatever sits
behind shows through. That reads as a corner only when the artifact can carry
"nothing" — an alpha channel, or a live document whose host paints the backdrop.
Everywhere else the hole is filled by something we do not control, and the result is
not a rounded slide but a slide with four pale notches punched out of it.

So the question is never "does the deck want rounding" but "can this artifact hold
it", and a target that cannot **renders square** rather than rounding-then-flattening.

## The measurement

Same `corners: rounded` deck (`examples/slide-corners.md`, `indaco`, `color-mode: dark`,
body `srgb(0,29,51)`), every export target on both surfaces, corner pixel at (0,0).

### Before

| Surface / target | Alpha | Corner | Reads as |
|---|---|---|---|
| Studio images `.zip` (PNG) | True | `srgba(0,0,0,0)` | rounded |
| Studio `.pptx` | True | `srgba(0,0,0,0)` | **transparent onto the recipient's template** |
| Studio `.pdf` | False | `srgb(255,255,255)` | white notches |
| CLI `.png` | False | `srgb(255,255,255)` | white notches |
| CLI `.zip` png / webp / jpeg | False | `srgb(255,255,255)` | white notches |
| CLI `.pptx` | False | `srgb(255,255,255)` | white notches |
| CLI `.pdf` vector / `--raster` | False | `srgb(255,255,255)` | white notches |

Two paths were wrong in **opposite** directions: the CLI flattened alpha it could have
kept, and the Studio shipped alpha into containers that cannot use it. #1676's body
claimed the raster "matches the vector PDF"; it did not — that claim is corrected here.

### The capability table

| Target | Why | Corner |
|---|---|---|
| `png` | alpha channel | **ROUNDED** |
| `webp` | alpha channel (lossy ≠ alpha-less — see the trap below) | **ROUNDED** |
| `html` | live document; the host paints behind | **ROUNDED** |
| `screen` | the live app surface | **ROUNDED** |
| `jpeg` | no alpha channel exists in the format | SQUARE |
| `pdf` | a page is paper | SQUARE |
| `pptx` | the image sits on the **recipient's** slide background | SQUARE |

**PPTX looks capable and is not.** The slide image is a PNG and can hold alpha, but
neither exporter writes a `<p:bg>` (verified in `ppt/slides/slide1.xml` on both), so the
corner shows the theme background of whoever opens the file. That makes the corner
colour a property of the reader's software. Baking white would at least be predictable;
both are wrong, so PPTX squares.

**HTML/player stays rounded** even though a bare file on a white browser canvas looks
like the PDF: nothing is flattened into bytes, so a host that paints a backdrop gets a
real card. In Lattice's own `--player` the backdrop is the deck's own `--bg`
(measured `rgb(0,29,51)` behind a `rgb(0,29,51)` slide), so the corner is **invisible** —
a no-op, deliberately left alone rather than "fixed" with a contrasting backdrop.

### After

| Target | Alpha | Corner | |
|---|---|---|---|
| CLI `.png` · `.zip` png/webp (+ thumbnails) | True | `srgba(0,0,0,0)` | rounded |
| Studio images `.zip` png (+ thumbnails) | True | `srgba(0,0,0,0)` | rounded |
| CLI `.zip` jpeg | False | slide/brand-bar colour | square |
| CLI + Studio `.pptx` | — | slide/brand-bar colour | square |
| CLI + Studio `.pdf` | False | slide/brand-bar colour | square |

## Shape of the implementation

**The capability is its own kernel, not part of the register.**
`lib/core/corner-export-capability.mjs` answers "what can the artifact hold" and runs
only at EXPORT; `lib/core/resolve-corners.js` answers "what did the deck ask for" and
runs on both RENDER paths. Splitting them is also what lets the capability be `.mjs`:
rollup cannot take named imports from the CJS register, so the Studio bundle could not
import it — while the emulator `require()`s the `.mjs` exactly as it already requires
`print-sheet.mjs`.

**Unknown targets square.** The failure directions are not symmetric: squaring an
alpha-capable format loses a corner the deck asked for; rounding a flat one ships the
artifact this rule exists to prevent. A new format opts IN with its measurement. This
default earned itself during implementation — it caught an unwired call site
(`rasterizeSectionToBlob`) by squaring instead of shipping a wrong corner.

**Eviction, not undo.** Both surfaces remove the `corners-rounded` token before the
capture rather than neutralizing the clip afterwards. The CLI does it in-page via
`page.evaluate` — deliberately NOT on the emitted markup, because the `.html` sidecar
written beside every non-html output is a live document that CAN hold the corner.

## Two traps, both hit during implementation

**1. Two properties carry the corner, and they fail in opposite directions.**
`clip-path` does the real rounding (a `border-image` will not honour `border-radius`,
which is why the register uses clip-path at all); `border-radius` only rides along so
consumers can read the value back. The Studio's pre-existing `borderRadius: '0'` in
`captureOptions` therefore flattened **nothing** of the deck's corner — that is how it
shipped transparent PPTX corners. But removing that reset outright re-imported a
different corner: the capture frame's own chrome sets `border-radius:6px` on every
section (`docs/src/playground/deck-preview.js`, the card look with its box shadow), and
html-to-image **does** honour border-radius when it inlines computed style. The reset
was never about the deck — it was stripping the preview's frame. So the correct code
evicts the token AND zeroes the radius, except where the corner is deliberately kept.

**2. Lossy ≠ alpha-less.** The image-set encoder branched on `meta.lossy` to decide
whether to paint an opaque white underlay. JPEG needs one (no alpha channel, so a bare
encode composites onto black); WebP is lossy but carries alpha. Branching on lossiness
would have flattened WebP's corner while the CLI kept it — the same cross-surface
disagreement this note exists to end. It now branches on the capability table.

## Consequences

- Square decks are **byte-identical**. `omitBackground` is scoped to decks that
  actually carry a rounded slide, so a deck with no `corners:` moves no bytes —
  confirmed by a full `npm run build`, which regenerated every committed artifact
  unchanged.
- `examples/slide-corners.pdf` **is** regenerated: it is the corners demo deck, and
  under this rule its PDF is square.
- A deck author who wants a rounded artifact exports PNG or WebP. That is now a
  property of the format, documented rather than discovered.
