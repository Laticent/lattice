---
origin: 2956
priority: P2
recorded: 2026-10-29
area: website
severity: medium
deferred: blocked — waits on real-user proof that only the owner can supply
swimlane: engineering/decisions/2026-10-28-home-positioning-audit.md §16
source: https://github.com/Laticent/lattice/pull/2956
---

# Home page: real-user proof is the last gap to 9.5 (scores 7.5 visitor, 7.5 craft)

```text
  P2 · [no ticket] put one real user's words or result on the home page
       why now   — every rescore on PR 2956 named the same blocker: the page has no proof from
                   a real person. Items (1)-(6) of the earlier round all landed (audit §15).
       blocked   — the continuation session checked the issue tracker on 2026-10-29: every
                   author is a repo member, so there is no external user, quote or outcome
                   to cite. The page must not invent one.
       needs     — from the owner, any ONE of:
                   (a) a quote with a name and role, and permission to print it;
                   (b) a named pilot (team or org) that agreed to be listed;
                   (c) a measured outcome from a real reader ("cut our board pack from two
                       days to two hours"), with who measured it.
                   The cheapest route: give the page to 3-5 real readers (a CFO, a sales
                   lead, an analyst) and ask each for one sentence.
       where     — docs/src/components/landing/sections.tsx, the room card the proof
                   belongs to (or the proof strip after the rooms for a general quote).
       done when — one real proof item is on the page, and a rescore with the same two
                   lenses (visitor, craft) reads 9+ on both. Screenshots at 390/820/1440 with
                   no horizontal overflow.
```
