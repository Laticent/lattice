- **Fixed: code comments and syntax colors that were too faint to read, across every theme and the
  default palette.** The twelve `--hljs-*` tokens × 32 themes × 2 modes had no contrast test
  anywhere — the one large token family the categorical gate does not reach. `checkHljsContrast`
  now measures each against the code panel it actually sits on, and **120 shipped values were below
  the 4.5:1 AA floor**: 66 comments, 46 punctuation marks, and 8 literals, the worst at 1.96:1
  (`crepuscolo`) and 2.03:1 (`magnolia`). Every one is repaired, lifted in OKLCH with hue and chroma
  held by the smallest step that clears the floor, so they land at 4.5–4.7:1 rather than at
  body-text contrast. **Comments still recede** — verified that no token carrying code sits below a
  repaired comment, and that comment and punctuation stay visually distinct rather than collapsing
  into one gray.
- **Fixed: the DEFAULT syntax colors — the ones every deck gets before a theme is chosen.**
  `lib/base/base.tokens.css` shipped Night Owl's `#637777` and `#ff5874`, tuned for Night Owl's
  panel rather than Lattice's. These matter more than any theme's: the PDF/PPTX/HTML **export
  loads the base after the theme**, so the base's syntax colors are what actually paint in an
  exported deck. On `indaco` that was a comment at 3.06:1 and a literal at 3.71:1 in every exported
  file. Both are now solved against *every* code panel in the corpus — comment `#92a8a8` (worst
  4.51:1), literal `#ff7c8c` (worst 4.58:1) — so they are safe whichever order the stylesheets load
  in.
- **Fixed: the Studio's theme generator manufactured the same defect.** `deriveTheme` held generated
  `--hljs-*` to the 3:1 graphical floor, calling syntax highlighting "decorative", so every theme
  built in the Studio shipped comments around 3.1:1. Now 4.5:1, matching the floor committed
  palettes are held to.
- `--hljs-*` is gated at budget 0 with **no exemptions**, mutation-tested per token, and the gate
  now measures the base against every theme's panel, rejects a value written in a notation it
  cannot parse instead of skipping it silently, and fails on a comment/punctuation collapse.
  (`engineering/decisions/2026-08-11-palette-concat-signoff.md` §7)
