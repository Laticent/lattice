- **Fixed: the Studio's top bar no longer jumps when the page finishes loading.** The
  pre-paint shell drew its header in the fallback font and re-laid it out when the
  webfonts arrived, so the deck-name pill — which sizes itself to its text — was about
  42px too wide until then, and the divider and Read/Write/Craft dial after it slid
  when it corrected. The two font files the bar paints with are now preloaded.
  Measured on a throttled connection: the deck title settles at its final width
  immediately, where before it shifted 41.9px.
