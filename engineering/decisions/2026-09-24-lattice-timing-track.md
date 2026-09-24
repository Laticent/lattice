---
status: proposed
summary: One timing format for every Lattice surface that speaks, captions or moves — the Lattice Timing Track (LTT). Today the same word timeline exists in five shapes (Cadenza's CaptionTrack, the manifest's readAlong 1.1, the HTML player's compact payload, Vetrina's NarratedWord list and the .vtt sidecar), each with its own converter, and the tour narrator already times the same sentence differently from the deck. The LTT is a versioned JSON contract with a required core (the CaptionTrack), optional layers owned by one library each (audio, actions), segments that let a deck and a tour share one shape, and two states (planned and resolved). One pure function, stateAt(ltt, t), answers what is on screen at time t, so the HTML player, Present and a future video export draw from the same code. The .vtt becomes a derived view of it. Nothing is built. The owner settled the four forks on 2026-09-24: *.ltt.json, two encodings, embedded in the HTML export, and a shared @laticent/ltt package the libraries may import.
---

# The Lattice Timing Track (LTT) — one timing contract for decks, tours and video

> **Proposed.** Nothing here is built. The owner settled all four forks on
> 2026-09-24 (§9); §8 is the order of work.

## 1. The symptom

Lattice has four libraries and three playback surfaces that need to agree on
when a word is spoken, when its caption lights up, and when an action happens
on screen. They agree today because each one recomputes the timing from the
same Cadenza function, not because they share data. The data itself exists in
five shapes:

| Shape | Where | Carries |
|---|---|---|
| `CaptionTrack` | `docs/src/lib/cadenza/track.ts` | Everything: cues, words, `display` and `spoken`, times, `charOffset`, `weight`, `endsParagraph` |
| `readAlong` 1.1 | `lib/core/lattice-doc.js` (manifest) | The voice and the audio mode. **No timings** — see `READ_ALONG_VERSION`'s comment |
| Compact per-slide payload | `lib/export/player-core.mjs` `narrationBlocks` | `{t, d, g, a, l, w: [[word, start, end]]}` per cue |
| `NarratedWord[]` | `docs/src/lib/vetrina/narrate.ts` | `{index, text, startMs, endMs}`, flattened — no cues, no emphasis, no spoken form |
| `.vtt` | `lib/core/read-along-vtt.js` via Cadenza `toVtt` | Display text and times only |

Each arrow between two shapes is a hand-written converter, and each converter
is a place where the shapes can drift apart. Two drifts are already real:

1. **The tour narrator times a sentence differently from the deck.** The deck
   producer calls `buildTrack(text, { pace, acronyms, emphasis, lang, lexicon })`
   (`lib/core/read-along-build.js:97`). Both of Vetrina's narrators call
   `buildTrack(text, { pace })`: `cadenzaNarrator` at
   `docs/src/lib/vetrina-narration/cadenza-narrator.ts:73` and `voicedNarrator`
   at `:255`.
   So in a tour, acronyms are not expanded, emphasized words get no hold, and a
   non-English line is timed as English.
2. **Vetrina keeps its own copy of Cadenza's reading rate.** `CAPTION_WPM` in
   `docs/src/lib/vetrina/pacing.ts` must equal Cadenza's `PACE_WPM`, and
   `pacing.test.ts` pins the pair. That pin covers `pacing: 'grounded'` only.
   The default, `'legacy'`, holds a caption at about 300 wpm, which is twice
   Cadenza's `moderate` rate.

Neither is visible on a surface today. The deck path passes every input, and
the tours that ship are plain English with no voice. They become visible the
moment a tour has a voice, an acronym or a second language.

## 2. Why it matters now: video, and decks that play anywhere

Two goals the owner set on 2026-09-24 turn this from tidying into a prerequisite:

- **Export a deck to video.** A video renderer asks "what is on screen at
  0:42.300?" once per frame, in any order, faster or slower than real time. The
  HTML player cannot answer that. It plays narration as a chain of events: a
  clip's `onended` fires, a `setTimeout` waits out the breath, the next clip
  starts (`player-core.mjs` `nextCue` / `endSlide`). The only way to learn the
  state at 0:42 is to play the deck from the start in real time.
- **A Lattice deck is portable and playable anywhere.** That needs a timing
  contract someone can implement without reading our code, and fallbacks to
  formats players already understand.

Both need the same thing: a timeline you can index by time, written down once,
that every surface reads.

## 3. The decision

**Adopt one timing contract, the Lattice Timing Track, and make every other
shape a view of it.**

- The LTT is **derived, never authored.** The deck's Markdown and a tour's
  storyboard stay the source. The LTT is produced from them, the way the `.vtt`
  is today.
- It is **JSON.** Every reader is code, the manifest beside it is JSON, and a
  `CaptionTrack` already serializes to JSON exactly. A human who wants to read
  it opens the `.vtt` generated from it.
- Its **core is Cadenza's `CaptionTrack`, unchanged.** The LTT does not invent a
  second word model. It wraps the one that exists.

## 4. The shape

### 4.1 An example — one stretch of a tour

```jsonc
{
  "format": "ltt",
  "version": "1.0",

  // What this file was built from. A reader that finds a different hash rebuilds it.
  "source": { "kind": "tour", "id": "board-demo", "hash": "sha256:9f2c…" },

  // Every input that changes timing. A mismatch here is the drift from §1, caught.
  "inputs": {
    "engine": "cadenza@1.4.0",
    "pace": "moderate",           // Cadenza's reading rate: slow | moderate | fast
    "deckPace": "natural",        // the deck's `pace:` register (resolve-pace.mjs): the hold on a new slide
    "lang": "en",
    "lexicon": "sha256:1ab0…",
    "acronyms": "sha256:77e3…"
  },

  "resolved": false,

  "segments": [
    {
      "id": "s3",
      "kind": "stretch",           // "slide" in a deck; in a tour, the run between two waits
      "at": { "beats": [3, 5] },   // a deck writes { "slide": 3 }
      "after": "awaitUser",        // what a player waits on before this segment; never a time

      // CORE (Cadenza). Required. Times are ms from the start of this segment.
      "track": {
        "basis": "estimate",       // "estimate" | "measured"
        "durationMs": 3120,
        "cues": [{
          "display": "Now click Publish to send it to the board.",
          "startMs": 0, "endMs": 3120, "charOffset": 0,
          "words": [
            { "display": "Now",     "startMs": 0,   "endMs": 240,  "charOffset": 0 },
            { "display": "click",   "startMs": 240, "endMs": 520,  "charOffset": 4 },
            { "display": "Publish", "startMs": 520, "endMs": 1010, "charOffset": 10, "weight": 1.3 }
          ]
        }]
      },

      // AUDIO (Suono). Optional.
      "audio": { "src": "audio/s3.mp3", "measuredMs": 3340, "leadMs": 46 },

      // ACTIONS (Vetrina). Optional. Anchored to a word, never to a time.
      "actions": [
        { "cue": 0, "word": 2, "verb": "click",   "target": "#publish", "arrive": "on-word" },
        { "cue": 0, "word": 8, "verb": "gesture", "kind": "check", "target": "#status" }
      ]
    }
  ]
}
```

A deck uses the same shape: `"kind": "deck"`, one `"slide"` segment per
narrated slide, and usually no `actions` layer.

### 4.2 The layers, and who owns each

| Layer | Owner | Required | What a reader that does not know it does |
|---|---|---|---|
| `source`, `inputs` | the producer | yes | — |
| `segments[].track` | Cadenza | yes | — (a reader that cannot read the core cannot play the file) |
| `segments[].audio` | Suono | no | plays silently on the estimate, exactly as the HTML player does for a cue with no clip |
| `segments[].actions` | Vetrina | no | skips it; captions and audio still play |
| any later layer | its library | no | skips it |

"Libraries ignore what they don't need" applies to the optional layers only.
The core is a contract every reader honors. A new **required** field is a new
major version.

### 4.3 Three choices that carry the design

1. **Segments, not one timeline.** Times restart at zero in each segment, and
   `after` names the wait before it without giving that wait a length. A deck
   slide is a segment. In a tour, a stretch between two waits (`until`,
   `awaitUser`, an async `act`) is a segment. This is what lets one format
   describe both without claiming a time for a wait nobody can predict. It is
   also the rule a Vetrina tour already follows in practice: wait on events at
   the points you do not control, run on a clock between them.
2. **Actions point at a word.** `{cue, word}` instead of a millisecond. When a
   voice re-times the line, the click moves with its word. The two-clock defect
   the Vetrina README records under §The action lands on the word (a voiced `at`
   cue "fires ~20% of `startMs` early, on the order of 180ms", because it is
   timed on the estimate while the ear hears the clip) disappears by
   construction rather than by alignment code.
3. **`inputs` plus `source.hash` make staleness detectable.** The tour-vs-deck
   drift in §1 would surface as a mismatch rather than as a sentence that is
   quietly timed two ways.

### 4.4 Two states: planned and resolved

- **Planned** (`"resolved": false`): estimated timings, and waits that have not
  happened. This is what the Studio, a live tour and a captions-only export
  work from.
- **Resolved** (`"resolved": true`): every clip measured (`basis: "measured"`),
  every wait filled in with how long it actually took, and each segment given an
  absolute `startMs` on one deck-wide timeline. This is what video export and
  exact offline playback need.

It is one format with one flag. A deck resolves once its audio is baked. A tour
resolves by **recording a run**: the recorder writes down how long each wait
took. That recording is also the run log Vetrina lacks today, which is what
makes tour timing testable at all.

## 5. `stateAt` — the function every surface shares

```
stateAt(ltt, tMs) → { segment, cue, word, caption, actions, audio: { src, offsetMs } }
```

A pure function: given a **resolved** LTT and a time, it returns what is on
screen and what is audible. It owns the rules the HTML player encodes today as
event handlers:

- the deck's hold on a newly arrived slide and section (`NAR_BEAT`, from
  `resolve-pace.mjs`);
- the breath after each sentence (`gapMs`, from Cadenza's `interCueGapMs`);
- a silent cue holding its estimated reading time (the player's `Math.max(300, d)`);
- skipping the encoder's leading silence in a clip (the player's `leadMs`).

Every surface then calls it with its own clock:

| Surface | Clock |
|---|---|
| HTML player | the audio element's `currentTime` |
| Present (Studio) | Suono's clock |
| Video export | the frame number × frame length |
| A test | any number it likes |

This is the concrete way the LTT prevents timing jank: the player and the
video cannot disagree about when a word lights up, because they run the same
function over the same data.

**Where it lives matters.** The HTML player is CSP-hashed and cannot import. It
inlines Cadenza's `makeCursor` by serializing the function's source
(`player-core.mjs`, `capKernel`). `stateAt` must be inlinable the same way: one
self-contained function with no imports and no closure over module state. §6
and fork B (§9.1) decide which package holds it.

## 6. Where the code lives

Every one of Cadenza, Suono, Vetrina and Lente is boundary-gated to import
nothing outside its own folder except `node:` built-ins, plus `react` in
Vetrina's adapter (`checkCadenzaBoundary` and its siblings in
`tools/check-ownership.js`), so they stay spin-off-able.

Fork B settled this (§9.1): the format gets its own package, `@laticent/ltt`,
and the libraries may import it. The owner's ruling is that a shared library we
own, carrying a contract this critical, is a sanctioned dependency rather than a
breach of the spin-off promise. Each library stays free of every OTHER outside
dependency, and `ltt` itself imports nothing.

| Piece | Home | Why |
|---|---|---|
| The LTT types (core, envelope, layers), `validateLtt`, `stateAt` | **`@laticent/ltt`**, a new workspace package gated to in-folder imports like its siblings | A format someone else adopts needs a reference implementation that is only the format, not a caption engine. Every type is defined once, here. Cadenza's `CaptionTrack` becomes a type imported from `ltt`, so there is no second copy to pin. |
| Producers: deck → LTT, player payload ↔ LTT, `readAlong` 1.1 → LTT | **`lib/core/`** | Beside `read-along-build.js` and `read-along-vtt.js`, which already consume the built Cadenza package from Node. |
| The actions layer | **Defined in `ltt`, used by Vetrina** | Vetrina imports the actions type from `ltt`. No mirror and no parity test. |
| Tour recorder (writes a resolved LTT) | **`docs/src/lib/vetrina-narration/`** | It sits above the libraries, where `cadenzaNarrator` already lives. |

No new CI step. Three rule changes land in `tools/check-ownership.js`, which
runs inside `build:check`: the Cadenza, Suono and Vetrina boundary gates each
admit `@laticent/ltt` as their one sanctioned outside import, and `ltt` gets its
own in-folder gate. The HTML player still copies `stateAt` in by its source, so
`stateAt` must stay one self-contained function inside `ltt` (§5).

## 7. Size, measured

A 141-word sample (three repeats of a five-sentence board paragraph with a
percentage, a currency figure and an acronym) run through the real
`buildTrack` at `pace: 'moderate'`:

| Encoding | Bytes | Per word | Gzipped |
|---|---|---|---|
| `CaptionTrack`, named keys, every field | 13,718 | 97 | 2,391 |
| Same, `spoken` omitted when equal to `display`, `endMs` omitted when it equals the next word's `startMs` | 9,815 | 70 | 1,887 |
| The HTML player's compact payload (`[word, start, end]` triples) | 3,646 | 26 | 579 |
| `.vtt` | 3,025 | 21 | 978 |

Reproduce: `node -e` over `require('@laticent/cadenza').buildTrack` on the
same text; the script is in this PR's description.

The named-key form is 2.7x the player's payload raw and 3.3x gzipped. That
matters for the HTML export, whose every byte is paid by the recipient, and
whose file is usually opened from disk without compression. The player
payload's own comment says named keys "would roughly double this", and the
measurement agrees.

So the spec defines **one data model with two encodings**: a canonical form with
named keys (what tools read and write) and a packed form with word tuples (what
the HTML export embeds). Conversion is lossless both ways and is covered by a
round-trip test. This is §9 fork C.

## 8. Order of work

Each step ships on its own. The first two change no output bytes.

1. **The package, spec, schema, converters.** Create `@laticent/ltt` as a
   workspace package with its own boundary gate; move `CaptionTrack` and its
   parts into it and have Cadenza import them; widen the Cadenza, Suono and
   Vetrina gates to admit `@laticent/ltt` and nothing else. Then
   `engineering/ltt.md` as the spec, a JSON Schema, `validateLtt`, and converters to and from `CaptionTrack`, from
   `readAlong` 1.1 and from the player payload. Round-trip tests. Plus the
   one-sentence parity test that pushes the same line through the deck producer
   and both Vetrina narrators and asserts identical timings — which fails today
   (§1 drift 1) and is fixed in the same step by passing the deck's inputs
   through the narrators' options.
2. **`stateAt` in `@laticent/ltt`,** with **conformance fixtures**: sample `.ltt.json`
   files and the expected `stateAt` result at chosen times. The fixtures are
   written against the HTML player's current behavior (slide and section holds,
   breaths, silent-cue holds, lead trim), so step 3 is a refactor, not a
   redesign.
3. **The HTML player reads the LTT** (packed encoding) and drives the crawl and
   the transport from `stateAt`. **This changes export bytes, so it stops for
   the owner's sign-off** on a demo deck rendered in dark and light mode (CLAUDE.md
   §Quality Bar). Decks already exported with the old payload keep playing: the
   player keeps a reader for it.
4. **Video export.** Headless Chromium steps `stateAt` frame by frame, the
   resolved audio is laid on the same timeline, and a `.vtt` is generated from
   the same LTT for the video's captions. Its own decision note, because it
   brings a muxer.
5. **Vetrina.** The actions layer; `Narrator.plan()` returns the core's cue and
   word shape instead of a flat list; the tour recorder writes a resolved LTT.

What each step does **not** do: none of them changes what a viewer sees on the
deck path today. That path already passes every input and already looks right.
The value is in what becomes possible (video, voiced tours, portable playback)
and in what stops being able to drift.

## 9. Forks for the owner

The owner settled all four on 2026-09-24.

- **A. Name and extension — settled: `*.ltt.json`.** "Lattice Timing Track".
  Editors, `JSON.parse` and schema validators work with no setup. A bare `.ltt`
  was declined because every tool would need to be told it is JSON.
- **B. Where the types, `validateLtt` and `stateAt` live — settled: a shared
  `@laticent/ltt` package the libraries may import.** §9.1 records the options
  and the ruling.
- **C. One encoding or two — settled: two (§7).** A canonical form with named
  keys for tools, and a packed form with word tuples for the HTML export.
  Conversion is lossless both ways and covered by a round-trip test.
- **D. Embed or reference in the HTML export — settled: embed.** The packed
  form rides inline, because the export's contract is one self-contained file
  with no network access. The manifest's `readAlong` points at the embedded
  block and moves to version 2.0.

### 9.1 Fork B, the options and the ruling

The constraint: Cadenza, Suono and Vetrina may import nothing outside their own
folders (§6). The HTML player cannot import at all; it copies a function's
source into itself (`capKernel`), so `stateAt` must be one self-contained
function. For scale, Cadenza's built bundle is 44,582 bytes (15,116 gzipped),
most of it text normalization, segmentation and the lexicon. `makeCursor`, the
function the player copies today, is 2,326 bytes of source.

| | 1. Inside Cadenza | 2. New `ltt` package the libraries import | 3. New `ltt` package nothing imports |
|---|---|---|---|
| Gate changes | none | Cadenza's, Suono's and Vetrina's gates each admit one sanctioned import | none; the new package gets its own in-folder gate |
| Copies of the core track type | one (Cadenza's) | one (the `ltt` package's) | two: Cadenza's and the `ltt` package's, pinned equal by a type test |
| Copies of the actions type | two (Cadenza's opaque one, Vetrina's mirror) | one | two (the `ltt` package's, Vetrina's mirror), pinned by a test |
| What a third-party player must take | all of Cadenza: the segmenter, the lexicon, the normalizer | only the format | only the format |
| Libraries stay zero-dependency | yes | no; three of them now depend on `ltt` | yes |
| Who owns the format | Cadenza, the caption engine | a package that is only the format | a package that is only the format |

**Option 1** is the least work. Its cost is that the format and the caption
engine become one thing: anyone implementing an LTT player takes the engine
with it, and Cadenza starts naming concepts (audio, actions) that belong to
other libraries.

**Option 2** is the cleanest data model: one definition of every type. Its cost
is the spin-off promise. Each library stops being zero-dependency, and three
boundary gates change.

**Option 3** separates the format from the engine without touching any existing
gate. Its cost is a second copy of the core track type, held equal by a type
test. That is the same pattern `pacing.test.ts` already uses to pin
`CAPTION_WPM` to Cadenza's `PACE_WPM`.

**The ruling (2026-09-24): a format-only package, and the libraries may import
it.** The owner chose option 3's home for the format and rejected its one cost:
a library we own, carrying a contract this critical, is a sanctioned dependency,
so there is no reason to keep a second copy of each type. The result is option
2's data model — every type defined once — in option 3's package, which is only
the format. A third-party player still takes only `ltt`. What changes is the
spin-off promise: Cadenza, Suono and Vetrina each become "no outside dependency
except `@laticent/ltt`", enforced by their boundary gates admitting exactly that
one import.

## 10. What "playable anywhere" does and does not mean

Being a standard means someone can implement the LTT without reading our code:
a spec document versioned apart from the implementation, a published JSON
Schema, conformance fixtures every player must pass (ours included), and a
reference player — the HTML export, which is already one self-contained file.

It does **not** mean other tools read `.ltt` on day one. Nobody outside Lattice
will at first. Portability starts with every Lattice export carrying its own
player and degrading to formats that already play everywhere: MP4 plus `.vtt`
for video, `.vtt` for screen readers and generic players, PDF for print. The LTT
is what keeps all of those consistent with each other. Adoption by other tools
is what makes it a standard, and that is earned, not declared.

## 11. What this note does not decide

- The video export's encoder, muxer and frame rate (step 4's own note).
- Whether Vetrina's default pacing flips to `'grounded'`. That is still the open
  follow-up in `2026-09-13-vetrina-cursor-caption-narration.md`; the LTT neither
  requires nor blocks it.
- Finer-than-hybrid word timing (`2026-07-08-word-level-sync.md`). A finer track
  carries finer numbers in the same schema.

## Related

- `2026-07-07-cadenza-caption-timeline.md` — the `CaptionTrack` model this wraps.
- `2026-07-08-read-along-export-manifest.md` — specified the full track inside the
  manifest (`readAlong` 1.0); what shipped as 1.1 moved it out. The LTT puts the
  pieces back together.
- `2026-07-12-suono-audio-library.md` — the audio layer's owner.
- `2026-09-13-vetrina-cursor-caption-narration.md` — the `Narrator` port and the
  voiced-cue drift.
- `2026-09-23-portable-packages.md` — the same portability goal for themes,
  components, finishes and motion.
