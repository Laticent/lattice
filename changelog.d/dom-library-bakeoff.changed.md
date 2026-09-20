- The docs test suite runs ~9% faster (233.3s to 212.2s on a 4-core box). 135 of its
  test files touch no DOM and were building a jsdom window they never used; they now
  declare `// @vitest-environment node`. All 313 files and 4,483 tests still pass, and
  no test behavior changed.
- Added `npm run dom:bakeoff` and `npm run dom:bakeoff:speed` — a correctness and
  throughput bake-off of six Node HTML parsers against this repo's own rendered markup.
  Its verdict is to keep jsdom: happy-dom breaks DOMPurify (it leaves `<script>` in the
  sanitized output, which HARD RULE #22 depends on) and linkedom still lowercases every
  camelCase SVG element name. See
  `engineering/decisions/2026-09-20-dom-library-bakeoff.md`.
- The bake-off field widened to ten parsers plus the Chromium the export path already
  launches (`npm run dom:bakeoff:chromium`). Two near-winners are recorded and declined:
  domino (4.5x faster, but DOMPurify deletes all markup on it and its NodeList is not
  iterable, which `withDom`'s fail-closed catch would turn into silent transform
  no-ops), and Chromium (fastest measured, but CDP is async and `withDom` is not).
