---
status: proposed
summary: >
  Regia (Italian: stage direction) is a new framework-free internal library that owns DELIVERY: it turns a script of
  beats (what to reveal, what to say, where to point) plus a pace and a style into one schedule on one clock, which any
  surface plays live, bakes into a Lattice Timing Track, or flattens to its end state. It knows nothing about slides:
  a deck is one producer of scripts (its figures' declared steps and speech, the author's `_build`, `delivery:`,
  `narrate:` and `pace:`), and a product tour, a docs walkthrough or a video export can be others. It composes the
  pieces that exist and today nothing joins: Cadenza (text to a timed caption track and a word cursor), Suono (clocked
  audio playback), LTT (the timing format) and Vetrina (gestures over a real UI). Owner direction 2026-11-02.
---

# Regia: one library owns delivery (2026-11-02)

**Answer.** Delivery — which beat plays when, how long it holds, which word a gesture lands on, what a surface does
with it — belongs to neither a figure kind nor the engine core. It belongs to a library with one contract:

```
script  +  pace  +  style   ──Regia──▶   schedule   ──▶  play live │ bake to LTT │ flatten to the end state
```

The owner's direction (2026-11-02): "a separate internal library should own this … we have Cadenza and Suono but we
don't have a library that puts it all together via a well-defined contract that is scalable, sustainable and generic
enough that it can be used in many other domains."

## 1. What exists, and the gap

| Piece | Owns | Does not own |
|---|---|---|
| Cadenza (`docs/src/lib/cadenza`) | Text → a timed caption track, a clock → word cursor, WebVTT/SRT | Reveals, gestures, surfaces |
| Suono (`docs/src/lib/suono`) | Audio bytes → clocked playback on one WebAudio clock, a pause-gated sequence scheduler | What plays, or why |
| LTT (`docs/src/lib/ltt`) | The timing-track format and the functions that read it | Producing a track |
| Vetrina (`docs/src/lib/vetrina`) | Gestures and theater over a real UI (focus, point, ink) | What to say, timing across a deck |
| `lib/core/resolve-delivery.mjs` | The `delivery:` register: three gesture characters as numbers | Density, timing |
| `lib/core/resolve-pace.mjs` | The `pace:` register: arrival holds (duplicated in Cadenza's `cadence.ts`, pinned by a test) | Anything after the hold |
| `lib/core/ltt-deck.mjs` | Deck → LTT for the exported player | Live Present, the Guide |

The Studio's Present mode, the exported player and narration baking each assemble these pieces themselves
(`present-guide.ts`, `guide-conductor.ts`, `narration-bake.ts`, `player-core.mjs`), so the same decisions are made in
three places.

## 2. The contract

**A script** is an ordered list of beats for one scene (a slide, a tour step, a page):

```
beat = {
  id,
  act,                         // frame | enter | visit | note | compare | peak | verdict | aside
  key?: true,                  // the beat the scene is about
  reveal?: [target],           // what becomes visible at this beat
  say?: { text, anchor?, audio? },   // anchor: the word a gesture lands on
  point?: [target],            // what the gesture is about
}
target = an opaque id the producer's surface can resolve (a semantic-tree unit, a CSS selector, a UI element id)
```

**A policy** is the pace (holds and beat spacing), the style's two axes (character: how an act moves; density: which
acts play) and the per-scene overrides.

**A schedule** is the script placed on one clock: every reveal, utterance and gesture with a start and an end, word
anchors resolved through Cadenza, audio placed through Suono's sequence scheduler. It is plain data, serializable,
and an LTT track is one encoding of it.

**Three consumers**, all reading the same schedule:

| Consumer | Does |
|---|---|
| Live (Present, a tour) | plays the schedule on Suono's clock, applying reveals and gestures through its surface adapter |
| Bake (the narrated player, a video) | encodes the schedule as LTT (plus audio), so playback needs no Regia at all |
| Flatten (PDF, a screenshot, a reader with motion off) | applies every reveal, no gestures, no timing |

## 3. What stays where

- **Figure kinds** declare acts, units, phrases and steps (`2026-11-02-declared-figure-semantics.md`). They never see
  Regia.
- **The deck producer** (engine side) turns a slide into a script: the semantic tree's units, the kind's phrases filled
  into beats, the author's `_build` and `_focus` as reveals, `narrate:` and `delivery:` (deck and slide) as the policy.
- **Regia** places beats on the clock, resolves anchors, applies the style, and serves the three consumers. It imports
  Cadenza, Suono and LTT; it knows no slide, chart or DOM.
- **Surfaces** supply a small adapter: resolve a target, apply a reveal, perform a gesture (Vetrina is the gesture
  adapter for real UIs and the Studio).
- **Pace numbers** live in Regia once; the engine register and Cadenza read them from there, and the duplicated table
  and its parity test go.

## 4. Why a library, and why generic

- One place decides delivery, so Present, the player and a bake cannot disagree.
- The contract holds no slide concept, so Vetrina's product tours, a docs walkthrough and a video export can be
  producers too; each gets pacing, word-anchored gestures, styles and LTT output without its own scheduler.
- It follows the workspace-library shape every sibling uses (framework-free core, a pure data contract, its own tests,
  a publishable package).

## 5. Questions for the owner

1. **The name.** Regia, beside Cadenza and Suono; or another.
2. **Where pace lives.** In Regia, with the engine's `pace:` register and Cadenza reading it (recommended), or in LTT as
   part of the format.
3. **Vetrina.** Becomes Regia's gesture adapter for live UIs (recommended), or stays a separate engine Regia calls.

## References

- `engineering/decisions/2026-11-02-declared-figure-semantics.md` (§4, §4a–c).
- `engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md`, `2026-09-25-vetrina-delivery-presets.md`,
  `2026-09-24-lattice-timing-track.md`, `2026-06-16-narrative-step-model.md`.
- `lib/core/resolve-delivery.mjs`, `lib/core/resolve-pace.mjs`, `lib/core/ltt-deck.mjs`.
