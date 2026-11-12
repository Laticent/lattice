---
origin: 3159
priority: P2
recorded: 2026-11-12
area: infra
severity: medium
swimlane: engineering/decisions/2026-11-12-gecko-srcdoc-rewrite-controller.md §7
deferred: blocked — the owner's call: patch a test dependency (docs/patches), wait for upstream, or keep the gecko case fixme
source: https://github.com/Laticent/lattice/pull/3159
---

# Playwright's Firefox driver crashes when a page re-inserts an iframe

why now   — the gecko project cannot run the offline preview case reliably: 2/10 alone, 8/10 under load, every failure this crash
where     — playwright-core lib/server/frames.js FrameManager.frameCommittedNewDocumentNavigation (1.56.1 and upstream main): no guard for an unknown frameId, which its same-document twin has
done when — the lookup is guarded (a one-line patch-package patch beside docs/patches/sonner+2.0.7.patch, or an upstream release), and the case passes 10/10 on gecko alone and under load
evidence  — engineering/gotchas/browser-engine.md "Playwright's Firefox driver crashes when a page re-inserts an iframe"
verify    — the same command as 3159-p1
