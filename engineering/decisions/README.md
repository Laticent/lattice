# Developer & agent notes

Durable investigation notes that captured root-cause analysis or
non-obvious decisions worth keeping around — not session scratch, not
in-progress thinking. If a note still teaches something six months
later, it lives here.

## Convention

- Filename: `YYYY-MM-DD-topic.md` (e.g. `2026-04-30-mermaid-theming.md`).
  Date is when the investigation/note was first authored, not when
  it was last edited. ISO order keeps `ls` chronological.
  **66 characters or fewer always fits**; past that it depends on your
  summary. The index renders the filename TWICE per row (link text + link
  target), so it is the one part of a row's cost the author controls, and it
  is paid on every read forever. A row over `ROW_CAP` (285 characters, in
  `tools/build-decisions-index.js`) fails `npm run decisions:index:check` (and so
  `build:check`) and names the note; the summary side is already capped by
  `GIST_CAP`, so the filename is the lever. Today's longest is 69 characters and clears the
  cap only because its gist is short.
- One root cause or one decision per file. Don't merge unrelated
  investigations.
- Lead with the symptom, then the root cause, then the fix. Future
  readers (human or agent) skim the first paragraph and need to know
  whether the note is relevant before they read on.
- Reference canonical docs (`../architecture.md`, `../theming.md`,
  `../references/*`) when you need to point at how-it-works content.
  Don't restate the canonical doc — link to it.
- When a note is fully absorbed into the canonical docs and adds
  nothing further, delete it. This folder is not an archive.

### Status lifecycle — a closed vocabulary the index reads

Every note carries a YAML front-matter block so its lifecycle is
machine-readable (and so the index can be **generated**, not
hand-maintained — hand-maintained indexes drift):

```yaml
---
# status is one of: proposed | in-progress | blocked | shipped | superseded
status: proposed
summary: one line describing what this note covers
# optional, only for status: superseded — the filename that replaced this note:
superseded-by: 2026-06-18-foo.md
---
```

`status` and `summary` are required; `created` is derived from the filename
date (don't duplicate it). Keep each value on one line — the index parser reads
flat `key: value`, so put any note on its OWN `#` line, never trailing a value.

| `status` | Glyph | Meaning | Index group |
|---|---|---|---|
| `proposed` | ☐ | A design/decision written, not yet built | **Active** |
| `in-progress` | ◐ | Being built now | **Active** |
| `blocked` | ⏸ | Needs an owner decision or a dependency | **Active** |
| `shipped` | ☑ | Built + verified; *absorb into canon, then delete* | **Shipped** |
| `superseded` | ⊘ | Replaced by `superseded-by` | **Historical** |

A **multi-part** initiative (several independently-shippable workstreams in one
note — e.g. `2026-06-17-workflow-efficiency-review.md`) adds a **roll-up banner**
under the title (overall status + a stats line) and a per-section
`**Status:**` line, so each partition tracks itself. The banner's stats are a
human roll-up of the section statuses.

**The index is generated, and it is not committed.** `npm run decisions:index`
reads every note's front-matter and writes **`dist/engineering/decisions.md`**,
grouped Active / Shipped / Historical. `npm install`, the SessionStart hook and
`npm run build` all write it, so it is there in any working checkout; on GitHub
it is published to the `dist-kits` branch. `npm run decisions:index:check` is the
gate: it validates every note's front-matter and row length, and runs inside
`build:check`. Never edit the index — edit a note's front-matter. Why it is not
committed: it is built from every note, so a committed copy was a file every
note-adding PR rewrote, 12 of the 50 commits to 2026-10-09
(`2026-10-09-generated-indexes-uncommitted.md`). `shipped` and `superseded` notes
are candidates for the "absorb-then-delete" rule above; the grouping makes the
historical majority skippable at a glance.

**A row is a GIST, not the summary.** Each entry renders the first sentence of
`summary:`, capped at 140 characters, with a `…` marking any cut. Write the
front-matter summary at whatever length the note deserves — but put the
identifying claim FIRST, because the first sentence is what the index shows.

**That cuts both ways, so read a row as an OPENING, not a verdict.** A `…` means
only "there is more" — it cannot tell you that the sense *flips* after it. A note
that opens by quoting the bug report it goes on to refute will advertise the
refuted claim. Nothing gates that, so when a row sounds like a claim you would
act on, open the note before acting.

**Grepping the index is not grepping the corpus.** A row carries a gist, so most of
each summary's vocabulary is not in it. When a term isn't in the gists, search the
notes themselves — `grep -rln <term> engineering/decisions/` — which costs the same,
because you pay for the hits, not the haystack.

The index is a **pick-list**: it exists to get you to the right note, and the note
is where the record lives. At one line per note it is **greppable**:
`grep -i mermaid dist/engineering/decisions.md` returns a handful of rows rather
than paragraphs. Start there, then open the two or three notes it names. Grep is
the access mode, and it is what the index is budgeted against — per row, not per
file (`2026-08-17-context-index-tiering.md` §"Amendment").

## What does **not** belong here

- Session-scoped TODOs, scratch experiments, half-finished thoughts.
  Use `.scratch/` (gitignored) for those.
- Step-by-step debugging logs without a conclusion.
- Anything that should be in `CHANGELOG.md` (user-facing changes) or
  `engineering/architecture.md` (how the system works).

## Scratch housekeeping

`.scratch/` is the gitignored sandbox for probes, throwaway scripts,
and temp artifacts (used by humans, agents, and tests). Nothing under
it is load-bearing.

- Treat anything older than ~2 weeks as fair game to delete.
- If a file is worth keeping, promote it: docs go under `engineering/decisions/`,
  source documents go to a sibling folder outside the repo (e.g. the
  gitignored `framework/` folder).
- Run `npm run clean:scratch` to delete `.scratch/` entries older than
  14 days. The script is opt-in — it never runs automatically.

## Finding a note

- **By topic:** `grep -i <topic> dist/engineering/decisions.md`, then open the
  notes it names. No `dist/`? Run `npm run decisions:index` (or `npm install`).
- **By a word in the body:** `grep -rln <term> engineering/decisions/`.
- **The newest:** `ls engineering/decisions/20*.md | tail`.
