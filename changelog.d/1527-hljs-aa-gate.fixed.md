- **Fixed: `indaco`'s code panel painted booleans and `null` below the AA floor, and nothing
  anywhere checked syntax colors.** The twelve `--hljs-*` tokens × 32 themes × 2 modes had no
  contrast test — the one large token family the categorical gate does not reach. `checkHljsContrast`
  now measures each against its own theme's `--code-bg`, and it immediately found a **live** miss:
  indaco declares Night Owl's `#ff5874` verbatim, but Night Owl tuned that for Night Owl's panel
  (`#011627`) and indaco's is the lighter `#003d66` — 3.71:1, rendering that way in shipped output
  today, in both concat orders. Lifted in OKLCH holding hue (14.4° → 14.3°) to `#ff7f8e`, 4.67:1.
  A second miss, `cuoio`'s `--hljs-literal` at 4.05:1, is repaired the same way; that one has never
  rendered, because the export loads the base after the theme, so it is a prerequisite for #1527's
  concat flip rather than a live defect.
- **Fixed: 110 comment and punctuation colors that were too faint to read comfortably.** Across the
  shipped palettes, 64 `--hljs-comment` and 46 `--hljs-punctuation` values sat under 4.5:1 on their
  own code panel — `crepuscolo`'s comments at 1.96:1, `magnolia`'s at 2.03:1. Every one is repaired,
  lifted in OKLCH with hue and chroma held by the smallest step that clears the floor, so they land
  at 4.5–4.7:1 rather than at body-text contrast. **Comments still recede** — verified across all 64
  theme-modes that no content token sits below a repaired comment, and confirmed by looking at real
  renders. `--hljs-*` is now gated at budget 0 with **no exemptions**, mutation-tested per token.
- **Fixed: the DEFAULT code comment color — the most-read one in the engine — was at 3.63:1.**
  `lib/base/base.tokens.css` shipped Night Owl's `#637777` on a darker panel (`#001d33`) than Night
  Owl's own, and that is the palette `dist/lattice.css` ships: what a deck renders with before any
  theme is picked. Lifted to `#748989`, 4.64:1. The gate had been scanning `themes/` only and
  excusing the base as "responsible for itself"; it now scans the base first, and not optionally.
  (`engineering/decisions/2026-08-11-palette-concat-signoff.md` §7)
