---
origin: 2354
priority: P2
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2354
---

# Desktop: AI key in the OS keychain (sign-in itself moved to 2354-p1, 2026-10-05)

The 2026-10-05 decision puts OpenRouter sign-in in its own app window (2354-p1, the Studio is
the whole app). What remains here is the key's storage and the main-frame check.

why now   — the Studio's AI features need a key. On desktop the key sits in localStorage,
            and sign-in cannot return: architect.ts builds the callback from location.href
            and redirects the whole page, and tauri:// is not a valid return address.
where     — docs/src/components/studio/architect.ts (~line 1845, the PKCE callback);
            docs/src/components/studio/ai/architect-model.js (~325-350, key storage);
            a new seam in docs/src/lib/platform.js + desktop/src-tauri/src/lib.rs.
done when — desktop sign-in completes through a loopback or deep-link callback, the key is
            stored in Secret Service, and the key-returning command REJECTS calls that did
            not come from the main frame (the preview iframes share the app origin and are
            not sandboxed; see the 2026-09-24 decision note). A real CSP replaces csp: null.
evidence  — a signed-in chat reply in the desktop app; a test showing an iframe-origin
            invoke is refused.
verify    — adversarial trio: this seam guards a secret (HARD RULE #22 threat model).
