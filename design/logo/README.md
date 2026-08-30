# Lattice brand mark — "Spectrum Cell"

A crystallographic **unit cell** (the structure) whose nodes are lit by the
brand **spectrum ribbon**, swept left→right and anchored by a single gold
core. The rule the whole mark obeys: **structure is ink, color is signal.**

- The **bonds** are navy ink — the lattice skeleton. They never carry color.
- The **nodes** carry the spectrum, in palette order (cool → warm), so the
  color reads as *Lattice's own `--spectrum`* rather than decoration.
- One **gold core** is the focal "atom" and the brand anchor.

## Files

| File | What | Use |
| --- | --- | --- |
| `lattice-mark.svg` | Full mark, **light+dark adaptive** (one file) | Anywhere ≥28px |
| `lattice-mark-min.svg` | Simplified mark (diamond + 5 nodes), adaptive | Favicon / app icon, ≤24px |
| `lattice-lockup.svg` | Mark + wordmark, dark text | On light surfaces |
| `lattice-lockup-dark.svg` | Mark + wordmark, light text | On dark surfaces |
| `generate.py` | Source of truth — regenerates all four | `python3 generate.py` |

Web copies live in `docs/public/` (`favicon.svg`, `lattice-mark*.svg`,
`lattice-lockup*.svg`). The site uses the adaptive SVGs everywhere: the
browser-tab favicon is `favicon.svg` and the in-page header/footer logo is an
`<img>` pointing at `lattice-mark-min.svg`. Both adapt to light/dark via
`@media (prefers-color-scheme: dark)`. (The former `docs/public/lattice-logo.png`
— a 512² raster downscaled to a ~30px header logo, ~20× the bytes of the vector
and unable to theme — was retired.)

## Palette (brand axis)

| Token | Hex | Role |
| --- | --- | --- |
| Indaco navy | `#003D66` | bonds (light) |
| Bright navy | `#4FA8DA` | bonds (dark) |
| Gold | `#C8A040` / ring `#7A5A10` | core |
| Spectrum | `#5B86B8 #7B72C0 #A8628A #C45D5D #D08C42 #B8A032` | nodes (cuoio ribbon) |
| Halo | cream `#FAF7F2` / dark `#15110D` | node separation, flips with scheme |

## Rules

- **Clear space:** keep padding of at least one node-diameter on all sides.
- **Minimum size:** full mark to ~28px; below that use `lattice-mark-min.svg`.
- **Dark mode:** the SVGs handle it via `@media (prefers-color-scheme: dark)` —
  bonds brighten, halos darken. Don't hand-recolour; ship the adaptive file.
- **Wordmark font:** Fraunces / Cormorant Garamond (Georgia fallback), 600,
  letter-spacing −1. Matches the deck display serif.
- **Don't:** recolour the nodes off-spectrum, put color on the bonds, squish
  the aspect ratio, or add effects (shadows/gradients on the nodes).

Regenerate after any change: `python3 design/logo/generate.py`.
