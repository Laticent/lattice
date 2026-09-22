---
origin: 2212
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2212#issuecomment-5670593205
backfill: true
---

# The handoff issue — the continuation brief as a durable GitHub object BLOCKED on one human pick (see DECISION below). Do not start the build without it.

Backfilled verbatim from the continuation brief on #2212 (merged 2026-09-14).
Not re-checked against `main` — it may already be done or duplicated elsewhere.

```text
  P1 · [no ticket] The handoff issue — the continuation brief as a durable GitHub object
       BLOCKED on one human pick (see DECISION below). Do not start the build without it.
       why now   — it closes the gap #2212 only narrowed: a brief on a PR is durable, but
                   it is still not claimable, searchable or dedupable, and a session that
                   dies before opening a PR still loses everything.
       where     — engineering/workflow.md §Post-merge standup (new subsection);
                   .github/scripts/issue-form.js (maskFences — see the trap below);
                   tools/sync-backlog.js + .github/workflows/triage-gate.yml (V2 only).
       done when — a session that leaves work pending files ONE handoff issue, one swimlane,
                   capped items, off-path findings only, base sha stamped; and a fresh
                   session can work it cold from the issue alone.
       evidence  — file a real handoff issue on this repo and have a second session work it
                   end-to-end without the transcript. Not a dry run, not a template in a doc
                   (#23). Show the DoR gate leaving status:ready ON it.
       verify    — tier 1, an independent checker: it changes shared state (the queue) that
                   parallel sessions read, which is CLAUDE.md's second-filter row 1.
       TWO TRAPS, both measured, do not rediscover them:
         · maskFences in .github/scripts/issue-form.js blanks fenced blocks BEFORE locating
           headings, deliberately. The brief is fenced by mandate, so pasting it verbatim
           leaves the DoR gate seeing no swimlane and no acceptance check → it strips
           status:ready. Put REAL H2 headings OUTSIDE the fence (## Swimlane / governing
           decision doc, ## Acceptance check) with the fenced brief as the value; the parser
           allows a fence as a VALUE, it just will not scan inside one for headings.
         · pr-autoclose-issues.yml re-parses the merged PR body and closes EVERY referenced
           issue — it exists to defeat partial-close. A 9-item handoff closed by a 6-item PR
           loses 3 items silently. So a handoff issue is NEVER referenced with a closing
           keyword; close it by hand after rewriting the remainder into a fresh one.
```
