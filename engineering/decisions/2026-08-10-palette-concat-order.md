---
status: proposed
summary: >
  The export bundle concatenates the theme BEFORE the base, so base.tokens.css's plain :root
  block lands later at equal specificity and wins — 426 palette declarations across 36 tokens
  and 18 palettes are dead on the export path. Measured in Chromium 131 using each order
  verbatim. The root cause is sharper than "the concat is in the wrong order": every theme
  declares `@import 'lattice';` at its top, which in CSS means the imported sheet's rules come
  FIRST and the importing theme wins — and lattice-emulator.js's OWN Mermaid token reader
  already models it that way at :852, citing that exact @import rationale in its comment,
  while the injected CSS at :691 does the opposite. So the file holds two contradictory models
  of one cascade, and 9 tokens (134 declarations) consequently resolve TWO WAYS IN ONE RENDER:
  a gantt's baked SVG gets the palette's --diagram-active while the CSS around it gets the
  base's. Flipping the concat is one line and fixes both, but it ACTIVATES all 426 dead
  declarations — verified visually: ardesia's code slide swaps the base's Night Owl syntax
  colors for ardesia's own curated muted ramp, which is what its author wrote and nobody has
  ever seen. That changes exported PDF bytes across 18 palettes, so it is a QUALITY-BAR
  sign-off gate and this record stops there rather than shipping the flip.
---

# The palette/base concat order — two models of one cascade

**#1527.** Found by the adversarial trio while reviewing #1457. Pre-existing, off that PR's
path, and nothing tracked it until now.

## 1. The mechanism, and the part the issue did not name

`lattice-emulator.js:691` builds the export bundle as:

```js
const css = paletteCSS + '\n' + layoutCSS;   // theme FIRST, base LAST
```

and drops it verbatim into the page. `lib/base/base.tokens.css`'s plain `:root { … }` block
therefore lands *later* at **equal specificity** and wins. Any token a palette declares at
`:root` that the base also declares at `:root` is silently overridden.

The issue framed this as a concat that happens to be the wrong way round. It is worse than
that: **the order contradicts what the themes themselves declare.** Every one of the 14
top-level palettes opens with

```css
@import 'lattice';
```

and in CSS an `@import`ed sheet's rules come *before* the importing sheet's own — that is the
whole point of the at-rule, and it is why a theme can override the base at all.
`loadPaletteWithImports` explicitly skips that import (`if (name === 'lattice') continue;`)
and the emulator re-appends the base **after** the theme, inverting the relationship the
theme wrote down.

**And the same file already models it correctly, 160 lines later.** `:852`:

```js
// Parse the combined cascade (layoutCSS first, then paletteCSS) …
// Theme declarations parsed last override defaults — matches the real browser cascade
// where `@import 'lattice'` at the top of every theme loads lattice.css first.
const PALETTE_VARS = parsePaletteVars(layoutCSS + '\n' + paletteCSS);
```

The Mermaid token reader puts the palette **last** and cites the `@import` rationale in as
many words. So the export path holds **two contradictory models of one cascade**, and the one
with the reasoning attached is the one that is not used to build the page.

## 2. Measured

Real Chromium 131, loading each order verbatim and reading `getComputedStyle` on a `section`.

| | |
|---|---|
| declarations shadowed on the export path | **426** |
| distinct tokens | **36** |
| palettes affected | **18** of 32 (the `-dark` variants declare nothing at `:root` of their own) |

Worst affected: `cuoio` (35), `atelier`/`brina`/`burgundy`/`laguna`/`magnolia`/`mustard` (32
each), `ardesia`/`concrete`/`crepuscolo` (31). The largest families are the twelve `--hljs-*`
(13 palettes each), the `--diagram-*` state tokens (14 each), and — worth noticing —
`--pass` / `--fail` / `--warn` / `--seq-500`, which are **semantic status colors**.

**The sharpest consequence: 9 tokens resolve two different ways in the same render.**
`--diagram-active`, `--diagram-active-mark`, `--diagram-critical`, `--diagram-critical-mark`,
`--diagram-done`, `--diagram-done-mark`, `--diagram-note`, `--diagram-today` and `--fail` are
read by **both** the CSS and the Mermaid token map — 134 declarations. The baked SVG gets the
palette's value (reader = palette last); the CSS around it gets the base's (injected = base
last). A gantt bar and the CSS that frames it are painted from the same token name and
different values.

## 3. What flipping the order actually does

Candidate 1 from the issue — `layoutCSS + '\n' + paletteCSS` — is one line and fixes both the
dead declarations and the two-model split at once. It is also **not** cosmetic. Rendered a
roadmap / code / status deck under ardesia, cuoio, onyx and carta, before and after:

| palette | slides changed (of 3) |
|---|---|
| ardesia | 1 |
| cuoio | 2 |
| onyx | 1 |
| carta | 2 |

Opened and looked at, not just diffed. The clearest case is ardesia's `code` slide: **before**
the flip it renders in the base layer's Night Owl-ish syntax palette (purple `const`, orange
numbers, pink interpolation); **after**, it renders in ardesia's own curated ramp — muted
blues, teals and greens, quieter and visibly of-a-piece with the theme. That second rendering
is what ardesia's author wrote and what no user has ever seen.

So the flip does not "fix a bug" so much as **turn on 426 curated declarations that have never
rendered**. That is very likely the right outcome — the palettes were authored to be seen —
but it is a change to the shipped appearance of 18 palettes, not a no-op.

## 4. Why this record stops here

**This changes the bytes of an exported artifact across 18 palettes.** CLAUDE.md's QUALITY BAR
makes that the one explicit exception to acting without being asked: it requires the owner's
inspection, with a representative deck rendered in both dark and light mode, before it ships.
So the deliverable here is the measurement and the model, and the flip is **not** in this
change.

Three directions remain open, and the measurement changes how they rank:

1. **Flip the concat** (`:691`). One line; fixes the dead declarations and the two-model split
   together; changes exported bytes across 18 palettes. Now the clear front-runner, because
   §1 shows the current order contradicts both the themes' own `@import` and the file's own
   token reader — this is restoring the declared cascade, not choosing a new one.
2. **`:where(:root)` on the base's token defaults.** Zero-specificity, so any theme `:root`
   wins regardless of order. Same visual outcome as (1) with a larger diff, and it leaves the
   two models disagreeing about anything *not* wrapped. Note `parsePaletteVars` cannot see
   `:where(:root)` at all (`checkNoSafeDefaultTokens` documents this), so this would move
   tokens out of the Mermaid reader's view — a second-order hazard (1) does not have.
3. **Gate it.** Fail the build when a palette declares a `:root` token the base also declares
   at `:root`, and require the base to use a zero-specificity default there. Useful *with*
   (1) or (2), not instead: on its own it makes the 426 a build error rather than a render
   defect, which needs one of the fixes anyway.

**Recommendation: (1), then (3) to hold the line** — but the visual sign-off is the gate, and
it is the owner's.

## 5. What is already known and must not be lost

`--cat-N-ink` is **deliberately exempt** from this hazard: `base.tokens.css` declares no
`:root` default for that tier precisely because the base would win here
(`base.tokens.css:414-426`, and `design/theming.md`'s on-canvas-ink section, which records the
measurement — the curated `#006D70` became the mark `#008386`). That comment is proof the
hazard was understood in 2026-08; it was simply never generalized past the one family. Whatever
direction is taken, that exemption's *reason* disappears under (1) — the base could then safely
declare an ink default — but the exemption itself should not be removed in the same change.

## 6. Not verified

- **No render sweep across all 18 affected palettes.** Four were rendered (ardesia, cuoio,
  onyx, carta). A full before/after sweep, in both modes, is part of the sign-off package and
  is not in hand.
- **PPTX and HTML export paths.** Only the PDF/PNG path was exercised. Both consume the same
  bundle, so the same inversion should apply, but it was not measured. **UNVERIFIED.**
- **The Studio / docs-site preview paths** load CSS their own way and were not measured. They
  may already be correct, which would make the preview and the export disagree — worth
  checking before (1) lands, since it decides whether this fix makes those two *agree* or
  merely swaps which one is wrong.
- **Whether every one of the 426 activations is desirable.** The four sampled palettes looked
  better afterwards. Nobody has looked at the other 14, and a palette could carry a stale
  declaration that was written against an older base and never re-checked *because* it was
  dead.
