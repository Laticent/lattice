---
status: shipped
summary: >
  The one doc CLAUDE.md routes to most, plus the index it did not route to at all,
  had both grown past the size where an index is useful — gotchas.md at 75k tokens and the decisions index at 96k — so the
  cheapest question in the repo cost more context than the work it preceded. Both
  are now one line per item (7k and 26k), with the detail one file away, and the
  rule that keeps it that way is an index budget plus generated-or-gated.
---

# Context index tiering — a map you can afford to read

## Symptom

A 10.2M-token authored corpus is not the problem; nobody ever loads it. What gets
paid, every session, is **discovery**: `CLAUDE.md` (9.4k tokens, unconditional)
plus whatever an agent reads to find the three files it needs. Two of those reads
had quietly become the most expensive in the repo:

| File | Before | What it is |
|---|---|---|
| `engineering/gotchas.md` | 290 KB / **75k tokens** | One file, 143 entries, 12 sections |
| `engineering/decisions/README.md` | 395 KB / **96k tokens** | Generated index of 406 notes, full summaries |

Only ONE of them was a routing surface, and the difference matters. `CLAUDE.md` sends
every "something behaving strangely" session to `gotchas.md` — the most common trigger
there is — and that file's own first instruction was **"Read top-to-bottom when something
breaks."** `CLAUDE.md` did **not** route to `decisions/README.md` at all; it named the
note path directly. So half this change shrinks a file nobody was sent to and THEN adds
the route — which only pays off if the 26k index is cheaper than the notes a reader
would otherwise hunt blind, and is the weaker half of the case. Following the
documentation as written cost 75k tokens before any work began. The decisions index
was worse per unit of value: it rendered all 406 `summary:` fields in full, so
reading the index cost more than reading the five notes it was supposed to help you
choose between.

The failure mode is specific and worth naming, because both files were *working as
designed*: a map only pays for itself while it is much smaller than the territory.
Past some size it stops being a map and becomes a second territory — and the
rational reader stops opening it, which is exactly when the indexed corpus goes
unfound. The decisions index had not drifted (it is generated, and gated); it had
simply outgrown its job.

## Cause

Neither file had a size budget, and both grew by the same increment that made them
valuable — one more entry, one more note. `gotchas.md` grew 143 entries deep with no
structural pressure to split, because markdown does not care. The decisions index
rendered whatever `summary:` contained, and summaries grew from a line to a
paragraph (the median first sentence alone is 135 characters, the longest summary is
3.9 KB, and 76 of them exceed 1.5 KB).

## Fix

**Tier the maps: L0 router → L1 one-line index → L2 the document.** `CLAUDE.md` is
L0 and already existed; L2 is the note or the topic file and already existed. The
missing layer was L1, and that is all this change adds.

- **`engineering/gotchas.md`** — 144 entries moved into 10 topic files under
  `engineering/gotchas/`; the file itself is now a generated symptom index, one line
  per gotcha, deep-linked to the entry. **75k → 7k tokens** on the landing read; the
  reader then opens ONE topic file (median 7k, worst `marp.md` at 21k).
- **`engineering/decisions/README.md`** — each row renders a gist (first sentence,
  capped at 140 characters, `…` marking a cut) instead of the whole summary. Two
  guards keep that honest: a "sentence" ending on an abbreviation (`vs.`) or too short
  to identify anything reads on to the next boundary, because an unmarked cut under the
  cap renders as a complete claim that is not one.
  **96k → 26k tokens.** Nothing is lost: the full summary is in the note's own
  front-matter, which is where a reader who opened the note was going to see it
  anyway. The index duplicated it.
- **`CLAUDE.md`** routing now names the access pattern, not just the file: skim or
  grep the index, then open the one or two documents it names.

The second-order win matters more than the byte count: **one line per item makes an
index greppable.** `grep -i mermaid engineering/decisions/README.md` returns eight
lines (~200 tokens) instead of eight paragraphs. The cheapest read is the one that
never loads the file.

## The rule this leaves behind

1. **An index budget is a per-ROW cost, and it binds against the access mode the
   routing prescribes — not a file total.** *(Restated 2026-08-17, see
   §"Amendment" below. The original form read "an index over ~10k tokens has failed at
   being an index", and this file was its counterexample on the day it was written.)*
   - A **read-whole** index — one the routing tells you to open — holds to **≤10k
     tokens**. Unchanged, and both such indexes are inside it: `gotchas.md` at 7k,
     `dist/docs/components.pick.md` at 3.8k.
   - A **grep-first** index — one whose routing says *skim or grep, then open the two
     documents it names* — has no meaningful file total. Budget the **row** and check
     what a query returns. `decisions/README.md` rows measure p50 **60 tokens**, p90 70;
     eight representative queries return **84–1,214 tokens**, and the broadest term
     tried (`studio`, 79 of 424 rows) returns 4,724 — every one of them inside the
     read-whole budget the file as a whole misses.
   - The **crossover is arithmetic**: at ~60 tokens a row, a whole-corpus index stops
     fitting 10k past ~165 items. Beyond that the routing must become grep-first, or
     the map is not one.
   - **Gate the row, never the total** — `ROW_CAP` in `tools/build-decisions-index.js`,
     285 characters, ratcheted at the widest row the live corpus has. A file total is
     the one number rule 4 already forbids: it bills the PR that trips it for 424
     predecessors' contributions and offers it no local fix.
2. **Generated or gated — never hand-maintained.** A stale summary is worse than no
   summary: it misdirects confidently and the reader pays for the wrong file anyway.
   `gotchas:index:check` joins `decisions:index:check` in `build:check`.
3. **Don't map what `grep` gives free.** For *code*, ripgrep is a zero-token index
   that is never stale. Maps earn their keep for prose (you cannot grep for "which
   decision settled color ownership") and for conventions (where does a new thing
   go). A summary layer over `lib/` would mostly restate what search already does.
4. **A new generated index copies the #1547 relaxation**, or it will eject PRs from
   the merge queue: verify each row against its own item, assert nothing about row
   ORDER, and carry no totals. Both index generators now share that shape.

## Amendment (2026-08-17) — why rule 1 was restated

The rule above shipped asserting a 10k target and naming two exits toward it. Both were
re-measured. **Neither reaches 10k, and one of them is worth less than `ls`.** All figures
`o200k_base` over the live corpus, 424 notes; the whole file is **27,026 tokens / 97,922
bytes**, of which the generated block is 25,552 and the rows alone 25,426.

| Shape | tokens | verdict |
|---|---:|---|
| Rows as shipped (glyph + linked filename + gist) | **25,426** | 2.5x over |
| …dropping the markdown link, bare filename kept | 19,205 | 1.9x over |
| Exit A — cap `summary:` at the source | ≥ **13,302** | 1.3x over **at its floor** |
| Exit B — filename + status only, linked | **13,302** | 1.3x over |
| Exit B unlinked | 7,504 | inside — and see below |
| the 424 note filenames alone (what `ls` prints) | 5,796 | free |

Exit A's floor **is** Exit B's number: the most a source-side summary cap can remove is
every character of gist, which lands on exactly the filename-and-status index Exit B
proposes. There is no arrangement of the two exits that reaches 10k with the link syntax
in place.

Two facts kill the original target:

- **The identifier is the floor, and the markup doubles it.** The 424 filenames cost
  **5,373 tokens** once. Every row renders the filename **twice** — link text and link
  target — so the identifier alone is 10,746 tokens, **42% of the rows**, before a word
  of gist (the gists are 11,600, 46%). Exit A deletes the 46% and cannot touch the 42%.
- **Exit B is a directory listing you pay for.** A filename-and-status index costs 13,302
  tokens to deliver what `ls` of the same folder prints for **5,796**. Of the 7,506-token
  difference, **5,798 is markdown link syntax** and 1,708 is the status column and bullet.
  That is rule 3 ("don't map what `grep` gives free") turned on this note's own proposal.

**Sharding (option (b)) fails on the only key that exists.** Every note is dated; nothing
carries an `area:` field (6 notes do, out of 424 — a coincidence, not a convention). By
year the corpus is one shard: **all 424 are 2026**. By month the largest shard is 2026-07
at 178 rows / **10,866 tokens** — over budget on its own, for the biggest split the data
supports. Sharding by a *new* `area:` key would mean 424 hand judgments to make a **grep
target** cheaper for a read pattern nobody uses: `grep` across `README.d/*.md` costs the
same as `grep` across one file, and a reader who must already know the area to pick the
shard did not need the index.

**So the shape did not change and the rule did.** The link duplication was measured
(5,373 tokens, 21% of the block) and **kept**: dropping it lands at 19,205, still 1.9x
over a target that is the wrong instrument, and it would cost every human reader
click-through from the rendered README. What ships instead is the per-row cap, gated —
because per-row is the only budget a generated, always-growing, merge-queue-shared index
can enforce without violating rule 4.

**Read against its real access mode, this index was never over budget.** `CLAUDE.md`
routes to it with *"grep it for the topic, then open the 2–3 notes it names"*, and that
is what a query costs:

| `grep -i …` | rows | tokens |
|---|---:|---:|
| `changelog` | 2 | 84 |
| `margin` | 2 | 133 |
| `merge queue` | 3 | 199 |
| `color` | 7 | 423 |
| `mermaid` | 11 | 619 |
| `layer` | 19 | 1,123 |
| `token` | 21 | 1,214 |
| `studio` | 79 | 4,724 |

The 2.6x was real, and so is the correction: it measured a file nobody was told to read
whole against a budget written for files that are.

## Changed by the split, beyond the move

- **Topic order is now alphabetical**, not the monolith's curated order (Charts → Marp →
  Mermaid → …). `collect()` reads `readdirSync().sort()`, which is self-maintaining and
  cannot rot; the editorial sequence is the cost.
- **`gotchas/ci.md` carries six Playground/Studio entries** filed under "CI (GitHub
  Actions / code scanning)" — a pre-existing mis-filing, inherited by the move and worse
  than `marp.md`'s. Off-path per HARD RULE #18: logged here, not swept into this diff.
  **Fixed in `2026-08-17-gotchas-topic-refile.md`** — `ci.md` now holds only what its
  title claims.

## Measurement

Token counts are measured, not estimated — `o200k_base` over the real files. (The
first pass at this used a chars/2.85 heuristic and overstated both files by 25-30%;
the numbers above replaced it.) Claude's own tokenizer is not public, so treat these
as ±10-20% for absolute planning and as exact for before/after comparison, since
both sides use the same encoder.

Repo-wide context, same encoder: ~21.9M tokens across all tracked text, of which
~10.2M is hand-authored (the rest is `dist/`, vendored bundles, lockfiles).

## Deliberately not done

- **`dist/docs/components.json` (95k tokens) is untouched, and it is the bigger fish.**
  `CLAUDE.md` and `AGENTS.md` both route agents there, `AGENTS.md` explicitly telling
  them to read it whole, and HARD RULE #6 makes a component lookup mandatory before
  authoring any `_class:` slide — so it fires more often than a symptom search does.
  This change fixed the tractable pair, not the highest-leverage one. That is the next
  slice, and it is a different shape: a machine catalog whose value is completeness,
  so the answer there is field pruning or a query tool, not a gist.
- **`docs/` (4M tokens) is left alone.** It is site content and SVG, rarely read
  during engineering work. Mapping it would spend effort where no tokens are burned.
- **`gotchas/marp.md` is still 21k tokens** — the largest topic file, and several of
  its entries look mis-filed (Studio/Playground overflow behavior under a "Marp /
  Marpit" heading). Re-filing entries across topics is an editorial judgment on
  content, not a mechanical split, so it stays out of a change whose diff is already
  a whole-file move. Off-path per HARD RULE #18: logged here rather than pulled in.
  **Done next, in `2026-08-17-gotchas-topic-refile.md`** — 26 of its 34 entries were
  filed elsewhere; it is now 8 entries about Marp.
- **Entry-level files (one per gotcha) were considered and rejected.** 144 files
  would minimize the read further but destroy topic browsing and make every entry
  edit a new-file decision. Topic granularity matches how a human navigates.
- **`CHANGELOG.md` (1.5 MB, 382k tokens)** is the largest single authored file and
  is still all-or-nothing to read. The write side was already fixed by `changelog.d/`
  fragments (#1593); the read side is a separate change.

## Removable when

Never — this is structural. The thing to enforce is rule 1 as restated: a read-whole
index holds ≤10k, a grep-first index holds a per-row cap (`ROW_CAP`, gated), and an
index that crosses ~165 items at 60 tokens a row changes its routing or stops being a
map. If any of those creeps, tier again rather than tolerating it — and do not restate
a total that nothing can hit, which is the mistake this note made about itself.
