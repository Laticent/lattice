---
origin: 3043
priority: P2
recorded: 2026-11-05
updated: 2026-11-06
area: infra
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: off-path — 25 of the 45 desktop reds measured on main (8a755f69) on 2026-11-06 are fixed on branch claude/plugin-patterns-d2-ghtybq (all stale test oracles or a test reading state too early); the ones left each need their own owner call (a design contract, a budget, a premise), and none is caused by that branch
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
left      — each needs a decision, not a test edit:
            - playground-kpi-pill.spec.ts:53 ×3: the test writes pills as bare backticks, which the pills plugin no
              longer reads (`{…}` now); with `{…}` the ground is opaque, but its "ink equals border" rule contradicts
              the current status mark (white ink on a status fill, status rim). A design-contract call.
            - playground-paint.spec.ts:230: the first-paint snapshot is 122,947 units against 122,880, a real 67-unit
              overrun; the budget is not loosened (HARD RULE #14).
            - studio-warm-offline.spec.ts:80: the starter deck's only math is inside inline code, so the warm-up rightly
              never fetches KaTeX; the test needs a deck with real math. :132: the offline Mermaid fence is never found
              (may touch D2's draw path; not investigated).
            - venue-fixed-size.spec.ts:104: a real defect, filed on its own (followups.d/*-new-slide-covers-clip-notice.md).
            - deck-register-gap.spec.ts:99: red only under full-suite load; 0 of 8 runs at 4 workers. Cause unknown.
            - not investigated: anima-motion-frames:247 (1228 > 1000), gallery-preview-metamorphic:370 (7 preview
              documents > 4), mermaid-cache-bindings:143 (hover timeout; also red on gecko/webkit-tablet),
              playground-first-paint:990 (null `hasAttribute`), studio-instant-shell:252 (3-4 px > 2 px), visual:37,
              workspace-backup-size:85 (0 of 10 reference docs restored).
            - passed on a re-run with no change, so red only under the full run's load (cause unknown, HARD RULE #32):
              lenses-landing:33, library-header-search:19, stage-window:335, studio-map-posters:87,
              supplied-page-position:18.
            - tablet and mobile projects: not re-run this session.
done when — `npx playwright test --project=desktop --project=tablet --project=mobile` on a fresh cloud session of `main`
            ends with 0 failed, or each remaining test skips with a stated reason the sandbox cannot meet.
evidence  — the full-suite summary line before and after, on `main`.
verify    — tier 1, self-review with the gates.
