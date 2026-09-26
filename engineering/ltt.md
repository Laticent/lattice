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
| The cursor (time → word, and re-timing to a clip) | `makeCursor` in `docs/src/lib/ltt/cursor.ts`. Cadenza re-exports it. |
| The timing functions | `positionAt` and `timeline` in `docs/src/lib/ltt/position.ts` |
| The conformance fixtures | `docs/src/lib/ltt/conformance/*.json`: sample files, each with its expected timeline and the expected position at chosen times |
| The deck producer | `deckLtt` in `lib/core/ltt-deck.mjs`, called by the HTML export (`narrationPayload` in `lib/export/player-core.mjs`) |
| The timing engine's hash | `ENGINE_HASH` in `docs/src/lib/cadenza/engine-hash.ts`, written by `tools/lib/timing-engine-hash.js` |

`@laticent/ltt` imports nothing outside its own folder, including no `node:`
built-ins. A boundary gate (`checkLttBoundary` in `tools/check-ownership.js`)
enforces it. Cadenza may import the package; the other libraries may import it
from the step that first needs it.

## What is built, and what is not yet

Built in step 1: the types, the schema, `validateLtt` and both encodings. Built
in step 2: `makeCursor` (moved in from Cadenza), `positionAt`, `timeline`, the
conformance fixtures, and the first producer and reader. The Studio's HTML export
writes a deck's LTT, and the exported player plays from it (guardrail G2).

Built in step 4: `isStale`, with the Vetrina tour recorder as its first caller
(`staleStretches` in `docs/src/lib/vetrina/recorder.ts`), the recorder itself, which writes a
seekable tour LTT, and `Narrator.plan()` returning the core's `CaptionTrack`. Vetrina's gate
admits `@laticent/ltt` by that exact name, as Cadenza's does. Not built: the video export (step
3, proposed in `decisions/2026-09-25-video-export.md`) and a reference tour player.

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
content hash of the timing engine, never its package version), `pace`,
and optionally `lang`, `lexicon` and `acronyms`. A deck may also carry
`deckPace`. A tour may also carry `viewport`, `motion` and `stagePace`, the
screen and motion a recorded run depended on. A deck never carries the tour
inputs, and a tour never carries `deckPace`.

**Emphasis goes with the text, not in `inputs`** (settled in step 4). Cadenza takes
per-line emphasis spans, and they change a track's timing, but a span is a character range into
one line, so it means nothing file-wide. `segmentHashInput(text, inputs, emphasis)` appends a
segment's spans, one list per line, when any line has one; with none, the string is exactly what
it was, so no existing hash moves. The tour recorder hashes them. The deck producer does not yet:
the HTML export receives no emphasis spans (`narrationPayload` gets text, track and clips), so an
emphasis-only edit to a deck still leaves its `hash` unchanged. Carrying them changes export
bytes, so it waits for its own sign-off (`followups.d/2339-p5-deck-emphasis-in-segment-hash.md`).

`engine` hashes the SOURCE the estimate is computed from: Cadenza's `track.ts`
(`buildTrack`) and every file it reaches through relative imports, in name
order, each preceded by its path (`tools/lib/timing-engine-hash.js`). The import
graph picks the files, so an edit to the cursor, the validator or a comment
elsewhere does not mark every measured segment stale. Source rather than the
bundled build, because the Studio runs Cadenza from source and never sees the
bundle, and because a bundler upgrade that reprints the same code should not
mark every measured segment stale. `npm run engine-hash:build` regenerates the
constant, and a unit test fails when the committed one is stale.

**`seekable`.** True when every segment's length is known, so the segments lay
end to end on one timeline. A deck is always seekable. A tour is seekable only
once a run has been recorded, and every waited stretch then records how long its
wait took in `waitedMs`.

"Known" means known to the precision of the segment's `basis`. A clip's length
is the estimate until a producer records its `measuredMs`, and the HTML export's
producer does not decode clips, so its file is `basis: "estimate"` throughout:
`timeline()` on it is exact for a captions-only export and an estimate for a
voiced one. The player itself follows the real clips (rule 3). A consumer that
needs the voiced timeline exactly, such as video export, decodes the clips and
fills in `measuredMs` first.

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
| `audio` — `voice`, and `clips[]`: one per cue at most, each `{ cue, src, clip, measuredMs?, leadMs? }` | Suono | plays silently on the estimate |
| `actions` — `{ cue, word, match, verb, target?, arrive? }` | Vetrina | skips it; captions and audio still play |

Everything outside the core is **open**. A reader skips a key it does not know,
and `validateLtt` ignores one, so a file written with a later layer still plays
in an older reader.

**The audio layer holds one clip per cue** (owner ruling, 2026-09-24; revised
inside 1.0, because no file had carried the layer). Every producer records a
sentence at a time, and the transport advances on each clip's end (rule 3), so
the file describes the audio as it exists. A cue with no entry in `clips` has no
audio. `clips` run in cue order. `cue` is the index of the cue a clip speaks,
`clip` is a hash of its bytes, `measuredMs` is its decoded length once a
producer has decoded it, and `leadMs` is the encoder silence at its head (rule
7). The rejected alternative, one clip per segment, meant joining the clips
with the breaths recorded as silence: on a 13-slide, 87-sentence deck, 14.2 s
of encoded silence (~113 KB at the bake's 64 kbps), 4 s of encoder lead at the
joins, and a transport that could no longer advance or re-time per sentence.

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
- each audio clip names a cue the track has, clips run in cue order, and no cue
  has two;
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

**In an HTML export** the player resolves each clip by its `src`: the fragment
below, or a `data:` URI carried in place. Any other `src` plays nothing, because
the export is self-contained and offline.

The packed LTT rides in one inert block,
`<script type="application/lattice+ltt" data-lp-ltt>`, with every `<` written as
`\u003c`. The clip bytes do not ride in it: each slide with audio gets its own
`<script type="application/lattice+audio" data-lp-audio="<n>">`, a JSON array of
`data:` URIs, where `n` is the slide's 0-based index. A clip's `src` in the LTT
names its place there as the fragment `#lp-audio/<n>/<k>`: entry `k` of block
`n`. The split exists because a viewer pays for what is parsed. The LTT is a few
kilobytes and the transport needs all of it at Play; the clips are megabytes and
the player needs one slide's at a time (`narrationPayload` in
`lib/export/player-core.mjs`).

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
  kept, because it cannot be rebuilt from text. `isStale(ltt, current)` takes
  each segment id mapped to its source's hash now, and returns the stale ones:
  `changed` or `gone`, each with `keep` true when the segment holds measured data
  (a recorded wait, a measured clip, a `measured` basis). It never edits the
  file. Its first caller is the tour recorder's `staleStretches`.

## The timing functions

`positionAt(segment, localMs, cursor?)` says where a player is, `localMs` after
a segment starts: the phase (`wait`, `hold`, `cue`, `gap` or `end`), the cue,
the word to show as spoken, the time on the track the crawl reads, each cue's
onset, the segment's length, and the actions whose word has been reached. It
lays the segment out as the transport plays it:

- a slide first holds for `holdMs`, and a stretch for its `waitedMs` (0 if none);
- a cue with a clip plays for its measured speech, `measuredMs − leadMs`, or its
  estimate when no measurement is recorded. Its words are re-timed to that
  length (`cursor.align`), which moves every later cue;
- a cue with no clip plays for its estimate, but never less than 300 ms, and
  900 ms when the estimate is 0 (rule 4). Its words still run on the estimate,
  and the last one is held through the rest of the floor;
- then the breath: the track's gap to the next cue, or after a slide's last cue,
  `tailMs`. A stretch has no tail.

The word lookup is the cursor's own (`makeCursor`), so there is one answer to
"which word now". A caller holding a cursor it has already re-timed passes it,
and `positionAt` uses it as it stands. The exported player always does.

`timeline(ltt)` lays a seekable file's segments end to end and returns each
one's start and length. It throws on a file that is not seekable, because a
wait of unknown length has no place on a timeline.

`positionAt` also returns the layout it computed — `waitMs`, and each cue's
`onsets`, `played` and `gaps` — and **the exported player arms every timer from
it**: the arrival hold, a silent cue's length and every breath. The transport
restates no timing rule of its own. The one length it does not take from
`positionAt` is a clip's, which ends when the audio does (rule 3).

**The conformance fixtures** (`docs/src/lib/ltt/conformance/*.json`) pin the
arithmetic: no hold on slide 1, an arrival hold on every later slide, `hold`
segments, the breath between cues and after the last one, the silent-cue floor,
and lead trim. Four checks hold `positionAt` and the player to them:

| Check | What it runs |
|---|---|
| `docs/src/lib/ltt/position.test.ts` | the fixtures, against the source |
| `test/unit/export/ltt-conformance.test.js` | the fixtures, against the inlined copy the player ships, plain and after an esbuild minify |
| `docs/src/lib/ltt/inlined.test.ts` | the fixtures, after rolldown (Vite 8's bundler) minifies the package on its own. Not the whole app bundle, which only the Studio e2e reaches |
| `test/unit/export/ltt-player-transport.test.js` | the real exported player, in jsdom on a fake clock: every slide must arrive when `timeline()` says, to the millisecond, and narration must stop when the last segment ends |

A real-browser run (`tools/verify-narrated-player.mjs`, on demand) plays exports
with clips, including clips 1.3× and 0.7× their estimate, and checks arrivals
against `timeline()` with the real lengths filled in.

**Inlining.** The exported player's script is CSP-hashed and cannot import, so
it carries `unpackTrack`, `makeCursor` and `positionAt` as source text. Each is
self-contained. `positionAt`'s one module-scope reference is in the branch that
builds its own cursor, which is why the player must always pass one.

## The transport

The timing functions tell a player **where in a segment** it is. The transport
decides **when to move between segments**. These rules are normative; the HTML
player (`lib/export/player-core.mjs`) implements them today, and any second
player, including the video renderer's simulated one, must follow them.

1. **Play** speaks the current slide at once, with no hold.
2. When a slide's narration ends, the player **advances first, then holds on the
   slide that arrived, then speaks it**. The hold is the section or slide hold
   of the arriving slide. A slide with no narration that the player advanced to is on
   screen for exactly its hold.
3. **Advance on clip end.** With audio, the next cue starts when the clip ends
   (`onended`), never at a computed time. The breath after a cue is held after
   that. **Measured cost:** headless Chromium 131 fires `ended` 90–110 ms after
   the audio content stops, so a voiced HTML export runs late of any computed
   timeline by about that much per clip: roughly 8 s over an 87-sentence deck.
   WebKitGTK 2.52 measured 51–76 ms per clip on the same real-speech deck. A
   simulated transport (video export) has no such latency, so the two
   disagree on voiced segment lengths by that amount until one of them changes.
   Firefox's figure is not measured: this sandbox's only audio device is a
   PulseAudio null sink, which plays about 1.6× slow.
4. **A cue with no clip** shows its caption and holds for its estimated length,
   but never less than 300 ms (and 900 ms when the estimate is missing). The
   caption crawl still runs on the estimate itself. So in a captions-only
   export, a cue shorter than 300 ms plays longer than its track says, and a
   timeline for such a file applies the same floor (`positionAt` does). **A
   clip that fails to decode** is treated the same way. The HTML player reads
   both signals a decode failure sends, the element's `error` event and a
   `play()` rejection that is not `NotAllowedError`, and falls back once. Only
   `NotAllowedError`, an autoplay refusal, stops narration.
5. **Pause restarts the slide** rather than resuming mid-word.
6. **Manual navigation re-anchors** on the chosen slide and speaks it with no
   hold. **Onto a slide with no narration, the player stays** (owner ruling,
   2026-09-25): narration remains armed, nothing is said, and the next manual move
   onto a narrated slide speaks it. A viewer who chose a silent slide wants to look
   at it; speaking it would reach the end of its narration at once and advance, so
   the slide left as soon as it arrived. A silent **last** slide ends narration
   instead, as reaching the end does. Play on a silent slide is rule 1, not rule 6:
   it advances at once and holds on the slide that arrives.
7. Within a segment, the player may re-time a cue to the decoded clip's
   length (`cursor.align`). That is the only way a measured length enters
   playback. **Lead trim:** a clip with leading silence (`leadMs`) starts playing
   `leadMs` in, and the cue is aligned to the clip's length **minus** `leadMs`,
   the speech alone. The Studio's bake (`compressClip` in
   `docs/src/playground/narration-encode.js`) records `leadMs` as the MP3
   encoder's delay (46 ms at 24 kHz) **plus the voice's own silence before its
   first word**: the first sample above 2% of full scale, less a 10 ms pre-roll
   (`speechOnsetMs`). Kokoro leaves 290–390 ms of it before every sentence, and a
   lead that counted only the encoder lit each caption about 0.3 s early. A player
   that skips the trim plays that silence before the first word while its crawl
   clock already runs, so its caption leads the voice by the whole `leadMs`. A player that skips the trim lets the
   crawl lag the voice by that much on every cue. The crawl's clock inside the
   cue is the clip's `currentTime` minus `leadMs`, so it starts at the first
   word, not `leadMs` into it. The seek and the re-timing wait for a **known** duration
   longer than `leadMs`: WebKit can report `loadedmetadata` before it knows an
   MP3's length, and a seek then makes it end the clip at once, skipping the
   sentence in silence (measured on WebKitGTK 2.52). A player anchors on
   `durationchange` when the length arrives late.

## What video export guarantees (G5)

Video export (step 3) renders from a seekable LTT. **It guarantees:** narration,
captions, slide and hold timing, and tour actions from a recorded run. **In 1.0
it does not guarantee:** Anima motion (the player receives that separately as
`animaJs`), or the cursor's position mid-travel (an `on-word` action records
where the cursor lands, not where it is in every frame). Either may become a
layer under G4.

The encoder, muxer, frame rate and simulated transport are proposed in
[`decisions/2026-09-25-video-export.md`](decisions/2026-09-25-video-export.md).

## Files written before the LTT

Out of scope: Lattice is not generally available, so no deck exported before the
LTT needs converting. The design note's legacy converter was dropped for that
reason (owner ruling, 2026-09-24).
