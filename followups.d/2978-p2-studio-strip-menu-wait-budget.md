---
origin: 2978
priority: P2
recorded: 2026-10-30
area: website
severity: medium
swimlane: engineering/gotchas/ci.md
deferred: off-path — a Studio test #2978 does not touch; it ejected #2978 from the merge queue once
---

# Give the Studio strip menu's wait an explicit budget

why now   — `studio.controls.test.tsx` › "with nothing changed since, the strip's Undo is the editor's own undo…"
            failed in #2978's merge-queue run (40973152007): `Unable to find role="menuitem" and name /^Delete/`.
            On the same merge commit the file passes 73/73 alone, and it passed on the PR's own CI. It is
            the cold-boundary class in engineering/gotchas/ci.md: `stripAction` waits for the slide menu on
            Testing Library's 1000 ms default, which a loaded runner can miss.
where     — `docs/src/components/studio/studio.controls.test.tsx`, `stripAction`:
            `await screen.findByRole('menuitem', { name }, { timeout: 5000 })`. Check the other waits that
            open the strip menu first in a case for the same exposure.
done when — Every first wait on the strip menu carries an explicit budget, and the file passes 5 runs in a
            row under 2x CPU oversubscription.
evidence  — The 5 loaded runs, green, with the load command in the PR body.
verify    — tier 0 gates, because it is a test-only wait.
