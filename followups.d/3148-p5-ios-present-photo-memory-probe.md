---
origin: 3148
priority: P5
recorded: 2026-11-12
area: website
severity: medium
swimlane: engineering/decisions/2026-11-11-deferred-asset-bytes.md §5
deferred: blocked — a new iOS Simulator platform suite is a CI-contract change (CLAUDE.md, the decision filter's row 2), so it waits on the owner
---

# Measure Present on a photo-heavy deck in real Mobile Safari (iOS Simulator suite)

why now   — PR #3148's headline claim (iOS reloaded the tab because Present built a ~0.5-1.9 GB Stage document, and now
            does not) rests on Chromium heap numbers in iPhone emulation and on Playwright WebKit; the pre-merge grader held the
            card at MEDIUM for it. The simulator cannot show a jetsam reload (no limit), but it can show the WebContent
            footprint growth on opening Present, as photo-memory.mjs does for previews.
where     — docs/scripts/ios-safari/ (a `present-memory` probe beside photo-memory.mjs / photo-probe.js, driven by run.mjs),
            .github/platform-suites.json (a new `ios-safari-present-memory` suite, off pull requests like every iOS suite).
done when — the probe seeds 18 photo-sized Library images, opens Present and steps through the deck in Mobile Safari, and
            reads the WebContent footprint: growth with photos within a stated ratio of the same deck with none, and no
            slide step slower than a stated bound; run once on main and once on this change for the before/after.
evidence  — the dispatched run's summary on main and on the change.
verify    — tier 1: maker-checker; the owner approves the new suite first.
