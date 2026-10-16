---
kind: library
name: Cadenza
order: 2
promise: Words that light up as they're spoken.
intro: Give Cadenza a paragraph and it estimates when each word will be spoken, in milliseconds, then corrects each sentence when the real audio starts. Highlight words in time with a voice, or export a caption file any video player reads. No recording is needed to start.
group: Sound and timing
inLattice: Times every narrated slide, in the Studio and the export.
useWhen: You want karaoke-style captions, a read-along highlight or a .vtt file from text, with numbers like "$4.2M" timed the way people say them.
mark: /cadenza-mark.svg
facts:
  - { k: Package, v: '@laticent/cadenza' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: Anywhere JavaScript runs }
  - { k: Dependencies, v: One — '@laticent/ltt' }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/cadenza/README.md
    note: Every option, the two word forms, calibration and the full API.
  - label: The LTT 1.0 spec
    href: /spec/ltt/
    note: The open timing format Cadenza's tracks are stored in.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-07-07-cadenza-caption-timeline.md
    note: The design note behind the caption timeline.
  - label: The pace model
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-07-12-narration-pace-model.md
    note: How a reading speed becomes a duration per word.
  - label: Suono
    href: /libraries/suono/learn/
    note: The sister library that plays the voice Cadenza keeps in step with.
---

## The problem

A slide says *"Revenue grew to $4.2M."* A narrator reads it aloud, and you want each word to light up as it is said — the way karaoke lyrics do.

Dividing the sentence's length by its word count gets it wrong:

- **What you see isn't what you hear.** "$4.2M" is one word on screen and five out loud: *four point two million dollars*. Time it as one short word and the highlight races ahead of the voice.
- **Splitting sentences is harder than splitting on periods.** "Dr. Smith arrived." is one sentence, and "$4.2" must not break at the decimal point.
- **You often have no audio yet.** A draft before the voice is recorded, a silent read-along for accessibility, or a caption file for a script all still need timings.
- **Real voices drift from any guess.** A fixed words-per-minute estimate slides out of step over a long passage unless something pulls it back to the real audio.

## The idea

Cadenza turns text into a **caption track**: a list of sentences, each split into words, every word with a start and an end time in milliseconds.

- **Each word has two forms.** Its *display* form is what the reader sees ("$4.2M"); its *spoken* form is what the voice says ("four point two million dollars"). Cadenza times the spoken form and highlights the display form, so the highlight holds on "$4.2M" for as long as it takes to say.
- **Estimate first, correct later.** The track starts as an estimate from the text and a reading pace — slow, moderate or fast. When a real audio clip starts, you tell Cadenza when and how long, and it re-times that sentence to the real voice.
- **You own the clock.** Cadenza never plays sound or watches the time itself. You hand it "now" from any clock — a timer, an audio player's position, a scrub bar — and it tells you which word is active.
- **Standard files out.** The same track exports as WebVTT (with per-word timestamps) or SRT, the caption formats video players already read.

## How to use it

Install the package:

```sh
npm install @laticent/cadenza
```

> Cadenza publishes to npm with Lattice 1.0, together with `@laticent/ltt`, the one package it depends on. Until then it lives in the Lattice repository at `docs/src/lib/cadenza`.

Three steps — time the text, follow a clock, export captions:

```ts
import { buildTrack, makeReader, toVtt } from '@laticent/cadenza';

// 1. Text in, timed words out. No audio needed.
const track = buildTrack('Revenue grew to $4.2M. We beat plan by eight points.', { pace: 'moderate' });
// track.durationMs is 4685. "$4.2M." is timed as "four point two million dollars."

// 2. Highlight the word being said, driven by any clock you choose.
const reader = makeReader({
  track,
  onWord: (active) => console.log(active), // { cueIndex, wordIndex }, only when it changes
  onEnd: () => console.log('done'),
});
const t0 = performance.now();
(function frame() {
  reader.sync(performance.now() - t0);
  if (performance.now() - t0 < reader.durationMs()) requestAnimationFrame(frame);
})();

// 3. Or write a standard caption file.
console.log(toVtt(track)); // WEBVTT … Revenue <00:00:00.615>grew <00:00:00.820>to …
```

When a real recording plays, call `reader.align(cueIndex, onsetMs, durationMs)` as each sentence's clip starts, and the highlight snaps to the real voice. [Suono](/libraries/suono/learn/) reports exactly those numbers.

| Call | What it gives you |
| --- | --- |
| `buildTrack(text, { pace })` | Text to a timed caption track |
| `makeReader({ track, onWord })` | The read-along driver: `sync(now)`, `align(…)`, `reset()` |
| `toVtt(track)` / `toSrt(track)` | Standard caption files |
| `toSpokenText(text)` | "$4.2M" to "four point two million dollars", for any speech engine |
| `splitSentences(text)` | A sentence splitter that knows "Dr." and "$4.2" |
| `narration(text)` | The same options as a chain, ending in `.toTrack()`, `.toVtt()` and more |

### The file format underneath

Cadenza's tracks are stored in **LTT**, the Lattice Timing Track, an open JSON format. For each narrated slide it records the words, when each is spoken, the pauses and which audio clip says it. Because the timing is written down once, a web player, a video renderer and a caption exporter all agree on what is happening at 0:42. LTT is published as a [1.0 spec](/spec/ltt/), with `@laticent/ltt` as its reference implementation.

## Where else it fits

Anywhere text needs timing, with or without audio:

- **Read-along e-books and language apps** that highlight each word as a recording or a synthetic voice reads it.
- **Caption files from a script**: a `.vtt` or `.srt` for a video, before you have the final recording.
- **Text-to-speech front ends**: `toSpokenText` turns "$4.2M" or "18.5%" into words a speech engine reads correctly.
- **Script timing**: how long will this passage take to say at a relaxed pace? `buildTrack(…).durationMs` answers.
- **Accessible silent read-along**: a highlight that moves at reading pace, with no audio at all.

## How Lattice uses it

Cadenza times every narrated slide. The command-line export builds each slide's track and writes `.vtt` caption files beside the video. In the Studio, Lattice's editor in the browser, read-aloud moves the word highlight with Cadenza's reader while Suono plays the voice. The deck linter uses its normalizer to warn about text a voice can't say, and chart narration uses it to read numbers aloud. Lattice's HTML export embeds these tracks in its LTT file.

## What it doesn't do

- **It doesn't listen to audio.** It doesn't analyze a recording to find each word. Timing inside a sentence is an estimate; only each sentence's start and length come from the real clip.
- **Number reading is English-only.** For other languages it keeps the text as written and skips the "$4.2M" expansion.
- **No playback, no interface.** It returns timings and indexes. You play the audio and paint the highlight.
- **It doesn't write the script.** It times the text it's given.
