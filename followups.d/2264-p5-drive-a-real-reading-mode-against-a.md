---
origin: 2264
priority: P5
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2264#issuecomment-5767264630
---

# Drive a REAL reading mode against a deployed build

Backfilled verbatim from the continuation brief on #2264 (merged 2026-09-21).
Triaged 2026-09-24 against `main` at 6110a1e: still open.

```text
  P5 · [no ticket] Drive a REAL reading mode against a deployed build
       why now   — it is the swimlane's own goal and the only claim still resting on
                   documentation rather than a driven surface; every card above it is verified
                   one layer below this
       where     — the deployed docs site (Cloudflare Pages preview) and a shared --player
                   export; Chrome/Edge DOM Distiller reads og:type + schema.org Article,
                   Firefox Reader runs Readability and reads neither
       done when — the Blink reading mode is observed activating on a deck page, or the attempt
                   is recorded as unreachable with what blocked it
       evidence  — a screenshot of the real reading mode over a real deployment
       verify    — tier 0; this is measurement, not a change
       BLOCKED FROM THIS SANDBOX as of 2026-09-21: no iPhone reachable, and the agent proxy
       breaks service-worker registration on a deployed HTTPS origin. Do not burn time
       rediscovering that — it needs a device or a human at a browser.
```
