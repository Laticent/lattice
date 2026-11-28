---
kind: library
name: LTT
order: 15
promise: One file that says when each word of a narration is spoken.
intro: LTT, the Lattice Timing Track, is a small JSON format for narration timing, and `@laticent/ltt` is its reference implementation. The package holds the types, a validator, a compact encoding for shipping and the functions that answer "what is on screen at this moment". A deck, a product tour and a video all read the same file the same way.
group: Sound and timing
inLattice: Carries the narration of every shared deck and video, and every recorded tour.
useWhen: Several players need to agree on when each word of a narration lands — the browser, a video renderer, a recorder — and you would rather they read one file than each re-derive the timing.
mark: /ltt-mark.svg
facts:
  - { k: Package, v: '@laticent/ltt' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: 'The browser, a worker and Node' }
  - { k: Dependencies, v: None }
  - { k: License, v: 'Apache-2.0 (spec: CC-BY-4.0)' }
reference:
  - label: The spec
    href: /spec/ltt/
    note: LTT 1.0, the contract. This package is its reference implementation.
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/ltt/README.md
    note: The functions, the two encodings, and how the player inlines them.
  - label: The types
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/ltt/types.ts
    note: Every field, defined once; the JSON Schema is generated from this file.
  - label: The conformance fixtures
    href: https://github.com/Laticent/lattice/tree/main/docs/src/lib/ltt/conformance
    note: Sample files with the timeline and positions a reader must produce.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-09-24-lattice-timing-track.md
    note: The design note, and why the timing is a file rather than code.
---

## The problem

A narrated deck plays in more than one place. The editor previews it, the shared HTML file plays it in any browser, and the video export renders it frame by frame. Each needs the same answer: at 0:42.3, which slide is up and which word is lit?

When each player works that out for itself, they drift:

- **Two copies of the rules disagree.** One player holds a slide for 1.4 seconds on arrival, another for 1.2, and by slide twelve the captions are a sentence behind the voice.
- **A recorded voice does not match the estimate.** Text-to-speech runs longer or shorter than the guess, and a player that cannot re-time to the real clip lights the wrong word.
- **Nobody can tell when the timing is stale.** Change one word of a slide's notes and the old recording is wrong, but nothing says so.
- **A tour waits for the user.** "Click Save" takes as long as it takes, so a tour cannot be laid on a timeline until a run is recorded.

## The idea

Write the timing down once, in a file every player reads.

- **One shape for decks and tours.** A file is a list of segments: a narrated slide, a silent slide that only holds, or a stretch of a tour between two waits. Each holds its caption track — every word, what is shown, what is spoken, and when.
- **The layout is a function, not a convention.** `positionAt` lays a segment out the way the player plays it: the hold on arrival, each sentence, the breath after it. `timeline` lays the segments end to end. A player arms its timers from them instead of restating the rules.
- **Measured audio re-times the words.** A clip's real length re-anchors its sentence and keeps the estimate's rhythm inside it.
- **Every segment carries a hash** of its text and every input that changes timing, so a tool can say exactly which slides need a new recording.
- **Two encodings, one meaning.** The canonical form is readable JSON for tools; the packed form turns words into tuples for embedding in an exported file, and unpacks to the same object.
- **A validator that never throws.** `validateLtt` returns plain sentences, one per problem, and an empty list for a valid file.

## How to use it

```sh
npm install @laticent/ltt
```

> LTT publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/ltt`.

Build a track (Cadenza estimates one from text), wrap it in a file, check it, and ask what is on screen:

```ts
import { buildTrack } from '@laticent/cadenza';
import { type Ltt, pack, positionAt, timeline, validateLtt } from '@laticent/ltt';

const ltt: Ltt = {
  format: 'ltt', version: '1.0',
  source: { kind: 'deck', id: 'board.md' },
  inputs: { engine: 'sha256:…', pace: 'moderate' },
  seekable: true,
  segments: [{ id: 'd1', kind: 'slide', at: { slide: 1 }, hash: 'sha256:…', basis: 'estimate',
               holdMs: 0, track: buildTrack('Revenue grew 18% to $4.2M.'), tailMs: 700 }],
};

validateLtt(ltt);                  // [] when valid; plain sentences otherwise
const line = timeline(ltt);        // { durationMs, segments: [{ id, startMs, lengthMs }] }
positionAt(ltt.segments[0], 1200); // { phase: 'cue', cueIndex, wordIndex, … }
const small = pack(ltt);           // for embedding; unpack(small) gives the file back
```

| Call | What it gives you |
| --- | --- |
| `validateLtt(file)` | Every rule a machine can check, as plain sentences; `[]` when valid |
| `positionAt(segment, ms)` | The phase, the sentence and the word at a moment, plus the segment's layout |
| `timeline(file)` | Where each segment starts on one clock; refuses a file with an unknown wait |
| `makeCursor(track)` | Time to word, and re-timing a sentence to a measured clip |
| `pack(file)` · `unpack(packed)` | The compact encoding and back, losslessly |
| `segmentHashInput(text, inputs)` | The exact string a segment's staleness hash is taken over |
| `isStale(file, hashes)` | Which segments no longer match their text |

## Where else it fits

- **Read-along and karaoke players** that light each word as it is spoken, from estimated or measured timing.
- **Narrated product tours**, where an action is pinned to a word rather than to a time, so it still lands when the voice is re-recorded.
- **Video renderers** that need every caption's frame before they start, from the same file the browser plays.
- **Caption tools** that want one timing source for WebVTT, SRT and an on-page highlight.

## How Lattice uses it

When you share a narrated deck as one HTML file, Lattice writes its narration as an LTT file, packed, inside the export. The player in that file inlines `positionAt` and `makeCursor`, so a browser plays the deck with the same arithmetic the spec pins. The video export reads the same file back and lays out every caption with `timeline`. Vetrina's recorder writes a tour's run as an LTT file too, with each wait's recorded length, which makes the tour seekable.

## What it doesn't do

- **It estimates nothing.** Cadenza turns text into a timed track; LTT holds the result.
- **It plays nothing.** It has no audio and no DOM. Suono plays the clips; the player draws the captions.
- **It does not hash.** It gives you the exact string to hash; you digest it with `crypto.subtle` or `node:crypto`, so the package needs neither.
- **A tour with an unrecorded wait has no timeline.** `timeline` refuses it, because guessing the wait would put every later segment at the wrong time.
