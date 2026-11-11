---
origin: 3043
priority: P2
recorded: 2026-11-05
updated: 2026-11-09
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: off-path — PR #3057 fixed the 25 reds that were stale tests or early reads; each one left fails the same way on a clean main checkout (867e0fff) and is either an app regression main introduced (#3048/#3054), a budget or design-contract decision, or a broken test premise; none is caused by #3057, and their fixes belong to the owners of those surfaces
source: https://github.com/Laticent/lattice/pull/3043
---

# Desktop e2e tests still red in the cloud sandbox, on `main` as well

state     — 2026-11-06, `main` at 8a755f69, a fresh cloud session: the suite could not START (the sandbox ships Chromium
            build 1243, @playwright/test 1.56.1 wants 1194; globalSetup now installs 1194). Then a full
            `npx playwright test --project=desktop` ended 1,227 passed, 45 failed, 19 skipped (1.4 h, 2 workers).
fixed     — on branch claude/plugin-patterns-d2-ghtybq, each a stale test or an early read, no app change: the export
            toasts carry the size ("PDF ready (29 KB)."); print-frame locators match the draw host's frame too (now by
            width); Compose caret walks raced `selectionchange` (`caretSettled`, docs/e2e/studio-fixture.ts); the Fast
            (JPEG) test needs the photo writer (#2985); the hidden Print drawer test counted the pool's release; two
            strict-mode duplicates; the raster marker's pill moved into its berth; one `logo:` copy since #3023; the
            add-slide confirmation moved into the New slide button.
after     — the full desktop run on the branch, with main at 867e0fff merged in: 1,256 passed, 23 failed, 20 skipped
            (1.2 h). Three of the 23 are new on main since 8a755f69 (#3048, #3054 changed the Studio), not this branch:
            they fail run alone, and still fail with main's own studio-fixture.ts: blank-slide-editors.spec.ts:56,
            strip-keyboard.spec.ts:51, strip-menu.spec.ts:106. Not investigated. Three more passed run alone
            (compose-pill-editor:259, plugin-inline-ui:170, read-article-beacons:94), so they join the load list below.
left      — each needs a decision, not a test edit:
            - playground-kpi-pill.spec.ts:53 ×3: the test writes pills as bare backticks, which the pills plugin no
              longer reads (`{…}` now); with `{…}` the ground is opaque, but its "ink equals border" rule contradicts
              the current status mark (white ink on a status fill, status rim). A design-contract call.
            - playground-paint.spec.ts:230: the first-paint snapshot is 122,947 units against 122,880, a real 67-unit
              overrun; the budget is not loosened (HARD RULE #14).
            - studio-warm-offline.spec.ts:80: FIXED in #3087. The starter deck's only math is inside inline code, so the
              warm-up rightly never fetched KaTeX; the test now seeds a deck with real math. (:132 is diagnosed below.)
            - venue-fixed-size.spec.ts:104: a real defect, filed on its own (followups.d/*-new-slide-covers-clip-notice.md).
            - deck-register-gap.spec.ts:99: red only under full-suite load; 0 of 8 runs at 4 workers. Cause unknown.
            - measured 2026-11-06, each run alone (--workers=1), each red every time, with its first error, and EVERY ONE
              of them, with the ones above, also red on a clean checkout of main 867e0fff (its own docs build; 15 failed,
              14 passed). The three marked (main) were green at 8a755f69, so a commit on main between the two broke them
              (#3048 or #3054 touched the Studio):
              - (main) strip-keyboard.spec.ts:51: Mod+D on a focused strip slide duplicates nothing (order stays
                "Alpha Bravo Charlie Delta"); the handler is StudioShell.tsx `runStripShortcut`.
              - (main) strip-menu.spec.ts:106: "New slide after" from the strip menu, a `toMatch` on the source.
              - (main) blank-slide-editors.spec.ts:56: the Markdown editor's deck reads 0 units where 3 are expected.
              - anima-motion-frames.spec.ts:247: the mid frame's drawn length is 1228, past the test's 1000.
              - mermaid-cache-bindings.spec.ts:143 (Studio and Playground): the drawn flowchart node is never hoverable
                (hover / dispatchEvent time out); also red on gecko and webkit-tablet. Touches D2's draw path.
              - studio-warm-offline.spec.ts:132: offline, the Mermaid fence settles `error`, not `rendered`. Likely cause,
                not yet confirmed: since D1 the preview draws Mermaid in the sandboxed draw frame from its ES module graph
                (`frames/mermaid/*.mjs`), but the Studio warm-up (studio-warm.ts → lib/plugins/drawn-library.mjs
                `drawnLibraryUrls`) still caches only the in-page `mermaid.min.js`, so offline the frame has nothing to
                import. A real offline defect in the plugin-patterns swimlane's preview path, which predates PR #3057.
              - playground-first-paint.spec.ts:990: the newcomer bake's element is null (`hasAttribute` of null).
              - studio-instant-shell.spec.ts:252: shell and app slide widths differ by 4 px (1440) and 3 px (390) against
                a 2 px tolerance.
              - visual.spec.ts:37: the Studio screenshot differs from its committed baseline.
              - workspace-backup-size.spec.ts:85: a 67 MiB backup restores 0 of its 10 reference docs.
            - passed on a re-run with no change, so red only under the full run's load (cause unknown, HARD RULE #32):
              lenses-landing:33, library-header-search:19, stage-window:335, studio-map-posters:87,
              supplied-page-position:18, compose-pill-editor:259, plugin-inline-ui:170, read-article-beacons:94.
            - tablet and mobile, the full projects on the branch: 292 passed, 6 failed, 27 skipped (17.2 m). Each of the
              6 is main's, measured on a clean checkout of main 867e0fff: visual.spec.ts:37 (tablet and mobile),
              ios-zoom.spec.ts:65 and plugin-inline-ui.spec.ts:170 (mobile) fail there every run;
              compose-soft-break.spec.ts:22 and :50 (mobile) are FLAKY there, 3 of 6 runs failing with the editor's
              source lacking the typed lines (on the branch, 40 runs each: 18 failed with its studio-fixture.ts, 16 with main's, so the fixture does not
              worsen it).
              A flaky test is fixed at its cause (HARD RULE #32); not investigated here.
done when — `npx playwright test --project=desktop --project=tablet --project=mobile` on a fresh cloud session of `main`
            ends with 0 failed, or each remaining test skips with a stated reason the sandbox cannot meet.
evidence  — the full-suite summary line before and after, on `main`.
verify    — tier 1, self-review with the gates.

2026-11-08 — measured on PR #3089 (agenda fill), against a clean main at 1ba5779, desktop project, run alone: the
            same 16 tests red on both trees, so none is the PR's. New to this list: chat-library-assets.spec.ts:251
            ("the cost readout rises by a few tenths of a cent when the Library gains photos") is red on main too. Not
            investigated. compose-soft-break.spec.ts:50 failed twice under full-suite load and passed 6 of 6 run alone
            (--repeat-each=3), so it joins the load list.
            WebKit and Gecko, same day, same method (main at 234538b): 646 passed, 16 failed on the branch; 12 still red
            run alone; 9 of them red on main too (studio-read-article-charts:60 webkit-phone ×2, library-images:256
            webkit-tablet and gecko, mermaid-cache-bindings:143 ×4, library-header-search:19). The other three are
            intermittent on BOTH trees, run --repeat-each=3: playground-tab-switch:211/:260 (webkit-phone, 1 of 15 red
            on the branch, 2 of 15 on main) and plugin-returns:60 (webkit-tablet, 2 of 3 red on the branch, 3 of 3 on main).
also red  — 2026-11-09, found by PR #3102's full desktop run and not in this file before: architect.spec.ts:53, :157,
            :225 and :273 (the offline Coach and Chat turns, #1813), and studio-jargon-alignment.spec.ts:258 ("clicking
            into a slide previews THAT slide"). Each fails run alone, in three runs out of three, and fails the same way on a
            clean build of main 756c1ff with main's own specs. Not investigated.
also red  — 2026-11-11, found by PR #3088's WebKit and Gecko run of six specs, and not in this file before:
            demo-mobile.spec.ts:437 (webkit-phone, "the editor follows the typing on real WebKit too") and
            plugin-admission.spec.ts:168 (gecko, "the rail splits a `$$` block as the engine does"). Both fail the same
            way on a clean build of main 192618d with main's own specs. plugin-inline-ui.spec.ts:173 (webkit-tablet and
            gecko) failed on main and passed on the branch in the same run. Not investigated.
also red  — 2026-11-11, PR #3088's full WebKit and Gecko run (802 tests, 14 red, main 192618d compared): under
            full-suite load only, passing 3 of 3 run alone on both trees: logo-wall-equal-weight.spec.ts:27
            (webkit-phone) and plugin-placeholder-cells.spec.ts:75 (gecko). Intermittent on both trees:
            plugin-inline-ui.spec.ts:139 (webkit-tablet, 1 of 3 red alone on the branch and on main). Not investigated.
fixed     — 2026-11-10, the Studio startup PR, test-only (no app change), each failing alone 3 of 3 on main 50f6f4a:
            - architect.spec.ts:53, :157, :225 and :273 (the first now :60) waited for the old catch-all notice "Connect a
              model in Workspace → AI and I can answer and edit your deck." Since the model spine (#3079) the notice names
              the selection's state, and a fresh profile is `unset`: "Choose a chat model in Workspace → AI: …". One
              constant, `NO_MODEL_NOTICE`, now carries the wording. It also revives the absence check in the #1813 case
              ("deck-1's notice is showing in deck-2's transcript"), which had passed against a wording that could no
              longer appear.
            - studio-jargon-alignment.spec.ts:258 floored its skips at `[3]`, the headingless quote slide. #3095 put a
              divider before that slide, so every sampled index gained a heading and the test failed for skipping
              nothing. The floor is now the sampled slides that have no heading, read from the deck.
            Each passes alone. The same PR's full desktop run (4 workers, its own build): 1,331 passed, 22 failed, 19
            skipped; none of the five above failed. Two load-only reads it found were fixed there too, each 24 of 24
            after under 6 workers: scenarios/consultant-rebrand.spec.ts:39 read `--accent` once just after boot, when
            the boot's second render now patches the slide (it polls and keeps the polled value), and
            saved-finish-export.spec.ts (the print case) pressed Escape again on a sheet already closing.
            restyle-overlap.spec.ts was a third: its reference step returned '' while a sheet swap was in flight,
            which passed `not.toBe(from)`, and then read the old palette. The PR's restyle-after-wait made the window
            wider: 24 loaded runs per case (desktop 6 workers, webkit-phone 4), main 0 and 1 of 48, the PR 4 and 3,
            and 24 and 24 of 24 after the poll kept its own value and required a real accent.
            Four others failed only under load on BOTH builds, 6 loaded runs each, main against the PR:
            export-photo-size:26 5 and 5, deck-drop-import:234 1 and 0, present-beat:231 1 and 0, lenses:21 0 and 0
            (it failed once in the full run). Not investigated.
