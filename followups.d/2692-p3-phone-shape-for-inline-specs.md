---
origin: 2692
priority: P3
recorded: 2026-10-14
area: infra
severity: low
swimlane: engineering/decisions/2026-09-28-segno-unified-inline-notation.md
source: https://github.com/Laticent/lattice/pull/2692
---

# Give the other three inline e2e specs a phone case, as inline-pill-grammar.spec.ts now has

why now   — #2692 found that inline-code-register.spec.ts (the toggle test) and plugins-tab.spec.ts
            (all three widths) fail under any phone device profile, on WebKit and on Chromium
            alike: they click the editor and read the preview side by side, and a phone shows
            Edit and Explore as tabs. Only the pill-grammar spec gained a `@webkit-phone` case,
            so the deck-settings toggle and the Plugins tab have no phone-layout coverage.
where     — docs/e2e/inline-code-register.spec.ts and docs/e2e/plugins-tab.spec.ts: lift each
            body into a function with a `phone` flag, as `drivesTheGrammar` does in
            inline-pill-grammar.spec.ts, and add a `@webkit-phone` test that switches tabs
            (Edit to type, Explore to look) before each assertion.
done when — the new cases pass under `--project=webkit-phone` with WebKit installed into a scratch
            PLAYWRIGHT_BROWSERS_PATH (see #2692's PR body for the install steps), and the
            desktop project still runs only the desktop cases.
evidence  — the run output for both projects, in the PR body.
verify    — tier 0 gates: tests only, no shipped code.
