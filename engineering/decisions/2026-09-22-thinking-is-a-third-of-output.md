---
status: shipped
summary: >
  Thinking is 33.6% of output tokens and 5.6% of the billable total, measured over 77
  turns across a main thread and two subagents. Output is dwarfed by new context —
  48,482 against 245,391 — so even deleting thinking entirely saves under a sixteenth
  of the bill, a cap at 4,096 saves 0.7% of output, and a cap tight enough to save
  real money (512) truncates the nine turns that were reasoning hardest. Recommending
  AGAINST a repo-wide MAX_THINKING_TOKENS; the number is the owner's to set and the
  options are priced here. The method took three corrections before it was right,
  each caught by a calibration arm the script runs on itself.
---

# Thinking is a third of output and a twentieth of the bill

`2026-09-21-what-a-turn-bills.md` documented `MAX_THINKING_TOKENS` as a per-session lever
and deliberately did not set a repo-wide default, on the argument that one number would
clamp hard reasoning along with routine turns. That argument was never sized. This note
sizes it.

## 1. What the transcript does and does not record

The transcript does **not** persist thinking text. A `thinking` block carries an encrypted
`signature` and an **empty** `thinking` string, so the `§Re-measuring` recipe in
`engineering/development.md` — tokenize the file — cannot reach it. Tokenizing those blocks
returns 0 for every turn, which reads like "nothing thought" rather than "nothing stored."

What can be measured is the **residual**:

```
residual = usage.output_tokens − (o200k tokens of text blocks + of tool_use inputs)
```

and the method **calibrates itself**: a turn with no thinking block must residual to roughly
zero. Whatever it residuals to is the framing and serialization noise; whatever a thinking
turn residuals to above that is thinking.

## 2. Three traps, each of which produced a wrong number first

This is recorded at length because each trap produced a plausible, well-formed, wrong
figure, and only the calibration arm caught it.

1. **Tokenizing the `thinking` field.** Every block is an empty string. First answer:
   thinking is 0.0% of output. A number that says a lever does nothing is exactly the
   number that stops an investigation.
2. **Counting per transcript record.** One API message is written as **several** records —
   one content block each — and every record repeats the **whole message's** `usage`. The
   main thread's 39 messages are 79 records, so a per-record sum bills output two to four
   times over. Symptom: the calibration went to p50 218 / max 4,781 on turns that did no
   thinking at all. Framing overhead is not 4,781 tokens; the calibration was telling me
   the denominator was wrong.
3. **Taking the first record's `usage`.** A record written mid-stream carries a **partial**
   `output_tokens`, and later records for the same message carry larger ones. The main
   thread happens to write the final count on every record, so this trap is invisible
   there — it only appears in the subagent transcripts, where taking the first understated
   one agent's output by 2.4x (5,700 against 13,782). Take the **max** per `message.id`.

Fixing all three moves the cross-check from noise to proof (§3). Two of the three are
undercounts that make the lever look free, which is the direction that ends an
investigation early.

## 3. The cross-check that says the residual really is thinking

The `signature` is an encryption of the thinking it seals, so its length should scale with
the thinking's length — and it is measured completely independently of `output_tokens`.
Over the 52 single-thinking-block turns:

| method state | Pearson r (signature chars vs. estimated thinking tokens) |
|---|---:|
| before the record-grouping and max-usage fixes | 0.286 |
| after | **0.984**, at 5.25 signature characters per estimated token |

An r of 0.984 against a quantity the estimator never sees is what promotes the residual
from arithmetic to evidence.

## 4. The measurement

77 turns across three contexts in one session (this repo, 2026-09-22): a main
implementation thread, a `fact-checker` subagent doing an investigation, and a `checker`
subagent reviewing a diff. Calibration on the 25 turns with no thinking block: mean 209,
p50 127 — small next to the thinking estimates below, which is the property the method
needs.

| context | turns | thinking turns | output | thinking~ | share of output |
|---|---:|---:|---:|---:|---:|
| main thread (implementation) | 39 | 26 | 26,562 | 7,729 | 29.1% |
| `fact-checker` subagent | 26 | 18 | 13,782 | 3,300 | 23.9% |
| `checker` subagent | 12 | 8 | 8,138 | 5,281 | **64.9%** |
| **all** | **77** | **52** | **48,482** | **16,310** | **33.6%** |

Per-turn thinking: p50 98, p75 265, p90 832, max 4,423. **A third of the turns emit no
thinking block at all**, and among those that do the median is under 100 tokens — so
thinking is already concentrated in a handful of turns rather than spread evenly.

**The number that decides it.** Set against the whole billable quantity rather than output
alone:

| | tokens |
|---|---:|
| New context (`input` + `cache_creation`) | 245,391 |
| Output | 48,482 |
| Cache reads (near-free, per `2026-09-21`) | 6,528,325 |
| Billable proxy (`new + output`) | 293,873 |
| Thinking | 16,310 |

Thinking is **33.6% of output but 5.6% of the bill**, because new context outweighs output
by 5x. That ratio is the whole finding: the ceiling on what any thinking cap can save is
one-eighteenth of a session.

## 5. The options, priced

Measured over these 77 turns. "Clipped" is what the cap would have truncated.

| cap | clipped | share of all output | share of the bill | turns touched |
|---:|---:|---:|---:|---:|
| 512 | 7,598 | 15.7% | 2.6% | 9 of 52 |
| 1,024 | 4,252 | 8.8% | 1.4% | 4 of 52 |
| 2,048 | 2,375 | 4.9% | 0.8% | 1 of 52 |
| 4,096 | 327 | 0.7% | 0.1% | 1 of 52 |
| 8,192 | 0 | 0.0% | 0.0% | 0 of 52 |
| none (today) | — | — | — | — |

## 6. Recommendation — no repo-wide default

Setting one is the owner's call (`CLAUDE.md` second filter, row 3). The recommendation is
**against**, and the priced reason rather than the intuition:

- **A safe cap saves nothing worth having.** 4,096 clips 0.1% of the bill. It is
  indistinguishable from no cap, and a gate that changes nothing is a gate that still has
  to be explained to everyone who reads it.
- **A cap that saves real money bites the hard turns first, by construction.** 512 saves
  2.6% of the bill and truncates 9 turns — and thinking is concentrated, so those 9 are the
  turns that were reasoning hardest. The `checker` subagent, doing the most adversarial work
  in the sample, ran at **64.9%** thinking; a repo-wide number set for the main thread's
  29.1% lands on it hardest. That is the failure mode `2026-09-21` named without a number,
  and it is now the one the numbers support.
- **The lever is in the other column.** New context is 83% of the billable proxy. Every
  point of `engineering/development.md` §Context cost — read sections not files, delegate a
  big read, batch calls — acts on the 83%. A thinking cap acts on 5.6% and is the only lever
  here that can make an answer worse.

If a cap is ever wanted anyway, `effort` is the better instrument and already the repo's
policy (HARD RULE #27): it is **per-agent**, so a `scout` or `inventory` card can carry a low
setting while `checker` and the adversarial trio keep theirs, which is exactly the
distinction one repo-wide number cannot draw.

## 7. Limits of this measurement

- **n is one session**, not several. A cloud sandbox starts with no prior transcripts on
  disk, so `~/.claude/projects/**` held only this session. The three contexts inside it do
  different work — implementation, investigation, review — and their shares differ by 2.7x,
  which is the variation this note actually leans on; a fourth context could still move the
  aggregate.
- **Thinking is estimated, not read.** The signature cross-check (r = 0.984) is strong
  evidence the residual is thinking, but no arm of this reads the thinking text, because
  nothing on disk contains it.
- **The cap table is retrospective.** It says what a cap would have truncated, not what the
  session would have done differently under one. A truncated turn may simply take another
  turn, which costs its whole prefix again — so the savings column is an upper bound.

## 8. Re-measuring

The script is `§Re-measuring` in `engineering/development.md`, which carries it inline with
the three traps commented at the point each one bites. Point it at one or more
`~/.claude/projects/**/*.jsonl`. Read its **calibration** line first: if the no-thinking
residual is not small next to the thinking estimates, or the cross-check r is not near 1,
the numbers below it are not measuring what they claim.
