---
origin: 3004
priority: P2
recorded: 2026-11-03
area: website
severity: medium
swimlane: followups.d/2959-p3-mac-edit-menu-undo-after-reload.md
deferred: blocked — cause unknown for both shapes: the iPad undo (also on main's nightly 41301950082) and the iPhone redo (not yet seen on main, whose runs carried no event log); the probe was ruled out, Studio and WebKit not yet separated
source: https://github.com/Laticent/lattice/pull/3004
---

# On the iOS Simulator, WebKit's undo or redo command sometimes raises no history event

why now   — `ios-safari-undo` failed on the iPad at 6d3250c (run 41562206550): "WebKit undo command raised
            historyUndo (Edit → Undo, shake and three-finger swipe send this): no beforeinput". The deck went
            in and the typed word landed as its own step; then `document.execCommand('undo')` raised no
            `beforeinput` at all. The iPhone and macOS sessions in the same run passed, with the event and
            `prevented true`. main's nightly 41301950082 failed the same check on the iPad, so this predates
            #3004. In passing iPad runs undo is enabled within 5 ms; whether it was enabled here is unknown,
            because the failure message did not carry the event log until 3004's last commit added it.
            A second shape at 273f9f2 (run 41568447188), now with the event log: on the iPhone, undo worked
            ("undo: enabled true after 61 ms, beforeinput:historyUndo, prevented true"), but WebKit's redo never
            became enabled ("redo: enabled false after 3033 ms"), so execCommand('redo') had nothing to send. Preventing
            the undo is not the cause on its own: every passing session, the iPhone included, shows the same
            `prevented true` and then redo enabled within 0 to 4 ms (one outlier at 751 ms). Something intermittent
            leaves redo disabled; whether a person's shake-to-redo then reaches the Studio is the open question.
where     — docs/scripts/ios-safari/undo-probe.js `command()` and the historyUndo step; the Studio's
            beforeinput handling for history (docs/src/lib/filo, the editor's undo bridge).
done when — the cause is named for both shapes from the event log the failure now prints (never enabled,
            enabled but no event, or an event the editor swallowed), and both devices pass in 5 of 5 dispatched runs.
evidence  — the failing run's message with its events; five green ios-safari-undo dispatches.
verify    — platform-suites.yml dispatch, suites=ios-safari-undo
