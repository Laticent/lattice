---
status: shipped
summary: >
  A session's budget is spent on what ENTERS the conversation, not on how long it runs.
  Correlating this repo's own transcript records against the budget counter across 23
  turns puts the charge at roughly 0.7 x (new tokens + output), with the cached prefix —
  150,087 tokens by the end, re-sent every turn — costing almost nothing. That re-ranks
  every lever: compaction is a context-window tool rather than a budget one, and the
  expensive things are verbose tools and whole-file reads. `npm test` printed 657,806
  o200k tokens to report 256 lines of facts and is now 477; the SessionStart hook put
  3,763 tokens of successful build log into every session's opening context and is now 29;
  `CLAUDE.md`, resident once per session AND once per subagent, is 15,785 -> 13,233. It
  also records two things that did NOT ship: a file-total gate on the decisions index,
  which `build-decisions-index.js` already refutes in its own docblock and forbids in its
  tests, and a repo-wide thinking cap, which would apply to the reasoning we want. Two
  figures in the investigation's own first report were wrong — a section-splitting bug
  inflated one rule from 567 tokens to 2,725 — and that is recorded because the same bug
  is what a reader would otherwise reproduce.
companion:
  - ./2026-08-17-context-index-tiering.md
  - ./2026-08-30-router-size-budget.md
  - ./2026-08-30-mandated-read-surfaces.md
---

# What a turn actually bills

## 1. The question

A working week was running out of budget in about two days. The standing assumption —
the one `2026-08-30-router-size-budget.md` reasoned from — was that the expensive event
is a READ crossing into context, and that resident text is cheap because prompt caching
makes re-sending it nearly free.

Half of that is right. The half that is wrong changes what to do about it.

## 2. The measurement

Claude Code writes a transcript per session under `~/.claude/projects/**/*.jsonl`, and
every assistant message carries a `usage` block: `cache_creation_input_tokens` (what is
NEW this turn), `cache_read_input_tokens` (the prefix re-sent), and `output_tokens`. The
harness also emits a remaining-budget counter. Deduplicating by message id and pairing
each counter delta with the turn that preceded it gives a direct read on what is billed.

| counter charge | new | cached re-read | output |
|---:|---:|---:|---:|
| 88,098 | 48,133 | 38,657 | 1,306 |
| 2,559 | 3,241 | 86,790 | 624 |
| 5,534 | 4,804 | 90,031 | 1,354 |
| 1,671 | 4,582 | 133,304 | 625 |
| 683 | 938 | 137,886 | 370 |
| 5,405 | 3,705 | 150,087 | 5,078 |

Across 23 turns the charge tracks `~0.7 x (new + output)`. The cached column grows to
150,087 and contributes nothing visible. Turn 1 is the exception at 1.78x, because the
baseline is new that turn rather than cached.

**So: cache reads are close to free, new context is paid at roughly full weight, and
output is paid at about the same weight as new context.**

## 3. Why that re-ranks everything

Under a dollar-priced API the cost of a long session is quadratic: every turn re-reads
the whole accumulated prefix at the cache-read rate, so at 100 turns roughly 60% of spend
is re-reading context already paid for, and **compaction is the dominant lever** — modelled
at 35% saving at 100 turns and 55% at 200.

Under the billing actually measured here that term is ~0, and the ranking inverts:

| lever | under API dollar cost | under this counter |
|---|---|---|
| Auto-compaction | dominant (35-55%) | roughly neutral — it saves free re-reads and writes a summary that is not free |
| Shorter sessions | 19% | ~0 — a new session re-pays an 86,790 baseline |
| Fewer tokens entering context | 14% | **dominant** |
| Less output | 10% | **co-dominant** |
| Smaller resident baseline | 5% | once per session, plus once per subagent |

The two models AGREE on the bottom two rows and disagree on the top two. Anything built
only for the top two rows would have been built for the wrong billing.

**This is what explains "two days".** A turn using targeted `sed`/`grep` reads charged
683-8,305 in the measured session. A turn that opens `engineering/workflow.md` whole
(29,507) plus one `gotchas/` topic (15,934) charges about 31,800 — ten times as much. At
~35k a turn a 15M budget is ~430 turns, which is about two days of work.

## 4. What shipped

| change | before | after |
|---|---:|---:|
| `npm test` output | 657,806 | **477** |
| SessionStart hook stdout | 3,763 | **29** |
| `CLAUDE.md`, resident per session AND per subagent | 15,785 | **13,233** |

**The test reporter was not only a cost bug.** 70,172 of the run's 70,428 lines were TAP
bookkeeping, and the eight counters that say whether the run passed print LAST — so a
reader on a truncated view paid thousands of tokens and then lost the verdict.
`--test-reporter=dot` keeps the full assertion diff, the stack and exit 1 on a failure
(measured at 231 tokens on a seeded failure), and `test:tap` remains for anything that
parses TAP. Nothing in CI or lefthook does today; both read only the exit code.

**The router trim** cut five rules that carried their rationale inline while also naming a
canonical doc. Every distinctive claim dropped from #22 and #29 was confirmed present in
the decision notes they point at before it was cut. #21 and #30 were pure duplication of
`engineering/house-style.md`, whose copy is strictly MORE current — the rule still quoted a
remainder of 71 where house-style records a measured 84 -> 30.

`2026-08-30-router-size-budget.md` declined this trim, on the ground that moving resident
text out "buys tokens by spending a read". That priced the read boundary correctly and left
two terms out: `CLAUDE.md` is paid again by **every subagent** (it is 57% of a measured
30,074-token subagent baseline), and a rarely-fired rule's resident cost is paid on every
session whether it fires or not. Neither term appears in #1897's bake-off, which measured
cache-creation for a single main-thread surface.

## 5. What did NOT ship, and why

**A file-total budget gate on `engineering/decisions/README.md`.** The investigation opened
with "36,086 tokens, drifted +39% since the tiering note fixed it at 26k, and ungated" —
which reads like a clean finding and is wrong twice over.
`tools/build-decisions-index.js` already answers it in its own docblock: the 10k budget was
**unreachable the day it was written** (filenames alone cost 5,387 tokens; a
filename-and-status-only index costs 13,336), and a file total is the one shape that file's
tests **forbid**, because it bills the PR adding note 566 for 565 predecessors with no local
fix, and because two concurrent PRs adding a note must both pass in either order. The
instrument the repo chose instead — `ROW_CAP`, 285 characters, pinned by a test — is correct
and already in force. `capabilities.md` has the same guard at 1,500.

The genuine gap that search turned up is narrower and different in kind: **`gotchas.md` is
generated with no row cap at all**, and the six large docs the routing table sends you to
are AUTHORED, so no row cap can reach them. The authored ones are handled here by naming
the access pattern in `CLAUDE.md` — open the section, not the file — which needed one edit
rather than six file splits and breaks no existing `§` reference. The gotchas row cap is
left as follow-up work: it is a real gap, off the path of this change, and #18 says log it
rather than pull it in.

**A repo-wide `MAX_THINKING_TOKENS`.** Thinking is output and bills like output, so a cap
is a real lever — but one number applies equally to the routine turn and to the hard
reasoning the cap would damage. It is documented in `engineering/development.md`
§Context cost as a per-session lever instead of set as a default anyone inherits.

## 6. Two figures this investigation got wrong

Both were caught in-flight and both are recorded, because the same mistakes are the ones a
reader re-deriving these numbers would make.

**A section-splitting bug inflated HARD RULE #30 from 567 tokens to 2,725.** Splitting
`CLAUDE.md` on `\n(?=- \*\*#\d+)` gives the LAST rule everything that follows it — in this
case the whole routing table and three more sections. The first report of this work
therefore said the five trimmed rules were 6,563 tokens and 42% of the router. Correctly
bounded at the section's closing `---`, they are **4,405 and 28%**, and the delivered
saving is 2,552 rather than the ~4,800 projected from the bad figure. The decision to trim
survives the correction; the number quoted for it did not.

**The resident baseline was nearly overstated by 55,002 tokens.** The transcript's
`prompt_snapshot` attachment is a RECORDING of the system prompt and tool schemas, not a
second copy sent to the model. Summing all attachment types naively gives 128,342 against a
measured turn-1 resident of 86,790. An accounting that exceeds the thing it accounts for is
the cheapest possible tell, and it is worth keeping the habit of checking the total.

## 7. How to re-derive any of this

`engineering/development.md` §Context cost carries the method, the per-command table and
the one-liner that counts o200k tokens. The figures move with the tree; quote a commit when
you publish one.
