---
status: proposed
summary: >
  232 of 391 notes are `shipped` — the index calls that group "pending teardown" — and none has
  ever been torn down. The issue frames this as a backlog to drain; one evening of work against
  the corpus says the framing is wrong, and the recommendation is the issue's option (4), which
  it lists as the cheap-and-honest floor rather than the answer. FOUR of the five cards worked
  tonight were scoped ENTIRELY by a `shipped` note's "what this does not fix" section, and three
  of those notes are in the pending-teardown group: #1594's question came from the index note's
  §5, #1595's scope from the ledger note's §5, #1596 from the shorthand note's §6, #1527 from the
  concat note's §6. Absorbing those into canon and deleting them would have deleted the backlog.
  What canon can hold is a conclusion; what these carry and canon cannot is the measurement, the
  harness, the corrections, and the caveats that become the next session's work. The real defect
  is narrower than 102,554 lines: the index heading asserts a process that has never once run,
  which is a stale claim in a generated file — the exact thing this repo treats as a defect
  everywhere else. NOT BUILT — this is a direction decision and the direction is the owner's.
---

# 232 notes "pending teardown", and whether that is the right thing to want

**#1597.** Raised by the Munger-inversion lens as its lead objection to the
#1547/#1546/#1528/#1545/#1527 batch. This note is analysis and a recommendation.
**Nothing is built and nothing is deleted.**

## 1. Measured on `main` today

```
391      notes total
232      status: shipped        ← the "pending teardown" group
 87      status: proposed
 61      status: in progress
  8      status: superseded
  3      status: blocked
102,554  lines of prose
```

Growth, by month the note is dated: `2026-05` 29 · `2026-06` 128 · `2026-07` 178
· `2026-08` 55 in eleven days. **166 notes in the last thirty days** — about five
and a half a day. The queue is fed far faster than any teardown ritual would
drain it, and this batch adds five more.

So the issue's description is accurate: the rule is written down, surfaced in the
generated index, and has never once been executed.

## 2. The evidence that changes the framing

The convention says *"When a note is fully absorbed into the canonical docs and
adds nothing further, delete it. This folder is not an archive."* The test of that
rule is whether an absorbed note still does work. **Tonight it is testable against
five cards, because four of them existed only because a note said what it had not
finished:**

| card worked | scoped by | that note's status |
|---|---|---|
| #1594 — sweep the other generated artifacts | `2026-08-10-decisions-index-merge-queue-race.md` §5 | **shipped** |
| #1595 — the semantic fallback gate | `2026-08-10-fallback-exit-ledger.md` §5 | **shipped** |
| #1596 — PPTX / HTML player unverified | `2026-08-10-spectrum-out-of-the-background-shorthand.md` §6 | **shipped** |
| #1527 — the concat sign-off | `2026-08-10-palette-concat-order.md` §6 | proposed |

Three of the four are in the pending-teardown group. Had the rule ever run, those
three would have been "absorbed into canon" — and canon would have carried the
*conclusions* (the gate exists, the ledger exists, the hoist is safe) while
dropping precisely what was load-bearing: **which population was measured, which
was not, what the harness was, and which claim had already been corrected once.**

Two concrete cases from tonight:

- The concat note carries a **runnable harness inline** and a §6 saying only four
  of 32 themes were rendered, light only. Re-running it found the sample was a
  wide underestimate (all 64 theme-modes change) and that the flip introduces an
  accessibility regression the four-theme sample could not see. A canonical
  "the concat order is wrong" paragraph would have carried none of that.
- The ledger note records a **correction that was itself wrong** — a published
  "your number doesn't reproduce" that an independent checker refuted. That
  paragraph is exactly the kind of thing "absorb into canon" deletes, and exactly
  the kind of thing that stops the same mistake being made twice.

**A note's caveats are the next session's work queue.** That is a function canon
does not have and should not acquire: canonical docs describe what is true now,
not what was measured, by whom, against what, and what was left undone.

## 3. So what IS the defect?

Not 102,554 lines. Three narrower things, in descending order of how much they
actually cost:

1. **The index asserts a process that has never run.** The heading reads
   *"Shipped — pending teardown (absorb into canon, then delete)"*. Nothing is
   pending; nothing is being torn down. A generated file stating a false claim is
   the defect this repo treats seriously everywhere else — it is the same class as
   a stale count in a comment, which #1547 deleted a tally over.
2. **`shipped` does not mean what the index says it means.** In practice it means
   "this work landed", which is useful and is what every author has written it to
   mean. The group heading reads a second meaning into it that no author intended.
3. **Nobody can tell how big the corpus is while browsing.** #1547 removed the
   footer tally — correctly, it was the one line two concurrent PRs could not both
   be right about — and that line was also the only place the size showed up.

## 4. The four options, assessed

**(1) Make teardown a step in an existing ritual** — e.g. the post-merge standup
names one `shipped` note older than N days as a teardown candidate. The issue
calls this "the one that would actually drain it". *It would not.* At 5.5 notes a
day, one teardown per merge does not approach the fill rate; and §2 says each
teardown is a lossy compression of the thing that turned out to be valuable. This
is the option that costs the most and buys the least.

**(2) A gate with a budget.** The issue's own objection stands — it punishes
whichever PR happens to cross the line, which is never the PR responsible. It also
puts a ratchet on *writing things down*, which is the behavior CLAUDE.md asks for.

**(3) Report the size somewhere non-racy.** Cheap and harmless. But it answers
"how big is it" when nobody has established that big is bad, and §2 argues the
opposite. Worth doing only as a rider on whichever direction is chosen.

**(4) Decide the folder IS an archive and say so.** The issue lists this as "the
cheapest, and honest if teardown is never going to happen". On tonight's evidence
it is not merely the cheap option — **it is the correct description of what the
folder does.** It is an archive, it has been one for its whole life, every author
has treated it as one, and the work it enables is real and measurable.

## 5. Recommendation

**Take (4), with a narrow rider from (3).** Concretely, and only on the owner's
go-ahead:

- `engineering/decisions/README.md` says the folder is a **dated archive**: notes
  are written once, corrected in place, and marked `superseded` when a later note
  replaces them — never deleted. The `superseded` status already exists and
  already does the job for the eight notes that needed it.
- The index heading stops saying "pending teardown". `shipped` means the work
  landed, which is what it has always meant.
- CLAUDE.md's guidance to leave a durable note is **unchanged and endorsed** —
  §2 is the argument for it, not against it.
- The rider: surface the corpus size in the **post-merge standup**, not in the
  generated index (that is what recreated #1547's race). One line, no gate.

**What this deliberately does not decide:** whether 391 notes is too many to
*find* things in. That is a discoverability question, not a deletion question, and
the index plus front-matter summaries are the surface to improve if it ever bites.
It has not bitten yet — four of tonight's five cards were found through the notes
themselves.

## 6. Why this stops here

The four options are mutually exclusive statements about what the folder is *for*,
and that is the owner's call, not a reversible default. Changing `README.md` to
say "this is an archive" retires a convention the owner wrote; adding a teardown
ritual adds work to every merge. Neither is something to pick unilaterally at the
end of a batch that itself added five notes to the pile.

The question, in one line: **is `engineering/decisions/` an archive, or a queue?**
