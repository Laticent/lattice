---
"@laticent/lattice": major
---

Covers and dividers now follow the deck's color mode, and `cover:` is renamed `cover-layout:` and takes only the composition word.

- **Breaking:** a light deck's title and closing slides open on the light canvas instead of the dark panel. Write `title dark` / `closing dark` to keep a dark cover; a dark cover paints the theme's brand panel (`--surface-inverse`), so indaco keeps its navy cover.
- **Breaking:** `cover:` no longer works. `cover-layout:` takes the composition (`plain`, `masthead`, `ledger`, `column`, `label`, `stage`, `frame`, `poster`). The per-slide `cover-light` / `cover-inverse` classes are gone: use `light` / `dark`. `lint:deck --fix` rewrites all of it and keeps a deck's look (`retired-cover-key`, an error).
- **Breaking:** dividers paint the theme's accent in light mode and the accent mixed 40% into the canvas in dark, instead of the dark panel. `divider light` now means the light color mode; the smaller centered layout it used to imply is `divider subsection`, in either mode.
- The numbered divider's hairline uses the secondary ink rung, so it clears 3:1 on the new fields.
- The HTML player no longer forces bookends dark, so a cover follows the viewer's light/dark toggle, and a `color-mode: system` deck's covers take the inverse logo mark in dark.
- The Studio's section rail treats `divider subsection`, not `divider light`, as a step inside a section.
- `tools/contrast-audit.js` scores each theme's divider field: its ink (4.5:1), the hairline (3:1) and its contrast against the content canvas (1.6:1 floor).
