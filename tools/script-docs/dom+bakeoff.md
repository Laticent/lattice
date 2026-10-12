---
group: Test & verify
---
Correctness bake-off for the Node HTML parser — can a candidate do the jobs jsdom does here? Probes SVG camelCase survival, serialization against jsdom byte for byte, the selectors this repo actually writes, the transformer mutation surface, script execution, CSSOM, parser corners, and whether DOMPurify sanitizes when hosted on it (HARD RULE #22). Only jsdom is a dependency; the rest of the field is opt-in via `npm i --no-save happy-dom linkedom node-html-parser cheerio`. On-demand. See engineering/decisions/2026-09-20-dom-library-bakeoff.md.
