---
status: proposed
summary: >
  The four state markers carry more answers than they have markers, and `[ ]` does double duty:
  "no" in verdict-grid (red ✕) and "not yet" everywhere else (open ring), so the same keystroke
  draws opposite meanings depending on the layout. Measured across the shipped decks, 66 `[ ]` in
  `state-cells` comparison tables are really "no" drawn as "not yet". Decided: SIX markers, one
  meaning each in every layout — `[x]` yes, `[-]` partly, `[!]` no, `[?]` unknown, `[ ]` open,
  `[/]` does not apply. SHAPE carries the meaning and never varies; FILL says settled (solid) or
  not (hollow); COLOR carries emphasis. The red ✕ stays, owned by `[!]`; `[?]` is a hollow ring
  with a drawn question mark. Costs a migration of verdict-grid's 43 `[ ]` (15 decks), a review of
  66 state-cells `[ ]` (7 decks), obligation-matrix exempt to `[/]` (37 uses, 9 decks), and folding
  eight private marker regexes into the one kernel.
---

# Six answers, six marks: one meaning per state marker

**Date:** 2026-09-24 · **Status:** proposed — the owner's decisions are recorded in §8; not yet built
**Refs:** PR #2327 (pricing and `state-cells` draw `[ ]` as the open ring), HARD RULE #1, #29

## 1. Symptom

The owner wrote a legend under a pricing slide in inline marks:
`` `[x]` Included · `[ ]` Coming in Q3 ``. The legend drew `[ ]` as an open ring; the cards
directly above drew the same marker as a red ✕. PR #2327 fixed that one pair by making pricing
read `[ ]` the way everything but verdict-grid does. The owner's follow-up question was the
right one: **is the red ✕ going away, and does it still have a place?**

It does have a place. The problem is that it has **no marker of its own**.

## 2. Root cause: four markers, six answers

A status mark answers one question about one row. There are six possible answers, not four:

| Answer | Logic | Today | Drawing |
|---|---|---|---|
| **Yes** | true | `[x]` | green disc, check |
| **Partly** | truthy | `[-]` | amber disc, dash |
| **No** | false | `[ ]`, **only in verdict-grid** | red disc, ✕ |
| **Unknown** | cannot be settled yet | nothing (authors write `[ ]` or prose) | — |
| **Open** | not yet looked at | `[ ]`, everywhere else | hollow gray ring |
| **Does not apply** | outside the question | `[/]` | gray disc, slash, label struck |

"No" and "does not apply" are different answers. *No* means the question applies and the answer
is negative. *Does not apply* means the question is not relevant to this row. Likewise *no* and
*open* are different: one is a finding, the other is the absence of one. And *unknown* is not
*open*: open means nobody has looked yet; unknown means somebody looked and the answer cannot be
settled (disputed data, a pending audit, a vendor who will not say).

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
| `[?]` | **unknown** | hollow ring, drawn `?` inside, `--muted-mark` | **hollow** |
| `[ ]` | open | hollow ring, empty, `--muted-mark` | **hollow** |
| `[/]` | does not apply | slash on `--muted-mark`, label struck | solid |

Five of the six drawings exist today (`--mark-check`, `--mark-dash`, `--mark-x`, `--mark-slash`,
and the hollow ring from `.state.todo`). The one new piece of artwork is `--mark-question`, a
stroked SVG mask in the same 24-unit box and stroke weight as its siblings, plus a `-bold` twin for
`checks-bold`. The other change is who owns the ✕: it moves from a layout flag to a marker the
author types.

## 4. Design rules

1. **Shape carries the meaning, and never varies by layout.** The shape is the color-blind and
   grayscale channel (see `lib/base/base.docs.md` §State markers), so it is the part that must
   be universal. The check, dash, ✕, ring and slash mean the same thing on every slide.
2. **Fill says whether the question is settled.** The three findings (yes, partly, no) and
   *does not apply* are solid discs. *Unknown* and *open* are hollow, because neither is an
   answer yet; the drawn `?` is what tells them apart. This rule is why `[?]` is NOT a solid gray
   disc: that shape would be a twin of `[/]`, and in grayscale "unknown" and "does not apply"
   would differ only by a small inner mark (prototype, §9).
3. **Color carries emphasis, and only a named modifier changes it.** `heat` already remaps
   color for exposure reading (applies = alarm) and keeps every shape. That stays the only way
   to recolor. A layout never softens a color by default: pricing's register is set by the
   author's choice of marker, `[/]` "not on this plan" rather than `[!]` "missing".
4. **The layout supplies the WORDS, never the meaning.** Each layout names the six answers in
   its own register, through the label sets (`labelSet` in the manifest), speech and the key
   under the grid. The words change; the answer does not.
5. **One parse.** The marker grammar is read in one kernel, `lib/core/state-marks.js`
   (HARD RULE #1). See finding §6.1.

## 5. Words per layout

What each layout's key, label set and narration say for each answer. A cell marked "—" is an
answer the layout rarely needs. The marker still works there and falls back to the universal word.

| Layout | `[x]` yes | `[-]` partly | `[!]` no | `[?]` unknown | `[ ]` open | `[/]` does not apply |
|---|---|---|---|---|---|---|
| universal / inline | done | partial | no | unknown | to do | skipped |
| checklist | done | partial | failed | unknown | to do | skipped |
| verdict-grid | yes | partial | no | unknown | not assessed | n/a |
| pricing | included | limited | missing | ask sales | coming | not included |
| obligation-matrix | applies | partial | does not apply | unclear | undetermined | exempt |
| roadmap | shipped | in flight | missed | at risk | planned | out of scope |
| `state-cells` | yes | partial | no | unknown | not checked | n/a |

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

### 6.4 The shape of `[?]`

Three candidates were weighed, and two were prototyped (§9):

| Candidate | Verdict |
|---|---|
| **A: hollow ring with a drawn `?`** | **Chosen.** Keeps the fill rule; reads clearly in light and dark at table size |
| C: solid gray disc, knockout `?` | Rejected. A solid gray twin of `[/]`; the knockout `?` loses contrast in dark mode |
| B: dotted ring | Not built. The ring is a box-shadow, so dots need per-consumer border rules, and fine dots blur at inline size and in print |

The `?` is DRAWN (a mask), never typed. A typed `?` would be a glyph from the deck's type family at
the text's weight and baseline, which is the problem HARD RULE #29 exists to stop.

## 7. Migration

| Change | Scope | How |
|---|---|---|
| verdict-grid `[ ]` → `[!]` | 43 uses, 15 decks | Mechanical codemod: inside a verdict-grid slide, every nested `[ ]` becomes `[!]` |
| `state-cells` `[ ]` → `[!]` where it means "no" | 66 uses, 7 decks | **Reviewed by hand:** a cell can mean "not checked" |
| obligation-matrix `[ ]` → `[/]` | 37 uses, 9 decks | Mechanical codemod |
| Third-party decks | unknown | `lint:deck` warns on `[ ]` in a verdict-grid slide ("did you mean `[!]`?"), plus a `**Breaking:**` changelog line |

Renders to check after the switch: every rebuilt gallery and deck through `golden-diff`, and the
`verdictGridBadges@pricing`-style fidelity probe widened to cover `[!]` on every consumer.

## 8. Decisions (owner, 2026-09-24)

1. **Six markers.** `[?]` unknown is split out from `[ ]` open. (Five was recommended; the owner
   chose six so "somebody looked and cannot tell" stops sharing a mark with "nobody has looked".)
2. **"No" is spelled `[!]`.**
3. **Obligation-matrix "exempt" moves to `[/]`.** `[ ]` there becomes "undetermined".
4. **Rollout: one PR.** Route all eight parsers through the kernel, add `[!]` and `[?]`, switch
   verdict-grid `[ ]` to the open ring, migrate every shipped deck, and add a `lint:deck` warning
   plus a `**Breaking:**` changelog line for everyone else's decks.
5. **`[?]` draws a hollow ring with a drawn question mark** (candidate A, §6.4).

## 9. Evidence

A throwaway patch (not committed) added `[!]` and `[?]` to the kernel and the eight regexes, and
made `[ ]` neutral everywhere. Two renders came from it, both in light and dark (indaco):

- **The five existing shapes** in checklist, pricing, `state-cells`, verdict-grid,
  obligation-matrix and inline marks. Every layout drew them identically with no CSS change,
  because every consumer except roadmap already styles `fail` as the ✕. The one visible gap:
  obligation-matrix's automatic key still named `[ ]` "Exempt" and had no entry for `[!]`, which
  is the §5 label work.
- **`[?]` as candidates A and C side by side**, from a prototype stylesheet, in checklist, a
  `state-cells` table and verdict-grid badges. That render settled §6.4.
