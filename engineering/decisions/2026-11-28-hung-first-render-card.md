---
status: in-progress
summary: >
  On a loader host (the Studio's preview), a render that has not settled 30 s after it started shows the failure
  card with Retry, or the bar over a slide already showing; it clears itself when a render settles. The owner's D4,
  2026-11-28. Ends #1164's "honest spin" for a render that never settles.
---

# A render that hangs shows the failure card at 30 s (2026-11-28)

**Decision.** On a loader host (the Studio's preview), a render that has not settled 30 s after it started shows the
preview's failure card with Retry. Over a slide that is already showing (the newcomer bake), the card is the bar along
the slide's foot, and the slide stays visible. The card clears itself when that render, or a newer one, settles. Owner,
2026-11-28, flake desk question D4, option A, picked in the command center's question tool (event
`a05f170d-1158-439d-9c6c-1efc039619aa`, session_015KSkL86Y46Lc6maFmiRhuk).

## What it changes

#1164 gave non-loader hosts a never-paint ceiling (32 s, reveal-verifying) and kept a loader host's skeleton spinning
when nothing painted: "honest, by the skeleton contract", because the render may still land. #1551 added the failure
card to loader hosts for DEFINITE failures only (`ok: false`, and later an engine import that rejects). A render that
never settles was neither, so the Studio spun for good. That is what a person saw in the iPad first-render stall
(`followups.d/3368-p1`): no frame, no message, no Retry. The honest spin now has an end.

## The rule, as built (`docs/src/components/DeckPreview.tsx`)

- `HUNG_RENDER_MS = 30000`. Each render on a loader host arms a clock and clears it when the render settles, either
  way. A newer render takes the clock over, so a render the frame scheduler's 4 s watchdog gave up on cannot raise the
  card over a newer render that settled, or is still inside its own 30 s.
- At 30 s: `stalled`, `failed`, and the reason "the slide did not finish loading; check the connection, then Retry". If
  the frame is revealed, it is the bar: "The preview stopped loading, so edits will not show here."
- A slide that reveals during a stall keeps the failure, as the bar (the recovery effect treats a stall like an engine
  failure). Only a settled render clears it. A render that settles `ok` clears it, as any successful render always has.
- Non-loader hosts are unchanged: their 32 s never-paint ceiling stays.

## Why 30 s

Past the single-slide preview's reveal poll (~30 s), so a slow cold load the poll still reveals rarely sees the card.
When it does, the card shows briefly and clears itself. The owner accepted that cost: "On a very slow machine the card
may flash briefly."

## What Retry can and cannot do

Retry starts a fresh render. The lazy loaders cache their promise, and the browser's module map shares one fetch per
URL, so a request that NEVER answers holds the fresh render too: only the network answering, or a reload, ends it.
Retry recovers once the stalled step has answered or failed: a failed theme fetch is dropped from the theme fetcher's
cache, so Retry fetches it again (`docs/e2e/preview-hung-render.spec.ts`).

## Evidence

`DeckPreview.test.tsx` (fake time): no card at 29,999 ms, the card at 30,000 ms, the bar over a revealed slide, the
card clears on settle, Retry renders again, and a stale clock raises nothing. `docs/e2e/preview-hung-render.spec.ts`
(Playwright's page clock; desktop, webkit-tablet, webkit-phone, gecko): a held lazy chunk shows the card at 30 s and
clears when the chunk answers; a held theme shows the card, fails, and Retry renders. Every arm fails on the code
before this change.
