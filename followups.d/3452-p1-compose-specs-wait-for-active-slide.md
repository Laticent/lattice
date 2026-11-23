---
origin: 3452
priority: P1
recorded: 2026-11-23
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: off-path — five other specs; none was seen failing, and each owes its own HARD RULE #34 runs
source: https://github.com/Laticent/lattice/pull/3452
---

# Five compose specs click into a slide and act before it is the active one

why now   — #3452 found the race in compose-insert-menu.spec.ts: a click moves the caret at once,
            but the `cs-slide-active` decoration (ComposeView.tsx), and with it the slide bar and
            its controls, follows a moment later. A spec that reaches for the active slide's
            controls straight after the click can get the slide the caret just left. Under
            `--workers=4` that spec failed 3 runs in 90; `caretInto(slide)` in
            docs/e2e/compose-insert.ts fixed it (90 of 90).
where     — the same click-then-act line, `.cs-slide-content p').first().click()`, in
            docs/e2e/compose-empty-deck.spec.ts, compose-fenced-code.spec.ts,
            compose-image.spec.ts, compose-pill-editor.spec.ts and compose-spark-editor.spec.ts.
done when — each spec either uses `caretInto(slide)` (or waits for `cs-slide-active` itself) before
            it touches the active slide's controls, or a line in the spec says why it does not need
            to (it never reads the active slide).
evidence  — per spec changed: a run that goes red without the wait (or reasoning why the race
            cannot occur there), `--repeat-each=10` alone, and `--workers=4 --repeat-each=5`.
verify    — `cd docs && npx playwright test e2e/compose-<name>.spec.ts --project=desktop --workers=4 --repeat-each=10`
