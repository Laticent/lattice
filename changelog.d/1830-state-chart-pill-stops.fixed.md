- **state-chart status badges now clear WCAG AA on every palette.** The component
  reimplemented the `.chart-status` pill's depth gradient instead of sharing it, so it
  missed both AA retunes chart-family took (`48%/64%` → `42%/54%` dark in #1809,
  `33%/54%` → `18%/30%` light in #1807). Measured through `tools/composed-contrast.js`'s
  own `evalSurface` over 32 palettes × 5 states, the old stops were sub-AA on **49 pairs**,
  worst `concrete` light `pass` at **2.48:1**. All three sites — the HTML index badge, the
  legend swatch and the SVG `.state-index-disc` — now carry chart-family's stops, and the
  worst pair is `laguna` dark `pass` at **4.62:1**.
- **Both gradient stops of all three sites are modelled in `tools/composed-contrast.js`.**
  Nothing modelled a state-chart pill at all, which is why no gate had ever reported the
  49 pairs; a fourth divergence now reddens the gate instead of shipping.
