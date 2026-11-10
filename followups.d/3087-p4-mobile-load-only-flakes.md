---
origin: 3087
priority: P4
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: large — about ten load-only failures, each its own investigation; the ones PR #3102 measured against main fail there at a similar rate
source: https://github.com/Laticent/lattice/pull/3087
updated: 2026-11-10, the Studio startup PR (demo-mobile, collage-lightbox and model-spine fixed at their causes; the rest stay)
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
update    — PR #3102 ran the full `--project=mobile` suite once (4 workers, --retries=0) on its build:
            314 passed, 6 failed. Two are the known reds (ios-zoom:65, visual:37). The other four, alone,
            three runs each: collage-lightbox.spec.ts:348 and :385 (@smoke) 3/3, model-spine.spec.ts:155
            3/3, demo-mobile.spec.ts:535 2/3. So collage-lightbox:348/:385 and model-spine:155 join the
            list above. demo-mobile:535 was then run 24 times under load (repeat-each, 4 workers) against
            each build: main 3 failed, PR #3102 4 failed; 5/5 alone on both. Its failure: "the tail was
            2018px off screen for 20+ consecutive frames while typing (scrollTop 0 of 2338)", that is,
            Compose never scrolled to follow the tour's typing while the CPU was contended. That points
            at the follow mechanism starving under load, not at the test's thresholds.
            The other three, 8 runs each under the same load: main failed collage-lightbox:348 once and
            :385 once (2 of 24); PR #3102 failed collage-lightbox:348 twice and model-spine:155 once (3 of
            24). collage-lightbox is a load flake on main. model-spine:155, 16 more runs a side: 1 failed on each
            (main a `locator.check` timeout, PR #3102 a `toHaveText`), so 1 of 24 against 2 of 24: a load
            flake on main as well.
desktop   — PR #3102 then ran the full `--project=desktop` suite once (4 workers, --retries=0): 1296 passed,
            30 failed. 15 tests failed again alone, three runs each, and every one fails on main 756c1ff too.
            The other 11 pass alone: they fail only under load. Run 4 times each at 4 workers, the 10 that
            are not this PR's own spec failed 3 of 40 on main and 5 of 40 on the PR's build, on the same
            tests (gallery-preview-metamorphic:370, lenses-landing:33, chart-detail-reveal:269 on main;
            model-spine:155 once on the PR). Load-only on desktop, then: chart-detail-reveal:269,
            compose-soft-break:22, fabricate:311, filo-undo:157, gallery-preview-metamorphic:370,
            lenses-landing:33, model-spine:155, panel-shells:138, stage-window:168, status-pill:24.
fixed     — 2026-11-10, the Studio startup PR, each at its cause, 24 loaded runs per test (--project=mobile,
            --repeat-each=24, --workers=4, --retries=0), main 50f6f4a against the fix:
            - demo-mobile.spec.ts:535 (now :543), 8 failed on main, 0 after. The test's own sampler counted the
              ProseMirror view's ARRIVAL (no editor, then the whole 1,252-character welcome deck) as typing, because it
              keyed a remount on the host and the view mounts inside an existing host, later under load. It measured an
              untouched document about 17 s before the tour typed. It now keys on the view, as the CodeMirror sampler
              does. Compose's follow itself was right in every logged run.
            - collage-lightbox.spec.ts:348 and :385 (now :358 and :395), 3 and 3 failed on main, 0 and 0 after. A resize
              to a phone mounts a fresh preview frame, hidden until it reveals; the test clicked it before the reveal,
              and `tapCollageAt` rightly ignores a hidden frame. It now waits for the reveal.
            - model-spine.spec.ts:155, 1 failed on main (2 of 48 in a second run), 0 after. Two causes. An app defect:
              the chat chip named a picked OpenRouter model from the catalog once, at status read, and a catalog that
              landed later was never read again, so the chip said "Model" until opened (architect.ts
              `useArchitectStatus` now waits for the same prefetched catalog). And a test race: picking a model closes
              the popover, so `check()` could not read the radio back; it clicks and asserts the chip.
also      — 2026-11-10, same PR: demo-mobile.spec.ts:437 (`@webkit-phone`, the CodeMirror follow) fails 6 of 6 at
            `--repeat-each=6 --workers=3` on main 50f6f4a AND on the PR, with "the editor was never both overflowing and
            being typed into", and passes 3 of 3 at one worker. Not investigated. collage-lightbox.spec.ts:395 on gecko
            failed once in a 3-worker mixed run and passed 6 of 6 alone at 3 workers.
where     — the specs named above that the "fixed" entry does not name.
done when — each failure is reproduced under full-project load and fixed at its cause, or 10 full
            mobile-project runs on main pass and this file is deleted with that evidence.
evidence  — per spec, runs and outcomes under load, before and after.
verify    — npx playwright test --project=mobile --retries=0, repeated.
