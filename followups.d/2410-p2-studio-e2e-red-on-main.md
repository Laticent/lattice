---
origin: 2410
priority: P2
recorded: 2026-09-27
---

# 14 desktop Studio e2e specs fail on main from e504ac7

why now   — the nightly e2e cannot be trusted while 14 specs are red on main, and no ticket
            tracked them. Reported in #2410's continuation brief; not caused by #2410.
failing   — playground-stress ×4, split:206, status-pill ×2, theme-import-style-sink ×2,
            webpage-export ×2, inline-grammar-marp-mirror:75, stage-window:372,
            studio-instant-shell:539 (desktop project, on e504ac7 and later).
where     — docs/e2e/ (the specs above) and whatever e504ac7 changed under docs/src/.
how       — reproduce one spec at e504ac7 and at its parent to confirm the commit, then read the
            first failing assertion of each; several may share one cause.
            NOT re-run in the session that recorded this, so the list is the brief's, UNVERIFIED here.
done when — every spec above passes on main, or each remaining one names its own tracked cause.
evidence  — the e2e run on main, before and after.
verify    — tier 0: the specs themselves.
