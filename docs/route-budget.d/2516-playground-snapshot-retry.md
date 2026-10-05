playground: +34

The Playground retries its first-slide snapshot (`PlaygroundApp.tsx`, `captureFirstSlide`) every
1.5 s, up to five more times, until a capture lands, instead of trying once 1.5 s after the first
render: one early try against a slide the FIT agent had not scaled left nothing stored until the
tab hid, the likely cause of the reload smoke test's 40 s timeout. The retry loop and the
capture's success result are the 34 gzipped bytes; nothing else on the route moved.
