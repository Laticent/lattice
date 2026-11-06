---
origin: 3048
priority: P10
recorded: 2026-11-06
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §4
deferred: large — five document builders (Stage, Print and export via buildSrcdoc, the assembled player, Read Article in the page itself) each need their own nonce plumbing, and the CLI export shares the policy kernel
source: https://github.com/Laticent/lattice/pull/3048
---
# A nonce script-src on the six other surfaces that render a deck

why now   — the Studio preview frame refuses any script without its nonce (lifecycle note §4,
            "The second wall"). The six other same-origin surfaces still rest on the sanitizer
            alone: byok-key-isolation-surfaces.spec.ts goes red on every one of them with its
            sanitizer call removed.
where     — stage-window.js buildStageDoc; deck-preview.js buildSrcdoc; share-export.ts and
            lib/export assemblePlayer; ReadArticle.tsx (in-page, so a page-level policy, or a frame);
            the Library scene art (in-page innerHTML).
done when — byok-key-isolation-surfaces.spec.ts stays green on each surface with its sanitizer
            call removed, as byok-key-isolation.spec.ts does for the Studio preview.
evidence  — the red-arm run, per surface.
verify    — tier 2 trio: a CSP mistake breaks every export.
