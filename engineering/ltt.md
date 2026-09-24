# The Lattice Timing Track (LTT) — spec 1.0

**Owner: @saden1.** The owner signs off every change to this spec's meaning:
a new field, a new layer, a new version. The reasoning behind the format is in
[`decisions/2026-09-24-lattice-timing-track.md`](decisions/2026-09-24-lattice-timing-track.md).
This page is the contract.

An LTT file says **when each word of a narration is spoken**, for a deck or a
tour, in one JSON shape that every Lattice surface reads the same way. A file is
named `*.ltt.json`.

## Where each part lives

| Part | Home |
|---|---|
| The types, one definition of each | `docs/src/lib/ltt/types.ts` (package `@laticent/ltt`) |
| The JSON Schema | `docs/src/lib/ltt/ltt.schema.json`, **generated** from the types by `tools/build-ltt-schema.js`. `npm run build:check` fails when the two differ. Do not edit it by hand. |
| The validator | `validateLtt` in `docs/src/lib/ltt/validate.ts` |
| The two encodings | `pack` / `unpack` in `docs/src/lib/ltt/encode.ts` |
| The staleness hash's input | `segmentHashInput` in `docs/src/lib/ltt/hash.ts` |

`@laticent/ltt` imports nothing outside its own folder, including no `node:`
built-ins. A boundary gate (`checkLttBoundary` in `tools/check-ownership.js`)
enforces it. Cadenza may import the package; the other libraries may import it
from the step that first needs it.

## What is built, and what is not yet

Built (step 1): the types, the schema, `validateLtt` and both encodings. Not built yet: `positionAt`, `timeline` and `isStale`. Each
lands in the same step as its first production caller (step 2, guardrails G2 and
G3), and nothing in production writes an LTT before then. The decision note's §8
lists the steps.

## The file

```jsonc
{
  "format": "ltt",
  "version": "1.0",
  "source":   { "kind": "deck", "id": "board.md" },
  "inputs":   { "engine": "sha256:…", "pace": "moderate", "deckPace": "natural", "lang": "en" },
  "seekable": true,
  "segments": [
    { "id": "d1", "kind": "slide", "at": { "slide": 1 }, "hash": "sha256:…", "basis": "estimate",
      "holdMs": 0, "track": { "cues": [ /* … */ ], "durationMs": 3120 } },
    { "id": "d2", "kind": "hold",  "at": { "slide": 2 }, "holdMs": 1400 }
  ]
}
```

The decision note's §4.1 has a longer example: a tour stretch that carries
every layer.

**Times.** Every time is a whole, non-negative number of milliseconds, no
larger than 2^53 − 1. Times
restart at zero in each segment. Because times are whole numbers, the packed
encoding can store times relative to a cue and add them back exactly. A producer
writing a `measured` track rounds: `cursor.align` re-times to fractional
milliseconds, and `validateLtt` refuses a fraction.

**`source`.** `kind` is `deck` or `tour`; `id` is whatever its producer uses to
find it again.

**`inputs`.** Every input that changes timing, for the whole file: `engine` (a
content hash of the timing engine's build, never its package version), `pace`,
and optionally `lang`, `lexicon` and `acronyms`. A deck may also carry
`deckPace`. A tour may also carry `viewport`, `motion` and `stagePace`, the
screen and motion a recorded run depended on. A deck never carries the tour
inputs, and a tour never carries `deckPace`.

**`seekable`.** True when every segment's length is known, so the segments lay
end to end on one timeline. A deck is always seekable. A tour is seekable only
once a run has been recorded, and every waited stretch then records how long its
wait took in `waitedMs`.

## Segments

Each segment has a unique `id`, a `kind` and an `at`.

| `kind` | Where | Carries | Its length |
|---|---|---|---|
| `slide` | deck; `at: { slide: n }` (1-based) | `hash`, `basis`, `holdMs`, `track`, `tailMs`, optional layers | `holdMs` + `track.durationMs` + `tailMs` |
| `hold` | deck; a slide with no narration | `holdMs` only | `holdMs` |
| `stretch` | tour; `at: { beats: [first, last] }` | `hash`, `basis`, `track`, optional `after` / `waitedMs`, optional layers | the wait + the track |

- **A deck has one segment per slide, in order, with no gaps**: slide 1, 2, 3
  and so on. A silent slide still waits its hold, so a missing slide would be a
  missing hold. The first segment's `holdMs` is 0,
  because Play speaks the first slide at once. Every later slide waits one hold
  when it **arrives**, whether or not it is narrated. The hold is a section hold
  or a slide hold according to the arriving slide.
- **`tailMs`** is the breath the player holds after a slide's last cue, before
  it advances. The track ends at the end of its last cue, so this is the one part
  of a slide's length the track cannot carry.
- **A stretch has no tail.** Whatever passes between a stretch's last cue and
  the next stretch's first belongs to that next stretch's wait.
- **`waitedMs`** is how long a recorded run spent between the end of the
  previous segment's track and the start of this stretch's first cue.
- **`after`** names what a stretch waits on before it starts: `awaitUser`,
  `until` or `act`. It is never a time. Absent means the stretch follows the
  previous segment at once.
- **`basis`** says how far to trust a segment's numbers: `estimate` (Cadenza's
  calculation from text alone) or `measured` (re-timed to a real clip).

## The core

A `slide` or `stretch` segment's `track` is exactly a Cadenza `CaptionTrack`:
`cues[]` and `durationMs`. Each cue has `display`, `words[]`, `startMs`,
`endMs`, `charOffset`, and optionally `endsParagraph` and `weight`. Each word
has `display`, `spoken`, `startMs`, `endMs`, `charOffset`, and optionally
`weight`. `durationMs` is the end of the last cue. A narrated segment has at
least one cue, and every cue has at least one word.

The core is **closed**: a key it does not define is an error. Every reader must
honor it, and a reader that cannot read the core cannot play the file.

## Layers

A layer is an optional block on a segment, owned by one library.

| Layer | Owner | A reader that does not know it… |
|---|---|---|
| `audio` — `src`, `clip` (hash of the bytes), `voice`, `measuredMs`, `leadMs` | Suono | plays silently on the estimate |
| `actions` — `{ cue, word, match, verb, target?, arrive? }` | Vetrina | skips it; captions and audio still play |

Everything outside the core is **open**. A reader skips a key it does not know,
and `validateLtt` ignores one, so a file written with a later layer still plays
in an older reader.

**The audio layer's clip granularity is not settled.** 1.0 defines one clip per
segment, but the HTML player ships one clip per **cue** and advances on each
clip's end (transport rule 3). Step 2 settles which one the layer carries, with
the owner, before any player reads it
(`followups.d/2339-p2-ltt-timing-functions-and-html-player.md`).

An action is anchored to a **word**, never to a time. `match` is the word the
author named, normalized: case-folded, with edge punctuation stripped
(`normalizeMatch`, the same rule as Vetrina's `findCueWord`). `validateLtt`
fails when the word at `{cue, word}` no longer normalizes to `match`. That is how
a narration edit that moved the words under an action is caught.

**What may become a layer (G4).** A new layer must change what `positionAt`
returns for some time in some segment. It needs its own decision record and the
owner's sign-off. Anything else is metadata and belongs to its producer, not to
this format.

## What only `validateLtt` checks

The JSON Schema says what a file may contain. It cannot say how the parts
relate, so a file can pass the schema and still fail `validateLtt`. Validate with
`validateLtt` when correctness matters. The rules only it enforces:

- which fields belong to which segment kind (`tailMs` on a slide only, `after`
  and `waitedMs` on a stretch only, no narration on a hold), and which inputs
  belong to a deck or a tour;
- deck segments run one per slide from slide 1 with no gaps, and the first
  one's hold is 0;
- tour stretches run forward through the storyboard's beats;
- a seekable tour records `waitedMs` on every waited stretch;
- the timeline: cue starts in order, each word inside its cue, words running
  forward, cues not overlapping, and `durationMs` equal to the last cue's end;
- each action's `match` still names the word at `{cue, word}`;
- segment ids are unique.

Two schema-level facts also run the other way: an unknown key outside the core
passes both checks, and a key inside the core fails both.

## Versions

`version` is `"1.0"`. A new optional field outside the core is a minor
revision. A new **required** field, or any change to the core, is a new major
version, because the core is closed and every reader depends on it.

## Encodings

One data model, two encodings. Conversion is lossless both ways.

- **Canonical** — named keys, every field. This is what tools read and write,
  and what `*.ltt.json` holds. A producer drops Cadenza's track in as-is.
- **Packed** — what the HTML export embeds. The file gains `"encoding":
  "packed"`, and each segment's `track` becomes tuples. Every other key rides
  through unchanged.

```
PackedTrack = [durationMs, PackedCue[]]
PackedCue   = [display, startMs, endMs − startMs, charOffset, PackedWord[], {e?, w?}?]
PackedWord  = [display, startMs − cue.startMs, endMs − cue.startMs,
               charOffset − cue.charOffset, {s?, w?}?]
```

`e` is `endsParagraph` and `w` is `weight`, each written only when the source
has the key. `s` is `spoken`, written only when it differs from `display`. The
trailing object is left out when it is empty. On the 141-word sample in the
decision note's §7, the packed form is 4,432 bytes (833 gzipped) against the
canonical form's 13,718 (2,391 gzipped). The note measured 4,400 (856) for an
earlier tuple layout; the test pins only the ratio, at least 2.5x gzipped.

The round-trip test in `encode.test.ts` is generated from the schema. It builds
a file with every field the schema defines, so a field added to the types but not
to `packTrack` fails the test (G1).

## Staleness

- A segment's `hash` is SHA-256 over the UTF-8 bytes of
  `segmentHashInput(text, inputs)` (`docs/src/lib/ltt/hash.ts`): canonical JSON
  of `[text, inputs]`, with object keys sorted at **every** depth. `text` is the
  exact string the segment's track was built from, the one handed to
  `buildTrack`. A tour stretch also covers the storyboard steps it spans.
  `inputs` is the file's `inputs` object.
- The package defines the input string and no digest, because it imports
  nothing. Each runtime digests with its own SHA-256 (`node:crypto` in Node,
  `crypto.subtle` in a browser). A golden vector in
  `test/unit/tools/ltt-schema.test.js` pins both the string and the digest.
- On a mismatch, a reader marks the segment **stale**. An `estimate` segment may
  be rebuilt freely. A `measured` segment or a recorded wait is flagged and
  kept, because it cannot be rebuilt from text. `isStale(ltt, source)` lands in
  step 2 with its callers.

## The transport

The timing functions tell a player **where in a segment** it is. The transport
decides **when to move between segments**. These rules are normative; the HTML
player (`lib/export/player-core.mjs`) implements them today, and any second
player, including the video renderer's simulated one, must follow them.

1. **Play** speaks the current slide at once, with no hold.
2. When a slide's narration ends, the player **advances first, then holds on the
   slide that arrived, then speaks it**. The hold is the section or slide hold
   of the arriving slide. A slide with no narration is on screen for exactly its
   hold.
3. **Advance on clip end.** With audio, the next cue starts when the clip ends
   (`onended`), never at a computed time. The breath after a cue is held after
   that.
4. **A cue with no clip** shows its caption and holds for its estimated length,
   but never less than 300 ms (and 900 ms when the estimate is missing). The
   caption crawl still runs on the estimate itself. So in a captions-only
   export, a cue shorter than 300 ms plays longer than its track says, and a
   timeline for such a file must apply the same floor. **A clip that fails to
   decode** must be treated the same way. **The HTML player does not do this
   yet.** Its `onerror` starts the fallback, but the rejected `play()` promise
   then stops narration outright (reproduced in Chrome 131). A followup
   tracks the player fix, which changes export bytes.
5. **Pause restarts the slide** rather than resuming mid-word.
6. **Manual navigation re-anchors** on the chosen slide and speaks it with no
   hold.
7. Within a segment, the player may re-time a cue to the decoded clip's
   length (`cursor.align`). That is the only way a measured length enters
   playback. **Lead trim:** a clip whose encoder added leading silence (`leadMs`)
   starts playing `leadMs` in, and the cue is aligned to the clip's length
   **minus** `leadMs`, the speech alone. A player that skips the trim lets the
   crawl lag the voice by that much on every cue.

## What video export guarantees (G5)

Video export (step 3) renders from a seekable LTT. **It guarantees:** narration,
captions, slide and hold timing, and tour actions from a recorded run. **In 1.0
it does not guarantee:** Anima motion (the player receives that separately as
`animaJs`), or the cursor's position mid-travel (an `on-word` action records
where the cursor lands, not where it is in every frame). Either may become a
layer under G4.

## Files written before the LTT

Out of scope: Lattice is not generally available, so no deck exported before the
LTT needs converting. The design note's legacy converter was dropped for that
reason (owner ruling, 2026-09-24).
