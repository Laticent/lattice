---
origin: 3022
priority: P2
recorded: 2026-11-03
area: engine
severity: medium
swimlane: engineering/decisions/2026-11-03-security-findings-spine.md §Phasing
deferred: large — four phases (S0 to S3), each its own change with its own differential; this PR is the decision note only
source: https://github.com/Laticent/lattice/pull/3022
---

# Build the security spine: one policy table, lint warns from source, the renderer blocks

why now   — The owner answered D1 to D5 on 2026-11-03. `lint:deck` has no security rule today, and the facts
            it needs live privately inside `remote-ref.js` (the fetch attribute sets) and
            `sanitize-slide-html.mjs` (the strip list), where only the renderer can read them.
where     — new lib/core/content-policy.js; remote-ref.js and the sanitizers import from it; lint-core.js gains
            the rules; tools/check-ownership.js gains the census rule. The note's §Phasing.
done when — S0: the table exists and the renderer reads it, byte-identical on the corpus. S1: lint warns on
            Markdown web addresses. S2: lint warns on raw HTML and CSS, with lintCoreGz raised by the measured
            amount. S3: the census rule fails on a private reader or a private copy of a list.
evidence  — per phase, as the note's table says; S2's differential (lint warns on exactly what the renderer
            blocks, both run independently on seeded markup) is the acceptance test.
verify    — tier 2 trio for S0 and S2 (they touch the sanitizer's inputs); maker-checker for S1 and S3.
