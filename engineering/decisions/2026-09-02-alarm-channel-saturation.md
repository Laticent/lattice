---
status: proposed
summary: >
  The nightly alarm family's live defect is the OPPOSITE of the silent night, and finding it
  reverses the order the remaining work should be done in. Two rolling threads are filing every
  single night and neither has ever closed: #1532 (perf) has 23 comments over 23 days (21 when this note was first written), and #1845
  (integration) has 9 since 08-25. #1532 never closes — but NOT for the reason this note first
  gave, which was false when it merged; see § Correction. The `watch` job has had a stand-down
  since #1988, and it deliberately COMMENTS rather than closes. It stays silent because there is
  never a green night to fire it. The alarm IS firing on noise, now measured across 140 repeat
  observations rather than three: 35% of them move further than the metric's own 3% tolerance on
  bytes that cannot have changed, and 30% of the rows measured twice on an IDENTICAL commit pair
  returned a different verdict on different nights. So the channel these alarms speak on is
  already saturated.
  Making four more filing conditions exhaustive (the silent-night fix) would add signal to a
  channel nobody reads, which is why that work should go SECOND, not first.
---

# The alarms are already crying wolf, which changes what to fix first

**Date:** 2026-09-02 · **Status:** PROPOSED — options, owner's call
**Corrected:** 2026-09-03 — see § Correction. The conclusion survived; the mechanism did not.

## Correction (2026-09-03)

This note shipped with a false claim, and it was false on the day it merged. Recording it here
rather than deleting it, because the note is `proposed` and steering, and because the way it
failed is the failure it warns about: an assertion nobody re-derived.

**What it said.** *"`watch` files at :150 and has no stand-down step at all — confirmed in the
workflow source and in the step lists of five consecutive runs."*

**What is true.** `perf-nightly.yml:213` is a step named `Report a measured-green night on the
rolling issue`, inside the `watch` job. Three independent proofs:

1. It is in the file, at `:213`, with a 26-line comment explaining itself.
2. `git log -S "Report a measured-green night on the rolling issue" -- .github/workflows/perf-nightly.yml`
   returns exactly one commit — `58bf241` (#1988), the very PR this note said had missed the job.
   #1988 gave BOTH jobs a stand-down. At `eadc61b`, the commit this note itself merged in, the
   string is already present.
3. Run `33742225649` (2026-09-03 10:03 UTC), job `watch`: step 13 `Open / append regression
   issue` → **success**; step 14 `Report a measured-green night` → **skipped**. The step exists
   and is wired. It skipped because the job really did measure a regression.

**Why the difference matters.** The original reason picked the fix, and the fix it picked is a
no-op. Adding a stand-down to `watch` adds nothing — there is one. #1532 stays open for two
other reasons, and both are deliberate:

- **The stand-down comments, it never closes.** `watch` is a DIFFERENTIAL job: head against a
  base ~24h old. The comment at `:187-204` argues that a clean night there cannot tell "fixed"
  from "the base now carries the regression too", so closing would be *"literally true and
  completely misleading, on a still-broken site."* That is a considered design decision, not a
  gap.
- **It never gets a green night anyway.** The job reports a regression essentially every night,
  so the stand-down's `regressed == 'false'` condition has had almost no opportunity to fire.

So the thread is not stuck because the alarm cannot retract. It is stuck because the alarm is
wrong nightly, and a human has to close it by hand. **That points the whole note at the metric**,
which is where its own evidence already pointed.

### A second defect, found while checking the first

`watch`'s filing step (`:150`) reads `if: steps.compare.outputs.regressed == 'true'` — with no
`always()`. Its sibling in `engine-perf` (`:479`) reads `if: always() && (...)`, and the comment
above it (`:469-477`) says the missing `always()` *"was the third instance of this alarm going
mute"*, because GitHub applies an implicit `success()` to any `if:` containing no status
function.

`watch` is the fourth instance of the same bug, in the same file. The reachable path: `Compare
head vs base` cannot fail (it captures both exits into an output), so `regressed` is already
recorded when `Upload reports` (`:133`) runs. If that artifact upload fails, the job goes red,
the implicit `success()` is unsatisfied, and the filing step is **skipped after a genuine
regression was measured** — the exact red-nightly-nobody-watches outcome `:469-477` documents.

**UNVERIFIED end-to-end** (HARD RULE #23): the mechanism is GitHub's documented `if:` semantics
plus this repo's own three prior incidents with it, but no run was constructed to observe the
mute. Confirming it means pushing a deliberately-failing workflow — a CI-contract change, so it
is the owner's call, not something to prove on the way past.

The swimlane has been treating the nightly family as too quiet: alarms that could not stand
down (#1988), checks wired to nothing (the orphaned-check census), filing steps that go silent
when a measuring step dies. All of that is real.

But the family's **live** defect is the other one. Two of its rolling threads have been filing
every night for weeks, and nobody has acted on either.

## What is actually happening tonight

| thread | opened | comments | last comment | can it close? |
|---|---|---|---|---|
| **#1532** `[perf-nightly] docs perf regression detected` | 2026-08-10 | **23** (as of 09-03; 21 at first writing) | 2026-09-01 10:47 | Comments only, by design |
| **#1845** `[integration-nightly] render-regression tier failing on main` | 2026-08-25 | 9 | 2026-09-01 10:28 | Comments only, by design |

**#1532 does not close, and that is deliberate — this paragraph originally said otherwise and was
wrong (§ Correction).** `perf-nightly.yml` has two jobs. `engine-perf` files at :479 and stands
down at :414. `watch` files at :150 and stands down at **:213** — a step #1988 added at the same
time as its sibling. The `watch` stand-down **comments and never closes**, because the job
compares head against a base ~24h old and a clean night there cannot distinguish a fix from a
base that has absorbed the regression (`:187-204`).

What the observed step lists actually show is narrower than the original reading: across five
consecutive nights `watch`'s "Open / append regression issue" concluded `success` and its
stand-down concluded `skipped`. That is not a missing step — it is a step whose condition
(`regressed == 'false'`) has had essentially no green night to fire on.

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

### The full measurement (added 2026-09-03) — 140 observations, not three

Three runs was the weakest form of this note's own evidence, and the thread carries far more.
Every one of #1532's 23 comments records base and head SHAs and a Script reading per URL per
form factor. Parsing all of them gives **230 Script rows**, and **140 (commit, URL, form-factor)
triples measured two or more times** — every one of those a repeat reading of bytes that cannot
have changed, because the commit is identical.

| measure | value |
|---|---|
| triples measured 2+ times | **140** |
| triples whose spread exceeds the metric's own 3% tolerance | **49 (35%)** |
| median spread | 0.0% |
| p90 spread | **27.6%** (nearest-rank; 28.2% linear-inclusive, 32.8% linear-exclusive) |
| worst spread | **104KB — 48.5% of that triple's median reading** — `mobile /`, commit `602858c`, readings 149 · 176 · 253 · 253 KB |
| rows on an identical commit pair that returned a DIFFERENT ✓/❌ verdict on different nights | **9 of 30 (30%)** |

Three separate commit pairs were each re-measured on multiple nights (`b842891→602858c` ×3,
`c4e01ba→b03b3bd` ×2, `b4d202c→0c920ca` ×**4** — one night more than this note originally found).
Single commits fare worse still: `0c920ca` on `mobile /` was read six times as
**151, 208, 209, 209, 251, 254 KB**. Those cluster near ~150, ~209 and ~252 — steps of roughly
50KB, which is what an intermittently-captured chunk looks like, and is consistent with the note's
reading that the metric records *what happened to load*, not what the build produced.

*(Two cells above were corrected on 2026-09-03 after an independent re-derivation. The p90 was
published as 33.3%, which matches no standard percentile method — the three named methods give
27.6 / 28.2 / 32.8%. And the worst spread was published as "59% of the median reading", which
divided 104 by 176 — the lower of the two middle values of `[149, 176, 253, 253]` — rather than by
the median 214.5, giving 48.5%. Neither moves a conclusion: the band that kills option C is
104KB on a ~200KB page either way. But a note whose entire subject is numbers nobody re-derives
has no business publishing a percentile without naming its method, and this one did it twice.)*

**This kills the tolerance-band option outright.** A band wide enough to swallow the observed
noise needs `noiseAbs ≥ 104KB` against today's 10KB. On a ~200KB page that is a **52%** band —
it would not detect a doubling of the payload. The band cannot be widened into usefulness; the
measurement has to change.

### And the fix already exists in the tree, on two of the five routes

`docs/scripts/check-route-budget.mjs` is a committed, **blocking** per-route byte ledger that
reads gzipped `/_astro/*.js` off the built `dist/` — deterministic bytes off a built artifact.
Its own header names this very metric as the predecessor it was written around: *"The only
payload watch was `perf-nightly.yml`: nightly, non-blocking, and relative at 3%/10KB, which at
this route's weight is roughly 40KB of headroom PER DAY."*

It covers **2** of the 5 routes the nightly measures (`studio`, `playground`), per
`docs/route-budget.json`. Sorting the noise measurement by route:

| route | repeat observations | max spread | median spread | in the ledger? |
|---|---|---|---|---|
| `/` | 28 | **104KB** | 47.5KB | no |
| `/components/` | 28 | 52KB | 3.0KB | no |
| `/getting-started/` | 28 | 36KB | 3.0KB | no |
| `/playground/` | 28 | 18KB | 0.0KB | **yes** |
| `/studio/` | 28 | **0KB** | 0.0KB | **yes** |

**Read this as a coincidence with a useful shape, not as causation.** The ledger does not make a
Lighthouse reading quieter — it is a different measurement on a different surface. The likelier
cause is that `/studio/` and `/playground/` eagerly load a fixed monolith while `/` defers chunks
whose capture timing varies. What the table does establish is that the three routes generating
all the noise are exactly the three with no deterministic budget, so extending an existing,
proven, in-tree gate to them would cover the gap that deleting `script-size` from the nightly
opens. HARD RULE #15 points at that script rather than at a new one.

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
script-size capture noise. Undifferentiated, in a thread that only a human can close.

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

**Rewritten 2026-09-03.** The original options were built on the false mechanism in § Correction:
option A's step 1 and the whole of option B were "add the stand-down `watch` is missing", and
`watch` is not missing one. What survives is the ordering argument and the metric fix, and the
measurement above now settles which metric fix is available.

### A · Re-source `script-size`, then close the silent night *(recommended)*

1. **Stop scoring `script-size` from Lighthouse network records.** The 140-observation
   measurement rules out the alternative: a band wide enough for the noise is 52% wide. Either
   drop the metric from `perf-regression.mjs` or re-source it from built bytes.
2. **Cover the three uncovered routes** by extending `docs/route-budget.json` +
   `check-route-budget.mjs` — the existing deterministic, blocking ledger — to `/`,
   `/components/` and `/getting-started/`, so dropping the nightly metric loses no coverage and
   gains per-PR attribution the nightly never had.
3. **Add `always()` to `watch`'s filing step** (`:150`), closing the fourth instance of the
   mute bug its sibling documents.
4. **Then** apply the exhaustive filing conditions from the silent-night work.

**Pros:** attacks the defect that is live tonight; reuses a proven in-tree gate instead of
writing a new one (#15); moves payload watching from a nightly nobody reads to a per-PR gate
that names the commit responsible. **Cons:** steps 1–3 are CI-contract changes; step 2 needs a
budget measured per route and will fail loudly the first time a route legitimately grows — which
is the ledger's design, not a defect. **Risk if wrong:** a ledger budget set too loose watches
nothing; mitigated by the stale-loose arm the script already enforces both ways.

### B · Delete `script-size` from the nightly and stop there

Steps 1 and 3 only, no ledger extension.

**Pros:** smallest change that actually silences the noise; one metric out of one config.
**Cons:** gives up payload watching on three routes entirely. Given the nightly's watch on those
routes is measurably a coin-flip (30% verdict flips), the coverage given up is closer to zero
than it looks — but it is not zero, and nothing replaces it.

### C · Widen the tolerance band — **NOT AVAILABLE, kept to record why**

The original note offered this as a live alternative. It is not one: `noiseAbs` would need to go
from 10KB to ≥104KB, a 52% band on a 200KB page. It would pass a doubling of the payload. Listed
here so the next reader does not re-propose it.

### D · Do the silent-night work first anyway

**Pros:** it is already specified and cheap. **Cons:** measured at ~1 issue/month of new signal
delivered into a channel currently carrying ~2 false alarms/night. It is the option that most
looks like progress and least changes the outcome.

**Recommendation: A.** The ordering argument is unchanged by the correction — it was always the
metric, and the correction removes the one step that would have made no difference.
