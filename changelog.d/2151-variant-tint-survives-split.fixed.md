- **A component's variant styling can reach its own split pages.** `roleOpenTag` replaces the
  section's class attribute (a cover is a `content` field, not a `split-panel`), so a variant
  selector like `section.split-panel.cat-3` could never match a split page. The authored
  modifiers now ride as `data-split-mods="cat-3 proof"` — an attribute, so opting in cannot
  collide with any selector already in the bundle — and a component adds
  `[data-split-mods~="cat-3"]` to its own stylesheet. The canvas axis still rides as a class.
- **`split-panel`'s eight `cat-N` variants keep their categorical tint when split.** All eight
  rendered identically once split — the plain `--accent` field, the one thing they exist to say
  gone, with nothing failing. The split pages set the same three custom properties
  `section.split-panel.cat-N` sets, so the tint recipe below them is shared rather than copied,
  and every text run takes `--cat-on-fill` for the reason the panel's own block gives: it is the
  one ink the categorical token contract guarantees against any `--cat-N-fill`.
