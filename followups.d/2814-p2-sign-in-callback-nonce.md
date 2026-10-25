---
origin: 2814
priority: P2
recorded: 2026-10-20
area: website
severity: low
swimlane: engineering/decisions/2026-10-20-openrouter-popup-sign-in.md §Why two channels, and why "closed" is not final
source: https://github.com/Laticent/lattice/pull/2814#issuecomment-6288414527
---

# Tie each popup callback to the sign-in that started it

why now   — after a Google sign-in cuts the popup off, a second Connect makes the first
            popup's code fail against the new PKCE verifier ("Connect failed" once)
where     — docs/src/lib/sign-in.js `accept()`, and the callback URL `signIn()` builds
done when — a per-sign-in nonce rides the callback and `accept()` drops a mismatched one,
            or OpenRouter is shown to drop a query on `callback_url` and the item is closed
evidence  — a real sign-in with `?s=<nonce>` on the callback, showing what OpenRouter returns
verify    — sign-in.test.ts gains a mismatched-nonce case that fails without the check
