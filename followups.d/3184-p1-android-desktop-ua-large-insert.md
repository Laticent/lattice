---
origin: 3184
priority: P1
recorded: 2026-11-13
area: website
severity: medium
swimlane: engineering/gotchas/studio-playground.md
deferred: blocked — needs a real Android device in Chrome's "Desktop site" mode; neither the sandbox nor CI has one, and emulation sets the user agent the guard reads, so it cannot show the real behavior
---

# Android Chrome's "Desktop site" mode may defeat the large-insert guard, so a 64K+ typed insert could land twice

why now   — `takesInsert` (docs/src/components/studio/editor-large-insert.ts) steps aside on Android's Chrome because it
            ignores a cancelled `beforeinput`: applying the insertion in the editor as well would put the text in twice. The
            guard recognises Android by the user agent, and Chrome's "Desktop site" setting sends a desktop user agent with
            no "Android" token. On that setting, a typed, dictated or dropped insertion of 64K characters or more could be
            applied by the editor AND by the browser. Raised by the #3184 session; plausible, not reproduced.
where     — docs/src/components/studio/editor-large-insert.ts (`takesInsert`, the user-agent check); its unit tests.
done when — on a real Android phone with Chrome's Desktop site on, a 64K+ insertion lands exactly once; and the guard keys
            on behavior rather than the user agent (for example, after taking the insertion, confirm the browser did not
            also apply it, or detect a non-honored `preventDefault`), so the user-agent string no longer decides it.
evidence  — a screen recording or remote-debugging trace from the real device, before and after, plus a unit test of the
            behavior-based check with a failing arm.
verify    — tier 1: a checker on the guard change; the device run is the evidence (HARD RULE #23).
