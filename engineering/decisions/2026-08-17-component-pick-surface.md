---
status: shipped
summary: >
  The component catalog cost 95k tokens to read and HARD RULE #6 makes reading it
  mandatory before every _class: slide, so it was the most-repeated read in the repo
  — while AGENTS.md itself said the file is only for PICKING and the authoring detail
  belongs in each component's docs.md. A one-line-per-component pick list (3.8k tokens)
  now carries what a pick needs; components.json is untouched for the tools that read
  it. Third application of the index-tiering rule, and the one with the highest hit rate.
---

# The component pick surface — 95k tokens to choose one of 61

## Symptom

`2026-08-17-context-index-tiering.md` fixed the two most expensive *routed-to* reads
and logged the bigger fish: `dist/docs/components.json` at **95,382 tokens**, which
both `CLAUDE.md` and `AGENTS.md` point agents at, with `AGENTS.md` describing it as
"one read gives you every component's axes, search tags, slots, authoring skeleton…".

**The prior state was not merely expensive — it was silently WRONG.**
`components.json` is **11,437 lines**. A default 2,000-line read surfaces the
alphabetical front of the catalog and stops: `actors` … `code`, roughly a third of
the 61. So an agent following the instruction to "load this to select a component"
either paid for six paginated reads, or — far more likely — picked from whatever
happened to be in the first page and never saw `quadrant`, `roadmap`, `timeline` or
`verdict-grid` at all. That is a correctness defect wearing a cost defect's clothes,
and it is the real case for this change. It was found by an adversarial pass, not by
me, and it belongs at the top of this note rather than in it.

It fires more often than either file that was already fixed. **HARD RULE #6 makes a
component lookup mandatory before authoring any `<!-- _class: X -->` slide** — a
per-slide cost in a slide-deck engine, against a symptom search that fires only when
something breaks.

The sharpest evidence is that the repo already knew the shape of the answer.
`AGENTS.md` says, verbatim:

> `components.json` is for *picking*; each component's generated
> `lib/components/<bucket>/<name>/<name>.docs.md` is for *authoring inside* the one
> you picked.

The file it points at carries both. Choosing one of 61 components meant reading all 61
components' slots, skeletons, effective variants and anti-pattern prose.

## Cause

Same as the two before it: **one artifact serving two jobs, sized for the larger one.**
`components.json` is a faithful projection of the manifests — nothing in it is wrong or
stale, and its `--check` gate has always held. It is simply the union of what a *tool*
needs and what an *author* needs, read by an agent that needed neither in full.

Measured, four fields carry 58% of the file:

| field | value chars | read by app code? |
|---|---:|---|
| `effectiveVariants` | 44,079 | **YES** — `docs/src/pages/studio.astro:119`, the Studio variant drawer |
| `whenToUse` | 43,254 | yes, by tooling — `tools/intent-bakeoff/*.mjs` |
| `slots` | 39,524 | **YES** — `studio.astro:103`, the AI primer’s slot contract |
| `antiPatterns` | 39,367 | yes, by tooling — `tools/intent-bakeoff/*.mjs` |

Sizes are characters of each field’s compact JSON value, not their pretty-printed
footprint in the file, which is larger. The 58% is measured differently — prune the
four fields and re-serialize: 395,015 → 165,729 chars.

**An earlier draft of this note said all four were read by nothing, and that was
wrong.** An adversarial checker found `studio.astro` reading `slots` and
`effectiveVariants` straight out of the catalog and feeding them to the Studio’s AI
primer and variant drawer; pruning them would have cut the primer’s per-layout slot
contract from 171 lines to zero — the exact regression
`docs/src/components/studio/chat-grounding.test.ts` exists to prevent. The error came
from grepping the consumers I had already found rather than the tree, which is what
makes a wrong “verified” claim worse than no claim at all.

What the narrower consumers read, verified: the Studio’s `SlidePicker.tsx` takes
`name`, `bucket`, `description`, `purpose`, `form`, `function`, `substance`, `tags`,
`variants`, `skeleton`; `lente/suggest.ts` takes `name`/`form`/`function`/`bucket`;
`deck-export.js` does not parse the catalog at all — it fetches the file and drops the
blob into the zip. The docs-site component pages render `whenToUse`/`antiPatterns` from
the **manifests directly** (`lib/components/index.js` `loadAll()`), not from this file.
And all 61 per-component `.docs.md` files carry Slots / When-to-use / Anti-patterns —
the detail is already at L2, where #6 sends you.

## Fix

A fourth projection from the same generator: **`dist/docs/components.pick.md`**, one
line per component, **3,840 tokens** for the whole catalog — a **25x cut** on the
mandated read.

Each row carries exactly what a pick needs and nothing else: name, bucket, the three
axes, search tags, the **effective** `capacity` as `axis:sweet/soft/hard` with its
escalation target, the **neighbors** it is most often confused with, and a one-line
purpose that is a COMPLETE SENTENCE.

Two of those came out of the adversarial pass, and both were the same mistake:
shipping a pick surface that could not discriminate.

- The first cut clamped `purpose` at 96 characters, which truncated **61 of 61 rows**.
  Manifest prose is written head-first ("Use for X…") and tail-last ("…for Y, use
  `Z` instead"), so a blind character clamp ate the discriminating half of every row —
  and, being unmarked below the cap, rendered as a complete claim. This is *exactly*
  the guard `2026-08-17-context-index-tiering.md` established for the decision gists,
  written the same day and not carried across. Cutting at a sentence boundary (160-char
  backstop) truncates **4** rows instead of 61 and is **smaller** — 4,925 characters
  against 5,620. A worse output was also a bigger one.
- The `see also` column exists because the catalog's confusable clusters are the whole
  problem: `list` / `cards-stack` / `list-tabular`, `matrix-grid` / `matrix-2x2` /
  `roadmap`. Without it an author whose item count happens to fit the first plausible
  row commits to it and never learns a neighbor fits better. `escalates to` answers
  "my count is too big"; `see also` answers "my shape is wrong". Capacity rides along because `AGENTS.md`
requires counting content against it *before* committing to a component — a pick
surface missing it would just add a hop.

**`components.json` is untouched.** It is a projection that tools consume, not a
document to trim, and shrinking it would have risked the Studio for no gain. What
changed is the routing: `AGENTS.md` and `CLAUDE.md` now send *picking* to the pick
list and say plainly not to load the full catalog to choose.

One line per component also makes the catalog **greppable** — `grep -i comparison`
returns rows, where the JSON needed a structured walk.

## What this confirms about the rule

Three applications now, and the same shape every time: **an artifact that serves two
jobs gets sized for the larger one, and the cheaper job silently pays.** The fix is
never to delete the detail — it is to give the cheap job its own surface and route to
it.

The pick list lands at 3.8k against the ~10k index budget, comfortably inside, which is
worth stating after the decisions index missed that budget by 2.5× on its rows. The difference is
what the row has to carry: 425 decision notes need a sentence each to be
distinguishable; 61 components are distinguishable by name, axes and tags.

*(Amended 2026-08-17.* That budget has since been restated — see
`2026-08-17-context-index-tiering.md` §"Amendment". The ~10k figure survives for
**read-whole** surfaces, which is exactly what this one is: 61 rows an agent loads in a
single call (3,844 tokens after this change adds two `see also` names). The decisions index turned out to be a **grep-first** surface, budgeted
per-row instead, so it was never over budget under the access mode its routing actually
prescribes. Nothing about the pick list's number changes; only the class it belongs to
is now named.)

A test pins the size (`build-pick-list.test.js` fails past 24 KB) so the pick list
cannot quietly become a document — the exact failure mode this rule exists to catch.

## Why not extend `new:slide --list` (HARD RULE #15)

`npm run new:slide -- --list` already prints the whole catalog grouped by family at
~1.5k tokens, reading the manifests live, and it is indexed in
`engineering/capabilities.md`. #15 says consult that index before building anything, and
this projection was written without doing so — the honest record is that the
alternative was found by review, not by me.

It stays a file rather than becoming CLI output for three reasons, and they should have
been argued up front rather than assumed: a committed artifact is **greppable** without
spawning a process, it **ships in the package** (`design/skills/` and `dist/` are
published, so downstream consumers get the pick surface too), and it is readable by
agents and tools that cannot shell out. The CLI keeps its job — scaffolding a slide —
and gains nothing from carrying a second one.

## Measured after the fact: what the thin row costs

The artifacts were verified before merge; the OUTCOME was not. `npm run intent:pick-eval`
now measures it against the repo's own FIT corpus (264 cases — every `whenToUse` body is
a described task whose component is ground truth, every redirecting `antiPattern` names a
better component), scored by the repo's own lexical ranker over two evidence sets:

|  | top-1 | top-3 |
|---|---|---|
| FULL catalog (`components.json` prose) | 59.8% | 78.8% |
| PICK surface (a pick row's text) | **42.0%** | **62.1%** |
| PICK + `whenToUse` titles | 42.0% | 63.3% |
| PICK + first `whenToUse` sentence | 42.4% | 62.1% |

**The row is worth 17.8 points of top-1 less than the full prose, and no cheap addition
recovers it.** That is the honest cost of the change, and it belongs on the record beside
the 25x saving.

Two things keep it from being a verdict:

- **It measures a lexical ranker answering one query, which is not how the pick surface
  is used.** The list is 61 rows an agent reads WHOLE (3.8k tokens), then follows
  `see also` and opens the chosen component's `.docs.md` — a two-step flow this
  single-shot ranking cannot model. The number is best read as the cost of the removed
  TEXT, which is the same fact the grep-recall note records, not as "agents pick worse".
- **No shipped surface ranks over the pick list.** The Studio's component search indexes
  `components.json`, which this change did not touch, so there is no production
  regression here to find.

**The leakage trap is why the last two rows exist.** A corpus query is `title + body` of a
`whenToUse` entry, so any index containing that entry scores string equality.
`fit-corpus.mjs` supplies `excludeKey` for leave-one-out. Measured WITHOUT it, indexing
`whenToUse` titles reads **71.6%** — better than the full catalog, and entirely false.
With the guard applied it is 42.0%, identical to carrying no `whenToUse` at all. The
first run of this experiment made exactly that mistake, and the corpus file's own header
had warned that such a result "should be disbelieved on sight".

What this does NOT justify is padding the row: the two obvious remedies were measured and
buy nothing. If picking accuracy ever proves to be a real problem, the answer is a better
retrieval step, not more prose per line.

## Then measured with agents, which reverses the reading

The ranker number above is a proxy, and the proxy was pessimistic. Four agents (Opus)
were each given **one surface and nothing else** — no manifests, no `.docs.md`, no
grep — and asked to name the `_class` for 12 authoring briefs written in author voice
("four metrics for the monthly ops review, each needs a label, the value, and whether
it's on track"). Ground truth was locked in a pre-registered file before any agent ran.

| condition | strict (the manifest's own answer) | defensible | distinct context ingested | reads |
|---|---|---|---|---|
| PICK surface | 22/24 — **92%** | 24/24 — 100% | **9.8k** | 1 |
| FULL catalog | 24/24 — 100% | 24/24 — 100% | **179.6k** | 10–11 |

*(Re-run by the harness on 2026-08-30 — see § "Re-run by the harness" below. The accuracy
columns are unchanged from the original hand-transcribed run, to the brief. The cost
columns are not: they now come from `modelUsage`, and the two instruments do not compare.)*

**The two surfaces agreed on 11 of 12 briefs.** The single disagreement is brief #3 —
six onboarding steps, in order, a sentence each: the full-catalog agents said
`list-steps`, the pick agents said `timeline-list`, which is in the same confusable
cluster and is a choice an author could defend.

**One sentence here did NOT survive the re-run and is withdrawn.** It read "both conditions
flagged the same two briefs as low-confidence, unprompted", which was true of the hand
transcription — all four easy-set runs self-reported `[1, 3]`. The harness runs disagree:
the pick agents flagged `[3]` and `[3]`, the full-catalog agents `[1, 3]` and `[1, 3]`. So
the two conditions did **not** agree, and the pick surface reported *less* doubt while being
the condition that missed. `low_confidence` is descriptive and was never scored — but it was
cited, and a cited number is a claim.

So the lexical proxy's **-17.8 points overstated the loss**: it models one-shot TF-IDF
retrieval over a row, while the real flow is an agent reading all 61 rows — 3.8k tokens
fits comfortably — and reasoning across them. Retrieval signal and decision signal are
not the same quantity, and this surface was built for the second.

The cost side is the sharper finding, and the harness re-run made it sharper still. A
full-catalog agent ingests **179.6k tokens of distinct context across 10–11 paginated
reads** to reach the same 12 answers a pick-surface agent reaches from **9.8k and a single
read** — **18.4x**. That is also the mechanism behind the "11,437 lines, a default read
stops at `code`" defect above: at **11,554 lines** against a 2,000-line default, the full
catalog is not one read, it is **six pages**, and an agent that does not pay for all six is
choosing from a fraction of the catalog.

**Keep those two numbers apart.** Six is the PAGINATION floor; **10–12 is the Read call
count** the harness measured, which is larger because agents re-read and overlap. The ledger
cannot arbitrate between them: `tool_calls` records `{id, name}` and no tool input, so
nothing in the artifact separates twelve distinct pages from six pages plus six re-reads.
`surface_reads` is auditable from the artifact; the pagination claim rests on the line count,
not on the ledger. Storing `input.offset`/`limit` would close that, and has not been done.

**Limits, stated plainly.** Twelve briefs, two runs per condition, and the briefs were
written to have defensible ground truth — which makes them easier than a real confusable
case. The 8-point strict gap is literally one brief. And the same person wrote the briefs
and both surfaces, so unconscious favouring of pick-row vocabulary cannot be ruled out.
**The discriminating follow-up this paragraph used to call for has now been run** — see
the next section; the same-author caveat survives it unchanged.

## Then measured on the cases built to break it

The limit above named a specific missing experiment: briefs drawn from the confusable
clusters (`list` / `cards-stack` / `list-tabular`, `matrix-grid` / `matrix-2x2` /
`roadmap`) where the `see also` column is supposed to earn its place. Twelve such briefs
were pre-registered in `tools/intent-bakeoff/pick-surface-briefs-confusable.json` and
committed before any agent ran; each encodes the ONE distinction the manifest itself
draws between a component and its neighbors — `cards-stack`'s vertical reading order
against `cards-grid`'s at-a-glance parallelism, `matrix-2x2`'s author-placed discrete
labels against `quadrant`'s continuous data, `roadmap`'s workstream×phase cells against
`gantt`'s overlapping spans. Same design as before: four agents on Opus, two per
condition, one surface each and nothing else.

**How this record was made.** Both bake-offs are written by
`npm run intent:pick-agents` (`tools/intent-bakeoff/pick-surface-agent-eval.mjs`) into
`pick-surface-agent-runs.json` and `pick-surface-agent-runs-confusable.json` — one file per
brief set, each carrying every agent's **raw return verbatim**, the per-call tool ledger,
the `usage`/`modelUsage` blocks and the cost. The briefs and the ground truth are gated
artifacts committed before any agent ran; the picks are now harness-written rather than
copied by hand. Re-run either set with `--score-only` for free, or re-earn it for about
$5 a set.

**This replaced a hand transcription, and the replacement changed things** (2026-08-30,
#1897). Until today this paragraph disclosed that `pick-surface-agent-runs.json` was a
human's copy of what eight subagents returned — an honest report, but under HARD RULE #23
not a reproducible measurement. #1734 built the harness and #1777 landed it; neither ever
wrote this file. What the re-run found is in § "Re-run by the harness" below, and it is not
a rubber stamp: the accuracy figures on the easy set reproduce to the brief, the confusable
set moved **against** the pick surface, and the cost figure the note had been quoting is
retired rather than confirmed.

| condition | strict | defensible | distinct context ingested | reads |
|---|---|---|---|---|
| PICK surface | 21/24 — **87.5%** | 22/24 — 91.7% | **9.9k** | 1 |
| FULL catalog | 24/24 — 100% | 24/24 — 100% | **180.2k** | 11–12 |

**The STRICT gap DID widen on the cases chosen to widen it** — 87.5% against 100%. The
hand transcription had recorded 92% here and the harness re-run does not reproduce it: one
pick agent additionally answered `cards-grid` where the manifest says `inventory` (brief 7,
inside `ok`, so defensible but not strict). The transcription recorded the two pick agents
returning *identical* picks on both sets; the re-run's two disagree on the confusable set,
so there is replicate variance the earlier record did not show, and a two-agent condition
cannot separate it from a real effect. **The DEFENSIBLE
gap did widen, from 0 points to 8**, and that is the honest headline of the table: on the
easy set the pick agents' one miss (`timeline-list` for brief 3) sat inside the `ok` set,
so both surfaces scored 100% lenient; here the miss falls outside both `expect` and `ok`.
A confusable brief costs you a defensible answer, not just a strict one.

The cost gap is the figure that moved most: **18.1x the distinct context and 11–12 reads
against 1.** The retired 4.3x came from the transcription's `subagent_tokens`, which was the
Agent tool's accounting inside an interactive session; these come from `claude -p`'s
`modelUsage`. **The two instruments do not compare** and the ratio is not "corrected" from
4.3x to 18.1x — the old number is withdrawn, and this one is what the harness measures
end-to-end on both sets (18.4x on the easy set, 18.1x here, from runs that never see each
other's context).

**The one miss is worth more than the score.** Brief 12 — six compliance dates, each
needing the date, a read on whether we are clear or exposed, and a line of explanation —
went `timeline-list` in both full-catalog agents and `regulatory-update` in both pick
agents. Both full agents named `regulatory-update` as their runner-up and rejected it for
a reason that is not on the pick row and cannot be: its antiPattern says each row needs
*all three* of citation, summary and effective date, "otherwise the row reads as rumor."
**That sentence is sourced from the hand transcription, which this note's own re-run
overwrote in place** — the harness prompt demands a bare JSON envelope, so the committed
`raw_return`s carry picks and nothing else, and no runner-up reasoning survives anywhere in
the tree. It is kept because it was observed, and flagged because it is no longer falsifiable
from the artifact, in the one section whose thesis is that the artifact is the point.
**The discriminator is a required sub-element, and a one-line purpose cannot carry one.**

**And it was not a `see also` failure — it was a `see also` GAP.** `timeline-list`
pointed at `gantt`, `list-steps`, `journey`, `roadmap`, `progress`; `regulatory-update`
pointed at `authority-chain`, `list-criteria`, `list-steps`, `list-tabular`. **Neither
named the other**, though both carry the `changelog` tag and the brief's own word
"compliance" is a literal tag on the row the pick agents chose. The column the experiment
was built to test never got a chance to fire. The missing edge is added here, both ways,
with its `when` clause — which is the fix this note predicted ("a richer `see also` or a
discriminating clause in the row, not reverting to the 95k catalog").

**Be precise about what that fix reaches, though.** The pick row's `see also` column
renders NAMES only, so a pick-only agent — the exact condition that missed — now sees the
bare token `timeline-list` in `regulatory-update`'s row and vice versa. That is what the
column is for ("where to go when the SHAPE is wrong"), and it is more than the nothing
that was there. **The `when` clause itself is not on that surface**; it lands in the two
`.docs.md` files and the galleries, which HARD RULE #6 sends you to *after* the pick. So
the fix gives the failing condition a pointer, not the discriminator.

**Rendering every `see also`'s `when` clause on the row was measured and rejected**:
243 links across 61 components cost **+2,883 tokens — 3,844 → 6,727, a 74% increase** —
and would take the file past the 24 KB pin `build-pick-list.test.js` holds (16,992 →
~30,300 characters). The answer to a missing edge is the edge, not a fatter row.

**What this result does NOT establish.** The `see also` fix was derived from the single
observed miss, so re-running these same twelve briefs is circular as a *test of the fix*.
It has nonetheless now been run with the edge in place, and **the fix did not rescue the
pick agents: both still answered `regulatory-update` on brief 12.** That is weak evidence
(circular by construction, and n=2), but it points one way, and it is the direction this
note predicted was possible — the row gained a bare pointer, not the discriminator, and a
pointer the agent has no reason to follow when its first answer already looks right. Read
it as the fix being **unverified and now mildly doubted**, not as verified. The brief that produced the miss
also handed the pick surface a verbatim tag match (`compliance`) pointing at the wrong
component, which makes 92% pessimistic here rather than flattering — worth stating in
both directions. And the same-author bias is unchanged and not retired: whoever wrote
these briefs also owns the surface under test. The mitigation is partial — discriminators
were read out of each manifest's `whenToUse`, which is text the FULL condition can see
and the PICK condition cannot, so where that biases the experiment it biases it toward
the full catalog — but it is not an independent-author design.

## Re-run by the harness (2026-08-30, #1897)

Everything above was, until this section, a hand transcription of what eight subagents
returned. `npm run intent:pick-agents` re-ran all eight — two conditions, two replicates,
both committed brief sets — and wrote the artifacts itself, all on Opus per HARD RULE #27.

**The spend, itemized, because half of it bought nothing.** $5.17 for the easy set and $5.09
for the confusable set = **$10.26** for the eight scored agents, which is what the artifacts
below are. Before them: **$0.51** validating one agent end-to-end, **~$0.16** on a
single-brief probe run purely to capture a raw transcript for the defect in finding 3, and
**$10.37** on a first full pass that was DISCARDED once that defect was found. About **$21**
total, of which $10.37 is the price of having shipped a harness whose accounting was never
tested.

**Three things came back, and only the first is a confirmation.**

**1. The easy set reproduced exactly.** 22/24 strict and 24/24 defensible for the pick
surface, 24/24 and 24/24 for the full catalog, and the single disagreement is still brief 3
(`timeline-list` against `list-steps`). A transcription is a weak artifact, but this one was
faithful.

**2. The confusable set moved against the pick surface**, 92% strict to 87.5%, on a
replicate that disagreed with its twin. See that section for the detail. This is the case
for re-running rather than re-arguing: the number that moved is the number the experiment
existed to produce.

**3. The harness's own headline metric was wrong, and it under-counted to ZERO.**
`parseStream` de-duplicated stream frames by `message.id` — but the CLI splits ONE assistant
message across several frames sharing that id, one per content block. Keeping only the first
frame therefore dropped any `tool_use` that followed a text or `thinking` block in the same
message. Measured on a captured transcript: four frames, two message ids, the `Read` sitting
in the *second* frame of the first id, and `surface_reads` reported **0** for an agent that
had plainly read its surface.

Across the discarded first pass the buggy parser recorded `pick` at 0–1 reads and `full` at
1–4; the same conditions under the fix record 1 and 10–12. **The entire paginated-read
argument runs through that number**, so the first pass was discarded and paid for again.
Those before-figures are quoted from the run log and are **not reproducible from the tree** —
the discarded artifacts were overwritten rather than committed, which is the same
un-auditability the fix exists to remove, one level up.

De-duplication now keys on the `tool_use` block's own `toolu_…` id — repeated by a
re-delivered frame, never shared by two real calls — and each run stores the per-call ledger
its counts derive from, so `surface_reads` is auditable from the artifact instead of by
paying for another run. The absence of that ledger is the only reason this defect needed a
re-run to find, and it is the general lesson: **an accounting artifact that cannot be
re-derived from what it stores is a transcription with extra steps.**

**What the re-run does NOT retire.** The same-author bias is untouched — whoever wrote these
briefs owns the surface under test, and that is #1898, not this. Twelve briefs and two
replicates per condition remain too few to separate replicate variance from effect, which
finding 2 now demonstrates rather than merely cautions about. And the numbers are `claude -p`
numbers: they do not compare to what an agent costs inside an interactive session, which is
the flow the routing actually serves.

## The one column that is mostly empty (#1784)

Recorded here because this note argues for `capacity` twice — it rides along "because
`AGENTS.md` requires counting content against it *before* committing to a component",
and the pick list's own preamble tells the reader to count before choosing.

**Measured 2026-08-30 over the generated file: 38 of the 61 rows render `capacity` as
`—`.** The column is present, documented, and empty for roughly three components in
five. That is not a defect in the pick surface — the manifests are where `capacity`
lives, and #1784 (open) records that it is undeclared on most of them — but it is the
gap between what this surface promises a picker and what it can currently deliver, and
the two were tracked in separate places until now.

The 23 rows that DO carry one come from THREE places, and the third is the interesting
one — #1784 §1 flags a discrepancy between the manifests and the catalog without naming
the mechanism, and the mechanism turns out to be two functions, not one:

| where the budget comes from | count | reaches `components.json`? |
|---|---:|---|
| a flat `capacity` in the manifest | 19 | yes |
| `adapt.capacity.wide` via `capacityEntry()` (`tools/build-docs-portal.js:81`), stamped `family: 'wide'` | 2 — `kpi`, `list` | yes |
| an AXIS-LESS family budget via `capacityCell()` (`:1117`) | 2 — `matrix-2x2`, `split-compare` | **no** |

`capacityEntry()` bails on a family table with no `axis` (`:85`), and those two carry
`axisRetired` prose instead of an axis — so the catalog omits them entirely while the
pick cell renders them anyway. You can see it in the rows without opening either file:
every other value row is prefixed with its axis (`list → item:5/6/6*`), and those two
are bare (`matrix-2x2 → 4/4/4`, `split-compare → 2/2/2`).

**So the two surfaces disagree in both directions, and 21 vs 23 is not drift.** An
earlier version of this section said the count was "moving" — 21 published on
2026-08-23 against 23 today — and that was wrong: `components.json` publishes 21 and
`components.pick.md` renders 23 *right now*, simultaneously, and nothing about capacity
has changed across the available history (no `capacity` line in
`git diff 2da7444 HEAD -- 'lib/components/**/*.json'`, and `capacityCell()`'s axis-less
arm was already there). It is a structural gap of exactly two components, not a
timestamp. Refuted by a fact-checker pass over this very section, which is the point of
running one.

It also bounds a claim above. The bake-off's cost finding (one read against nine) does
not depend on this column, but "each row carries exactly what a pick needs" is weaker
than it reads while the count that decides whether your content fits is blank on most
rows. Filling the manifests fixes both surfaces at once; nothing here needs to change.

## Deliberately not done

- **`components.json` must NOT be pruned, and the first draft of this note was wrong to
  call pruning “available and tempting”.** Two of the four heavy fields are load-bearing
  for the Studio (see the table above), `whenToUse`/`antiPatterns` feed the
  `tools/intent-bakeoff` evaluators, and the file is a published machine surface — the
  LFM spec names it, `sync-playground-assets.mjs` ships it into the playground bundle,
  and `lib/core/marp-bundle.js` copies it into every exported deck. The pick list makes
  its SIZE irrelevant to agents, which was the actual problem; its CONTENT is not spare.
- **The 62 `*.docs.md` files (105k tokens combined) are untouched.** Nobody reads them
  in bulk — #6 sends you to exactly one, which is already the right shape.

## Removable when

Never — structural, like its predecessor. If a future field turns the pick list into a
document, the size test fails first, and the answer is to tier again rather than to
raise the ceiling.
