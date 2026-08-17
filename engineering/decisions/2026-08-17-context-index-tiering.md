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
paragraph (the median first sentence alone is 135 characters; the longest summary is
1.5 KB).

## Fix

**Tier the maps: L0 router → L1 one-line index → L2 the document.** `CLAUDE.md` is
L0 and already existed; L2 is the note or the topic file and already existed. The
missing layer was L1, and that is all this change adds.

- **`engineering/gotchas.md`** — 144 entries moved into 10 topic files under
  `engineering/gotchas/`; the file itself is now a generated symptom index, one line
  per gotcha, deep-linked to the entry. **75k → 7k tokens** on the landing read; the
  reader then opens ONE topic file (median 7k, worst `marp.md` at 21k).
- **`engineering/decisions/README.md`** — each row renders a gist (first sentence,
  capped at 140 characters, `…` marking a cut) instead of the whole summary.
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

1. **An index over ~10k tokens has failed at being an index.** That is the budget to
   apply to any future map — and this change only half meets it. `gotchas.md` lands
   at 7k, inside. `decisions/README.md` lands at 26k, **2.6x over**, because 408
   filenames and status glyphs cost ~13k before a single word of gist. Calling that
   "close" would be the kind of rounding this note exists to argue against: the
   budget is the target, the gist index is a way-station, and the honest next move is
   either capping `summary:` at the source or dropping to a filename-and-status
   index (measured at 12.8k). Do not cite this file as precedent for a 2.6x index.
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
- **Entry-level files (one per gotcha) were considered and rejected.** 144 files
  would minimize the read further but destroy topic browsing and make every entry
  edit a new-file decision. Topic granularity matches how a human navigates.
- **`CHANGELOG.md` (1.5 MB, 382k tokens)** is the largest single authored file and
  is still all-or-nothing to read. The write side was already fixed by `changelog.d/`
  fragments (#1593); the read side is a separate change.

## Removable when

Never — this is structural. The budget in §"The rule this leaves behind" is the
thing to enforce; if an index creeps past it again, tier it again rather than
tolerating it.
