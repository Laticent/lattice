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
- **Fixed: the Studio's top bar no longer slides sideways when the page finishes loading.** The
  pre-paint shell reserved space for the deck's slide count using a width measured once against
  one deck — 53px against a real 56px — so from 1280px up the Read/Write/Craft dial and
  everything after it jumped 3px when the app took over, and a deck with a different number of
  slides moved it further. The slot now reserves a fixed width that both the shell and the app
  take from one shared constant, so it no longer depends on the deck. The same change stops the
  preview bar's counter widening as you page from slide 9 to slide 10.
