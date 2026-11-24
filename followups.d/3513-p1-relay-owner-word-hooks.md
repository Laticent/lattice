---
origin: 3513
priority: P1
recorded: 2026-11-24
area: tooling
severity: medium
swimlane: engineering/workflow.md §Relay
deferred: blocked — the owner chose rules text now and the hook work after the 2026-11-29 usage reset
source: https://github.com/Laticent/lattice/pull/3513
---

# Make the command-center relay and the merge gate checkable by tools

why now   — #3513 lets the owner free branches (`release #N`) and answer decision cards in the
            command center, relayed to each session. Today the receiver checks the event by hand.
where     — .claude/hooks/owner-merge-gate.mjs; tools behind `npm run baton`.
done when — (1) a hook accepts `release #N` / `release all` only as the owner's typed turn right
            after a `🔓 Release digest`, as the merge gate does for `merge #N`;
            (2) `npm run baton -- take <branch> --relay <session> <event>` runs the four checks
            in §Relay "The owner's word, relayed" and refuses on any miss;
            (3) the merge gate reads only the end of the transcript, so a 342 MB one (the old
            #2988 session) no longer breaks it.
evidence  — each with a failing arm (a forged relay, a synthetic turn, a huge transcript).
verify    — node --test on the hook and baton tests; one real relay end to end.
