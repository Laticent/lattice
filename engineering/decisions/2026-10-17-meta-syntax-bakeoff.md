---
status: proposed
summary: >
  Pre-registration of a bake-off between five authoring syntaxes for the per-slide metadata record, plus a control
  (today's comments with a consolidated reader). The candidates, the criteria, how each is measured, the scoring weights
  and the disqualifying gates are fixed here, in a commit that precedes every result, so the outcome cannot be argued
  after the fact. Results go in the same directory when the harness has run.
builds-on:
  - 2026-10-17-meta-record.md
  - 2026-10-15-bridges-and-two-hosts.md
---

# Slide metadata syntax: bake-off pre-registration (2026-10-17)

Status: proposed. Written and committed **before** the harness exists or has run. Parent: `2026-10-17-meta-record.md`,
whose §13 review ended with the owner redirecting the surface syntax: typed fields that reuse front-matter register
names, never rendered on a Lattice surface, no inline code, and "we don't want to settle."

## 1. The question

Which spelling should an author (human or model) use to give one slide its metadata (layout, variant, registers,
header and footer, notes, pane markers, tooling pragmas)? The record's contents are settled in the parent note; this
note only chooses how it is written.

## 2. Candidates

| ID | Spelling | Reader |
|---|---|---|
| C1 | `` `@meta{layout=cards, footer="Q3"}` `` on its own line (inline-code Segno record) | real Segno (`docs/src/lib/segno`) |
| C2 | `@meta{layout=cards, footer="Q3"}` on its own line, no backticks | real Segno, record text only |
| C3 | a ```` ```meta ```` fence whose body is `key: value` lines (`key: \|` for blocks) | a strict line reader written for the bake-off |
| C4 | `[meta]: # "…"` reference definition, body `key: value` lines, `\"` for a quote | a strict line reader written for the bake-off |
| C5 | `<meta layout="cards" footer="Q3">` HTML data element | an attribute reader written for the bake-off |
| C0 | control: today's `<!-- _key: value -->` comments, reader consolidated | the repo's own `readDirectiveComment` |

Dropped before the bake-off, with the reason: a per-slide `---` YAML block (a YAML document marker; `markdown-it`
renders `---\nlayout: cards\n---` as a rule plus a heading), and `+++` (a fence does the same job with no new
delimiter).

All candidates carry the **same canonical record** (§4), so the comparison is of spelling, not of content.

## 3. Criteria, measures and weights (100 points, fixed now)

| # | Criterion | Measure | Points |
|---|---|---|---|
| 1 | Parser pains | Round-trip pass rate of an adversarial suite (§5) through the candidate's reader | 20 |
| 2 | Rendering pains outside Lattice | Visible junk and breakage when the same slides go through `markdown-it`, `marked`, `commonmark` and `micromark`: mean visible characters per slide, and a count of parsers whose slide structure changes | 15 |
| 3 | Jank | Line numbers preserved by the source door; adjacency (two records on adjacent lines, a record directly above a paragraph or an image) reads correctly; reads inside lists and blockquotes fail loudly, not silently | 15 |
| 4 | Authoring size | Median lines and characters per real slide, over the 12-slide set | 10 |
| 5 | Authoring correctness | Three writer agents each write the 12 slides in every syntax from a one-page spec; the harness counts records that parse and match the canonical record | 15 |
| 6 | Validation and completion | Yes/no per capability: per-field type check, per-field completion, did-you-mean on a typo, structured edit of one field without touching the rest | 10 |
| 7 | House style and LFM fit | Rubric in §6 | 5 |
| 8 | Marp bridge | Compile-back to Marp comments round-trips the 12 slides, including the tricky values | 5 |
| 9 | Speed | Parse cost over the corpus, relative to C0. Scored only if a candidate is more than 2x C0; otherwise all tie | 5 |

Scoring within a criterion: the best candidate gets the criterion's full points, the rest get points in proportion to
their measure (`points = max_points x candidate / best`, inverted for "lower is better" measures). Criteria 6 and 7
are rubric counts and are stated in §6.

## 4. The slide set and the canonical record

The 12-slide set is chosen by rule, not by eye. For each category in this list, the first slide, walking
`examples/*.md` in path order, whose directives satisfy it:

1. one directive, `_class` with a single word
2. one directive, `_class` with a layout and a variant
3. `_class` with six or more words (the register-heavy case)
4. `_class` plus `_footer`
5. `_class`, `_header` and `_footer`
6. a `_paginate` directive
7. a panes slide with two `_pane` markers
8. a speaker note whose text contains a double quote
9. a speaker note of two or more paragraphs
10. a `_focusSteps` slide
11. `_class` containing `image`, directly above a `![bg]` image
12. a `stress-slide` pragma

The canonical record for a slide is read from its comments by `readDirectiveComment` and the note extractor, then split
into typed fields using the component catalog (`dist/docs/components.json`) and the register tables. A class word the
catalog cannot place is recorded as `unplaced` and reported; it is not guessed.

## 5. The adversarial suite

Every candidate serializes the same value cases and reads them back. A case passes only if the value round-trips exactly.

- values with `"`, `'`, a backtick, a backslash, `-->`, `<`, `>`, `&`, `{`, `}`, `[`, `]`, `(`, `)`, `,`, `=`, `:`, `#`
- `yes`, `no`, `on`, `off`, `null`, `1e3`, `0123` as strings that must stay strings
- a note of one paragraph, of three paragraphs with blank lines, with a trailing space, with a leading `-` or `#`
- unicode (CJK, emoji, a combining mark) and a no-break space
- CRLF and LF line endings
- a value 4,000 characters long

Placement cases, each scored for "read as intended" and, separately, "fails loudly (lint-visible) when not":
first line of the file; directly after a paragraph with no blank line; directly before a paragraph; directly before a
`![bg]` image; two records on adjacent lines; inside a list item; inside a blockquote; indented four spaces; inside a
fence of another language.

## 6. Rubrics

**Criterion 6, one point each, ten possible:** per-field type check; per-field completion; did-you-mean; structured
single-field edit; line-shaped detection (a raw-text reader can find it without a markdown parse); unambiguous end of
record; carries a note with blank lines without escaping; carries a value with a quote without escaping; fields are
named (not positional); reuses front-matter register names.

**Criterion 7, one point each, five possible:** valid in a standard parser with no error; one obvious spelling (no two
ways to write the same field); consistent with how LFM already marks block constructs; no new delimiter or sigil the
spec must reserve; reads as plain words to a person who has never seen it.

## 7. Gates

A candidate that fails a gate is disqualified from the recommendation, and is still scored and reported.

- **G1 lossless notes.** A three-paragraph note containing a double quote, a backtick and `-->` round-trips exactly.
- **G2 line-preserving.** The door can replace the record with an internal comment of the same line count.
- **G3 no silent loss.** A record the reader cannot place produces a visible diagnostic, never a silent drop.
- **G4 control comparison.** A candidate must beat C0 on total score by at least 10 points to recommend a syntax
  change. Otherwise the recommendation is "keep comments, consolidate the reader," and the syntax change is closed.

## 8. Method rules

- The harness (`engineering/decisions/2026-10-17-meta-syntax-bakeoff/`) is committed with its output, so the numbers
  reproduce.
- One independent checker audits the harness for bias before the result is read: whether any candidate's reader is
  less carefully written than another's, and whether a spec sheet given to the writer agents is longer or clearer
  for one syntax.
- The three writer agents each see all six syntaxes, in a different order each, so an order effect cancels.
- Nothing about the weights above changes after the first result is produced. A mistake in a measure is fixed in a
  new commit that says so, and the old number stays in the history.
- The bake-off uses no key of ours (HARD RULE #24); the writer agents are Claude Code subagents.

## 9. What the result decides

The syntax for the slide record, or the decision to keep comments (G4). It does not decide the record's fields, the
door, the reader consolidation or the step order; those are in the parent note and hold under any winner.

## 10. Amendment: C6 added at the owner's request (2026-10-17, after the first results)

After the first round was scored and reported, the owner proposed one more candidate and asked for it to be evaluated:

| ID | Spelling | Reader |
|---|---|---|
| C6 | an HTML comment whose first content line is `@meta{…}`: `<!--` / `@meta{…}` / `-->` on three lines; long notes as `key: value` lines after the record, inside the same comment | real Segno for the record, the shared line grammar for the rest |

What this amendment keeps and changes, so it cannot be mistaken for moving the goalposts:

- **Unchanged:** the weights, the gates, the G4 rule, the slide set, the adversarial suite and the rubrics' items.
  C6 is scored by exactly the code that scored C0 to C5.
- **Changed, and disclosed:** C6 enters after the first table was read. The first table stays in the history
  (`f6f4160`) and the results note shows both. The writer test uses **one** writer agent, not three, because the three
  earlier writers each scored 36 of 36 on every syntax and a second round adds cost without discriminating power.
- **New side measurement, not scored:** what real Marp (`@marp-team/marp-core`) does with each syntax when a deck is
  opened without the bridge compile (visible characters on the slide, and speaker-note characters). It is reported for
  all seven candidates, because it is the case C6 raises and the first round did not measure it.
