studio: +604
playground: +582
home: +606
`writeSrcdoc` (src/lib/srcdoc-write.js) and its one-off probe, imported by the preview builders (deck-render.js, single-slide-render.ts) because the first preview write needs them: Firefox gives a srcdoc frame the page's service worker only when `srcdoc` was set before the frame entered the page, so offline the preview's runtime, fonts and Mermaid failed (engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md). The rest is what the independent review of that design added: single-slide-render's `docOrMount` (a frame not yet in the page still reaches its host if building its document throws) and the Playground newcomer-bake loader writing its frame the same way. Nothing to give back first: the bytes are the fix.
