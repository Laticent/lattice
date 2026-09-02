---
title: Ship your finish
description: What a finish touches, the gates it has to clear, and the export sign-off that cannot be skipped.
---

## What you touch

```text
lib/core/resolve-finish.js                    ← one row in FINISH_REGISTER
lib/base/base.finish.css                      ← the preset block
docs/src/components/studio/finish-catalog.ts  ← the Studio's display metadata
examples/quarry.md + quarry.pdf               ← the demo deck
```

Four files, one of them a single line.

## The checklist

**The preset**

- [ ] One row added to `FINISH_REGISTER`.
- [ ] All four slot families declared — unused ones set to `none`.
- [ ] Every full-bleed layer has a `-opaque` twin ending on
      `var(--fin-canvas)`.
- [ ] The two faces have the **same layer count**.
- [ ] `--fin-size`, `--fin-position` and `--fin-repeat` each carry one
      entry per layer, in the same order the layers are listed: texture
      first, then wash.
- [ ] Accent alpha stays in the 5–16% range.
- [ ] `--fin-mark-text` defaults to `""`.
- [ ] A full frame uses `--fin-frame`, not the section's `::after`.

**Palette-blind**

- [ ] Every color is a `color-mix()` of `var(--accent)`,
      `var(--fin-canvas)` or `var(--text-heading)`.
- [ ] No hex literals, no `url()`, no `mask-image`, no `margin`.

**Around it**

- [ ] `finish-catalog.ts` entry added — the guard test passes.
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

## The five mistakes, in order of frequency

1. **A fade ending on `transparent` in the opaque face.** A gray cloud in
   every PDF.
2. **Accent alpha too high.** The backdrop competes with the words.
3. **`url()`, `mask-image`, a hex, or a `margin`** anywhere in the preset.
4. **A monogram baked into a deck-wide finish.**
5. **Mismatched layer counts** between the two faces, which quietly
   corrupts the shared size and position lists.

## Where to go next

- Pick the colors it will wear: [Theme anatomy](/craft/themes/anatomy/).
- Arrange what sits on top of it:
  [Component anatomy](/craft/components/anatomy/).
- Build one from dropdowns and sliders instead: the [Studio](/studio/) has
  a finish workbench that writes this CSS for you.
