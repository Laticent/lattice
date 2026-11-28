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

- `HUNG_RENDER_MS = 30000`, timed from the OLDEST render still unsettled since the frame was last current. One timer,
  armed when the first render goes unsettled; the renders an edit starts after it do not re-arm it, so a person typing
  into a stalled preview still sees the card 30 s after the stall began. The NEWEST render settling stops the clock,
  whatever older renders still hang (the frame scheduler's 4 s watchdog lets a newer render start beside a hung one).
- An older render that settles while a newer one's stall card is up leaves the card: the newer render is still
  unsettled. (The first cut re-armed the clock on every render and let any settle clear the card; the checker on #3617
  found both.)
- At 30 s: `stalled`, `failed`, and the reason "the slide did not finish loading; check the connection, then Retry". If
  the frame is revealed, it is the bar: "The preview stopped loading, so edits will not show here."
- A slide that reveals during a stall keeps the failure, as the bar (the recovery effect treats a stall like an engine
  failure). Only a settled render clears it. A render that settles `ok` clears it, as any successful render always has.
- Non-loader hosts are unchanged: their 32 s never-paint ceiling stays.
- Present's slide is a loader host too (`PresentOverlay.tsx`), so a presented slide whose render hangs gets the card the
  same way. Its bar's wording ("edits will not show here") fits the editing preview, not Present; the engine-failure bar
  has the same wording there. Not changed here.

## Why 30 s

The owner's number. The clock times a render SETTLING, not the frame revealing. A render that writes the frame returns
without waiting for the reveal poll (~30 s), so a slow paint after a write does not hold it. A render that comes after a
write and finds that frame's document still loading does wait for it (`DOC_LOAD_WAIT_MS`, 30 s a round, single-slide-
render.ts), so on a very slow machine the card can show while a frame is still loading, then clear when the render
settles. The owner accepted that cost: "On a very slow machine the card may flash briefly."

## What Retry can and cannot do

Retry starts a fresh render. The lazy loaders cache their promise, and the browser's module map shares one fetch per
URL, so a request that NEVER answers holds the fresh render too: only the network answering, or a reload, ends it.
Retry recovers once the stalled step has answered or failed: a failed theme fetch is dropped from the theme fetcher's
cache, so Retry fetches it again (`docs/e2e/preview-hung-render.spec.ts`).

## Evidence

`DeckPreview.test.tsx` (fake time): no card at 29,999 ms, the card at 30,000 ms, the bar over a revealed slide, the
card clears on settle, Retry renders again, and a stale clock raises nothing. `docs/e2e/preview-hung-render.spec.ts`
(Playwright's page clock; desktop, webkit-tablet, webkit-phone, gecko): a held lazy chunk shows the card at 30 s and
clears when the chunk answers; a held theme shows the card, fails, and Retry renders. Every positive arm fails on the code
before this change; the negative arms (a stale clock, a non-loader host) fail when their guard is removed, and the
oldest-render and newest-only arms fail on the first cut.
