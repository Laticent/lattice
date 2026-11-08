---
origin: 3087
priority: P6
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-09-26-studio-panel-lazy-loading.md §Warming the fonts the first slide skipped
deferred: large — a new iOS Simulator probe and a platform-suite registry entry, iterated on macOS runners; the owner chose its own PR (#3087, D2 A)
source: https://github.com/Laticent/lattice/pull/3087
---

# Prove on real Safari that the Studio's warmed fonts are read from cache

why now   — #3087 warms 31 fonts (about 2.7 MB) after the first slide so later edits find them cached.
            The cache hit is proven on Chromium (live deploy), Firefox and Linux WebKit, not on Safari.
            If Safari misses, every iPhone visit downloads those 2.7 MB twice. The owner approved adding a
            nightly check (D2 A on #3087's decision card).
where     — docs/scripts/ios-safari/run.sh (a new PROBE), .github/platform-suites.json (one entry);
            the probe's logic mirrors the server-hit count in #3087's decision-doc section.
done when — a nightly iOS Simulator job adds an emoji, a code block and `finish: sketch` after the
            warm-up and asserts no font request reached the server; a control arm (edit before the
            warm-up) shows the requests, so the probe can fail.
evidence  — the dispatched run's log, both arms, on the PR.
verify    — workflow_dispatch platform-suites.yml with the new suite, on the PR branch.
