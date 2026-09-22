---
status: shipped
summary: >
  Thinking is 37% of output tokens and about 6% of the billable total, measured over 69
  usable turns across a main thread and two subagents. Output is dwarfed by new context —
  48,418 against 218,468 — so even deleting thinking entirely saves around a fifteenth of
  the bill, a cap at 4,096 saves 0.14%, and a cap tight enough to save real money (512)
  truncates the nine turns that were reasoning hardest. Recommending AGAINST a repo-wide
  MAX_THINKING_TOKENS; the number is the owner's and the options are priced here. The
  method took four corrections, the last one found by an independent auditor after the
  first version of this note published 33.6% and 5.6%.
---

# Thinking is a third of output and a sixteenth of the bill

`2026-09-21-what-a-turn-bills.md` documented `MAX_THINKING_TOKENS` as a per-session lever
and deliberately did not set a repo-wide default, on the argument that one number would
clamp hard reasoning along with routine turns. That argument was never sized. This note
sizes it.

## 1. What the transcript does and does not record

The transcript does **not** persist thinking text. A `thinking` block carries an encrypted
`signature` and an **empty** `thinking` string, so the `§Re-measuring` recipe in
`engineering/development.md` — tokenize the file — cannot reach it. Tokenizing those blocks
returns 0 for every turn, which reads like "nothing thought" rather than "nothing stored."

What can be measured is the **residual**: a turn's billed `output_tokens` minus the part of
its output we CAN see, which is its text blocks and its tool-call inputs.

The catch is that we can only count the visible part with `o200k_base`, and Anthropic bills
with a different tokenizer. Over the turns that did no thinking, `o200k(visible)` regresses
on `output_tokens` at **slope 0.7052, intercept −50.2, r = 0.9995** — so o200k counts about
70.5% of what the meter counts, for identical content. The gap is **proportional**, not
constant. The estimator therefore converts the visible o200k count back onto the meter's
scale before subtracting:

```
thinking ≈ output_tokens − (o200k(text + tool_use inputs) − intercept) / slope
```

and the method **calibrates itself**: run it over the turns that emitted no thinking block
and it must return roughly zero. That self-check is what makes the number trustworthy, and
it is what §2's corrections were each caught by.

## 2. Four corrections, each of which produced a plausible wrong number first

Recorded at length because every one produced a well-formed, confident, wrong figure, and
three of the four pointed the same way — making the lever look cheaper than it is.

1. **Tokenizing the `thinking` field.** Every block is an empty string. First answer:
   thinking is 0.0% of output. A number saying a lever does nothing is exactly the number
   that ends an investigation.
2. **Counting per transcript record.** One API message is written as **several** records —
   one content block each — and every record repeats the **whole message's** `usage`. The
   main thread's 39 messages are 79 records, so a per-record sum bills output two to four
   times over (26,562 becomes 59,247). Symptom: the calibration went to p50 218 / max 4,781
   on turns that did no thinking at all. Framing overhead is not 4,781 tokens; the
   calibration was reporting a broken denominator.
3. **Taking the first record's `usage`.** A record written mid-stream carries a **partial**
   `output_tokens`, and later records for the same message carry larger ones. The main
   thread happens to write the final count on every record, so this is invisible there — it
   appears only in the subagent transcripts, where taking the first understated one agent by
   **2.4x** (5,700 against 13,782) and the other by **17x** (476 against 8,138). Take the
   **max** per `message.id`.
4. **Correcting the overhead with a constant.** The first version of this note subtracted
   the calibration's MEAN residual (208.6) from every turn, on the reading that the residual
   on a no-thinking turn is fixed framing noise. It is not: it rises with turn size, because
   it is a tokenizer ratio (§1). A constant under-subtracts on large turns and
   over-subtracts on small ones, and thinking turns skew large. **It published 33.6% of
   output and 5.6% of the bill; the size-aware estimator says 37.4% and ~6%.**

**The self-check that catches #4, and why it is now in the script.** Summed over the
calibration turns — turns that did no thinking — an estimator must find nothing:

| estimator | leakage on the no-thinking turns | cross-check r |
|---|---:|---:|
| constant overhead (the published version) | 2,109 tokens | 0.984 |
| **proportional (this version)** | **303 tokens** | **0.994** |

The constant-overhead version claimed two thousand tokens of thinking on turns that emitted
no thinking block. It also scored the *worse* cross-check, which was the signal available at
the time and not read.

**A fifth trap, found by the same audit: 8 of 77 turns record an `output_tokens` SMALLER
than their visible content** — a 347-token tool call billed as 3 — and taking the max per
message does not repair them. They are not measurements, so they are dropped, and they are
reported rather than silently skipped. Six of the eight carried a thinking block.

## 3. The cross-check, and what it can and cannot license

The `signature` is an encryption of the thinking it seals, so its length should scale with
the thinking's length — and it is measured completely independently of `output_tokens`. Over
the 46 single-thinking-block turns:

| | r |
|---|---:|
| signature length vs. estimated thinking | **0.994** |
| signature length vs. the VISIBLE output the residual excludes | 0.119 |

The second row is the one that matters: the signature tracks what the residual *keeps* and
not what it *removes*, so the turn-size confounder — both quantities merely growing together
— does not explain it.

**What this cannot do is set the level.** A correlation is invariant to rescaling the
estimator, so r cannot distinguish 15,461 tokens from 18,105. It validates the *shape* —
residual is proportional to thinking, and the estimator is not measuring turn size in
disguise. The level rests on §1's calibration, and on the self-check above.

The same caution applies to reading thinking off signature length directly. The ratio of
totals is 4.52 characters per estimated token, but the fitted line is **3.44 characters per
token plus a 425-character fixed header** (the shortest signature observed is 396, and every
length is a multiple of 4 — base64). Anyone dividing by 4.52 and anyone using the slope will
get different answers.

## 4. The measurement

77 turns across three contexts in one session (this repo, 2026-09-22): a main implementation
thread, a `fact-checker` subagent doing an investigation, and a `checker` subagent reviewing
a diff. **69 usable** after dropping the 8 with unusable `usage`.

| context | turns | thinking turns | output | thinking~ | share of output |
|---|---:|---:|---:|---:|---:|
| main thread (implementation) | 39 | 26 | 26,562 | 8,342 | 31.4% |
| `fact-checker` subagent | 22 | 16 | 13,740 | 4,504 | 32.8% |
| `checker` subagent | 8 | 4 | 8,116 | 5,258 | **64.8%** |
| **all usable** | **69** | **46** | **48,418** | **18,105** | **37.4%** |

Per-turn thinking: median 181, p75 366, p90 873, max 4,472. **A third of turns emit no
thinking block at all** (23 of 69), so thinking is already concentrated in a handful of turns
rather than spread evenly.

The review context runs about **twice** the share of the other two, and the two that are
not reviewing are within 1.4 points of each other. (The first version of this note put the
spread at 2.7x and ranked the main thread above the `fact-checker`; the size-aware estimator
narrows the spread and inverts that pair. The "review reasons about twice as hard" finding
survives the correction; the specific 2.7x did not.)

**The number that decides it.** Set against the whole billable quantity rather than output
alone:

| | usable turns | all 77 turns |
|---|---:|---:|
| New context (`input` + `cache_creation`) | 218,468 | 245,391 |
| Output | 48,418 | 48,482 |
| Billable proxy (`new + output`) | 266,886 | 293,873 |
| Thinking | 18,105 | 18,105 (uncountable on the 8) |
| **Thinking as a share of the bill** | **6.78%** | **6.16%** |

Cache reads were 6,528,325 and near-free, per `2026-09-21`. Quote the **6.16%** when one
number is wanted: it keeps the dropped turns' real bill in the denominator and so cannot be
accused of flattering the estimate.

Thinking is **37% of output but about 6% of the bill**, because new context outweighs output
by 4.5x. That ratio is the whole finding: the ceiling on what any thinking cap can save is
roughly a fifteenth of a session.

## 5. The options, priced

Measured over the 46 thinking turns. "Clipped" is what the cap would have truncated; the bill
column spans the two denominators in §4.

| cap | clipped | share of all output | share of the bill | turns touched |
|---:|---:|---:|---:|---:|
| 512 | 7,259 | 15.0% | 2.47–2.72% | 9 of 46 |
| 1,024 | 4,436 | 9.2% | 1.51–1.66% | 3 of 46 |
| 2,048 | 2,424 | 5.0% | 0.82–0.91% | 1 of 46 |
| 4,096 | 376 | 0.8% | 0.13–0.14% | 1 of 46 |
| 8,192 | 0 | 0.0% | 0.00% | 0 of 46 |
| none (today) | — | — | — | — |

## 6. Recommendation — no repo-wide default

Setting one is the owner's call (`CLAUDE.md` second filter, row 3). The recommendation is
**against**, and the priced reason rather than the intuition:

- **A safe cap saves nothing worth having.** 4,096 clips 0.14% of the bill. It is
  indistinguishable from no cap, and a gate that changes nothing still has to be explained to
  everyone who reads it.
- **A cap that saves real money bites the hard turns first, by construction.** 512 saves
  2.7% of the bill and truncates 9 turns — and thinking concentrates, so those 9 are the
  turns that were reasoning hardest. The `checker` subagent, doing the most adversarial work
  in the sample, ran at **64.8%** thinking against roughly 32% for the two that were not
  reviewing. A repo-wide number set for the common case lands hardest on the uncommon one.
  That is what `2026-09-21` claimed without a number, and it is what the numbers support.
- **The lever is in the other column.** New context is 82% of the billable proxy. Every point
  of `engineering/development.md` §Context cost — read sections not files, delegate a big
  read, batch calls — acts on the 82%. A thinking cap acts on 6% and is the only lever here
  that can make an answer worse.
- **The correction did not narrow the margin.** For a 1,024 cap to save even 5% of a
  session's bill, thinking would have to be roughly **double** what is measured here. The
  §2.4 correction moved it by 11%. The uncertainty is an order of magnitude short of
  changing the answer, which is the test that matters: an estimator wobble that cannot flip
  the decision is a caveat, not a defect.

If a cap is ever wanted anyway, `effort` is the better instrument and already the repo's
policy (HARD RULE #27): it is **per-agent**, so a `scout` or `inventory` card can carry a low
setting while `checker` and the adversarial trio keep theirs — exactly the distinction one
repo-wide number cannot draw.

## 7. Limits of this measurement

- **n is one session**, not several. A cloud sandbox starts with no prior transcripts on
  disk, so `~/.claude/projects/**` held only this session. The three contexts inside it do
  different work — implementation, investigation, review — and the review context runs about
  twice the others, which is the variation this note leans on; a fourth context could still
  move the aggregate.
- **Thinking is estimated, not read.** Nothing on disk contains the text. The cross-check is
  strong evidence the residual is thinking-driven; it is not the thinking.
- **The calibration's slope is measured, its mechanism is not.** That `o200k(visible)` is
  70.5% of billed `output_tokens` is almost certainly a tokenizer mismatch, and it is stable
  across all three contexts — but there is no ground-truth Anthropic tokenizer here to prove
  it. The correction's *form* does not depend on the mechanism; its interpretation does. If
  some of that gap were output the transcript does not persist at all, the estimator would be
  subtracting real work.
- **The cross-check constrains shape, not level** (§3). r would not have caught §2.4; only
  the leakage self-check did.
- **8 of 77 turns were dropped** for recording an `output_tokens` below their visible
  content, six of them thinking turns. Their thinking is uncountable, so the share is
  measured over the rest, and §4 gives both denominators.
- **The cap table is retrospective.** It says what a cap would have truncated, not what the
  session would have done under one. A truncated turn may simply take another turn, which
  re-bills its whole prefix — so the savings column is an upper bound.

## 8. Re-measuring

The script is in `engineering/development.md` §Re-measuring, which carries it inline with
each trap commented at the point it bites. Point it at one or more
`~/.claude/projects/**/*.jsonl`, keeping the file inside the repo so it can resolve
`gpt-tokenizer`.

**Read its first three lines before anything else.** If the calibration fit's `r` is not near
1, the proportional model does not hold for that data. If the leakage on the calibration
turns is not small next to the thinking totals, the estimator is finding thinking where there
is none. If many turns are dropped as unusable, the sample is not what the table says it is.
Only then read the results.
