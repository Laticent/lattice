---
origin: 3273
priority: P2
recorded: 2026-11-17
area: website
severity: medium
swimlane: engineering/decisions/2026-11-17-compose-empty-deck.md §1
deferred: large — a new iOS Simulator probe step that empties a deck inside real Mobile Safari through WebDriver, iterated by ~20-minute macOS dispatches; PR 3273's raise loop had spent its three rounds
source: https://github.com/Laticent/lattice/pull/3273#issuecomment-6945732329
---

# A real tap on an empty deck's canvas puts the caret on the line in Mobile Safari

why now   — PR 3273's pre-merge card stopped at HIGH on this one claim: on a phone, a tap on the empty Compose canvas (outside
            the start grid's controls) calls `focusEmptyLine()` from the tap's click and should raise the keyboard. Only
            Playwright's WebKit and a 390px Chromium window ran it; iOS Safari treats a programmatic focus inside a tap its own way.
where     — docs/scripts/ios-safari/run.mjs (`composeTouchTap` already sends a real WebDriver touch), a new step after it;
            docs/src/components/studio/StudioShell.tsx `[data-start-grid]` onClick; ComposeView.tsx `focusEmptyLine`.
done when — the ios-safari-studio-iphone suite empties a deck in real Mobile Safari, sends a WebDriver touch on the start grid's
            background, and checks the editor holds focus with the caret in the empty line (the visual-viewport shrink recorded
            as a detail, since a simulator with a hardware keyboard shows none); the step goes red when the onClick is removed.
evidence  — PR 3273 card: "not run — iPhone keyboard on tap"; checker rounds 2 and 3 named this as the raise path.
verify    — dispatch platform-suites.yml with suites=ios-safari-studio-iphone on the branch; read the step in the result.
