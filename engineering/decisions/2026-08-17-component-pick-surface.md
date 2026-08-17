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
worth stating after the decisions index missed that budget by 2.6×. The difference is
what the row has to carry: 411 decision notes need a sentence each to be
distinguishable; 61 components are distinguishable by name, axes and tags.

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

| condition | strict (the manifest's own answer) | defensible | tokens per agent | tool calls |
|---|---|---|---|---|
| PICK surface | 22/24 — **92%** | 24/24 — 100% | ~48k | 1 |
| FULL catalog | 24/24 — 100% | 24/24 — 100% | 61k–216k | 8–9 |

**The two surfaces agreed on 11 of 12 briefs.** The single disagreement is brief #3 —
six onboarding steps, in order, a sentence each: the full-catalog agents said
`list-steps`, the pick agents said `timeline-list`, which is in the same confusable
cluster and is a choice an author could defend. Both conditions flagged the same two
briefs as low-confidence, unprompted.

So the lexical proxy's **-17.8 points overstated the loss**: it models one-shot TF-IDF
retrieval over a row, while the real flow is an agent reading all 61 rows — 3.8k tokens
fits comfortably — and reasoning across them. Retrieval signal and decision signal are
not the same quantity, and this surface was built for the second.

The cost side is the sharper finding. One full-catalog agent burned **216k tokens across
8 paginated reads** to reach the same 12 answers a pick-surface agent reached in **48k
with a single read** — which is also the mechanism behind the "11,437 lines, a default
read stops at `code`" defect above: the full catalog is not one read, it is six, and an
agent that does not pay for all six is choosing from a fraction of the catalog.

**Limits, stated plainly.** Twelve briefs, two runs per condition, and the briefs were
written to have defensible ground truth — which makes them easier than a real confusable
case. The 8-point strict gap is literally one brief. A discriminating follow-up would use
briefs drawn from the confusable clusters (`list` / `cards-stack` / `list-tabular`,
`matrix-grid` / `matrix-2x2` / `roadmap`) where the `see also` column is supposed to
earn its place. And the same person wrote the briefs and both surfaces, so unconscious
favouring of pick-row vocabulary cannot be ruled out.

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
