---
origin: 3223
priority: P1
recorded: 2026-11-15
area: infra
severity: high
swimlane: engineering/decisions/2026-11-06-flaky-tests.md
deferred: blocked — the owner has not yet approved a branch for it
source: https://github.com/Laticent/lattice/pull/3223
---

# The iPad's Compose touch tap lands somewhere other than the point it was sent to

owner     — the session that recorded this (PR #3223's), once a branch is approved. Ref #2911, where the nightly alerts land.
why now   — `ios-safari-studio` is red on the iPad at the compose tap, and #3213's fix did not change that. Dispatch
            43760667692 (at d11b28b4f, with #3213 in): `FAIL compose tap · a touch tap puts the caret in the tapped paragraph
            ("First point" at 93,478 (held still 5 frames), gesture 739 ms, but it SELECTED "Workspace stop / Lattice Studio"
            (read as a long press); the selection sits in LEGEND "Workspace stop")`. The 2026-11-13 nightly (run 43426081919,
            iPad job 131894337170) failed the same step ("SELECTED 'point'"), and so did nightly 43712612297 on 2026-11-15.
            #3213 made the probe wait until the paragraph's box held still and `document.elementFromPoint` named it; both held,
            and Safari still selected text elsewhere. The iPhone passes the same step.
            Theory, NOT proven: on iPad Safari's desktop-mode page (it reports a Macintosh user agent, 1032 px wide), the
            coordinate WebDriver sends for a touch is not the CSS point the page reads, so the tap lands on another element.
            It is INTERMITTENT, which weakens a fixed-offset theory: dispatch 43772671900 (at aabd6b0ec) passed the same
            step on the iPad at the same point, `"First point" at 93,478 (held still 5 frames), gesture 939 ms`. The
            failures selected text as a long press (739 ms gesture) and the pass did not (939 ms), so the gesture's length
            does not decide it either. Log both coordinates on a failing run AND a passing run before naming a cause.
where     — docs/scripts/ios-safari/run.mjs (`composeTouchTap`: the point it reads, and the WebDriver touch action it sends);
            docs/scripts/ios-safari/compose-probe.js.
done when — the coordinate WebDriver sends and the point Safari actually lands on are both logged on one iPad run, the
            cause is named from that, and the fix makes the compose tap pass on the iPad in a dispatched ios-safari-studio run.
            Nothing is changed in the tap before that log exists (the coordinator's condition).
evidence  — the runs above; the next iPad run's logged sent and landed coordinates (for example a `touchstart` listener
            that records `clientX/clientY` and the target, read back after the tap).
verify    — platform-suites.yml dispatch, suites=ios-safari-studio, on the fix's branch.
