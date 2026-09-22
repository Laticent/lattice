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

### What survives, and why it is harmless

`background-position`, `-size` and `-repeat` are no longer reset, so a frame keeps
whatever the earlier rule set — a size for a layer that no longer exists. Audited
against the built bundle: `section.accent.dark` is the only section-subject rule
bundled after these that sets `background-image`, and it sets its own
`background-size`, so nothing inherits a stale one.

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
  60,263 cells per palette in real Chromium against the real bundle. Green with
  nothing pinned.
- Computed styles off a **real render** (#2291's own acceptance shape):
  `examples/dark-canvas-ownership.md` with `spectrum: off`, `title` / `topic` /
  `closing` moved from `rgb(0,29,51)` to `rgb(0,61,102)`. Identical under
  `spectrum-edge: left`.
- `examples/spectrum-canvas-ownership.md` (+ committed PDF) is the same deck's
  subject on a rendered surface.
- Mutants: re-adding `background-color: var(--bg)` to `section.accent.dark`, and
  restoring either `background:` shorthand, both fail.

**UNVERIFIED:** no WebKit or real-Safari render was driven (#2297 records that CI has
none), and the PPTX and export-to-Marp paths were not exercised.

## Records

- `2026-08-09-color-theme-ownership.md` — who owns color at all
- #2293 — the `section.dark` half, and why an exemption list works there
- #2294 — `--fin-canvas` outside `dark`, closed alongside this
- #1528 — why these rules use longhands rather than a multi-layer shorthand
- #1656 — what `--fin-canvas` is for
