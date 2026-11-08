---
origin: 3087
priority: P5
recorded: 2026-11-08
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — none touches the Studio warm-up this PR changes; each fails the same way on main d1a4704
source: https://github.com/Laticent/lattice/pull/3087
---

# Untracked e2e reds on gecko and webkit-phone, all also red on main

why now   — PR 3087 ran the full `mobile`, `webkit-phone` and `gecko` projects (--retries=0) against its
            build and re-ran every failure against main d1a4704's build. These fail on main too and are
            not in followups.d/3043-p2-e2e-desktop-30-red-in-sandbox.md (which already holds visual:37,
            ios-zoom:65, library-header-search:19 and the gecko mermaid-cache-bindings:143 pair):
            - webkit-phone · studio-read-article-charts.spec.ts:60, light and dark — red every run.
            - gecko · draw-frame-preview.spec.ts:297 — red on main.
            - gecko · library-images.spec.ts:256 (@smoke) — red on main.
            - gecko · stage-placement.spec.ts:186 — red on main.
            - gecko · slide-bar-studio.spec.ts:59 — flaky: 1 of 3 red on main and on the branch.
where     — the specs named above; each names its surface.
done when — each passes with --retries=0 on a real build, five runs in a row, or is fixed at its cause
            (HARD RULE #32); a flake is never retried green.
evidence  — per spec, the failing assertion and the fix's before/after run counts.
verify    — npx playwright test <spec> --project=<project> --retries=0 --repeat-each=5.
