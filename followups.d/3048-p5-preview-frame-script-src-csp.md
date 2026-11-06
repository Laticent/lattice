---
origin: 3048
priority: P5
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §4
deferred: large — the runtime and Mermaid scripts the frame needs must first be allowed by hash or nonce, across every preview builder
source: https://github.com/Laticent/lattice/pull/3048
---
# Give the preview frame a script-src that refuses inline event handlers

why now   — the slide sanitizer is the only thing between a shared deck and the
            author's OpenRouter key: the frame is same-origin, unsandboxed, and its CSP
            has no script-src. Unguarded, four inline-handler vectors read a canary key
            (PR #3048). A script-src without 'unsafe-inline' would stop those even if the
            sanitizer regressed. The inversion pass in #3048 recommended it.
where     — lib/core/subresource-csp.mjs (the policy); docs/src/playground/single-slide-render.ts
            srcdoc(); lib/runtime/index.js (sets onload/onerror as properties, which CSP allows).
done when — the frame CSP carries a script-src that admits the runtime and Mermaid by
            hash or nonce and refuses inline handlers, and byok-key-isolation.spec.ts
            stays green with sanitizeOnce disabled.
evidence  — the isolation spec passing with the sanitizer removed.
verify    — tier 2: the adversarial trio, since a CSP mistake breaks every preview.
