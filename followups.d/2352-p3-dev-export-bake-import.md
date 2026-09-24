---
origin: 2352
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2352
---

# Studio webpage export ships raw Mermaid source on the docs dev server

why now   — Found while verifying #2352 on real surfaces. In `npm run dev` the Studio's "Download as webpage" bake fails before it starts, with `SyntaxError: The requested module '/@fs/…/lib/core/base64-utf8.js' does not provide an export named …`, logged as "diagram bake failed; the webpage export ships un-rendered diagram source". Every diagram then exports as its fence source. The unchanged base does the same. It is also why `docs/e2e/mermaid-unavailable-export.spec.ts` fails against a dev server.
where     — `docs/src/components/studio/export/deck-export.js` (the bake's dynamic imports), under Vite's dev-mode CommonJS interop. Production builds (`npm run build:e2e`) are unaffected.
done when — a webpage export from `npm run dev` carries drawn diagrams, not `language-mermaid` source.
evidence  — the unchanged base, driven the same way, exported raw source. The production preview of the same flow exported drawn, tagged diagrams.
verify    — seed a deck with one Mermaid fence, run Share → Webpage on the dev server, and grep the file for `language-mermaid` (expect 0).
