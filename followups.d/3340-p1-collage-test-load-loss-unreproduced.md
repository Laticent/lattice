---
origin: 3340
priority: P1
recorded: 2026-11-20
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md §HARD RULES #33 and #34 (2026-11-12)
deferred: blocked — no reproduction: it never failed again in a deterministic replay, two full runs of the fix, or a full-load replay of the commit that failed
source: https://github.com/Laticent/lattice/pull/3340
---

# The collage test lost its Add click once under load, and the cause is unproven

why now   — `library-images-render.spec.ts:148` failed once in a full 2-worker Chromium run on 2026-11-19
            (desktop, tablet and mobile): the photo-format dialog was still open 15 s after "Add photo" was
            clicked. PR 3340 fixed the dialog growing by up to 32 px as its sizes landed, the suspected cause,
            but a deterministic replay on the build before that fix still hit the button.
where     — `docs/e2e/library-images-render.spec.ts:148`, `docs/src/components/studio/PhotoFormatDialog.tsx`,
            `engineering/gotchas/studio-playground.md` §"A click on a dialog's button lands beside it".
done when — the test fails again and the failure shows its cause, and that cause is fixed with a failing arm;
            or 30 days of nightly e2e on `main` pass it with no loss, and this file is deleted.
evidence  — PR 3340 body §Caveats: the replay that aimed while the encoder was held still hit the button; the
            full replay on `11d0d61` (2143 tests, 2.3 h) passed `:148` on all three projects.
verify    — `cd docs && npx playwright test e2e/library-images-render.spec.ts:148 --project=desktop
            --project=tablet --project=mobile --workers=2`, then a full run at 2 workers.
