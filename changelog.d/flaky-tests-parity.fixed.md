- **Fixed: a QR-card slide (`wifi`, `contact`, `gift-card`) with no card fields yet no longer keeps the browser
  runtime busy forever.** The runtime rewrote the slide's HTML on every pass even when nothing had changed, and that
  write triggered the next pass, so an open slide re-ran the whole deck's transforms about seven times a second. In
  Chromium, one such slide ran 21 passes in 3 seconds; it now runs 2, the same as a `content` slide. The three
  adapters now share one `rebuildCardsInDom` that writes only when the card changes.
- **Fixed: a `wifi` or `contact` slide with no card fields yet no longer loses its closing coda (Key Insight).** The
  card builder set the coda aside to re-attach under the card, then returned the slide without it when there was no
  card to build. It now returns the slide exactly as written, as `gift-card` already did.
- **Fixed: the runtime parity tests (`test/integration/parity`) no longer pass or fail on the machine's speed.** 34
  fixed sleeps are gone. The jsdom boots run on a virtual clock and read once the runtime has nothing queued; the
  real-Chromium checks wait for the page's timer queue to empty. Every rewrite was shown failing on a broken product
  line.
