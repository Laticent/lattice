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
  would have lost its corner. Square decks render byte-identical rasters and PDFs (the
  .html sidecar gains the print rule, so it moves for every deck).
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

- Decks with **no rounded slides** produce byte-identical rasters and PDFs. Note the guard
  is `roundedSlides > 0`, not "the front matter says rounded" — so a deck with no `corners:`
  key that opts in per-slide via `_class: corners-rounded` *does* gain an alpha channel, and
  correctly so. The red-team pass falsified an earlier wording that said "a deck with no
  `corners:`", by building exactly that deck. Verified by rendering the same square deck from `origin/main` and from this
  branch and comparing md5 — `sq.pdf`, `sq.001.png`, `sq.002.png` all identical.

  **The `.html` sidecar is the exception, and it moves for every deck.** The `@media print`
  block is inlined into every emitted document, so the sidecar grows ~1.4 KB whether or not
  the deck rounds. That is correct — the rule has to reach a document a human might print —
  but it means "byte-identical" is a claim about rasters and PDFs, not about every artifact.

  An earlier draft of this note cited `npm run build` as the evidence. That was wrong twice
  over: `tools/build.js` regenerates `dist/` and never renders an export at all, and this
  change *does* move `dist/lattice.css` and friends. Corrected after the independent
  checker caught it — the claim was true, the evidence for it was not.
- `examples/slide-corners.pdf` **is** regenerated: it is the corners demo deck, and
  under this rule its PDF is square.
- A deck author who wants a rounded artifact exports PNG or WebP. That is now a
  property of the format, documented rather than discovered.

## The road not taken, recorded because the review argued for it

The Munger inversion pass accepted the rule and the shared kernel but argued the PLUMBING
is over-built, and the argument is good enough to write down rather than lose.

Its observation: of the eight Studio capture sites that pass a target, only two change
behavior — `'png'` at the chart export and `format` at the image set. The five passing
`'pdf'`/`'pptx'` are behaviorally identical to passing nothing, because unknown targets
square. They are documentation compiled as code. And of the defects found across this
change, three were WIRING (an unwired site, a dropped parameter on an inert branch, a doc
citing the wrong evidence) rather than domain errors — evidence, it argued, that threading
a string through eight hand-written sites is the wrong shape for a rule with two live
consumers.

The alternative it sketched: (a) the `@media print` block exactly as written, (b) one
UNCONDITIONAL eviction at each exporter's shared capture entry — no `cornerTarget`
parameter, no threading — and (c) a small `rasterCarriesAlpha(format)` consulted at the
three encoders where `format` is already in scope. Same kernel, same HARD RULE #1
compliance, same output bytes, and the unknown-target policy plus half the table
disappears because the vocabulary reduces to `IMAGE_FORMATS`, which is already exported
and closed.

Not taken here, for one reason: what shipped is measured working on both surfaces across
every target, and a redesign would discard that evidence to buy tidiness. The wiring is
verbose but it is verified, and the coupling test now fails if a new format goes
unclassified. If this area is touched again — most likely for #1713's `<p:bg>` — reshape
it then, with these notes, rather than re-deriving the argument.

Two smaller points from the same pass, both addressed rather than deferred: the CLI was
claiming "a .X cannot carry a transparent corner" even for a target that was never
classified (asserting a measurement it never took — `isFlatExportTarget` now distinguishes
the two), and the Studio says nothing at all when it overrides an explicit directive.

The CLI half is fixed here. The Studio half is **#1716**, and it is filed rather than
shipped because the obvious fix does not work: `onStatus` is a transient progress line,
and the render loop's next `onStatus('Rendering slide 1 of 2…')` supersedes the notice
microseconds later. Verified on the real Studio — the helper runs, `onStatus` is called
with the right text, and polling the dialog every 60ms never catches it, because React
never paints the intermediate state. The persistent `notify` toast in `ShareSheet` is the
right channel (its own comment says so), and wiring it means deciding how the export
reports back — real work, out of scope here, rather than a no-op that looks like a
feature.

## Two corrections the final checker made, recorded because of how they happened

**A claim I had already fixed twice, still shipping in a third place.** The byte-identity
wording was falsified by the red team (a deck with no `corners:` key that opts one slide in
via `_class: corners-rounded` DOES gain an alpha channel), and I corrected the changelog
fragment and this note — but missed `lib/base/base.docs.md`, which is the doc HARD RULE #6
sends authors to. A same-PR internal contradiction survived two review passes because I
fixed the instances I remembered rather than grepping for the claim.

**A defensive edit justified by a failure mode that cannot occur.** The earlier checker
flagged that `withCaptureFixups` mutated the corner token OUTSIDE its `try`, reasoning that
a throw would strand the live preview stripped and poison later exports. I folded that in
without checking the premise. The premise is false: `section` always comes from
`sectionsOf(frame)`, every frame is the disposable offscreen iframe `createCaptureFrame`
builds, and every caller disposes it in its own `finally`. A throw destroys the frame —
there is no persisted node and no later export to poison.

The restructure stays, because unwinding all of a function's state in one `finally` is
better than some of it depending on where a throw lands. But the comment now says what is
actually true. Worth recording as a pattern: a review finding is a claim like any other,
and folding one in without verifying its reasoning is how a wrong premise gets promoted
into a code comment that the next reader will trust.

**Also latent, not live:** the `isFlatExportTarget` branch added to the CLI's message is
unreachable from any CLI input today — `OUT_FORMAT` is a closed ternary and the image-set
format is clamped to `IMAGE_FORMATS`, so every target that reaches the guard is already
classified. It is defensive code for a future format, not a fix for a reachable bug, and
the commit that added it framed it as the latter.
