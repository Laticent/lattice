---
status: in-progress
summary: >
  A slide carries four notes, each named for where it shows up: `@note{…}` (speaker notes), `@say{…}` (the voice and
  the captions), `@alt{…}` (alt text, for someone who cannot see the slide) and `@handout{…}` (the handout and the
  player's read view), always written inside a comment. A plain comment with no `@name` goes nowhere. `describe:` and
  `reader:` are renamed, the `say:` comment and the record fields `note=`, `say=`, `describe=`, `reader=` are removed,
  and the repo is rewritten by a codemod. Breaking; Lattice is not GA.
builds-on:
  - 2026-10-17-meta-record.md
  - 2026-10-17-meta-syntax-bakeoff.md
  - 2026-10-14-plugin-inline-door.md
  - 2026-09-28-say-not-caption.md
  - 2026-07-03-author-reader-notes-deferred.md
---

# Four notes, named for where they show up (2026-11-20)

**Status:** in progress. **Owner decisions:** 2026-11-20, one `AskUserQuestion` round, every recommendation taken (§2).
This note amends `2026-10-17-meta-record.md` D7 (plain comments stay speaker notes) and §4.2/§4.4 (notes as record
fields).

## 1. The answer

A slide has four notes. Each name is the place the words end up, a place an author already knows:

```markdown
## Where the pipeline leaks.

<!-- @say{The pipeline holds until activation, then loses seventy percent before paid.} -->
<!-- @alt{Funnel chart: 12,000 visitors narrowing to 620 paid; the sharpest drop is activation to paid.} -->
<!-- @note{Open on the drop. Pause before "seventy".} -->
<!-- @handout{Activation-to-paid is measured over 30 days; see the appendix for the cohort.} -->
```

| Write | Shows up in | For |
|---|---|---|
| `@note{…}` | speaker notes: Present mode, the PPTX notes field, the PDF note annotation | you, while you present |
| `@say{…}` | the voice and the captions: TTS, read-along, the `.vtt` sidecar | someone listening |
| `@alt{…}` | alt text: screen readers, PPTX alt text, `aria-describedby` | someone who cannot see the slide |
| `@handout{…}` | the handout PDF and the player's read view | someone reading the deck alone, later |
| `<!-- a plain comment -->` | **nowhere** | you, in the source, like a code comment |

Settings stay in the record (`<!-- {layout=funnel, footer="Q3"} -->`). Words go in `@name{…}`. One spelling each.

Private working notes have two homes, and neither is a note: a plain comment (never exported) and a Studio review
comment (kept in the `.lattice` file, outside the markdown). A markdown file cannot keep a secret once it is shared, so
"private" is never a property of a note.

## 2. Decisions (owner, 2026-11-20)

| # | Question | Chosen |
|---|---|---|
| N1 | Carrier | **`<!-- @name{…} -->`.** The comment hides the note in every other markdown viewer; the bake-off measured a bare `@meta{…}` at about 111 characters of visible text in GitHub, VS Code and Marp, and the comment form at none. Inline code was ruled out on 2026-10-17. |
| N2 | Names | **`note`, `say`, `alt`, `handout`.** `describe` becomes `alt` and `reader` becomes `handout`. |
| N3 | A plain comment | **Goes nowhere.** It stops being the speaker note. |
| N4 | Record fields `note=`, `say=`, `describe=`, `reader=` | **Retired and removed** ("we are not GA"). The record holds settings only. |
| N5 | A plain comment in an export that carries the source | **Travels with the source, like a code comment; `--strip-notes` removes it.** Five exports carry the raw markdown: the HTML player, PDF `--embed-source`, the reopenable `.lattice` inside a PDF or PPTX, the Studio Markdown share, and the Marp bundle. A plain comment never renders, speaks or annotates, but it rides in that source unless `--strip-notes` is set. The Marp bundle always strips it, because Marp would show it as a speaker note. |
| N6 | The front-matter `say:` map | **Removed.** It was a second spelling of `@say` (3 files), with a renumbering writer (`lib/core/renumber-say.mjs`), a remap across split and hidden slides, its own scrub, and an open numbering defect (`followups.d/3287-p2-front-matter-say-map-numbering.md`). The codemod moves each entry onto its slide as `@say{…}`. |
| N7 | The LFM spec | **Folded into the LFM 2.0 draft** that `2026-10-17-meta-record.md` §9 step 7 already plans, with conformance cases, in this PR. §3.5 of LFM 1.0 and 1.1 stays as ratified. |

**Decided by the maker, inside this branch:**

- **The codemod turns every plain comment that ships as a speaker note today into `@note{…}`**, so no deck's output
  changes (373 in 76 decks and fixtures). Comments that are plainly author labels go back to plain comments in a
  separate, reviewed commit.
- **Export to Marp:** `@note` becomes a plain Marp note, `@handout` a note labeled `Handout:`, and `@say` and `@alt`
  are dropped, because Marp has no channel for either. Before this change they leaked into Marp's speaker notes.

## 3. Why the old model confused people

1. **The names followed three patterns.** `say` was a verb for an action, `reader` was a person, `describe` was a verb
   with no destination, and `note` was generic. Each had to be learned on its own, and `reader` collided with "screen
   reader", the audience of `describe`. The new names follow one rule: the name is the destination.
2. **The speaker note was implicit.** Any plain comment became the speaker note and shipped inside the PPTX and the
   PDF. A private TODO written as a comment reached a client. The hidden rule is gone: every note is named, and an
   unnamed comment reaches nothing.
3. **There were three spellings of each note:** a plain comment, a `key:` comment, and a record field. There is now one.

## 4. Grammar

- A note is a comment whose content is exactly one `@name{…}` with `name` one of `note`, `say`, `alt`, `handout`. The
  opener line carries `<!-- @name{`, so a line scan finds it (the rule `2026-10-17-meta-record.md` §4.1 set for records).
- **The body is prose, not a record.** It runs from `{` to the matching `}` and may span lines and paragraphs. Braces in
  the body must balance; an unbalanced body is a lint error (`note-unbalanced`), never a silent truncation.
- **`-->` and `--!>` cannot appear in a body**, because they end the comment in a browser or in markdown-it. A body
  that needs them is a lint error; there is no escape in this change.
- Several notes of the same name on one slide join in source order, as paragraphs.
- Lowercase only: `@Say{…}` is not a note. `lint:deck` warns, in case it was meant.
- Front-matter `terms:` (how a term is spoken) is deck data, not a note, and is unchanged.

## 5. What is removed, and how the repo moves

Removed with no alias: `<!-- say: … -->`, `<!-- describe: … -->`, `<!-- reader: … -->`, plain-comment speaker notes, and
the record fields `note=`, `say=`, `describe=`, `reader=`. `lint:deck` reports each old form as an error that names its
replacement, as `caption-key-retired` does (`2026-09-28-say-not-caption.md`); the engine does not read them.

A codemod rewrites every deck in the repo. The Marp importer turns a Marp deck's plain-comment notes into `@note{…}`,
so an imported deck keeps its speaker notes, and export-to-Marp writes `@note` and `@handout` back as Marp's plain
note comments.

## 6. What the build found

- **The `-->` escape already existed.** A note body writes `--\>` (`--!\>`), which the readers undo
  (`decodeNoteText`), as record notes did (`2026-10-17-meta-record.md` §10). Unbalanced braces escape as `\{` and
  `\}`; `writeNote` adds them only when the text needs them, so any text round-trips.
- **Pane markers are read by the pane carve, not the directive reader.** The first cut of `isPrivateComment` took
  `<!-- _pane: bar -->` for a plain comment, so the codemod would have made it a speaker note and `--strip-notes`
  would have deleted it from the source a recipient re-imports. The check now asks `parsePaneMarker` too.
- **The player's Read view never showed the reader note.** `2026-10-17-meta-record.md` D8 said it did; the CSS hid
  `aside.lattice-reader` in every view. `projectDeckToProse` now prints each slide's handout after its body
  (`.lp-handout`, once per split run), in all three article hosts.
- **The scrub no longer needs the render to know what a note is.** `--strip-notes` used to lift note bodies from a
  render and match them back against the source; every leak it had was a way for the two to disagree. A note is
  named now, so `stripChannelsFromSource` classifies each comment where it stands. The cut measurement (render both
  candidate cuts, keep the one that reproduces the deck) is unchanged.
- **LFM 2.0 starts here.** No 2.0 draft existed; `spec/LFM-2.0.md` is written as changes against 1.1, with §3.5 in
  full and the shared case `spec/conformance/lfm/four-notes`. A case pinning 1.x behavior that 2.0 changed carries
  `until: LFM-2.0`, and the reference runner skips it.
