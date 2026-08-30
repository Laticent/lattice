---
status: shipped
summary: >
  The index-tiering rule was written for INDEXES and applied to three of them, but two
  surfaces a HARD RULE makes MANDATORY were never measured against it: capabilities.md
  (#15, before building any tool) at 13.8k, and base.docs.md (#6, before authoring a base
  modifier) at 24.5k. Neither is fixable the way an index is. capabilities.md cannot reach
  10k by any row cap — measured, 40 tokens a row still lands at ~10.5k — so its routing
  changes to grep-first and ROW_CAP (600 chars) bounds what a query pays; the tail was 10
  rows costing 18% of all row cost. base.docs.md was not a size problem at all: `### sketch`
  was 8.3k of a 15.5k variants section because NINE front-matter registers had been filed
  under a per-slide variant, one at a time, each arriving as "a sibling of the one above".
  Moving those ten registers to their own file takes the mandated read 24,504 -> 14,991 and
  makes `headline:` findable by someone not reading about handwriting. A fact-checker pass
  over the accompanying pick-surface edits refuted two claims that had already been
  committed, which is recorded here because it is the argument for running one.
---

# The mandated reads — where the tiering rule was never pointed

## What was already true

`2026-08-17-context-index-tiering.md` established the budget: a **read-whole** index holds
≤10k tokens; a **grep-first** index budgets the ROW and gates it. Three surfaces were fixed
under it — `gotchas.md` (75k → 7k), `decisions/README.md` (96k → 26k, then row-capped), and
`components.pick.md` (a 95k catalog → a 3.8k pick list).

All three are **indexes**. Nobody went looking for the other shape: a document a HARD RULE
makes you open before you are allowed to do something. There are two.

| Surface | The rule | Fires when | Was |
|---|---|---|---:|
| `engineering/capabilities.md` | #15 — "consult before building any script/harness" | before any new tool | **13,847** |
| `lib/base/base.docs.md` | #6 — "in the SAME turn open … base modifiers → base.docs.md" | before authoring a base modifier | **24,504** |

A mandated read is the worst possible place for an unbudgeted file, because the cost is not
optional and the reader has already been told the answer is in there.

## capabilities.md — the routing was wrong, not the size

Its own first line said *"check here first"* — read-whole routing — and it missed the
read-whole budget by 38%. The obvious move is a row cap, so that was priced first, before
proposing it:

| cap (tokens/row) | resulting file | rows truncated |
|---:|---:|---:|
| 100 | ~12,445 | 19 / 320 |
| 65 | ~11,565 | 30 / 320 |
| 40 | ~10,511 | 64 / 320 |

**No cap reaches 10k.** At 320 items the file is far past the ~165 crossover the tiering
note derived, so the honest conclusion is the one that note's own Amendment reached about
the decisions index: **change the access mode.** At p50 27 tokens a row it is a good
grep-first index — ten representative queries returned 301–2,590 tokens before the trim and
301–2,211 after, all inside the read-whole budget the file as a whole misses.

`ROW_CAP` (600 characters, gated in both `capabilities:build` and `capabilities:check`) is
therefore not a file-size lever and is not sold as one — it saved 846 tokens, 6%. It bounds
what a QUERY pays. The tail was the whole problem: ten rows over 150 tokens carried **18% of
all row cost from 3% of rows**, and `grep -i intent` cost 158 tokens a row against a 27-token
median because it happened to land on four of them. After the trim: widest row 341 → 156,
`grep -i intent` 1,109 → 696.

**Two deliberate differences from the decisions-index ROW_CAP**, both in the generator's
header so nobody "fixes" them:

- It is a **trim, not a ratchet.** That one was pinned at the widest live row so nothing had
  to change on the day it landed. This one is set below the tail on purpose.
- It scopes to the **script and tool tables, not FRAMEWORKS.** A script row has an L2 — the
  tool's own header, which is the file the reader opens next and has no cap. A framework row
  is curated prose about a third-party library whose L2 is that library's docs.

Every one of the eleven over-cap rows was checked against its tool's header **before** the
trim, file by file. Two that a first grep said were missing turned out to be present under
different wording — which is why the check was per-file rather than per-pattern.

**The trim cost grep recall, and that is the finding worth keeping.** In the first cut
`contrast:palette-native` stopped matching `theme` and `export`, and `equiv:check` stopped
matching `render` — a palette tool you could no longer find by grepping "theme". Both rows
were rewritten to carry the terms again, and ten probe queries now return the same row
counts as before. **A cheaper index that cannot be found is not cheaper**, and a row cap
optimizes the exact quantity that makes a row findable, so this failure mode is structural
rather than a slip.

## base.docs.md — not a size problem

The plan going in was "§ Universal variants is 63% of the file, so index it". Measuring the
subsections first killed that plan:

| subsection | tokens |
|---|---:|
| **`### sketch`** | **8,323** |
| `corners:` | 2,312 |
| state markers | 1,380 |
| the other 13 | 3,483 |

`sketch` was 54% of the variants section and 34% of the whole file — and after its first ~60
lines it is not about `sketch` at all. Lines 765–1186 were **nine `#### The <X>:
front-matter register` subsections** — `mode:`, `finish:`, `split:`, `stamp:`/`tone:`,
`spectrum:`, `rule:`, `eyebrow:`, `headline:`, `lift:` — nested under a per-slide variant.

**How it happened is the ordinary way, which is why it is worth recording.** `mode: sketch`
is how you turn sketch on deck-wide, so `#### The mode: register` followed the sketch section
fairly. Then `finish:` arrived as "a sibling of `mode:`", and seven more followed the same
logic. Every step was locally reasonable and the destination is a section where nothing can
be found: a reader looking for `headline:` has no reason to open a section about handwriting,
and the heading structure offers them no other route. This is `2026-08-17-gotchas-topic-refile.md`'s
lying-group-label defect, in a file nobody thought to check for it.

A tenth register, `corners:`, sat one level up as a sibling `###` — filed correctly and
equally unfindable.

All ten moved to **`lib/base/base.registers.docs.md`**, with a table at the top naming what
each selects and its default. The mandated read drops **24,504 → 15,171**.

**And the total went UP, which the headline number hides.** The two files together are
**25,610** against 24,504 before — the new preamble, the link table and the pointers cost
~1,100 tokens. That is the right trade *for what #6 mandates*: a base-modifier read is the
frequent one and it got a third cheaper, while a register question is rarer and now costs
10,439 instead of being unfindable inside 24,504. But a reader who needs BOTH pays more than
before, and some `_class:` authoring genuinely does need both — so the stub in `base.docs.md`
names the per-slide tokens (`corners-square`, `lifted`, `sketch-clean`, `stamp-notch`,
`spectrum-*`) to keep them greppable in the file #6 actually names. Found by the checker
pass, not by the maker.

**The move was mechanical and asserted**: each block was split fence-aware at its heading
level, and every one of the ten bodies was compared byte-for-byte after the write. Only the
heading LEVEL changed (`####`/`###` → `##`); heading text is unchanged. Two positional
cross-references were falsified by the move and repointed by name — `corners:`' "the ones
above" survives (it is still last), but `eyebrow:` pointed at *Eyebrow labels* "above" (that
section stayed behind) and a `tone-*` variant pointed at the `stamp:`/`tone:` registers
"above" (they left). That class of reference is the one thing a pure move silently falsifies,
and it is hunted specifically because the gotchas split shipped two broken ones.

Routing followed the content: `design/skills/finish.md`, `design/design-system.md` and
CLAUDE.md's own table. **CLAUDE.md grew 58 tokens** doing it — stated plainly because #1896
is an open issue about that file's growth, and a first draft of the row cost 100 before it
was folded into the existing one instead of adding a new row.

## The fact-checker, and why it is in this note

An independent fact-checker pass over the accompanying `component-pick-surface.md` edits
refuted **two claims that were already committed**:

- *"The count is moving — 21 published on 2026-08-23 against 23 today."* False. Nothing moved:
  `components.json` publishes 21 and `components.pick.md` renders 23 **simultaneously**, and no
  `capacity` line changed across the available history. A structural gap had been explained as
  drift over time.
- *"`capacityEntry()` … 4 more resolve one from `adapt.capacity.wide`."* Right total, wrong
  route for half of it. `capacityEntry()` bails on a family table with no `axis`, and
  `matrix-2x2`/`split-compare` carry `axisRetired` — so `capacityCell()`'s axis-less arm renders
  them and the catalog omits them entirely. Visible in the rows: every other value row is
  axis-prefixed, those two are bare.

Both were re-derived before acting on them. The second is a **better answer** to #1784 §1 than
the one it replaced: the two surfaces disagree in *both* directions.

The general point: nothing in `build:check` can tell a true assertion about the tree from a
plausible one, so a claims-heavy diff has no machine gate at all. This is the second time in
one session that a wrong claim of mine reached a commit and was caught by re-derivation rather
than by a gate.

**And a third, from the checker pass on this change:** the capabilities commit shipped
`neighbouring` into a tool docblock — a HARD RULE #21 violation, in the same session whose
subject is claims nothing checks. `checkUsEnglish` did not catch it because `UK_ENGLISH_FORMS`
lists `neighbour` and `neighbours` and the pattern is `\b`-anchored, so the `-ing` inflection
is invisible to it. The instance is fixed here. The gate gap is real and bounded — the list
enumerates inflections one by one and omits several (`honouring`, `labouring`, `standardising`,
`specialising`, `finalising`, `capitalising`, and most `-isation` forms) — and it is **#1918**
rather than swept in, because closing it surfaces three pre-existing occurrences this PR did
not cause (#18: found, not caused, off-path).

## Deliberately not done

- **`themes/palette-audit.md` (196,801 tokens)** — the largest authored file in the repo by 8x,
  a Marp deck whose categorical half `themes/README.md` already marks superseded (#1022). No
  HARD RULE mandates it and CLAUDE.md does not route to it, but `design/skills/theme.md:77`
  still points theme authors at it. Off-path here; worth its own look.
- **`engineering/workflow.md` (22,128) was measured and CLEARED.** HARD RULE #28 tells you to
  read § Pre-merge card there rather than from a summary, which reads like a 22k tax. That
  section is **1,204 tokens** and the rule already routes by name. Recorded so nobody
  re-derives it and "fixes" a file that is working.
- **Two dated decision records still say `base.docs.md` documents something "under the
  `headline:` register"** (`2026-07-30-masthead-framing-fills-the-band.md:96`,
  `2026-08-02-sovereign-bookend-measures.md:233`). True when written, false now.
  `engineering/decisions/**` is a dated archive and editing it to chase a move would fight
  #17/#8 — logged here, per #18's found-not-caused arm.
- **`base.docs.md`'s remaining 15k is not further split.** § Auto-detected authoring patterns
  (4,830) and the residual variants (5,985) are what the file claims to be about.

## Removable when

Never — structural, like its three predecessors. The rule this adds: **a surface a HARD RULE
makes mandatory is budgeted like a read-whole index, and if it cannot get under the budget,
its routing changes.** The two found here were the two that exist; a third mandated read
should be measured on the day the rule creating it is written.
