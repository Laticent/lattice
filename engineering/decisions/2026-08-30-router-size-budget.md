---
status: shipped
summary: >
  `CLAUDE.md` was the only surface in the context-tiering system with no budget, and the
  only one every session pays unconditionally. It is now gated — 64,500 bytes, about
  16,509 o200k_base tokens, against today's 58,760 / 15,041. The gate caps GROWTH rather
  than demanding a trim, because #1897 measured the expensive thing as the read boundary
  and `CLAUDE.md` is on the cheap side of it with zero reads: both trimming options priced
  on #1896 convert resident text into an extra read, and routing the canonical-doc table
  is actively wrong since that table is what tells you which doc to open. The measure is
  BYTES, which is a proxy the issue's own acceptance check did not ask for — justified by
  a 0.079% ratio spread across four distinct revisions of this one file, and by two live
  precedents that already gate a token-motivated budget with characters. Nothing guards that
  proxy: a composition check was written, measured against a counterexample, and deleted.
  #1896's 13,897 was CORRECT when posted — an earlier draft of this note wrongly called it
  stale — and the file reached 14,914 half an hour later.
---

# A budget for the router — cap the growth, not the file

## What was unbudgeted

`2026-08-17-context-index-tiering.md` set the rule: a read-whole index holds ≤10k tokens,
a grep-first index budgets the row. Three surfaces were fixed under it, and
`2026-08-30-mandated-read-surfaces.md` then found the shape nobody had looked for — a
document a HARD RULE makes you open — and measured two more.

`CLAUDE.md` is neither. It is the **L0 router**, and it is the one file that is not read at
all: it is resident before the first tool call, on every session, unconditionally. The rule
it carries was written for indexes, so the router was out of its own scope by construction.

## The measurement, and a correction to the one on the issue

`o200k_base` via `gpt-tokenizer` in a scratchpad — deliberately not a repo dependency:

| commit | bytes | tokens | bytes/token |
|---|---:|---:|---:|
| `d9a8dee` | 54,252 | 13,897 | 3.9039 |
| `4271fe1` (adds #30) | 57,937 | 14,842 | 3.9036 |
| `ff35963` (= `bd1ff9c` = `b77107d`) | 58,260 | 14,914 | 3.9064 |
| this branch | 58,760 | **15,041** | 3.9067 |

**Four distinct states, not five.** A first draft listed `bd1ff9c` and `b77107d` as separate
rows; both carry the blob `ff35963` produced, so counting them twice overstated the sample by
25%. The conclusion is unchanged — the spread is (3.9067−3.9036)/3.9036 = **0.079%** — but a
duplicate presented as an independent measurement is the kind of claim this branch exists to
catch.

**#1896's 13,897 was correct when it was posted, and a first draft of this note said
otherwise.** The comment landed at 17:01; `d9a8dee` (13,897) was the tip from 16:13, and
`4271fe1` — which added HARD RULE #30 and took the file to 14,842 — did not land until 17:34.
The analysis was measuring the live file. It went stale 33 minutes later, and by the branch
point (`ff35963`, 18:53) the file was 14,914.

The draft claim, "four commits and about 80 minutes stale", was also internally impossible: at
80 minutes one commit had landed; four commits is 160. It is corrected here rather than
quietly dropped, because it accused someone else's measurement of an error it did not make.

What survives is the reason the budget is set against 15,041 rather than 13,897: **this file
moved +1,144 tokens in under six hours**, so a number quoted from a merged PR is stale by the
time anyone acts on it. That argues for the gate, not against the analysis.

Of the +127 tokens on this branch, all are the #21 enforcement tag, corrected because this
branch's own work falsified it.

## Why the gate caps growth instead of demanding a trim

#1897's bake-off measured a **step function at the read boundary**, not a linear token
cost: the full catalog costs 18x the pick surface because it takes 10–12 paginated reads
against 1, and an agent that does not pay for all of them chooses from a fraction of the
catalog. `CLAUDE.md` sits on the cheap side of that boundary in the strongest way
available — no read at all.

So both trimming options priced on #1896 spend the expensive currency to save the cheap
one:

- **Routing the canonical-doc table** (1,413 tokens, 37 rows) is the clearest case and is actively
  wrong. That table is the thing that tells you which doc to open; moving it behind a
  pointer spends a read on exactly the sessions that need routing.
- **Splitting rule text from rationale** (~1,900 tokens) carries the issue's own objection:
  *a HARD RULE that a session does not read is not a rule.* #22's four-arm gate description
  and #29's two-posture split are long **because** the evasion envelope is the load-bearing
  part.

The file is therefore allowed to be its size. What is gated is unbounded growth, which is
the failure the tiering note named for `gotchas.md` and the decisions index — a file that
grows by the same increment that makes it valuable.

## Why bytes, when the acceptance check said tokens

#1896's acceptance check says the number is measured with `o200k_base` and not estimated
from byte length. The gate estimates from byte length. That substitution is deliberate and
is the one thing here worth arguing with.

**There is no tokenizer in the repo, and the tiering note keeps `gpt-tokenizer` out on
purpose** — a ~2MB BPE rank table installed on every checkout to serve one gate on one file.

**The proxy is the established method here, not a novel one.** `ROW_CAP` in
`tools/build-capabilities.js` and in `tools/build-decisions-index.js` both gate a
token-motivated budget with a **character** count today. The second's docblock states its
own token measurement in `o200k_base` and then caps characters. One unit note: both cap
`String.length`; this gate caps BYTES. `CLAUDE.md` is 58,760 bytes against 58,204 characters,
0.96% apart — the calibration is internally consistent in bytes, so nothing is wrong, but the
precedent is not quite the same unit.

**And the calibration is far tighter than a cross-file ratio would be, because the gate
judges one file.** Across the four distinct revisions above: 3.9039, 3.9036, 3.9064, 3.9067 —
a spread of **0.079%** over a span of +1,144 tokens. The live gate's own estimate of today's
file is 15,040 against a true 15,041. Across *other* prose files the ratio runs 3.61
(`decisions/README.md`, dense with links) to 4.42 (`components.pick.md`), which is exactly
why this gate names its one file rather than pretending to a general rule.

**Nothing guards the proxy, and a check that pretended to was deleted.** This note first
claimed `test/unit/tools/router-budget.test.js` guarded the substitution with a 24–32%
non-letter-byte band, on the theory that composition drift is what moves bytes/token. A checker
was asked to break it and did, using this paragraph's own example: fill the whole 5,740-byte
headroom with a CSS fence and the file is 17,342 real tokens while the gate reports 16,509 — 5%
understated — with the band green at 29.6%. Across every tracked `.md` over 4k, non-letter
share and bytes/token correlate at r = −0.30, and of the 625 repo files inside that band
bytes/token spans 3.53 to 4.70. It could not have worked structurally either: 5,740 bytes is
under 10% of the file, so nothing that fits under the ceiling moves a whole-file ratio by 4.5
points.

So the proxy is **unguarded**. The honest sentence beats the reassuring assertion, because the
assertion is the one a future reader would have trusted. What holds the substitution together
is that raising the ceiling means re-measuring with `o200k_base` — which is when the
calibration gets re-derived.

## The number

**64,500 bytes ≈ 16,509 tokens**, against today's 58,760 / 15,041. Headroom is 5,740 bytes
/ ~1,470 tokens — **+10%**, chosen by the owner. One rule the size of #22 (1,288 tokens) or
#29 (1,164) fits without a trade; a second does not.

**Zero slack was rejected on purpose.** `US_ENGLISH_BUDGET` was a burn-down toward zero and
its ratchet shape was right for that; this file is *allowed* to be its size, so a zero-slack
gate would make every future edit that adds a word fail the build. That is the "a bad gate
is a permanent tax" case from CLAUDE.md's own second filter.

For scale on the other side: the owner's post-merge review of the preceding token work
measured the whole line at ~$0.04–0.07 per session. This gate is not claiming a saving. It
is claiming that the next 1,470 tokens should be a decision somebody makes rather than an
accumulation nobody sees.

## Two things deliberately not done

- **No `CLAUDE.md` entry announcing the gate.** A rule about the router's size, written
  into the router, is the joke it sounds like — and the failure message is self-contained:
  it names the ceiling, the constant, where to raise it, and the one wrong fix.
- **The tiering note is not amended.** Its rule is written for indexes and remains correct
  as written; this is a second budget for a different shape, in the way
  `2026-08-30-mandated-read-surfaces.md` was a third. `engineering/decisions/**` is a dated
  archive.

## Removable when

The ceiling is raised in a PR that says what the extra text buys — that is the gate working,
not a failure of it. The gate itself is removable when `CLAUDE.md` stops being resident, or
when a repo tokenizer makes the proxy unnecessary. Neither is close.
