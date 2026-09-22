---
origin: 2241
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2241#issuecomment-5752669968
backfill: true
---

# Use the already-open Chromium as the DOM in the CLI export path

Backfilled verbatim from the continuation brief on #2241 (merged 2026-09-20).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] Use the already-open Chromium as the DOM in the CLI export path
       why now   — lattice-emulator.js builds THREE jsdom windows (one inside a .map over
                    sections, so once per slide) while a puppeteer page is open in the same
                    process. Measured 26.9ms vs ~202ms on a whole deck (7.5x), and the CDP
                    floor is 0.49ms per round-trip, so batch the sections into ONE evaluate
                    rather than paying the floor per section.
       where     — lattice-emulator.js:5311-5316; the op to mirror is in
                    tools/dom-bakeoff/chromium.mjs; `npm run dom:bakeoff:chromium` re-derives
                    the numbers. Do NOT touch lib/core/dom-provider.js's withDom — it is
                    SYNCHRONOUS and CDP is not; that is why this is scoped to the export
                    path, which already runs inside page.evaluate (29 such bodies).
       done when — a deck exported via the CLI is byte-identical to the pre-change export,
                    and the three jsdom constructions are gone from that path.
       evidence  — EXPORT SIGN-OFF IS REQUIRED (CLAUDE.md QUALITY BAR): this alters the bytes
                    of an exported artifact. Render a representative demo deck in BOTH dark
                    and light mode and send the PDFs via SendUserFile for human inspection.
                    Also `npm run bench` before/after. "Tests pass" is not evidence here.
       verify    — tier 1 checker, because it is an engine/export path change with real blast
                    radius; escalate to tier 2 trio if the byte comparison is not exact.
```
