---
status: shipped
summary: >
  Four rules in three files had been flattening a frame's own section canvas, and
  three of them were never trying to paint one. `section.dark.spectrum-off`,
  `section.dark:is(.spectrum-edge-*)` and `section.accent.dark` each draw or remove a
  BAR — the dark canvas's top hairline, the divider's left rail, the accent stripe —
  and each restated the background COLOR while doing it, two through the `background:`
  shorthand (chosen because it resets every longhand at once) and one by copying
  `background-color: var(--bg)` out of the rule it replaced. At (0,2,1) and (0,3,1)
  those restatements out-specified every frame's own (0,1,1) canvas, so a dark title,
  closing, topic, accent cover or imagery matte went flat whenever a register was set.
  #2293 fixed the fourth rule (`section.dark`) with an exemption list, which works
  only because that rule wins on ORDER; no list could have reached these three. The
  fix that did was to delete the color: each rule declares `background-image` now.
  The payoff is in a different file — `--fin-canvas` carried a six-class exclusion
  group on nine arms, mirroring these rules, and every one of those groups is gone.
  An exclusion is a COPY of somebody else's rule, and copies rot; the durable fix is
  to stop the other rule painting what it never meant to paint.
---

# Canvas ownership: declare the thing you mean, not the thing that resets it

## The shape of the bug, four times

A frame that paints its own section canvas — `title`, `closing`, `divider`, `topic`,
the six accent covers, the `image`/`scene` matte compositions — declares it at
`(0,1,1)`: `section.title { background: var(--surface-inverse) }`. Anything that
restates `background` or `background-color` on a `section` at a higher specificity,
or at equal specificity later in the bundle, takes that canvas away.

Four rules did:

| Rule | Where | Specificity | Wins by | What it was FOR |
|---|---|---|---|---|
| `section.dark:not(:where(…))` | `base.modifiers.css` | (0,1,1) | source order | painting the dark deck canvas + its top hairline |
| `section.dark.spectrum-off` | `base.variants.css` | (0,2,1) | specificity | REMOVING that hairline |
| `section.dark:is(.spectrum-edge-*):not(.divider)` | `base.variants.css` | (0,3,1) | specificity | REMOVING that hairline |
| `section.accent.dark` | `shared.styles.css` | (0,2,1) | specificity | DRAWING an accent stripe |

The first is a genuine canvas rule, and #2293 fixed it the only way an order-winner
can be fixed: an exemption list, `:not(:where(…))` spelled with `:where()` so the
rule's specificity does not move. That fix does not transfer. The other three win on
**specificity**, so no position in any list saves the frame.

#2291 framed the remaining choice as the two moves that follow from taking the color
reset as given: drop those rules to `(0,1,1)` (and re-derive everything else they
beat), or grow `divider`'s two hand-written carve-outs to cover all four anchors. The
third option is the one that was taken, and it is smaller than either: **none of the
three needs to say anything about color at all.**

## The fix

```css
/* before — "clear the bar", spelled as "repaint the slide" */
section.dark.spectrum-off                    { background: var(--bg); }
section.divider:not(.light).spectrum-off     { background: var(--surface-inverse); }
section.dark:is(.spectrum-edge-*):not(.divider) { background: var(--bg); }
section.accent.dark { background-color: var(--bg); background-image: …stripe…; }

/* after */
section.dark.spectrum-off                    { background-image: none; }
section.divider:not(.light).spectrum-off     { background-image: none; }
section.dark:is(.spectrum-edge-*):not(.divider) { background-image: none; }
section.accent.dark { background-image: …stripe…; }
```

The shorthand was not a slip. `section.dark` paints its hairline with five longhands
(`background-color`/`-image`/`-position`/`-size`/`-repeat`), and `background:` resets
all five in one declaration — which is exactly what "remove the bar" needs. The cost
was invisible because the color it restated was almost always the color already
there: on an ordinary dark slide `var(--bg)` is what `section.dark` had just painted.
It was wrong only on the frames that paint something else, and those are the frames
nobody was looking at.

`section.accent.dark`'s `background-color: var(--bg)` has the same origin one step
removed — it replaced `section.dark` wholesale and copied the canvas line along with
the rest, under a comment (#1528) explaining why the longhands must not be a
shorthand. The comment was right about the shorthand and silent about the copy.

### The bar is four longhands, not one

A first cut declared only `background-image: none` and argued the geometry longhands
were inert with no image to apply to. That is true only while nothing else supplies
an image, and something else can: a deck carries `<style>`, a theme is a stylesheet,
and `dist/marp-kit/lattice.css` ships these rules to renderers we do not control.
Measured with an author rule setting a full-bleed `background-image` on the section,
`divider dark spectrum-off` rendered it as a **3.75px vertical rail** and
`content dark spectrum-off` as a **1px strip** — the bar's own geometry, applied to
somebody else's picture.

`background-position`, `-size` and `-repeat` are reset with the image. The one
longhand left alone is `background-color`, which is the whole point of the change.
Found by the HARD RULE #25 checker, and the first cut's audit was reported backwards
as well ("the only rule bundled *after* these" — `section.accent.dark` is bundled
*before* them; the question that matters is what can win `background-image` at
≥(0,2,1), and inside the engine nothing can).

### `divider` stops being the exception

`base.variants.css` already carried `section.divider:not(.light).spectrum-off` and
`.spectrum-edge-off` as hand-written carve-outs restoring `--surface-inverse` — so
whoever wrote them had seen this bug on one frame and repaired it there. They are
ordinary members of the set now: clear the rail, keep the canvas, same sentence as
the other three.

One visible consequence: a printed `divider` under `spectrum: off` used to keep its
framed panel, because the carve-out restated `--surface-inverse` and so survived
`section.print`. It restates nothing now, so it takes the print ground — which is
what a printed `title` and `closing` already did. The register stops changing the
print face.

## The payoff is in `base.finish.css`

`--fin-canvas` names the surface a finish composites against (#1656). Because these
four rules could take a frame's canvas, every arm that re-pointed `--fin-canvas` had
to know about them, and did:

```css
section:is(.title, .closing):not(.print):not(:where(.dark:is(.accent, .spectrum-off,
  .spectrum-edge-left, .spectrum-edge-right, .spectrum-edge-bottom, .spectrum-edge-off)))
```

Nine arms carried that group. The `divider` arm carried a *conditional* version of it
(`.print:not(.spectrum-off):not(.spectrum-edge-off)`) because its carve-outs changed
the answer; the print-face arm had to mirror the edge rule's own `:not(.divider)`.
Every one of those is a **copy of another file's rule**, kept in sync by hand, and the
history shows the cost: the conditional form was written, then documented wrongly in
the same commit, then re-derived. All of it is gone. What is left is `:not(.print)`,
on the frames that genuinely lose the surface to the print remap.

`test/unit/palette/finish-canvas-contract.test.js` now holds an empty `REGISTERS`
list, and **the emptiness is the assertion** — if a register is ever given a canvas of
its own, that list grows and the arms grow a mode-scoped exclusion group with it.

## The rule to carry forward

**A rule that decorates should declare only the decoration.** When you reach for
`background:` to clear something, you are also declaring a color; ask whether you
mean it. If a frame beneath you paints its own surface, you have just taken it.

And, one level up: **an exclusion group is a copy, and copies rot.** When
`--fin-canvas` needs to list what repaints a frame, the question to ask first is
whether the repainter should be repainting at all.

## Verification

- `test/integration/invariants/finish-canvas-matrix.test.js` — 18 frames × 219
  modifier classes × every register pair × every subject attribute × both DOM shapes,
  60,263 cells per palette in real Chromium against the real bundle, on all 33
  palettes. Green with nothing pinned: `main` leaves 3,976–12,628 rows per palette
  compositing against a color the slide does not paint, this tree leaves 0 on every
  one.
- Computed styles off a **real render** (#2291's own acceptance shape):
  `examples/dark-canvas-ownership.md` with `spectrum: off`, `title` / `topic` /
  `closing` moved from `rgb(0,29,51)` to `rgb(0,61,102)`. Identical under
  `spectrum-edge: left`.
- `examples/spectrum-canvas-ownership.md` (+ committed PDF) is the same deck's
  subject on a rendered surface.
- Mutants, all of which fail: re-adding `background-color: var(--bg)` to
  `section.accent.dark`; restoring either `background:` shorthand; making
  `spectrum: off` stop clearing the hairline; leaving the bar's geometry longhands
  behind; moving print's de-flood arm above the category tint; dropping the token
  carriers; and leaving the attribute axis's probe-match population unpopulated.

## What the independent checker found, and what it changed

The HARD RULE #25 checker ran against the two commits and found no live
`--fin-canvas` mismatch — including on an independent 9,072-cell sweep with attribute
*pairs and triples*, which the shipped cross cannot generate. What it did find was
four holes in the gate written to protect this change, and each is closed here:

1. **The cover arms' source order was load-bearing and ungated.** Three arms sit at
   (0,2,1) and two of them beat the one before them on order alone. With print's arm
   moved above the category tint, a printed categorical split cover composites against
   a color the page does not paint — and both gates passed 4/4, because the cross puts
   at most one attribute on a probe and never builds the shape where they collide.
   Gated now on source position, which is where that fact lives.
2. **The rewritten bar rules were entirely unmeasured.** After this change they consist
   of `background-image: none` plus geometry; the cross compares `backgroundColor`.
   Making `spectrum: off` stop removing the hairline — the register's whole purpose —
   passed every gate in the repo. A computed-value test now asserts the bar goes and
   the canvas stays.
3. **The attribute axis had no population guard**, though the shape axis beside it has
   one and its comment records why. A derivation that built an attribute wrong and
   skipped the proof would measure a section the painter never matches.
4. **Every `--panel-fill` row passed vacuously.** `--panel-fill` is defined by
   `section.split-panel-split[data-split-mods~="cat-N"]`, a class no derivation had
   reason to find, so both sides of 3,080 rows were an unresolved `var()` comparing
   `rgba(0,0,0,0)` to itself. A token-carrier derivation puts the defining class on the
   probe, and an unresolved `--fin-canvas` is now a failure rather than a pass.

It also caught three wrong cell counts and three stale or inverted sentences in the
comments, all corrected. The geometry-longhand reset above is its finding too.

**UNVERIFIED:** no WebKit or real-Safari render was driven (#2297 records that CI has
none), and the PPTX and export-to-Marp paths were not exercised.

## The split half: the covers now carry what this CSS was written for (#2305)

#2293 and #2309 gave the accent covers a correct `--fin-canvas`, but no cover the
splitter emitted carried a finish. `roleOpenTag` (`lib/core/split-envelope.js`)
replaced the class list and kept only the canvas axis. So the CSS was right and nothing
in a rendered deck exercised it. Measured on `examples/finish-canvas-light-half.md`,
`finish: atrium`: 8 of 13 pages carried the finish. None of the 6 covers and carousel
pages did, and the auto-split body pages beside them did. One run disagreed with itself.

Three changes close it. Each one applies this note's rule from the other side:

1. **The deck's surface registers ride the class swap.**
   `lib/core/surface-registers.js` builds the list from each register's own tokens.
   `claim:` and `cards:` stay behind because they compose a layout, and they reach the
   page as `data-split-mods`.
2. **`splitDoc` re-injects the `.backdrop` wrapper** on the pages it re-authors. The
   injector moved to `lib/core/backdrop.js` so the splitter can call it without a
   require cycle. It now also lands after a leading deck logo.
3. **A frame that paints the field names the ink that reads on it.** Every preset drew
   in `var(--accent)`, which is accent on accent on these six covers. The backdrop was
   in the DOM and changed 0.06% of the cover's pixels, all of them in the spectrum bar.
   The presets now draw in `--field-accent`, which defaults to `var(--accent)`. The accent
   covers set `var(--on-accent)`, a `cat-N` tint sets `var(--cat-on-fill)`, and print's
   de-flood arm resets it to the accent. It is `--fin-canvas`'s other half: the canvas
   the finish mixes toward, and the ink it draws in, are both declared by the frame that
   owns the surface.

`test/integration/invariants/finish-ink-matrix.test.js` holds `--field-accent` against
`--fin-canvas` at 3:1 or better. It covers the six covers (stamped and unstamped), all
eight `cat-N` tints, the four bookend and content controls, six canvas modifiers and all
33 palettes: 4,608 rows, worst 4.88:1. With the cover ink declarations removed from the
bundle, 2,050 rows fail.

## Records

- `2026-08-09-color-theme-ownership.md` — who owns color at all
- #2293 — the `section.dark` half, and why an exemption list works there
- #2294 — `--fin-canvas` outside `dark`, closed alongside this
- #1528 — why these rules use longhands rather than a multi-layer shorthand
- #1656 — what `--fin-canvas` is for
- #2305 — the split kept only the canvas axis, so no cover carried a finish
