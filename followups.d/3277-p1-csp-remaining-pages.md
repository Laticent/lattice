---
origin: 3277
priority: P1
recorded: 2026-11-17
area: website
severity: medium
swimlane: engineering/decisions/2026-11-17-site-discovery.md §2
deferred: large — four separate changes, each its own measurement: the Studio export's capture and prune frames, the font subsetter in a worker, the voice runtimes' hosts, and a sandbox that opens offline (the owner accepted that gap for #3307 on 2026-11-21 and 2026-11-22, on the condition that the visitor is told; see OFFLINE)
source: https://github.com/Laticent/lattice/pull/3277
---

# CSP: the five pages still without a policy

why now   — stage 2 put the strict policy on 199 of 204 routes: every preview frame now runs
            same-origin files (lib/core/frame-agents.mjs) and the sandboxes load through a shell
            (lib/packages/sandbox-shell.mjs). Five routes still carry none, each printed by every
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
            OFFLINE (every policy page that opens a draw frame): the frame loads the sandbox shell, a
            navigation the service worker does not answer for a sandboxed frame. Firefox loads it
            from its HTTP cache once the page was seen online; Chrome 153 does not load it offline at
            all, even served immutable (measured 2026-11-22 against main, which drew it). The owner
            accepted the gap for #3307 on condition the visitor is told. draw-host.ts fails a shell
            with no hello in 2 s offline: in Firefox, Mermaid then draws from the page's own copy;
            function-plot, whose fallback the policy refuses (it compiles code), shows "Offline,
            this browser can't open this diagram. Reconnect to draw it." (Mermaid offline in Chrome
            153 fails on main too.) Not covered: a network that is connected but reaches nothing
            (navigator.onLine stays true), where the old 30 s wait applies. Pages without a policy
            keep srcdoc and are unaffected.
where     — docs/src/components/studio/export/deck-export.js and
            docs/src/components/studio/player-prune-browser.ts (frame);
            lib/core/pdf-compose/font-subset.mjs and docs/src/components/studio/export/calco-font-host.js
            (eval); docs/src/playground/voice-model.js and kokoro-worker.js (network).
done when — FRAME: the player's runtime is a same-origin file in the capture and prune frames, or
            those frames load through the sandbox shell. EVAL: the subsetter runs in a same-origin
            worker (measured 2026-11-17: a worker loaded from our origin inherits no policy and
            `new Function` runs in Chromium, WebKit and Gecko). NETWORK: the hosts kokoro-js and
            the Studio's on-device models reach are measured on a real load and named in
            ORIGIN_DIRECTIVES, and esm.run leaves OPEN_ORIGINS.
            OFFLINE: a function-plot frame opens offline in Chrome and Firefox (the sandbox needs no
            navigation, or one the browser serves offline), and OFFLINE_SHELL_MESSAGE goes.
            Then csp.mjs exempts nothing and MIN_POLICY_PAGES is 204.
known     — four limits the stage-2 review lenses found (PR #3307), each for the stage that
limits      meets it:
            STUDIO IMAGES: a static policy fixes img-src when the page loads, and a preview frame
            inherits it, so a deck's per-deck web-image consent cannot widen it later. The FRAME
            stage must carry the consented hosts some other way (the frame's own policy, or the
            shell) before /studio/ gets a policy, or a consented web image stays blocked.
            FIREFOX ORIGINS: Gecko does not match a service worker's 'self' (csp.mjs selfOrigins), so
            the policy names its origins. A build names the canonical site, the PR-preview wildcard
            when GITHUB_HEAD_REF is set, and --self-origin; any other host the same build is served
            from (another alias, a local port) loads no fonts in Firefox until it is named.
            RUNNER DEADLINE: the code-package runner's ready deadline now includes the shell's
            network load, so a slow first load can spend part of it.
            SHELL PATH: the code-package runner's shell is driven by unit tests and by direct probes
            in all three engines, not by an e2e test through the Studio's package consent.
evidence  — `node docs/scripts/csp.mjs --check` prints the five and their reasons; the stage-2
            measurements are in the decision note §2.
verify    — `npm run build`, then `npx playwright test e2e/site-csp.spec.ts` on the six projects
            (desktop, tablet, mobile, webkit-phone, webkit-tablet, gecko), with Calco's export and
            the Studio's export driven under the policy.
