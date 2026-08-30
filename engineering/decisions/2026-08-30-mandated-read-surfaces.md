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
  Moving those ten registers to their own file takes the mandated read 24,504 -> 15,682 while
  the two files TOGETHER come to 26,121 — up ~1,600 — and makes `headline:` findable by
  someone not reading about handwriting. A fact-checker pass
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

**No cap that leaves the median row intact reaches 10k.** Extending the same curve past
where this table stops, a **30**-token cap does land under it — 9,613 — by truncating **121
of 320 rows** against a p50 of 27. That is not an index, it is a list of names. An earlier
draft of this section said flatly "no cap reaches 10k", which the table's own method refutes
in three lines; a checker pass did exactly that. At 320 items the file is far past the ~165 crossover the tiering
note derived, so the honest conclusion is the one that note's own Amendment reached about
the decisions index: **change the access mode.** At p50 27 tokens a row it is a good
grep-first index — ten representative queries returned 301–2,590 tokens before the trim and
301–2,211 after, all inside the read-whole budget the file as a whole misses.

`ROW_CAP` is therefore **a ratchet pinned at the widest live row**, gated in both
`capabilities:build` and `capabilities:check`. It stops a row growing past the worst that
exists. That is all it claims, and getting there took a reversal worth recording.

### The trim was wrong, and how it was wrong is the finding

The first cut set the cap **below** the tail at 600 characters and trimmed eleven rows into
it, on the reasoning that the tail was the problem: ten rows over 150 tokens carried 18% of
all row cost from 3% of rows, and `grep -i intent` cost 158 tokens a row against a 27-token
median. Ten probe queries were run before and after; all ten returned the same row counts,
and the trim shipped.

**Ten probes chosen by the trimmer cannot measure recall on an index whose job is finding
things you cannot name.** A red-team pass ran twenty different words and found five losses;
a word-set diff over the whole file found the real number:

| | |
|---|---:|
| distinct words that stopped matching anywhere in the file | **~130** |
| among them | `permission`, `wink-nlp`, `cascade`, `retired`, `classifier`, `containment`, `light-dark`, `check-adaptive-families` |

`grep -i permission` had returned `intent:pick-agents` carrying a measured finding — that
`--allowed-tools Read` is a whole-tool allow rule which overrides the working-directory
refusal, with `permission_denials` coming back EMPTY on a real escaped read. That is a
**reinvention hazard**, which is the precise thing HARD RULE #15 exists to stop the next
person rediscovering, and the query that finds it returned nothing. `grep -i openrouter`
stopped returning the row whose trimmed clause said it spends Claude tokens rather than the
OpenRouter key — so the row that exists to be found by a #24 audit dropped out of the #24
audit query.

**The eleven rows are restored verbatim, and the word-set diff against `main` is now zero.**

What that costs: the file is back to 13,926 tokens and `grep -i intent` back to ~1,100. What
it buys is the property the whole change is about. The trim's entire benefit was **846 tokens,
6%** — on a file whose size this note has already argued is not the fixable problem, since no
cap reaches 10k and the routing is the answer. It was paid for in the one currency a
grep-first index actually spends. **A cheaper index that cannot be found is not cheaper** was
already written three paragraphs above when the trim shipped; the confession did the work of
the fix.

**Lowering the ratchet needs a recall check first**, not a probe list: a per-row assertion
that no word findable only in this row leaves with the edit. That is buildable and cheap, and
until it exists the honest cap is the one that forces nobody to delete anything.

**Two deliberate scope notes**, both in the generator's header:

- It scopes to the **script and tool tables, not FRAMEWORKS** — two framework rows are
  already wider than any script row, and their L2 is a third-party library's own docs.
- The failure message names **`SCRIPT_META` and the tool header** as the places a row is
  edited, and warns about recall — a message that says only "too long" invites exactly the
  fix that had to be reverted here.

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
each selects and its default. The mandated read drops **24,504 → 15,682**.

**And the total went UP, which the headline number hides.** The two files together are
**26,121** against 24,504 before — the new preamble, the link table and the pointers cost
~1,100 tokens. That is the right trade *for what #6 mandates*: a base-modifier read is the
frequent one and it got a third cheaper, while a register question is rarer and now costs
10,439 instead of being unfindable inside 24,504. But a reader who needs BOTH pays more than
before, and some `_class:` authoring genuinely does need both — so the stub in `base.docs.md`
carries a table of **every** per-slide token, grouped by register — 48 of them, derived from
the class names in `lib/base/*.css` rather than hand-picked, because #6 says to open *this*
file and a token that is not in it is not findable by someone following the rule.

Two earlier attempts at that mitigation were wrong, and both were caught rather than
noticed: naming eight of the tokens by hand (a list that is incomplete on the day it ships),
then replacing it with "grep the folder, not this file" (which works, but is not what HARD
RULE #6 tells the reader to do). Measured before the fix: **38 of 48** register-family class
tokens had lost their only hit in the mandated file. Zero have now. The table costs ~500
tokens, which is why the file lands at 15,682 rather than 15,171.

**The move was mechanical and asserted**: each block was split fence-aware at its heading
level, and every one of the ten bodies was compared byte-for-byte after the write. Nine are
identical with only the heading LEVEL changed (`####`/`###` → `##`, plus one nested `#####`
→ `###` under `headline:`); the tenth, `eyebrow:`, carries the one-line repoint described
below. Heading text is unchanged throughout. Two positional
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
- **`base.docs.md`'s remaining ~15k is not further split.** § Auto-detected authoring patterns
  and the residual § Universal variants are what the file claims to be about. (Deliberately no
  token figures here: a fence-aware split and a naive one disagree by ~1.2k on these two,
  because the section is full of fenced examples whose own `##` lines look like headings, and
  the number is not load-bearing enough to pin a method to.)

## Removable when

Never — structural, like its three predecessors. The rule this adds is narrow, and the
narrowness is deliberate: **a surface a HARD RULE makes MANDATORY is measured against the
read-whole budget like an index, and when it cannot get under it, the routing changes rather
than the content.** The two found here were the two that exist; a third should be measured on
the day the rule creating it is written.

Note what it does NOT say. It does not license trimming a document to hit a number — that is
the mistake this branch made and reverted, and the ratchet exists so the next reader cannot
make it from here. Both surfaces this note touches are still over 10k afterwards (13,932 and
15,682) and that is the intended outcome: the routing moved, the prose stayed.

**An open challenge to the underlying budget, recorded rather than resolved.** An inversion
pass argues the ≤10k figure from `2026-08-17-context-index-tiering.md` generalizes from the
wrong mechanism. The only real experiment in this corpus — the pick-surface bake-off — measured
a **discontinuity**: `components.json` is 11,437 lines against a 2,000-line default read, so
agents paid for eight or nine paginated reads or silently chose from a fraction of the catalog.
That is a step function at the read boundary, not a linear token cost. `capabilities.md` (441
lines) and `base.docs.md` (1,232) both fit one read and exhibit none of it. The proposed
restatement is *"a mandated read must fit in ONE tool read"* — which catches `components.json`
cleanly, clears both files here, and would not have asked anyone to shred a working document.

That is a change to a rule this note did not write, so it is not made here. It is the right
question, and the instrument to settle it already exists: `npm run intent:pick-agents` spawns
agents against a pinned surface and records their token usage, so condition A (the file read
whole) against condition B (the file under grep-first routing), scored on whether the agent
finds the existing tool, would measure the SESSION rather than the file. Nobody has run it.
