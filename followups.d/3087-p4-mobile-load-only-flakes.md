---
origin: 3087
priority: P4
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — load-only failures that hit main d1a4704 at the same rate; none reproduces alone
source: https://github.com/Laticent/lattice/pull/3087
---

# Mobile specs that fail only under full-project load, on main and on PR 3087 alike

why now   — PR 3087 ran the full `--project=mobile` suite (4 workers, --retries=0) five times: three on its
            final build, two on main d1a4704's. Besides the known reds (ios-zoom:65, visual:37,
            plugin-inline-ui:170, all in or beside followups.d/3043-…), each run lost a different 0-3
            specs that pass alone, on both builds:
            - main: compose-soft-break.spec.ts:22 and :50, logo-wall-first-visit.spec.ts:74.
            - PR build: logo-wall-first-visit.spec.ts:74, playground-tab-switch.spec.ts:211,
              playground-deck-settings.spec.ts:110, plugin-inline-ui.spec.ts:136,
              settings-reopen.spec.ts:81, collage-lightbox.spec.ts:314.
            Counts per run: main 0 and 3; the PR's final build 3, 2 and 3. Every one tried alone passed 3 of 3
            on both builds. (demo-mobile.spec.ts:535 also failed once, on the PR's build BEFORE its quiet
            gate; it passed all three full runs after, so it is not listed.)
            A test that fails only under load still fails in CI's merge train (HARD RULE #32).
where     — the specs named above.
done when — each failure is reproduced under full-project load and fixed at its cause, or 10 full
            mobile-project runs on main pass and this file is deleted with that evidence.
evidence  — per spec, runs and outcomes under load, before and after.
verify    — npx playwright test --project=mobile --retries=0, repeated.
