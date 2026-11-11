---
origin: 3128
priority: P2
recorded: 2026-11-11
area: website
severity: medium
swimlane: engineering/decisions/2026-11-10-compose-first.md §4
deferred: off-path — the hazard is on main (ComposeView's parked-resync rule predates #3128); #3128 only stopped its own auto focus from triggering it, and the fix changes how every outside change reaches a focused Compose
source: https://github.com/Laticent/lattice/pull/3128
---

# A focused Compose in a Live session drops a co-editor's edit

why now   — ComposeView parks an outside change while it has focus and applies it on blur; a local edit
            "supersedes" the parked change (the external-source effect and `dispatchTransaction`'s emit
            branch). In a Live session the outside change is a co-editor's edit, so a guest who has clicked
            into Compose and types emits the whole deck from a doc without the host's edit. On main this needs
            a click into Compose before the host edits. #3128's smart focus took the keyboard on a mode switch
            with no click, which made filo-live.spec.ts:273 fail; #3128 skips the auto focus in a session
            (`inLiveSession` in StudioShell.tsx) and leaves the rule itself alone.
where     — docs/src/components/studio/ComposeView.tsx: `pendingResyncRef`, the external-source effect, and
            the emit branch's `pendingResyncRef.current = null`.
done when — a co-editor's change reaches a focused Compose without losing the author's caret or their
            in-flight typing (resyncFrom now keeps the caret's slide, line and column, so an immediate resync
            between keystrokes is one candidate; an IME composition must still be left alone), and a new
            filo-live case clicks into the guest's Compose BEFORE the host edits, then checks both edits survive.
evidence  — that filo-live case failing on main and passing with the fix, in Chromium, Firefox and WebKit.
verify    — filo-live.spec.ts, compose-change-flash.spec.ts and studio-pane-sync.spec.ts on all three engines.
