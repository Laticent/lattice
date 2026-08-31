---
status: shipped
summary: >
  `CLAUDE.md` was the only surface in the context-tiering system with no budget, and the only
  one every session pays unconditionally. It is now gated at 16,500 o200k_base tokens against
  15,117 today. The gate caps GROWTH rather than demanding a trim, because #1897 measured the
  expensive thing as the read boundary and `CLAUDE.md` is on the cheap side of it with zero
  reads: both trimming options priced on #1896 convert resident text into an extra read. It
  measures TOKENS, not a byte proxy, and the discarded proxy is the useful half of this
  record — the ratio was stable to 0.079% but nothing could check that it stayed stable, and
  the composition check written to guard it was broken in one attempt. The measurement costs
  30 MB installed and ~190 ms per run, both measured.
---

# A budget for the router — cap the growth, not the file

## What was unbudgeted

`2026-08-17-context-index-tiering.md` set the rule: a read-whole index holds ≤10k tokens, a
grep-first index budgets the row. Three surfaces were fixed under it, and
`2026-08-30-mandated-read-surfaces.md` then found the shape nobody had looked for — a document
a HARD RULE makes you open — and measured two more.

`CLAUDE.md` is neither. It is the **L0 router**, and it is the one file that is not read at
all: it is resident before the first tool call, on every session, unconditionally. The rule it
carries was written for indexes, so the router was out of its own scope by construction.

## The measurement, and how often it went stale

`o200k_base`, this file, across the states it passed through in one evening:

| commit | bytes | tokens |
|---|---:|---:|
| `d9a8dee` | 54,252 | 13,897 |
| `4271fe1` (adds HARD RULE #30) | 57,937 | 14,842 |
| `ff35963` (= `bd1ff9c` = `b77107d`) | 58,260 | 14,914 |
| `9504fde` (main, mid-PR) | 58,550 | 14,990 |
| this branch | 59,050 | **15,117** |

*A first version of this table put 15,041 on the `9504fde` row. That was the pre-rebase
branch's count paired with `9504fde`'s byte count — half one commit, half another, wrong by
51. Caught by a checker, in the table whose whole subject is figures going stale.*

**Three published figures went stale inside one session, and the last one moved while this
gate's own PR was open.** `9504fde` added 290 bytes to `CLAUDE.md` after the branch had
already measured and recorded 15,041. That is not an argument against the analysis; it is the
argument *for* the gate, and it is why the gate derives the number at run time rather than
carrying a calibration somebody has to remember to re-check.

**#1896's 13,897 was correct when it was posted**, and a first draft of this note wrongly
called it "four commits and about 80 minutes stale". The comment landed at 17:01; `d9a8dee`
was the tip from 16:13, and `4271fe1` did not land until 17:34. The draft claim was also
internally impossible — at 80 minutes one commit had landed, four is 160. Corrected here
rather than quietly dropped, because it accused someone else's measurement of an error it did
not make.

## Why the gate caps growth instead of demanding a trim

#1897's bake-off measured a **step function at the read boundary**, not a linear token cost:
the full catalog costs 18x the pick surface because it takes 10–12 paginated reads against 1,
and an agent that does not pay for all of them chooses from a fraction of the catalog.
`CLAUDE.md` sits on the cheap side of that boundary in the strongest way available — no read
at all.

So both trimming options priced on #1896 spend the expensive currency to save the cheap one:

- **Routing the canonical-doc table** (1,445 tokens over its 37 data rows plus header) is the
  clearest case and is actively wrong. That table is the thing that tells you which doc to open; moving it behind a
  pointer spends a read on exactly the sessions that need routing.
- **Splitting rule text from rationale** carries the issue's own objection: *a HARD RULE that a
  session does not read is not a rule.* #22's four-arm gate description and #29's two-posture
  split are long **because** the evasion envelope is the load-bearing part.

The file is therefore allowed to be its size. What is gated is unbounded growth — the failure
the tiering note named for `gotchas.md` and the decisions index, where a file grows by the same
increment that makes it valuable.

## It measures tokens, and the discarded byte proxy is the point

#1896's acceptance check says the number is measured with `o200k_base` and not estimated from
byte length. This gate does that. **It nearly did not, and the reasoning that almost won is
worth keeping**, because it was good reasoning that reached the wrong answer.

The case for bytes was real. No tokenizer was a repo dependency and the tiering note kept it
that way on purpose. `ROW_CAP` in `tools/build-capabilities.js` and in
`tools/build-decisions-index.js` both gate a token-motivated budget with a **character** count
today, so a proxy was the established method here rather than a novel substitution. And because
the gate judges ONE file, the calibration was unusually tight: 3.9039, 3.9036, 3.9064, 3.9059, 3.9062
bytes per token across the five states above, spanning +1,220 tokens — a spread of **0.072%**,
where across other prose files the ratio runs 3.61 (`decisions/README.md`) to 4.42
(`components.pick.md`).

**What killed it is that nothing could check the ratio stayed stable.** A composition check
shipped first: assert the share of non-letter bytes stays in a 24–32% band, on the theory that
composition drift is what moves bytes/token. A checker was asked to break it and did, using the
gate docblock's own example — fill the whole headroom with a fenced block of CSS custom-property
declarations and the file runs ~7% more tokens than the gate reports, with the band green. (The
first telling of this said "a CSS fence" and quoted 17,342 tokens. A later checker could not
reproduce that figure: `dist/lattice.css` verbatim in a fence gives only 1.2% over. It takes
DENSE `--token: #hex;` declarations to reach ~7%. The conclusion survives, the artifact was not
recoverable, and "CSS fence" was doing more work than a reader would guess.) Across
every tracked `.md` over 4k, non-letter share and bytes/token correlate at **r = −0.30**; of the
631 such files inside that band, bytes/token spans 3.53 to 4.70. It could not have worked
structurally either: the headroom is under 10% of the file, so nothing that fits under the
ceiling moves a whole-file ratio by 4.5 points.

That left two honest options — an unguarded proxy, stated as unguarded, or the real
measurement — and the owner chose the measurement.

**What it costs, measured rather than estimated.** `gpt-tokenizer` is **30 MB installed**
(27.2 MB unpacked, 1,537 files), because it ships every encoding in both CJS and ESM.
Requiring the `o200k_base` encoding alone costs **~175 ms** and **+70 MB RSS** (43 MB → 113 MB;
an earlier draft quoted the 113 as the cost, which is the whole process, not the delta).
Encoding this file costs ~30 ms, so **~200 ms attributed** on a ~6.2 s `check:ownership` run,
about 3%.

*The paired wall-clock timings a first draft offered as proof of that — 6,180/6,052/6,271 ms
with against 6,153/5,990/5,907 without — do not actually resolve it: a 151 ms difference of
means inside per-arm ranges of 219 and 246 ms is noise at n=3. The ~200 ms figure comes from
in-run attribution (timing the real module load and the real encode inside a live
`check-ownership` run), which does resolve it. The magnitude holds; the evidence originally
cited for it did not.* *An earlier version of
this note guessed "~2 MB" when the option was put to the owner. It is 30 MB — a 15x error in
the number a decision was made on, corrected here.*

The require is deliberately **inside the function**: `tools/check-ownership.js` is loaded at
module scope by several test files, and none of them should pay 180 ms for a tokenizer they do
not use.

## The number

**16,500 tokens**, against 15,117 today — **1,383 tokens of headroom, +9.15%**. The owner chose
"+10%" against the byte pair the gate then used (64,500 / 58,760 = +9.77%); the constant carried
over when the measure changed and the file grew, so the label is "+10%" and the arithmetic is
+9.15%. Stated rather than rounded, since rounding a number somebody else set is how it stops
being theirs. One rule the size of #22 (1,288 tokens) or #29 (1,164) fits without a trade; a second
does not.

**Zero slack was rejected on purpose.** `US_ENGLISH_BUDGET` was a burn-down toward zero and its
ratchet shape was right for that; this file is *allowed* to be its size, so a zero-slack gate
would make every future edit that adds a word fail the build. That is the "a bad gate is a
permanent tax" case from CLAUDE.md's own second filter.

For scale on the other side: the owner's post-merge review of the preceding token work measured
the whole line at ~$0.04–0.07 per session. This gate is not claiming a saving. It is claiming
that the next 1,383 tokens should be a decision somebody makes rather than an accumulation
nobody sees.

**One divergence from real `o200k_base`, recorded because it is invisible.** `gpt-tokenizer`
4.0.0 and OpenAI's `tiktoken` agree on all 80 tracked `.md` files tested, `CLAUDE.md` included —
but they differ on a leading BOM: tiktoken merges it into the following token, gpt-tokenizer
emits three byte-fallback tokens. The gate reads with `'utf8'`, which does not strip a BOM, so a
BOM'd `CLAUDE.md` would over-count by 2. It has no BOM, and `.gitattributes` pins `eol=lf` so
line endings cannot vary by checkout either. A divergence, not a defect — but a future reader
comparing this gate against `tiktoken` should know where the one gap is.

## Two things deliberately not done

- **No `CLAUDE.md` entry announcing the gate.** A rule about the router's size, written into the
  router, is the joke it sounds like — and the failure message is self-contained: it names the
  count, the ceiling, the constant, where to raise it, and the one wrong fix.
- **The tiering note is not amended.** Its rule is written for indexes and remains correct as
  written; this is a second budget for a different shape, as
  `2026-08-30-mandated-read-surfaces.md` was a third. `engineering/decisions/**` is a dated
  archive.

## Removable when

The ceiling is raised in a PR that says what the extra text buys — that is the gate working, not
a failure of it. The gate itself is removable when `CLAUDE.md` stops being resident. The
tokenizer dependency is removable only by going back to a proxy, and this note is the record of
why that was refused: not because the proxy was inaccurate, but because nothing could tell you
when it stopped being accurate.
