---
origin: 3043
priority: P2
recorded: 2026-11-05
updated: 2026-11-06
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
            - studio-warm-offline.spec.ts:80: the starter deck's only math is inside inline code, so the warm-up rightly
              never fetches KaTeX; the test needs a deck with real math. (:132 is diagnosed below.)
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
            - tablet and mobile projects: not re-run this session.
done when — `npx playwright test --project=desktop --project=tablet --project=mobile` on a fresh cloud session of `main`
            ends with 0 failed, or each remaining test skips with a stated reason the sandbox cannot meet.
evidence  — the full-suite summary line before and after, on `main`.
verify    — tier 1, self-review with the gates.
