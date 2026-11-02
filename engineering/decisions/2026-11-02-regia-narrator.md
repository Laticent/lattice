---
status: proposed
summary: >
  Regia (Italian: stage direction) is the narrator, as Vetrina is the walkthrough: a framework-free internal library
  that turns declared semantics into spoken beats. It reads a figure's semantic tree and its kind's speech declaration
  (phrases with slots, fact functions for computed insights), applies the author's density, register and variant
  choices, and returns beats `{ act, targets, text, anchor }`. It knows nothing of slides, charts, timing or the DOM,
  so any structured content can be narrated by it. Cadenza times the beats and owns pace; the Lattice Timing Track
  carries them, gaining an optional delivery layer (each cue's act and targets) so narration and gesture travel
  together; Suono speaks, Vetrina points, the surface reveals. Regia and Vetrina never import each other: they meet
  at two data contracts, the beat and the LTT delivery layer. Regia replaces the 6,543-line chart-narration.js.
---

# Regia: the narrator (2026-11-02)

**Answer.** Narration is a craft of its own, and it gets a library of its own, the way walkthroughs did (Vetrina).
Regia decides **what is said** from declared semantics. It never decides when (Cadenza), never speaks (Suono), never
points (Vetrina) and never reads a slide.

```
kind manifest (what it can say)  +  semantic tree (what this figure holds)
                    │
                    ▼
   REGIA       fills declared phrases from the tree, calls the kind's fact functions, applies density,
               register and variants, drops repeated framing
                    │  beats: { act, targets, text, anchor }
                    ▼
   CADENZA     times the words; owns pace
                    │
                    ▼
   LTT         the timeline, file or in memory, with a delivery layer: each cue's act and targets
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
| The timeline | **LTT** | cues, timing, audio clips, and (new) each cue's act and targets | how either was made |
| Speaking | **Suono** | audio bytes on one clock | text |
| Pointing | **Vetrina** | targets, gestures, the delivery character | how sentences are made |

## 2. Regia's contract

**In**

- **The semantic tree** for one scene: its units, each with `{ unit, id, label, value, relations }`, as the kind
  emitted them (`2026-11-02-declared-figure-semantics.md` §3). Regia takes it as plain data; it never queries a DOM.
- **The speech declaration** from the kind's manifest: per act, phrases with slots; the visit order; the key act;
  named fact functions (`2026-11-02-declared-figure-semantics.md` §4a).
- **The fact functions themselves**, passed in by the caller (the kind's code). Regia calls them with the tree and
  gets facts back, never words.
- **A policy**: density (`narrate:`: `full`, `brief`, `insight`, and `-act` switches), register, the variant seed, and
  the previous scene's kind (so a repeated `frame` is dropped).

**Out**

- **Beats**, in order: `{ act, targets: [{ unit, id }], text, anchor }`. `anchor` names the slot where the target is
  spoken, so a gesture can land on that word. A beat with no target is an `aside`.

**Shared grammar Regia owns**

How values are spoken (numbers, money, dates, lists), and later other languages. Today that lives in
`lib/core/chart-values-speech.js` and moves into Regia.

**What Regia refuses**

A phrase is slot-filling only: `{name}`, `{value}`, `{top.lead}`. No conditionals, loops or arithmetic in a phrase,
because that is a template language the no-DSL rule forbids. A computed act needs a fact function.

## 3. The beat and the LTT delivery layer

Two data contracts are the only things Regia and Vetrina share.

- **The beat** is Regia's output and Cadenza's input. Cadenza already turns text into timed cues; it now carries each
  beat's `act`, `targets` and `anchor` onto the cue it times.
- **The LTT delivery layer** is a new optional layer of `spec/LTT-1.0.md`, beside the audio layer: per cue, the act,
  the targets and any reveal. A reader that does not know it ignores it, the way a reader that cannot play audio plays
  silently today. It replaces the side channel the exported player uses now ("guide delivery data" baked beside the
  track, `lib/export/player-core.mjs`), so narration and gesture travel in one record and cannot drift.

Live playback (Present) reads the same records in memory; a bake writes them to the file. One shape, two forms.

## 4. Where each control lives

| Control | Register (deck · slide) | Owner | Why |
|---|---|---|---|
| Density, act switches | `narrate:` · `_narrate:` | Regia | decides what is said |
| Register, variants | (style presets) | Regia | decides how it is phrased |
| Character | `delivery:` · `_delivery:` | Vetrina | decides how pointing looks |
| Pace | `pace:` | Cadenza | decides timing |

The engine's `pace:` register names a preset and reads Cadenza's table; the duplicate table in
`lib/core/resolve-pace.mjs` and the test that pins the two together go.

## 5. What moves

| From | To |
|---|---|
| `lib/core/chart-narration.js`: per-chart narrators | each kind's manifest (phrases, order, key act) and its fact functions |
| `lib/core/chart-narration.js`: the walk, dispatch, floor | Regia (generic) |
| `lib/core/chart-values-speech.js` | Regia's spoken-value grammar |
| Mermaid's nine narrators | the Mermaid plugin's diagram kinds: phrases plus fact functions, as charts |
| the exported player's baked guide data | the LTT delivery layer |
| `lib/core/resolve-pace.mjs` numbers | Cadenza (already holds them) |

## 6. How it is held to its contract

- **Boundary gate**, as Vetrina's: Regia imports nothing from Lattice, Vetrina or Cadenza; Vetrina imports nothing
  from Regia.
- **Conformance per kind**: every declared unit is emitted, every emitted unit is declared, every phrase's slots
  resolve against the kind's tree fixtures.
- **Golden narration**: today's narration over the gallery decks is snapshotted before the move; the migration keeps
  it word for word except where a change is reviewed.
- **Screen-reader parity**: the accessible description and the spoken frame come from the same phrases
  (today's `chart-a11y-contract.test.js`, generalized).

## 7. Questions for the owner

1. **The LTT delivery layer** is a change to a published spec. Additive and optional, with a version bump.
2. **Regia's package** follows the workspace-library shape (`@laticent/regia`, framework-free, own tests, private
   until a publish is approved, as `@laticent/markup`).

## References

- `engineering/decisions/2026-11-02-declared-figure-semantics.md`, `2026-11-01-charts-one-plugin.md`.
- `engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md`, `2026-09-25-vetrina-delivery-presets.md`,
  `2026-09-24-lattice-timing-track.md`, `2026-07-05-vetrina-walkthrough-library.md`, `2026-07-11-manifest-speech-contract.md`.
- `lib/core/chart-narration.js`, `lib/core/chart-values-speech.js`, `lib/core/resolve-pace.mjs`, `lib/export/player-core.mjs`,
  `docs/src/lib/cadenza/cadence.ts`, `docs/src/lib/ltt/types.ts`.
