- **Fixed: `indaco`'s code panel painted booleans and `null` below the AA floor, and nothing
  anywhere checked syntax colors.** The twelve `--hljs-*` tokens × 32 themes × 2 modes had no
  contrast test — the one large token family the categorical gate does not reach. `checkHljsContrast`
  now measures each against its own theme's `--code-bg`, and it immediately found a **live** miss:
  indaco declares Night Owl's `#ff5874` verbatim, but Night Owl tuned that for Night Owl's panel
  (`#011627`) and indaco's is the lighter `#003d66` — 3.71:1, rendering that way in shipped output
  today, in both concat orders. Lifted in OKLCH holding hue (14.4° → 14.3°) to `#ff7f8e`, 4.67:1.
  A second miss, `cuoio`'s `--hljs-literal` at 4.05:1, is repaired the same way; that one has never
  rendered, because the export loads the base after the theme, so it is a prerequisite for #1527's
  concat flip rather than a live defect. **`--hljs-comment` and `--hljs-punctuation` are exempt,
  with the reason recorded**: 64 and 46 shipped values sit under 4.5:1 against 4 for every other
  token combined, and de-emphasizing a comment is the design rather than a defect — WCAG disagrees,
  and that trade-off is flagged for a decision rather than settled by a gate.
  (`engineering/decisions/2026-08-11-palette-concat-signoff.md` §7)
