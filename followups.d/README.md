# `followups.d/` — pending work that has no issue

**Every item a continuation brief leaves pending gets a file here, unless it already has
an issue.** The brief on a PR comment and in chat still gets posted. This file is the copy
that lives in the repo, so the work survives the session that found it.

## Why this exists

A continuation brief tagged an unticketed item `[no ticket]` and treated the brief itself
as the spec. That brief lived in a PR comment and in a chat transcript, and nowhere a
session reads by default. In the two months to 2026-09-22, 29 of 506 merged PRs left
**79** such items in their final brief. The handoff-issue rule (#2215) was meant to catch
them, and 4 handoff issues were filed after it landed. A script copied those items here
verbatim, **without re-checking them against `main`**. A triage pass on 2026-09-24
checked all 79: it deleted 27 that were done and 6 duplicates, and kept 46. Each kept
file says so in a `Triaged 2026-09-24` line under its title. The `backfill: true` flag
and its warning in `npm run followups` stay in place for any future bulk import.

The backfill is complete for the tag. `[no ticket]` was coined in #1775 on 2026-08-23,
and the harvest window starts 2026-07-22. 33 merged PRs ever used the tag: 29 gave items,
#1775 only defines it, and on #2229, #2269 and #2300 a later brief on the same PR replaced the untracked items.
Deferred work mentioned in free prose before the brief existed is not harvested.

## The contract

One file per item:

```
followups.d/<origin-pr>-p<n>-<slug>.md
```

- **`<origin-pr>`** — the PR whose brief left the item pending.
- **`p<n>`** — the item's priority in that brief.
- **`<slug>`** — lower-case `[a-z0-9-]`, a few words of the title.

One file per item, rather than one shared ledger, for the reason `changelog.d/` exists:
two PRs in flight never edit the same region, so neither gets ejected from the merge
queue on a conflict.

```markdown
---
origin: 2311
priority: P1
recorded: 2026-09-22
source: https://github.com/Laticent/lattice/pull/2311#issuecomment-…
---

# kanban accepts a status word it then cannot paint

why now   — …
where     — …
done when — …
evidence  — …
verify    — …
```

The five fields are the brief's own (`engineering/workflow.md` §The continuation brief),
so copy the item across as the brief states it. `origin` and `priority` (both matching
the file name), `recorded`, a `#` title outside any code fence, and a line starting
`done when —` are required. A `backfill: true` file is exempt from the `done when` line,
because one backfilled brief predates that field and the copy is kept verbatim. `checkFollowups` in
`tools/check-ownership.js`, via `build:check`, fails on a missing one. `source` is
optional.

## The lifecycle

- **Add** the file in the same PR whose brief leaves the item pending.
- **Delete** the file in the PR that finishes the item, or that finds it already done.
  If a handoff issue lists the item, tick its box in the same PR.
  The deletion is the record, as a closed issue would be.
- **Promote** an item to an issue when it needs a board column, an owner or a
  discussion. Delete the file in the same PR and tag the brief `[#N]` from then on.

`npm run followups` lists every item, one line each. Read it at the start of a session,
next to `BACKLOG.md`.

## What the gate cannot do

It checks the shape of the files that exist. It cannot read a chat, so it cannot tell
that a brief left an item out. That half is still discipline, on the author of the brief.
