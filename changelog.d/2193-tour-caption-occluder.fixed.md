- **Fixed: a walkthrough no longer scrolls its target under its own caption.** `block: 'nearest'`
  scrolls the minimum, so a target that was below the fold landed flush with the edge Vetrina
  paints its caption against — with `caption: 'scrim'` (the phone choice) a 230px gradient reaching
  90% opacity exactly there. Every reveal now asks for that much room through `scroll-margin`, which
  leaves the choice of scrolling ancestor with the browser.
- **Fixed: the Studio's editor follows a tour's typing to somewhere the viewer can see.** The tail
  reveal landed the new line at the bottom edge of the editor, which is the strip the tour's caption
  is covering: measured 115px inside the gradient on Chromium at 390×844 and 225px inside it on real
  WebKit at an iPhone 15 Pro box. This was the unexplained half of the iPhone report, and it is not
  iOS-specific — the phone caption style is.
- **Added: a stage publishes the band it is covering**, as `--vt-chrome-top` / `--vt-chrome-bottom`
  on the document element, so a host that scrolls its own content during a tour can leave the same
  room. Removed on `destroy()`.
