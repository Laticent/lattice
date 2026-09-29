---
origin: 2404
priority: P2
recorded: 2026-09-29
source: https://github.com/Laticent/lattice/pull/2404
---

# The shared PDF writer times out on a long deck and the CLI silently prints with Chrome

Found re-rendering every committed PDF through the shared writer. `node lattice-emulator.js
themes/palette-audit.md out.pdf` (151 pages) prints `PDF writer failed (Runtime.callFunctionOn
timed out. Increase the 'protocolTimeout' …); printing with Chrome instead.` The writer composes the
whole deck inside ONE page call, and Puppeteer's default `protocolTimeout` is 180 s per call, so
any deck whose compose passes 180 s falls back. The fallback is announced on stderr, but a build
or hook that does not read stderr ships a Chrome PDF. Every other committed deck (up to 13 pages
of heavy charts, and the 35-page design gallery) finished inside the limit.

This is an export-pipeline change, so it needs the owner's dark + light sign-off (CLAUDE.md
QUALITY BAR, export exception).

```text
  P2 · shared PDF writer: long decks time out and fall back to Chrome
       why now   — themes/palette-audit.pdf is the one committed deck still Chrome-printed.
       where     — the CLI's call into lib/core/pdf-compose (one Runtime.callFunctionOn per deck);
                   Puppeteer launch options (protocolTimeout) in the CLI export path.
       done when — a 151-page deck writes through the shared writer; the call is chunked per slide
                   (or bounded by a timeout that scales with pages), and the fallback fails loudly
                   in the pdf-rebuild hook rather than shipping a Chrome PDF.
       evidence  — palette-audit rendered through the writer, dark + light, sent for sign-off;
                   tools/pdf-writer-parity.mjs over it.
       verify    — tier 1.
```
