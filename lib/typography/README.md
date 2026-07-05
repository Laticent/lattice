# lib/typography — the type-scale source of truth

- `scale.js` — the curated per-orientation coefficient sets (`SCALES`),
  role list (`ROLES`), and selector map.
- `emit.js` — `typographyTokensCss()`: manifest → the cascade-ordered
  `--fs-*` blocks `tools/build-css.js` splices into `dist/lattice.css`.

The 12-token `--fs-*` system is HARD RULE #4; the deep reference is
`engineering/typography.md`.

**Gotcha:** every size is `coefficient x var(--_sec-1cqi, 1cqi)`
(width-relative); orientation changes the coefficient, not a multiplier.
A raw `cqi` font-size that bypasses `scale.js` renders at landscape size
on a portrait box — always route sizes through this module.
