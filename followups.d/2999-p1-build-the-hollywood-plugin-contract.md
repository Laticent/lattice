---
origin: 2999
priority: P1
recorded: 2026-11-01
area: engine
severity: high
swimlane: engineering/decisions/2026-11-01-plugin-contract-hollywood.md §6
deferred: blocked — waits on the owner naming who builds it (#2997's branch belongs to another session, HARD RULE #31); and large — a contract change across every plugin, the host and the structure gate
source: https://github.com/Laticent/lattice/pull/2999
---

# Build the Hollywood plugin contract as one complete PR

why now   — #2999 settled the design and the owner held #2997 for it, so the structure gate that stops
            plugin-coupling drift reaches `main` only when this lands (drift went 8 → 49 imports while
            #2997 waited).
where     — engineering/decisions/2026-11-01-plugin-contract-hollywood.md §2 (mapping), §4 (contract
            table), §5 (packages), §6 (the six commits); lib/plugins/host*.{js,mjs}, lib/plugins/resolve.js,
            lib/core/katex-wall.js, lib/authoring/lint-core.js; #2997's branch claude/codebase-structure-v2
            (cf61608) for the layering, site moves and gate.
done when — every in-tree plugin imports only its own folder and its private package.json's packages;
            lib/plugin-kit/ never exists on main; no manifest has `hostApi`; `KNOWN_API` is [1, 2] with zip
            plugins unchanged; the structure gate runs in build:check with no plugin exception and a text
            backstop; publishing @laticent/plugin-api, markup and segno has gone to the owner as a release-CI
            decision.
evidence  — every deck in examples/ and the baseline decks exported byte-identical (PDF, PPTX, HTML,
            --player) against main; lint JSON over every gallery byte-identical; the lint and editor golden
            from §3 unchanged; route budget measured; npm run bench before and after; the §8 evidence
            script showing the injection and the fail-open gate now refused.
verify    — tier 2 trio on the PR, because it moves the trust boundary (sanitizers, sandbox, HARD RULE #22)
            and changes the contract every plugin depends on.
