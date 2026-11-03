---
origin: 3004
priority: P2
recorded: 2026-11-03
area: website
severity: medium
swimlane: followups.d/2959-p3-mac-edit-menu-undo-after-reload.md
deferred: off-path — WebKit's undo command on the iPad Simulator, not the probes' editor-pane race #3004 fixes; main's nightly logged the same failure (41301950082)
source: https://github.com/Laticent/lattice/pull/3004
---

# On the iPad Simulator, WebKit's undo command sometimes raises no historyUndo

why now   — `ios-safari-undo` failed on the iPad at 6d3250c (run 41562206550): "WebKit undo command raised
            historyUndo (Edit → Undo, shake and three-finger swipe send this): no beforeinput". The deck went
            in and the typed word landed as its own step; then `document.execCommand('undo')` raised no
            `beforeinput` at all. The iPhone and macOS sessions in the same run passed, with the event and
            `prevented true`. main's nightly 41301950082 failed the same check on the iPad, so this predates
            #3004. In passing iPad runs undo is enabled within 5 ms; whether it was enabled here is unknown,
            because the failure message did not carry the event log until 3004's last commit added it.
where     — docs/scripts/ios-safari/undo-probe.js `command()` and the historyUndo step; the Studio's
            beforeinput handling for history (docs/src/lib/filo, the editor's undo bridge).
done when — the cause is named from the event log the failure now prints (undo never enabled, enabled but
            no event, or an event the editor swallowed), and the iPad passes in 5 of 5 dispatched runs.
evidence  — the failing run's message with its events; five green ios-safari-undo dispatches.
verify    — platform-suites.yml dispatch, suites=ios-safari-undo
