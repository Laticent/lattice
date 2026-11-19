---
origin: 3277
priority: P1
recorded: 2026-11-17
area: website
severity: medium
swimlane: engineering/decisions/2026-11-17-site-discovery.md §2
deferred: large — four separate changes, each its own measurement: the Studio export's capture and prune frames, the font subsetter in a worker, the voice runtimes' hosts, and the landing page's route-budget ceiling (the owner's call)
source: https://github.com/Laticent/lattice/pull/3277
---

# CSP: the six pages still without a policy

why now   — stage 2 put the strict policy on 198 of 204 routes: every preview frame now runs
            same-origin files (lib/core/frame-agents.mjs) and the sandboxes load through a shell
            (lib/packages/sandbox-shell.mjs). Six routes still carry none, each printed by every
            build with its reason (docs/scripts/csp.mjs):
            FRAME (/studio/, /proto/chat-figures/): the export player (player-core) writes its
            runtime INLINE into the Studio's capture and prune frames (deck-export.js,
            player-prune-browser.ts), which inherit the page's policy.
            EVAL (/libraries/calco/): woff2-encoder's Emscripten bindings build functions from
            strings (`new_(Function, …)`), so the PPTX export hangs at "Embedding fonts…" under
            the policy. The Studio's exports reach the same code through player-prune.
            NETWORK (/libraries/cadenza/, /libraries/suono/): voice-model.js imports kokoro-js from
            esm.run, which redirects to jsDelivr and then fetches its model and wasm from hosts no
            scan of our bundle can list (OPEN_ORIGINS).
            OFFLINE (every policy page that opens a sandbox): the frame now loads the sandbox shell, a
            navigation the service worker never sees (it does not control an opaque-origin frame), so
            a code package or draw frame opens offline only while the HTTP cache holds the shell.
            Pages without a policy keep srcdoc and are unaffected (sandbox-shell.mjs).
            HELD (/): the policy tag is about 1,460 bytes and the landing page's HTML sits 52 bytes
            under its 121,924-byte htmlRaw hard ceiling (2026-11-19), so the policy would put it
            about 1.4 KB past; raising it is the owner's call (HELD_ROUTES).
where     — docs/src/components/studio/export/deck-export.js and
            docs/src/components/studio/player-prune-browser.ts (frame);
            lib/core/pdf-compose/font-subset.mjs and docs/src/components/studio/export/calco-font-host.js
            (eval); docs/src/playground/voice-model.js and kokoro-worker.js (network); csp.mjs
            HELD_ROUTES and check-route-budget.mjs (held).
done when — FRAME: the player's runtime is a same-origin file in the capture and prune frames, or
            those frames load through the sandbox shell. EVAL: the subsetter runs in a same-origin
            worker (measured 2026-11-17: a worker loaded from our origin inherits no policy and
            `new Function` runs in Chromium, WebKit and Gecko). NETWORK: the hosts kokoro-js and
            the Studio's on-device models reach are measured on a real load and named in
            ORIGIN_DIRECTIVES, and esm.run leaves OPEN_ORIGINS. HELD: the owner raises the
            landing page's ceiling, or the page gives back the bytes, and its HELD_ROUTES entry goes.
            OFFLINE: the shell is reachable offline (precached where a navigation can use it, or the
            sandbox no longer needs a navigation).
            Then csp.mjs exempts nothing and MIN_POLICY_PAGES is 204.
evidence  — `node docs/scripts/csp.mjs --check` prints the six and their reasons; the stage-2
            measurements are in the decision note §2.
verify    — `npm run build`, then `npx playwright test e2e/site-csp.spec.ts` on the six projects
            (desktop, tablet, mobile, webkit-phone, webkit-tablet, gecko), with Calco's export and
            the Studio's export driven under the policy.
