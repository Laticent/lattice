---
origin: 3043
priority: P2
recorded: 2026-11-05
updated: 2026-11-21
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: off-path — what is left is the WebKit and Gecko items, which another session owns, and deck-register-gap, which #3307 owns; no Chromium red remains on main
source: https://github.com/Laticent/lattice/pull/3043
---

# e2e tests red in the cloud sandbox, on `main` as well: what is left

state     — 2026-11-06 a full desktop run on `main` 8a755f69 ended 1,227 passed, 45 failed. PRs #3057, #3087, #3102,
            #3150, #3164 and the 2026-11-12 flaky-e2e branches (shell, export, render, compose) fixed most of them at their
            causes, each with its evidence in that PR; the last of those fixes is kept below.
open      — deck-register-gap.spec.ts:99 (desktop): red only under full-suite load, 0 of 8 runs at 4 workers, cause
            unknown. #3307 owns it.
            WebKit and Gecko, the paragraphs below (another session owns those projects).
cleared   — 2026-11-21, branch claude/chromium-e2e-flake-triage, on main 450df6d with a fresh `build:e2e`, the desktop,
            tablet and mobile projects, --retries=0, whole spec files: 4 workers x2 and x8 under load, and 1 worker x5
            alone. Every Chromium item still listed here passed every run, so each is stale:
            playground-first-paint:990, stage-window:335, studio-map-posters:87, supplied-page-position:18,
            plugin-inline-ui:170 (mobile), chat-library-assets:251 (also followups 3080-p3, deleted with it),
            deck-drop-import:234, lenses:21.
            present-beat:231 (now :239, the `pace: deliberate` test) took 55 to 64 s under load against a 60 s limit,
            because it walked the fake clock one frame at a time (shape F4); the same branch steps it in 250 ms chunks
            where nothing is measured (median 19.6 s at 4 workers, 48 of 48), and the hold it measures still fails when
            the product's beat is shortened.
done when — every item above is fixed or deleted, and a full run of all projects on a fresh cloud session of `main`
            ends with 0 failed.
verify    — tier 1, self-review with the gates.

webkit    — 2026-11-08, PR #3089 (agenda fill), each run alone on the branch and on main:
            WebKit and Gecko, same day, same method (main at 234538b): 646 passed, 16 failed on the branch; 12 still red
            run alone; 9 of them red on main too (studio-read-article-charts:60 webkit-phone ×2, library-images:256
            webkit-tablet and gecko, mermaid-cache-bindings:143 ×4, library-header-search:19). The other three are
            intermittent on BOTH trees, run --repeat-each=3: playground-tab-switch:211/:260 (webkit-phone, 1 of 15 red
            on the branch, 2 of 15 on main) and plugin-returns:60 (webkit-tablet, 2 of 3 red on the branch, 3 of 3 on main).
also red  — 2026-11-11, found by PR #3088's WebKit and Gecko run of six specs, and not in this file before:
            demo-mobile.spec.ts:437 (webkit-phone, "the editor follows the typing on real WebKit too") and
            plugin-admission.spec.ts:168 (gecko, "the rail splits a `$$` block as the engine does"). Both fail the same
            way on a clean build of main 192618d with main's own specs. plugin-inline-ui.spec.ts:173 (webkit-tablet and
            gecko) failed on main and passed on the branch in the same run. Not investigated.
also red  — 2026-11-11, PR #3088's full WebKit and Gecko run (802 tests, 14 red, main 192618d compared): under
            full-suite load only, passing 3 of 3 run alone on both trees: logo-wall-equal-weight.spec.ts:27
            (webkit-phone) and plugin-placeholder-cells.spec.ts:75 (gecko). Intermittent on both trees:
            plugin-inline-ui.spec.ts:139 (webkit-tablet, 1 of 3 red alone on the branch and on main). Not investigated.
also red  — 2026-11-11, PR #3141's WebKit and Gecko run (the raise loop's evidence row; the run was stopped at its
            50-minute deadline after 604 of 830 tests): under full-suite load only, slide-bar-studio.spec.ts:35
            (webkit-tablet, "choosing a different placement does not move a border frame's heading") read the heading
            64 px right of its `top` position right after the class became `spectrum-edge-left`, then passed 15 of 15
            run alone (--repeat-each=5) on the branch and 3 of 3 on main's product code. Not patched with a poll on
            purpose: the read is a frame where the heading stood 64 px off, which may be a real jump on screen
            (engineering/jank.md), so it wants a root cause, not a wait. Also seen red on the same run and already listed
            above: library-header-search:19 (gecko, red on main's product code too), mermaid-cache-bindings:143 and
            playground-tab-switch:211. Sandbox note: the export specs need the `chromium-1194` path the docs' pinned
            Playwright names; this sandbox ships build 1243, so they fail with "Browser was not found" until that path
            points at a Chrome (a symlink made them pass, 16 of 18 with the two above).
triaged   — 2026-11-21, every WebKit and Gecko row above but library-header-search:19 (fixed, above), on main 450df6d (one `npm run build:e2e`, --retries=0): each
            test alone on its own project (--workers=1 --repeat-each=5), then under load (--workers=3 --repeat-each=8).
            None is red any more; every row below passed every run, so each is STALE and closes here:
            - studio-read-article-charts.spec.ts:62 (the old :60, webkit-phone, light and dark): 10 of 10 alone, 16 of 16 loaded.
            - library-images.spec.ts:248 (the old :256): webkit-tablet 5 of 5 and 8 of 8; gecko 5 of 5 and 8 of 8.
            - mermaid-cache-bindings.spec.ts:143 (Playground and Studio): webkit-tablet 10 of 10 and 16 of 16; gecko 10 of 10
              and 16 of 16 (fixed 2026-11-12, below; this confirms it on both engines).
            - playground-tab-switch.spec.ts:211 (its :260 is inside it, webkit-phone): 5 of 5, 8 of 8.
            - plugin-returns.spec.ts:60 (webkit-tablet): 5 of 5, 8 of 8.
            - plugin-admission.spec.ts:176 (the old :168, gecko): 5 of 5, 8 of 8.
            - plugin-inline-ui.spec.ts:173 (webkit-tablet and gecko) and :139 (webkit-tablet): 5 of 5 and 8 of 8 on each.
            - logo-wall-equal-weight.spec.ts:27 (webkit-phone): 5 of 5, 8 of 8.
            - slide-bar-studio.spec.ts:35 (webkit-tablet): 5 of 5, 8 of 8. Its one miss was in a full-suite run, heavier
              than this; the 64 px read is still unexplained, so a red seen again should keep its trace.
            - demo-mobile.spec.ts:444 (the old :437, webkit-phone): 5 of 5, 8 of 8 (fixed 2026-11-12 in the touch PR).
            - plugin-placeholder-cells.spec.ts (gecko, every test): 60 of 60 alone; loaded, 95 of 96, then 72, 72 and 120
              of 120 (the last at --workers=4 --repeat-each=10), so 359 of 360. The one red was "Target page, context or
              browser has been closed" inside `gotoStudio`'s first-paint wait, with no assertion and no test-timeout
              line; its trace was overwritten before it was read, and it did not come back. Not changed: there is no
              cause to fix without a failure body.

fixed     — 2026-11-12, branch claude/flaky-e2e-render, each at its cause, with a failing arm, 10 runs alone and loaded runs
            (numbers in that PR):
            - playground-kpi-pill.spec.ts ×3: rewritten to the status-mark contract (2026-10-24-status-is-one-system.md):
              `{…}` pills, opaque status fill, one `--on-mark` ink, the drawn mark, the role border, the rim at 3:1.
            - anima-motion-frames.spec.ts:247: a `non-scaling-stroke` mark scales anime's dash lengths; the test now
              asserts the mid/end ratio, not `< 1000`.
            - mermaid-cache-bindings.spec.ts:143 ×2 (all engines): the draw shim moves `title` into `data-lattice-tip`;
              the test finds the node by its class.
            - studio-warm-offline.spec.ts:132 (now :136): a product defect, not the warm-up list. serve-dist.ts lacked the
              CORS header the draw frame needs, and offline the draw host's own chunks failed without falling back; the
              diagram now falls back to the page's Mermaid in the same preview (engineering/gotchas/mermaid.md).
            - plugin-inline-ui.spec.ts:139 and :173 (every project): a product race, the `@` menu returned nothing until
              the lazy lint core landed (`withLazyInlineCore`).
            - plugin-admission.spec.ts:168: `image` (#3114) joined the plugins; the expected list is read from the
              manifests.
            - lenses-landing.spec.ts:33 (load only): Present attached its keyboard in a passive effect, after paint, so an
              Escape on a later open could land before it; now a layout effect. 2 of 20 under load before, 20 of 20 after.
            - read-article-beacons.spec.ts:94 (load only, now :103): `server.close()` waited for the browser's keep-alive
              connections; it closes them first. 2 of 10 under load before, 10 of 10 after.
