---
title: Ship your finish
description: What a finish touches, the gates it has to clear, and the export sign-off that cannot be skipped.
---

A finish is finished when it works in every palette, in both canvases, and
— the part no script can check — in the exported PDF. This page is that
list.

## What you touch

```text
lib/finishes/quarry/quarry.manifest.json   ← name, label, blurb, order, swatch
lib/finishes/quarry/quarry.recipe.json     ← the look, for "Start from preset"
lib/base/base.finish.css                   ← the preset block
design/skills/finish.md                    ← the count of shipped finishes
examples/quarry.md + quarry.pdf            ← the demo deck
```

The package folder is the whole registration: the engine's register, the
lint vocabulary, the Studio's picker and its reserved-name list are generated
from it. The CSS block is the real work.

## The checklist

**The preset**

- [ ] Package folder added (`lib/finishes/quarry/`: manifest + recipe), and
      `node tools/build-packages-index.js` run.
- [ ] All four slot families declared. Unused background slots are `none`;
      unused `--fin-frame` is `0 0 transparent` — `none` is invalid in a
      shadow list and silently kills the tone rail.
- [ ] Every full-bleed layer has a `-opaque` twin ending on
      `var(--fin-canvas)`.
- [ ] The two faces have the **same layer count**.
- [ ] `--fin-size`, `--fin-position` and `--fin-repeat` each carry one
      entry per layer, in the same order the layers are listed: texture
      first, then wash.
- [ ] Accent alpha stays in the 5–16% range wherever a layer covers the
      whole page. A narrow band — an edge strip, a mark bar — may go higher.
- [ ] Both mark slots declared: `--fin-mark: none` and
      `--fin-mark-text: ""`.
- [ ] A full frame uses `--fin-frame`, not the section's `::after`.

**Palette-blind**

- [ ] Every color is a `color-mix()` of `var(--accent)`,
      `var(--fin-canvas)` or `var(--text-heading)`.
- [ ] No hex literals, no `url()`, no `mask-image`, no `margin`.

**Around it**

- [ ] The shipped-finish count in `design/skills/finish.md` bumped — the
      ownership guard checks it against the register.
- [ ] `examples/quarry.md` written, six to ten slides, PDF committed.
- [ ] A changelog fragment in `changelog.d/`.
- [ ] `npm run build:check` green.
- [ ] `npm test` green.

**The sign-off no script can do**

- [ ] Exported through **both** engines — the command-line PDF and the
      in-browser export — in **both** canvases, all four files opened and
      looked at.

That last one is a hard requirement. A finish changes the bytes of every
exported file, and its failure mode — a gray cloud across a full-bleed
fade, a title slide washed to near-blank — appears only in the export.
Nothing on screen predicts it.

## Six ways a finish goes wrong

1. **A fade ending on `transparent` in the opaque face.** A gray cloud in
   every PDF.
2. **Accent alpha too high across the full page.** The backdrop competes
   with the words.
3. **`--fin-frame: none`.** Invalid inside a shadow list, so the declaration
   dies and takes the tone rail with it. Use `0 0 transparent`.
4. **`url()`, `mask-image`, a hex, or a `margin`** anywhere in the preset.
5. **A monogram baked into a deck-wide finish.**
6. **Mismatched layer counts** between the two faces, which quietly
   corrupts the shared size and position lists.

## Where to go next

- Pick the colors it will wear: [Theme anatomy](/craft/themes/anatomy/).
- Arrange what sits on top of it:
  [Component anatomy](/craft/components/anatomy/).
- Build one from dropdowns and sliders instead: the [Studio](/studio/) has
  a finish workbench that writes this CSS for you.
