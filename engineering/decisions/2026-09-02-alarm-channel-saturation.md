---
status: proposed
summary: >
  The nightly alarm family's live defect is the OPPOSITE of the silent night, and finding it
  reverses the order the remaining work should be done in. Two rolling threads are filing every
  single night and neither has ever closed: #1532 (perf) has 21 comments over 23 days, and #1845
  (integration) has 9 since 08-25. #1532 cannot close by construction — #1988 gave the
  `engine-perf` job a stand-down and left the `watch` job without one, so nothing in that job can
  ever retract. And it is firing on noise, which is now PROVED rather than inferred: three
  consecutive runs measured the IDENTICAL commit pair b4d202c -> 0c920ca and disagreed by up to
  100KB of script on the same page, with the same row passing on 08-28 and filing a regression on
  08-30. So the channel these alarms speak on is already saturated.
  Making four more filing conditions exhaustive (the silent-night fix) would add signal to a
  channel nobody reads, which is why that work should go SECOND, not first.
---

# The alarms are already crying wolf, which changes what to fix first

**Date:** 2026-09-02 · **Status:** PROPOSED — options, owner's call

The swimlane has been treating the nightly family as too quiet: alarms that could not stand
down (#1988), checks wired to nothing (the orphaned-check census), filing steps that go silent
when a measuring step dies. All of that is real.

But the family's **live** defect is the other one. Two of its rolling threads have been filing
every night for weeks, and nobody has acted on either.

## What is actually happening tonight

| thread | opened | comments | last comment | can it close? |
|---|---|---|---|---|
| **#1532** `[perf-nightly] docs perf regression detected` | 2026-08-10 | **21** | 2026-09-01 10:47 | **No — structurally** |
| **#1845** `[integration-nightly] render-regression tier failing on main` | 2026-08-25 | 9 | 2026-09-01 10:28 | Comments only, by design |

**#1532 cannot close by construction.** `perf-nightly.yml` has two jobs. `engine-perf` files at
:479 and stands down at :414. `watch` files at :150 and **has no stand-down step at all** —
confirmed in the workflow source and in the step lists of five consecutive runs, where
`watch`'s "Open / append regression issue" concluded `success` every night while `engine-perf`'s
concluded `skipped`. #1988 fixed the family's stand-down gap one job at a time and this job was
missed.

## And it is firing on noise

The tripping rows change from night to night, which a real regression does not do:

| run | tripping rows |
|---|---|
| 08-29 (`33250889056`) | desktop `/` **LCP** +304ms · mobile `/` **LCP** +1654ms |
| 09-01 (`33497216804`) | desktop `/components/` **Script** +26KB · mobile `/` **Script** +99KB |

Through all of it the metric that matters is flat: desktop `/` perf score 0.99 on both nights,
mobile `/` 0.63 → 0.60 → 0.71 → 0.72. On 09-01 the mobile `/` score actually **improved**
(0.710 → 0.720) and TBT **improved** (265ms → 207ms) on the same page the alarm flagged.

**The script-size metric is classified as deterministic and is not. This is proved, not
inferred, and the proof is in the alarm's own thread.** Its config comment says *"script-size =
bundle bytes; no runner/network noise → tight"*, and it gets a 3% tolerance on that basis
(`docs/scripts/perf-regression.mjs:64-70`). But it is summed from Lighthouse network records —
`it.resourceType === 'script'`, adding `transferSize` (`:105-115`) — so it measures **what
happened to load during that run**, not what the build produced.

**Three consecutive nightly runs measured the IDENTICAL commit pair** — base
`b4d202c7ca54b078e6c3f240b07ded89492f0f80` → head `0c920ca0fe7f1442ca599c5463fd735806016295`.
Same two builds, same pages, three nights:

| night | run | desktop `/` base → head | mobile `/` base → head | mobile `/` verdict |
|---|---|---|---|---|
| 08-28 | `33195788680` | 172 → **151** KB | 254 → **209** KB | −45KB ✓ |
| 08-29 | `33250889056` | 209 → **172** KB | 172 → **151** KB | −21KB ✓ |
| 08-30 | `33306976109` | 178 → **172** KB | 151 → **251** KB | **+100KB ❌** |

The same head commit reads 151, 172 and 172 KB on desktop `/`, and 209, 151 and 251 KB on
mobile `/`. The same base commit reads 172, 209, 178 and 254, 172, 151. **A 100KB spread on
bytes that never changed.**

The verdict column is the part that matters: **on 08-30 that noise filed a ❌ regression on the
exact row that passed ✓ two nights earlier, for the same two commits.** The metric is not merely
noisy, it is noisy well past its own 3%-and-10KB gate, so it manufactures regressions.

*(One thing remains inference, and it is adjacent: precisely WHICH stage of the capture admits
the variance — lazy-chunk timing, prefetch, an aborted request. The recommendation does not
depend on it. Whatever the stage, a quantity that moves 100KB at a fixed commit cannot be
compared at a 3% tolerance, and the fix is to read built bundle bytes off disk rather than to
widen a band around a number that is not measuring what its name says.)*

**A third failure mode is mixed into the same thread**, worth separating before anyone tunes
anything: on 08-30 `mobile /playground/` tripped on **Perf score −0.010**, well inside the 0.05
tolerance. That is the `floor` backstop — an absolute catastrophe guard independent of the delta
— firing because the score sits at 0.46. That one is arguably a real signal. So #1532 carries at
least three different things under one title: absolute-floor breaches, LCP timing noise, and
script-size capture noise. Undifferentiated, in a thread that cannot close.

## Why this reverses the order of the remaining work

An alarm's channel has a budget, and it is the reader's attention. #1532 has spent 23 days of
it. The rule this family already wrote down for itself is exactly on point: *"a thread's first
firing — likelier a harness failure than a real regression — turned it into 'the flaky
nightly', and a genuine regression months later arrived as a comment nobody reopens."* That is
now the observed state of #1532, not a hypothetical.

So **making four more filing conditions exhaustive is the right change at the wrong time.** It
adds messages to a channel that is already saturated. Measured, the silent-night gap it closes
is rare: across the four workflows in its scope there was **one** red scheduled run in **107**
(integration, 08-18); modulepreload, preview-e2e and perf were 0-for-80. Roughly one extra
issue a month — worth having, and worth having *after* the reader trusts the channel again.

## Options

### A · Fix the saturation first, then close the silent night *(recommended)*

1. Give `perf-nightly`'s `watch` job a stand-down, the same shape `engine-perf` already has.
2. Reclassify `script-size` — either widen its band to the environment-coupled class, or
   measure built bundle bytes from disk instead of Lighthouse network records. The second is
   the real fix and makes the "deterministic" comment true.
3. Then apply the exhaustive filing conditions from the silent-night work.

**Pros:** attacks the defect that is live tonight; makes #1532 closable and lets it close;
the silent-night fix then lands in a channel people read. **Cons:** step 2 is the largest piece
of work in this note and touches how a nightly scores itself; steps 1 and 3 are CI-contract
changes. **Risk if wrong:** widening a band can hide a real regression — mitigated by fixing
the measurement rather than the threshold.

### B · Stand-down only, leave the metric alone

Add the missing stand-down to `watch` and stop there.

**Pros:** smallest change, one step, mirrors an existing shape exactly. **Cons:** does not stop
the nightly firing — it only lets a quiet night retract, and there are no quiet nights while
the metric is noisy. #1532 would close and immediately reopen. **This is the jank option:** it
looks like a fix and changes nothing a reader would notice.

### C · Fix the metric only

Reclassify or re-source `script-size`; no stand-down.

**Pros:** removes the noise at its source. **Cons:** #1532 still cannot close, so the thread
that has cried wolf for 23 days stays open forever with no path to resolution. The reader's
trust is not restored by a thread that merely stops growing.

### D · Do the silent-night work first anyway

**Pros:** it is already specified and cheap. **Cons:** measured at ~1 issue/month of new signal
delivered into a channel currently carrying ~2 false alarms/night. It is the option that most
looks like progress and least changes the outcome.

**Recommendation: A**, in that order. B and C are each half of A and neither half works alone.
