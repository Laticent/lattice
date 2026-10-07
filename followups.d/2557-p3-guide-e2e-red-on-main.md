---
origin: 2557
priority: P3
recorded: 2026-10-06
---

# Three Guide e2e specs fail on main: the hand gestures per sentence and never varies its verb

why now   — found while driving the Studio's Guide for #2557's pre-merge card. The same three
            specs fail, with the same messages, on main (Studio E2E dispatch run 37535772081,
            0287591) and on #2557 (run 37535768965), so the PR did not cause them:
            - `e2e/present-delivery.spec.ts:107` "somber focuses the figure": the focused bullet
              is "Hiring continued on plan across every team.", not the `$48.6M` one.
            - `e2e/present-guide.spec.ts:278` "one gesture per BLOCK": four `underline` bursts
              (≈2.2 s, 4.6 s, 7.5 s, 10.3 s), one per sentence, where the spec allows two.
            - `e2e/present-guide.spec.ts:310` "the vocabulary varies": every gesture is
              `underline` across three different shapes.
            The nightly workflow's e2e job passes with these red, so nothing has flagged them.
where     — the Guide's cue planner and gesture classifier (`docs/src/lib/vetrina/`, `stage.ts`
            and the deictic/rhythm modules) and the Present dialog's delivery modes.
done when — the three specs pass on main, or each is rewritten because the owner changed the
            behavior it pins; and the e2e job fails on a red spec instead of passing.
evidence  — a Studio E2E dispatch run of those three specs, green, on main.
verify    — tier 1 checker.
