---
origin: 3159
priority: P5
recorded: 2026-11-12
area: website
severity: low
swimlane: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §7
deferred: blocked — filing with Mozilla and Playwright is outward-facing, so it is the owner's call
source: https://github.com/Laticent/lattice/pull/3159
---

# Report the Gecko srcdoc controller gap and the Playwright frame guard upstream

why now   — the probe in docs/src/lib/srcdoc-write.js retires itself when Gecko is fixed; a report makes that likelier
where     — Mozilla Bugzilla (Core :: DOM: Service Workers); microsoft/playwright
done when — both reports are filed (draft texts are in PR #3159's body), their links are in the decision note, and docs/patches/playwright-core+1.56.1.patch is deleted once Playwright ships the guard
evidence  — the decision note §2 table (Gecko) and engineering/gotchas/browser-engine.md (Playwright)
verify    — none: tracking only
