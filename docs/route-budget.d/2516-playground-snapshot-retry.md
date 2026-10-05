playground: +227

The Playground's first-slide snapshot (`PlaygroundApp.tsx`, `captureFirstSlide`) now waits for the
slides to go live, retries every 1.5 s for up to 45 s, and on giving up logs which check refused it.
Before, it tried once 1.5 s after the first render, and a slide the FIT agent had not yet scaled left
nothing stored until the tab hid: the reload smoke test's 40 s timeout, seen again in CI with a
render-anchored retry. The reveal wait and the refusal reasons (each check now returns why it said
no) are the 227 gzipped bytes, measured against main with the CI build; nothing else on the route moved.
