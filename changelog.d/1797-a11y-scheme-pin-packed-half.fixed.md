- **Fixed: the four CVD accessibility palettes followed the dark scheme on the
  Studio and the component reference pages.** `a11y-achromatopsia`,
  `a11y-deuteranopia`, `a11y-protanopia` and `a11y-tritanopia` pin
  `color-scheme: light` so their color separation is tuned for one canvas. That
  pin was declared only at `:root:root`, which the engine rewrites to a selector
  that can never match a slide — so on every frame built by
  `single-slide-render.ts` (Specimen, the Studio, the landing previews), which
  injects its own `:root{color-scheme:MODE}`, the slide inherited dark and
  painted `rgb(0,0,0)` where the palette's fixed canvas should be white. It is
  now declared at both `:root` and `:root:root`: the plain half lands directly on
  the slide and wins by directness, the doubled half still outranks a deck's own
  `style:` directive on the CLI export, where that directive is emitted last and
  no cascade order can beat it. Measured on a real page — before `rgb(0,0,0)`,
  after `rgb(255,255,255)` — with fifteen section variants swept in both modes to
  confirm `_class: dark`, the `.title` / `.closing` / `.divider` bookends,
  `.print` and `.light` all still resolve exactly as before. The CLI, PDF, PPTX
  and image-set outputs are unaffected.
- **Known and unchanged:** the `--player` HTML export still flips these palettes
  with its own toggle. It sets `color-scheme` as an inline style on the document
  root, which no selector can outrank. Pre-existing, measured both ways, and now
  stated in `themes/a11y-base.css` rather than contradicted by it.
