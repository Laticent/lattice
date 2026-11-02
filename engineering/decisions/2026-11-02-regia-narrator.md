---
status: proposed
summary: >
  Regia (Italian: stage direction) is the narrator, as Vetrina is the walkthrough: a framework-free internal library
  that turns declared semantics into spoken beats. It reads a figure's semantic tree and its kind's speech declaration
  (phrases with slots, fact functions for computed insights), applies the author's density, register and variant
  choices, and returns beats `{ act, targets, text, anchor, span }`. It knows nothing of slides, charts, timing or the DOM,
  so any structured content can be narrated by it. Cadenza times the beats and owns pace; the Lattice Timing Track
  carries them, its existing `actions` layer gaining each beat's targets so narration and gesture travel together;
  Suono speaks, Vetrina points, the surface reveals. Regia and Vetrina never import each other: they meet at two data
  contracts, the beat and the LTT `actions` layer. Regia replaces the 6,543-line chart-narration.js. Revised after the
  adversarial review (§7).
---

# Regia: the narrator (2026-11-02)

**Answer.** Narration is a craft of its own, and it gets a library of its own, the way walkthroughs did (Vetrina).
Regia decides **what is said** from declared semantics. It never decides when (Cadenza), never speaks (Suono), never
points (Vetrina) and never reads a slide.

```
kind manifest (what it can say)  +  slide tree (host data: the slide's prose and its figures)
                    │
                    ▼
   REGIA       fills declared phrases from the tree, calls the kind's fact functions, applies density,
               register and variants, drops repeated framing
                    │  beats: { act, targets, text, anchor, span }
                    ▼
   CADENZA     times the words; owns pace
                    │
                    ▼
   LTT         the timeline, file or in memory; its `actions` layer carries each beat's targets
                    │
          ┌─────────┼──────────────┐
          ▼         ▼              ▼
        SUONO     VETRINA        the surface
        speaks    points         reveals
```

The owner's framing (2026-11-02): "Regia is our Vetrina for narration." An earlier draft of this note made Regia a
scheduler that took Vetrina's storyboard and runner; the owner rejected that as tight coupling, and an intermediate
draft dropped Regia for LTT alone. Both are superseded here.

## 1. Why a library, and why this boundary

Today's narration is one shared file, `lib/core/chart-narration.js` (6,543 lines): 20 chart narrators, 9 Mermaid
narrators and a generic floor, about 39 branches on a chart class, 24 unit names as string literals, and it re-parses
each slide's Markdown rather than reading what the chart drew. Every new chart edits it; nothing outside slides can
use it.

The boundary follows the crafts:

| Craft | Library | Knows | Never knows |
|---|---|---|---|
| What to say | **Regia** | units, phrases, facts, density, register, variants | slides, time, audio, the DOM |
| When | **Cadenza** | words, syllables, pauses, pace | what a sentence is about |
| The timeline | **LTT** | cues, timing, audio clips, and word-anchored actions (now with targets) | how either was made |
| Speaking | **Suono** | audio bytes on one clock | text |
| Pointing | **Vetrina** | targets, gestures; it receives the delivery style as data | how sentences are made |

## 2. Regia's contract

**In**

- **The slide tree** for one scene, as host data (never read back out of markup, §7 #1): the slide's prose nodes
  (heading, eyebrow, paragraphs, item details, callouts) and each figure's units, `{ unit, id, label, value,
  relations }`, as the engine and the kind produced them at render, before hydration (§7 #2, #3) (`2026-11-02-declared-figure-semantics.md` §3). Regia takes it as plain data; it never queries a DOM.
- **The speech declaration** from the kind's manifest: per act, phrases with slots; the visit order; (the key beat is
  the manifest's existing `gesture.key` selection rule);
  named fact functions (`2026-11-02-declared-figure-semantics.md` §4a).
- **The fact functions themselves**, passed in by the caller (the kind's code). Regia calls them with the tree and
  gets typed facts back, never words (§7 #4).
- **A policy**: density (`full`, `brief`, `insight`, and `-act` switches; the register's name is an owner decision, §7 #14), register, the variant seed, and
  the previous scene's kind (so a repeated `frame` is dropped).

**Out**

- **Beats**, in order: `{ act, targets: [{ unit, id }], text, anchor, span }`. `anchor` names the slot where the
  target is spoken, so a gesture can land on that word; `span` keeps today's character range over the text. A beat
  may have no target (`frame`, `verdict`, `aside`): the act says what it is. The acts are the eight of
  2026-09-27 §3, open to new ones with a declared fallback (§7 #15).

**Shared grammar Regia owns**

How values are spoken (numbers, money, dates, lists), and later other languages. Today that lives in
`lib/core/chart-values-speech.js` and moves into Regia.

**What Regia refuses**

A phrase is slot-filling only: `{name}`, `{value}`, `{top.lead}`. No conditionals, loops or arithmetic in a phrase,
because that is a template language the no-DSL rule forbids. A computed act needs a fact function.

## 3. The beat and the LTT `actions` layer

Two data contracts are the only things Regia and Vetrina share.

- **The beat** is Regia's output and Cadenza's input. Cadenza already turns text into timed cues; it now carries each
  beat's `act`, `targets` and `anchor` onto the cue it times.
- **The LTT `actions` layer** (Vetrina's, `spec/LTT-1.0.md:219`, already word-anchored by `{ cue, word, match }`)
  gains `{ unit, id }` targets, and the segment hash covers the target ids so a changed target reads stale. It
  replaces the side channel the exported player uses now ("guide delivery data" baked beside the track,
  `lib/export/player-core.mjs:2496-2501`), so narration and gesture travel in one record and cannot drift. No new
  layer: the spec's rule G4 keeps layers for what changes timing (§7 #6).

Live playback (Present) reads the same records in memory; a bake writes them to the file. One shape, two forms.

## 4. Where each control lives

| Control | Register (deck · slide) | Owner | Why |
|---|---|---|---|
| Density, act switches | `<density>:` · `_<density>:` (name: owner decision, §7 #14) | Regia | decides what is said |
| Register, variants | (style presets) | Regia | decides how it is phrased |
| Character | `delivery:` · `_delivery:` | host data in `lib/core/delivery-styles/`, handed to Vetrina and the player | decides how pointing looks, captions and read-along (§7 #10) |
| Pace | `pace:` | Cadenza | decides timing |

Cadenza holds the pace table; the engine's copy in `lib/core/resolve-pace.mjs` is generated from it at build, so the
hand-kept duplicate and its parity test become a build product and a freshness check (§7 #9).

## 5. What moves

| From | To |
|---|---|
| `lib/core/chart-narration.js`: per-chart narrators | each kind's manifest (phrases, order) and its fact functions (typed facts) |
| `lib/core/chart-narration.js`: the walk, dispatch, floor | Regia (generic) |
| `lib/core/chart-values-speech.js` | Regia's spoken-value grammar |
| Mermaid's nine narrators | the Mermaid plugin's diagram kinds: phrases plus fact functions, as charts |
| the exported player's baked guide data | the LTT `actions` layer, with targets |
| `lib/core/resolve-pace.mjs` numbers | generated from Cadenza's table |

## 6. How it is held to its contract

- **Boundary gate**, as Vetrina's: Regia imports nothing from Lattice, Vetrina or Cadenza; Vetrina imports nothing
  from Regia.
- **Conformance per kind**: every declared unit is emitted, every emitted unit is declared, every phrase's slots
  resolve against the kind's tree fixtures.
- **Golden narration**: today's narration over the gallery decks is snapshotted before the move; the migration keeps
  it word for word except where a change is reviewed.
- **Screen-reader parity**: the accessible description and the spoken frame come from the same phrases
  (today's `chart-a11y-contract.test.js`, generalized).

## 7. Adversarial review (HARD RULE #25), 2026-11-02

A red team, a Munger inversion and an independent checker reviewed this note with
`2026-11-02-declared-figure-semantics.md` and `2026-11-01-charts-one-plugin.md`. Each finding, and what it changes.
"Ran" findings were reproduced on the branch; the rest were read from the code.

### The design changes

| # | Finding | Lens | Resolution |
|---|---|---|---|
| 1 | **The tree, read back out of markup, is forgeable** (ran): a raw `<span data-label="…">` in a slide passes the engine untouched (`lib/plugins/author-markup.js:43,58,68` protects five host markers; the slide sanitizer allows `data-*`), so author text would become speech, the accessible name and Guide targets. Mermaid already emits author-chosen `data-id`. | red team | **The tree is host data, never markup.** The kind returns it to the host beside its HTML; capabilities read that object. Anything projected onto the output for the Guide is one host-written marker (`data-lattice-semantics`) added to `HOST_MARKERS`, and every query is scoped to the figure root the host marked. |
| 2 | **Narration speaks the slide, not only the figure**: heading (the verdict), eyebrow lines, item details, callouts and leftover prose (`speakLeftover`, `speakItemDetail`, `withCallouts`: 46 uses). | inversion | **The tree is a slide tree.** The engine emits the slide's prose blocks as nodes (heading, eyebrow, paragraphs, item details, callouts) with the figure's subtree inside; Regia narrates the whole tree. No host composer re-reads Markdown. |
| 3 | **The CLI has no hydrated figure**: state-chart and flowchart layouts, Mermaid SVG and callout placement exist only after a browser pass; every producer passes Markdown today (`lattice.js:6549`, `PresentOverlay.tsx:486`, `narration-bake.ts:497,679`). | red team, checker | **The tree is render-time engine output, produced before hydration, identical on every path** (CLI, Studio, player). A hydration pass may amend it only through a declared amendment schema. Mermaid emits its tree from the parsed diagram, not from the SVG it draws. Deck context (`callout:`, `legend:`, plugins off) is policy, not tree. |
| 4 | **Slot-only phrases cannot express real chart English**: rose/fell/held by sign, point/points, clauses present only when a value is non-zero. | inversion | **Fact functions return typed values** (`{ direction: 'up' \| 'down' \| 'flat', delta: Quantity }`), and Regia's grammar owns how a typed value is spoken (verbs, plurals, units, lists, articles). Phrases stay slot-only. Prototype on line, funnel and sequence before writing more manifests; owner decision below. |
| 5 | **Determinism**: seeding by position, no-repeat across slides and frame-skipping make slide N depend on slide N-1; inserting a slide churns every later caption; a screen reader jumping to a slide would lose its frame. | red team | **Variants are seeded by a hash of the slide's own tree and kind**, never position. The **accessible description always uses phrasing 0** and ignores delivery policy. Frame-skipping is a delivery rule only, applied by the producer when it builds a timeline, never in assistive output. |
| 6 | **The LTT delivery layer fails the spec's own rule** (G4, `spec/LTT-1.0.md:243-246`: a layer must change what `positionAt` returns) and the cue core is closed (`validate.ts:18-26`); an `actions` layer with word anchors already exists (Vetrina's, `LTT-1.0.md:219`). | red team, checker | **No new layer. Extend `actions`** with `{ unit, id }` targets, anchored by its existing `{ cue, word, match }`, and hash target ids into the segment hash so a changed target reads stale. Still a spec change: owner decision below. |
| 7 | **The a11y contract test would weaken**: it is strong because it compares two independent derivations; one tree feeding both makes an omission invisible. `"{value} for {name}."` breaks its "name leads the sentence" rule. The hidden data table (`.chart-sr-only`) is not in the vocabulary. | red team | Keep an **independent oracle** (a DOM sweep of what was drawn). A phrase with a `{name}` slot must lead with it (a lint on manifests). The screen-reader table is a declared projection of the tree. |
| 8 | **Fact functions have no trust tier**; zip plugins carry code only through the sandboxed door (async), lint must be sync. | red team | **Fact functions are in-tree only** (LPM §10 says so); a zip kind declares phrases as data and gets no computed acts. Values reaching the tree from the sandbox are checked against declared units and length-capped. |
| 9 | **Pace cannot simply move to Cadenza**: `lib/core/resolve-pace.mjs:28-41` explains why the table is stated twice (package boundaries; the player resolves a beat with no workspace package; Rollup refuses the CJS route). | checker | **Cadenza stays the source; the engine copy is generated from it at build** (a `*.generated.mjs`), so the duplicate becomes a build product and the parity test becomes a freshness check. |
| 10 | **`delivery:` character cannot move into Vetrina**: the styles (`lib/core/delivery-styles/*.mjs`) are read by the player, `scene-resolve`, `delivery-score`, lint and the Studio; Vetrina may import only `@laticent/ltt`; a style also sets caption and read-along policy. | checker | **Delivery styles stay host data in `lib/core`**, handed to Vetrina and the player as data, the way Vetrina already receives a preset. `_delivery:` per slide is new and needs the player's per-slide style. |
| 11 | **The spoken-value grammar cannot move into Regia as is**: `chart-values-speech.js` requires `@laticent/segno/values` and `chart-values.js`. | checker | Regia's grammar depends on `@laticent/segno/values` (a package, allowed); the chart-specific value readers stay with the charts plugin and hand Regia typed values. |
| 12 | **Byte budgets**: lint core 0.3 KB from its ceiling, engine 2 KB, Studio eager 4.9 KB; `read-along-core` (183,638 B gz) is eager in the Studio. | red team | A **byte plan before building**: models in one shared chunk counted once; phrase tables load when Present opens; measured on a spike. |
| 13 | **The notes contradicted each other**: act lists (8, 5, and a `full` density that drops `note`/`compare`/`peak`); the beat's field names (`targets` vs `units`); "a beat with no target is an aside" (frame and verdict have none); `key` declared as an act in `speech` while `gesture.key` is a selection rule in 26 manifests; charts-one-plugin's `narrate()` role and byte-identity promise. | checker | Fixed in all three notes: **the eight acts of 2026-09-27 §3** are the list; `full` speaks them all; the beat is `{ act, targets, text, anchor, span }` (keeping today's character spans); an `aside` is an act, not a missing target; **`gesture.key` stays the key** (a selection rule), with no second declaration; charts-one-plugin points narration at Regia. |
| 14 | **`narrate:` collides with the CLI flag `--narrate`** (voice the player with Kokoro) and Vetrina's `run({ narrate })`. | red team, checker | The density register is renamed: owner decision below. |
| 15 | **Acts would ossify** once 37 kinds and the gesture mapping depend on a closed list. | inversion | Acts are an **open set with a declared fallback** (`act: 'trend', fallsBack: 'peak'`); styles map an unknown act through its fallback. |

### What held

The three-layer split (meaning, capability, timing), "capabilities read what was drawn, never the source" (the
word-cloud narrator today counts words the canvas never drew), one beat for speech and gesture, gates in place of
rosters, Regia's boundary, and charts as one plugin with 28 catalog kinds. Most measured claims were confirmed
(6,543 lines; 19 chart narrators plus the diagram dispatcher and 9 Mermaid readers; 22 entries in `CALLOUT_READERS`
and `CHART_SVG_SEL`; the player's side channel, `player-core.mjs:2496-2501`). Two corrections: 23 distinct unit
literals, not 24; and the 2026-09-27 note's "the LTT track carries the refs" is inaccurate (they travel in the player's
data).

### What the owner decides

1. **Scope** of #2997 (the owner chose one PR for everything; the review argues for gated steps).
2. **The phrase grammar**: typed facts plus Regia's grammar, or a standard message format.
3. **The LTT change**: extending `actions` with targets.
4. **The density register's name**.

## 8. Order of work, gated

Whatever the PR count, the steps are gated separately so no gate is re-blessed for two reasons at once:

1. Charts move into one plugin with **byte-identical** engine HTML, CSS, exports and narration.
2. The slide tree and the host marker land, with a reviewed one-time HTML diff and the export sign-off.
3. Narration ports to Regia with **one phrasing per act**, goldens held word for word against today's narrator.
4. Variants and frame-skipping turn on, as their own reviewed golden change.

## References

- `engineering/decisions/2026-11-02-declared-figure-semantics.md`, `2026-11-01-charts-one-plugin.md`.
- `engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md`, `2026-09-25-vetrina-delivery-presets.md`,
  `2026-09-24-lattice-timing-track.md`, `2026-07-05-vetrina-walkthrough-library.md`, `2026-07-11-manifest-speech-contract.md`.
- `lib/core/chart-narration.js`, `lib/core/chart-values-speech.js`, `lib/core/resolve-pace.mjs`, `lib/export/player-core.mjs`,
  `docs/src/lib/cadenza/cadence.ts`, `docs/src/lib/ltt/types.ts`.
