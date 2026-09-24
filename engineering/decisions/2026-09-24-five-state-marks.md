---
status: proposed
summary: >
  The four state markers carry FIVE answers, and `[ ]` is the one doing double duty: "no" in
  verdict-grid (red ✕) and "not yet" everywhere else (open ring), so the same keystroke draws
  opposite meanings depending on the layout. Measured across the shipped decks, 66 `[ ]` in
  `state-cells` comparison tables are really "no" drawn as "not yet". Proposal: one marker per
  answer, one meaning in every layout — `[x]` yes, `[-]` partly, `[!]` no, `[ ]` open, `[/]` does
  not apply. SHAPE carries the meaning and never varies; COLOR carries emphasis. The red ✕ stays,
  owned by `[!]`. Costs a migration of verdict-grid's 43 `[ ]` (15 decks) and a review of 66
  state-cells `[ ]` (7 decks), plus folding eight private marker regexes into the one kernel.
---

# Five answers, five marks: one meaning per state marker

**Date:** 2026-09-24 · **Status:** proposed, awaiting the owner's decisions in §8
**Refs:** PR #2327 (pricing and `state-cells` draw `[ ]` as the open ring), HARD RULE #1, #29

## 1. Symptom

The owner wrote a legend under a pricing slide in inline marks:
`` `[x]` Included · `[ ]` Coming in Q3 ``. The legend drew `[ ]` as an open ring; the cards
directly above drew the same marker as a red ✕. PR #2327 fixed that one pair by making pricing
read `[ ]` the way everything but verdict-grid does. The owner's follow-up question was the
right one: **is the red ✕ going away, and does it still have a place?**

It does have a place. The problem is that it has **no marker of its own**.

## 2. Root cause: four markers, five answers

A status mark answers one question about one row. There are five possible answers, not four:

| Answer | Logic | Today | Drawing |
|---|---|---|---|
| **Yes** | true | `[x]` | green disc, check |
| **Partly** | truthy | `[-]` | amber disc, dash |
| **No** | false | `[ ]`, **only in verdict-grid** | red disc, ✕ |
| **Open** | unknown / not yet | `[ ]`, everywhere else | hollow gray ring |
| **Does not apply** | outside the question | `[/]` | gray disc, slash, label struck |

"No" and "does not apply" are different answers. *No* means the question applies and the answer
is negative. *Does not apply* means the question is not relevant to this row. Likewise *no* and
*open* are different: one is a finding, the other is the absence of one.

`[ ]` carries both *no* and *open*, and `lib/core/state-marks.js` `stateClassesFor(marker,
neutralEmpty)` picks between them by layout. That flag is the whole defect: the author cannot see
it, and the same keystroke draws opposite answers on two slides of one deck.

### What authors actually mean by `[ ]` (measured)

Counted over every committed deck, excluding `*.docs.md` and the `engineering/`, `design/`,
`changelog.d/` and `followups.d/` trees:

| Where | `[ ]` uses (decks) | What the authors mean |
|---|---|---|
| roadmap | 155 (28) | planned |
| checklist | 107 (26) | not done yet |
| `state-cells` tables | 66 (7) | **mostly "no"**: `examples/table-component.md` §state-cells, `Productboard · Speed · [ ]` |
| verdict-grid | 43 (15) | no, criterion not met |
| obligation-matrix | 37 (9) | exempt |
| inline marks | 26 (6) | not yet |
| pricing | 2 (1) | coming soon |

About three quarters of the uses mean *open*. The *no* uses sit in exactly the two places built
for comparison: verdict-grid, which draws them correctly, and `state-cells`, which does not.

## 3. The model: one marker per answer

| Marker | Answer | Drawing | Filled? |
|---|---|---|---|
| `[x]` | yes | check on `--pass` | solid |
| `[-]` | partly | dash on `--warn` | solid |
| `[!]` | **no** | ✕ on `--fail` | solid |
| `[ ]` | open | hollow ring, `--muted-mark` | **hollow** |
| `[/]` | does not apply | slash on `--muted-mark`, label struck | solid |

All five drawings exist today (`--mark-check`, `--mark-dash`, `--mark-x`, `--mark-slash`, and
the hollow ring from `.state.todo`). **No new artwork is needed.** The change is who owns the ✕:
it moves from a layout flag to a marker the author types.

## 4. Design rules

1. **Shape carries the meaning, and never varies by layout.** The shape is the color-blind and
   grayscale channel (see `lib/base/base.docs.md` §State markers), so it is the part that must
   be universal. The check, dash, ✕, ring and slash mean the same thing on every slide.
2. **Fill says whether the question is settled.** The three findings (yes, partly, no) and
   *does not apply* are solid discs. *Open* is the only hollow shape, because it is the only
   answer that is not an answer yet.
3. **Color carries emphasis, and only a named modifier changes it.** `heat` already remaps
   color for exposure reading (applies = alarm) and keeps every shape. That stays the only way
   to recolor. A layout never softens a color by default: pricing's register is set by the
   author's choice of marker, `[/]` "not on this plan" rather than `[!]` "missing".
4. **The layout supplies the WORDS, never the meaning.** Each layout names the five answers in
   its own register, through the label sets (`labelSet` in the manifest), speech and the key
   under the grid. The words change; the answer does not.
5. **One parse.** The marker grammar is read in one kernel, `lib/core/state-marks.js`
   (HARD RULE #1). See finding §6.1.

## 5. Words per layout

What each layout's key, label set and narration say for each answer. A cell marked "—" is an
answer the layout rarely needs. The marker still works there and falls back to the universal word.

| Layout | `[x]` yes | `[-]` partly | `[!]` no | `[ ]` open | `[/]` does not apply |
|---|---|---|---|---|---|
| universal / inline | done | partial | no | to do | skipped |
| checklist | done | partial | failed | to do | skipped |
| verdict-grid | yes | partial | no | not assessed | n/a |
| pricing | included | limited | missing | coming | not included |
| obligation-matrix | applies | partial | does not apply | undetermined | exempt |
| roadmap | shipped | in flight | missed | planned | out of scope |
| `state-cells` | yes | partial | no | — | n/a |

Two rows move an existing meaning, and each needs a call in §8:

- **verdict-grid `[ ]`** goes from "no" to "not assessed". Its 43 uses migrate to `[!]`.
- **obligation-matrix "exempt"** goes from `[ ]` to `[/]`. An exempt regime is one the
  obligation does not reach, which is *does not apply*, not *open*.

## 6. Findings made while designing

### 6.1 The grammar is parsed in eight places, not one

`[x\-/ ]` appears as a private regex in eight places:

- three in `lib/integrations/markdown-it/plugins.js`
- three in `lib/runtime/index.js`
- one in `lib/components/chart/roadmap/roadmap.transform.js`
- one in `lib/core/table-row-label.js`

`lib/core/inline-pills.js` also has its own `RESERVED_MARKERS`. `state-marks.js` owns the
*meaning*, but not the *syntax*. A fifth marker added to seven of the eight would leave one surface
printing a literal `[!]`, which is exactly the drift HARD RULE #1 exists to stop. The
implementation must first export one `MARKER_RE` / `MARKER_CLASS` from `state-marks.js` and route
all eight through it, with a test that fails on a private copy.

### 6.2 Roadmap keeps a second vocabulary

Roadmap maps markers to its own classes (`state-shipped`, `state-wip`, `state-planned`,
`state-skipped`) through a private `markerToState`. Its stylesheet comment
(`roadmap.styles.css`, "State token vocabulary") says `[/]` is "fail red", but the rule below it
paints `--muted-mark`. The code is right and the comment is stale. A fifth state needs a
`state-missed` class there, or better, roadmap consuming `stateClassesFor` like everyone else.

### 6.3 Why `[!]` for "no" (spelling)

| Candidate | For | Against |
|---|---|---|
| **`[!]`** | Reads as "problem" in raw markdown; cannot be mistaken for `[x]`; appears in no shipped deck today | Some tools (Obsidian) use `[!]` for "important"; one gallery sentence says `[!]` stays literal and must change |
| `[n]` | Mnemonic "no" | A letter invites `[y]`; reads oddly next to `[x]`, which already means yes |
| `[X]` | Looks like a cross | **Rejected:** GitHub-flavored markdown treats `[X]` as *checked*, the opposite answer |
| `[~]` | Free on most keyboards | Already typed as a literal "partial-ish" in two decks (`examples/autosplit-coverage.md`, `examples/sketch.md`); reads as "approximately", not "no" |

### 6.4 Why not a sixth marker for "unknown"

*Unknown* (nobody knows) and *not yet* (will be done) are distinguishable, and `[?]` is the obvious
spelling. They would share the hollow ring, though, since both are unsettled, so a sixth marker
needs a sixth shape, and no deck measured here puts both on one slide. Recommendation: keep
them as one *open* answer. Revisit if a deck needs both at once.

## 7. Migration

| Change | Scope | How |
|---|---|---|
| verdict-grid `[ ]` → `[!]` | 43 uses, 15 decks | Mechanical codemod: inside a verdict-grid slide, every nested `[ ]` becomes `[!]` |
| `state-cells` `[ ]` → `[!]` where it means "no" | 66 uses, 7 decks | **Reviewed by hand:** a cell can mean "not checked" |
| obligation-matrix `[ ]` → `[/]` (if §8 Q3 says so) | 37 uses, 9 decks | Mechanical codemod |
| Third-party decks | unknown | `lint:deck` warns on `[ ]` in a verdict-grid slide ("did you mean `[!]`?"), plus a `**Breaking:**` changelog line |

Renders to check after the switch: every rebuilt gallery and deck through `golden-diff`, and the
`verdictGridBadges@pricing`-style fidelity probe widened to cover `[!]` on every consumer.

## 8. Decisions for the owner

1. **The model.** Five markers (recommended), six with `[?]` split out, or keep four.
2. **The spelling of "no".** `[!]` (recommended), `[n]`, or another.
3. **Obligation-matrix "exempt".** Move to `[/]` (recommended, it is *does not apply*), or keep
   `[ ]` with the word "exempt".
4. **Rollout.** Switch verdict-grid and migrate every shipped deck in one PR, with the lint
   warning for everyone else (recommended), or keep verdict-grid `[ ]` as ✕ for one release
   behind a deprecation warning.

## 9. Evidence

A throwaway patch (not committed) added `[!]` to the kernel and the eight regexes, and made `[ ]`
neutral everywhere. It rendered all five answers in checklist, pricing, `state-cells`,
verdict-grid, obligation-matrix and inline marks, in light and dark (indaco). Every layout drew
the five shapes identically with no CSS change: every consumer except roadmap already styles
`fail` as the ✕. The render also showed the one visible gap. Obligation-matrix's automatic key
still named `[ ]` "Exempt" and had no entry for `[!]`, which is the §5 label work.
