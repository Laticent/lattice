---
origin: 3080
priority: P3
recorded: 2026-11-08
area: website
severity: low
swimlane: engineering/development.md §Studio e2e suite
deferred: off-path — PR #3080 changes the nightly golden bless and no docs/src code; the docs site on its branch is identical to main's (4e16c2b1), so this red is main's
source: https://github.com/Laticent/lattice/pull/3080
---

# The chat cost readout does not rise when the Library gains photos

why now   — The evidence run for PR #3080 (desktop project, cloud sandbox, 2026-11-08) hit it twice: once in a
            full `--project=desktop` run, and again run alone. It is not in `3043-p2-e2e-desktop-30-red-in-sandbox.md`
            or `2959-p1-e2e-failing-on-main-in-the-sandbox.md`, the two lists of desktop e2e reds on main.
where     — `docs/e2e/chat-library-assets.spec.ts:251`, "the cost readout rises by a few tenths of a cent when the
            Library gains photos". After `addPhotos(page, PHOTOS)`, the poll at :269 waits 30 s for the readout's
            `edit` figure to rise above its starting 0.11, and it stays at 0.11.
done when — the readout counts the Library's photos and the spec passes, or the spec is changed to match a
            deliberate change to how the cost is estimated (find the commit that changed it first).
evidence  — `cd docs && npx playwright test --project=desktop --trace off e2e/chat-library-assets.spec.ts:251`:
            "Expected: > 0.11, Received: 0.11, Timeout 30000ms exceeded while waiting on the predicate".
verify    — tier 1: the command above, green, plus one full `--project=desktop` run with it green.
