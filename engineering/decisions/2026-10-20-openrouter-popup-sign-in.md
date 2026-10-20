---
status: shipped
summary: >
  Connect OpenRouter opens OpenRouter's page in a popup instead of sending the whole Studio
  there and back. The popup returns to a static callback page (`/sign-in/callback/`), which
  hands its URL to the Studio tab over a BroadcastChannel (and `window.opener` where it
  survives) and closes; the tab exchanges the code. The full-page redirect stays as the
  fallback for a blocked popup and for an iOS home-screen app. The seam is
  `docs/src/lib/sign-in.js`, shaped like PR #2354's desktop sign-in window so the two merge.
---

# OpenRouter sign-in in a popup

**Ask (2026-10-20, the owner):** OpenRouter can sign in through a popup; use that instead of
sending the user to a separate page and back. PR #2354 already does this for the desktop app.

## What happens on Connect

1. `connectOpenRouter()` (`docs/src/components/studio/architect.ts`) calls
   `openSignInWindow()` (`docs/src/lib/sign-in-window.js`, the one eager piece) **before its
   first `await`**. A popup opened after an `await` has lost the click's user activation, and
   popup blockers refuse it. Every caller already calls `connectOpenRouter()` straight from a
   click handler. The rest of the seam, `sign-in.js`, loads after that, on the click.
2. `signIn()` (`docs/src/lib/sign-in.js`) builds the PKCE URL with the callback
   `<origin>/sign-in/callback/`, points the popup at it, and records the page the sign-in
   started from in `localStorage['lattice-sign-in-return']`.
3. OpenRouter sends the popup to `/sign-in/callback/?code=…`. That page
   (`docs/public/sign-in/callback/index.html`, static, no bundle) posts
   `{ type: 'sign-in-callback', url }` on the `lattice-sign-in` BroadcastChannel and to
   `window.opener`, and scrubs the code from its own history entry.
4. The tab checks the URL is its own callback page (same origin and path), acks, closes the
   popup and exchanges the code (`resumeOpenRouterAuth`). The toast and the
   `db-model-changed` event are the ones the redirect path already used.

## Why two channels, and why "closed" is not final

A sign-in page that sends `Cross-Origin-Opener-Policy` cuts the popup off from its opener for
good. Google's sign-in page does, and OpenRouter offers Google sign-in. After that cut,
`window.opener` is null in the popup, and `popup.closed` reads `true` in the tab **while the
user is still signing in**. So:

- **BroadcastChannel is the main route.** It needs only the same origin, not the opener link.
- **"Closed" resets the button, not the sign-in.** `signIn()` resolves `null`, so the
  Workspace's Connect button comes back. The tab keeps listening for 10 minutes, and a code
  that arrives in that time still connects, with the same toast (`onLate`).
- **A new Connect cancels the old listener**, so one tab never holds two. It does not stop
  the new listener from taking a code the old popup sends: nothing in the callback names the
  sign-in it belongs to, and that code fails the exchange against the new PKCE verifier. The
  user sees "Connect failed" and connects again. A nonce in the callback URL would close
  this, but it needs OpenRouter to keep a query on `callback_url`, which is unverified.
- **The code is exchanged once.** Callers that join one sign-in share one exchange, and an
  exchange is skipped when the key is already stored and no verifier is pending (the
  callback page's own fallback got there first).

## The fallbacks

| Case | What happens |
|---|---|
| The popup is blocked (`window.open` returns null) | The page goes to OpenRouter and comes back with `?code=`, as before. `resumePendingAuth` finishes it on load. |
| An iOS home-screen app (`navigator.standalone`) | Same redirect. Its popups open in a browser with separate storage and no way back to the app. |
| No tab answers the callback page within 4 s (the Studio tab was reloaded or closed) | The callback page sends itself to the recorded start page with the same query, and that Studio finishes the sign-in on load. |

## Relation to PR #2354 (the desktop app)

PR #2354 adds `docs/src/lib/sign-in.js` with `signIn(begin, webCallback)`: the desktop branch
opens a Tauri sign-in window, and the web branch does the full-page redirect. This change
lands the same file and the same first two parameters, with the web branch now a popup and a
third `{ popup, onLate }` options argument. Merging #2354 after this one means adding its
`tauri()` branch at the top of `signIn()` and keeping `openSignInWindow()` from opening a
popup inside the desktop app.

## Verified

- Unit: `docs/src/lib/sign-in.test.ts`, against jsdom's real BroadcastChannel and
  postMessage.
- Chromium e2e: `docs/e2e/openrouter-popup-sign-in.spec.ts`, with OpenRouter mocked by
  `context.route` (HARD RULE #24): the popup round trip with the Studio page never
  navigating, a closed popup resetting Connect, and the no-listener fallback.
- **UNVERIFIED:** a real OpenRouter account (the mock stands in for OpenRouter's redirect),
  and the Google-sign-in COOP cut, which no mock reproduces.
