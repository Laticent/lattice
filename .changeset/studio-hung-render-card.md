---
---

When the Studio's preview has not finished a render after 30 seconds, it now says so and offers Retry, instead of spinning forever.

A render that waits on a request that never answers (a stalled network, an overloaded host) used to leave the Studio's loading skeleton on screen with no message and no way out. Now the failure card appears at 30 seconds: "This preview couldn't render — the slide did not finish loading; check the connection, then Retry." Over a slide already on screen, it is the bar along the slide's foot instead. If the slow render finishes later, the card goes by itself. Retry starts a fresh render; a request that never answers can still hold it, and a reload clears that. Decision `engineering/decisions/2026-11-28-hung-first-render-card.md`.
