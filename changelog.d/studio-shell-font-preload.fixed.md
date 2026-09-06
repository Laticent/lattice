- **Fixed: the Studio's top bar no longer jumps when the page finishes loading.** The
  pre-paint shell drew its header in the fallback font and re-laid it out when the
  webfonts arrived, so the deck-name pill — which sizes itself to its text — was about
  42px too wide until then, and the divider and Read/Write/Craft dial after it slid
  when it corrected. The two font files the bar paints with are now preloaded.
  Measured on a throttled connection: the deck title settles at its final width
  immediately, where before it shifted 41.9px.
- **Fixed: the Studio's editor toolbar no longer appears all at once when the page
  finishes loading.** The pre-paint shell drew the editor's sub-bar as a single
  placeholder while the app's own bar carries eleven controls, so the band under the
  header filled in — and grew — at hand-off. The shell now draws the same controls the
  app does at the same width. Measured on an iPad Air 4 in both orientations: 12 of 12
  controls present in portrait and 11 of 11 in landscape, each within 1px of where the
  app puts it, where before the shell drew 1.
