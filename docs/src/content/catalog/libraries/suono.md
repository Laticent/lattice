---
kind: library
name: Suono
order: 1
promise: Play a list of audio clips smoothly, on time, on every device.
intro: Give Suono a list of things to play and a function that returns their audio. It plays them back to back with natural pauses, asks for the next clip's audio while the current one plays, and tells you the moment each one starts, so captions can follow the voice.
group: Sound and timing
inLattice: Plays the Studio's read-aloud, lessons and call audio.
useWhen: You play speech or sound one clip at a time, as in read-aloud, lessons or a voice assistant, and it has to keep working on iPhones, over Bluetooth and through pause and resume.
mark: /suono-mark.svg
facts:
  - { k: Package, v: '@laticent/suono' }
  - { k: Status, v: Coming to npm with Lattice 1.0 }
  - { k: Runs in, v: The browser (helpers run in Node) }
  - { k: Dependencies, v: None }
  - { k: License, v: AGPL-3.0 }
reference:
  - label: The README
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/suono/README.md
    note: Every option, the device quirks it handles, and what it deliberately leaves out.
  - label: The types
    href: https://github.com/Laticent/lattice/blob/main/docs/src/lib/suono/types.ts
    note: The full contract, commented, in one file.
  - label: Why we built it
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-07-12-suono-audio-library.md
    note: The design note — the bugs it was born from and the options we turned down.
  - label: Cadenza
    href: /libraries/cadenza/learn/
    note: The sister library that turns Suono's clip timings into word-by-word captions.
---

## The problem

Say an app reads an article aloud, one sentence at a time. A text-to-speech service returns a short audio file per sentence. You want sentence one, a breath, sentence two, a breath — and a listener who can pause, or cut it off mid-word.

The obvious version is one `<audio>` element per sentence. It works on your laptop and then fails in the field, in ways that take weeks to track down:

- **iPhones stay silent.** iOS only unlocks sound inside a tap, and the hardware silent switch mutes web audio unless the page asks for playback mode.
- **There are gaps and clicks between clips.** A clip that starts cold leaves dead air while the next one downloads, and a clip that starts mid-waveform pops.
- **Bluetooth and car audio stutter.** The wireless link goes to sleep in the silence between clips and wakes with a crackle.
- **Pause and resume lose sound on Safari.** Suspending the whole audio engine can drop the audio when it comes back.
- **Captions drift from the voice.** To highlight the word being spoken you need to know when each clip *actually* reached the speaker, not when you asked it to play.

## The idea

Suono splits the job in two. **You** decide what to play and where its audio comes from. **Suono** owns everything about playing it well.

- **A stage** is one shared audio engine for the page. It decodes clips, plays them and caches them. You create it once.
- **A sequence** is a playlist you *describe* rather than load: a list of items, plus a `produce(item)` function that returns each item's audio bytes. Suono calls it a little ahead of time, a few at once, and never while paused — so pausing doesn't keep generating (or paying for) the rest.
- **Bytes in, no network.** Suono never fetches a URL and never holds an API key. Your `produce` function does the fetching; Suono plays what it's handed. That keeps your keys and your servers yours.
- **A clock you can sync to.** Every clip reports when it really started and how long it lasts, on Suono's own audio clock. A caption highlighter can follow that clock and stay in step with the voice.
- **It doesn't throw at you.** A clip that fails becomes a short silence and an error report; a request that hangs is skipped. The listener hears a smooth run, not a crash.

## How to use it

Install the package:

```sh
npm install @laticent/suono
```

> Suono publishes to npm with Lattice 1.0. Until then it lives in the Lattice repository at `docs/src/lib/suono`, and you can copy or link it from there.

This example needs no network and no key. It synthesizes three tones to stand in for speech:

```ts
import { createStage, encodeWav, sequence } from '@laticent/suono';

// A short sine-wave WAV. In a real app, produce() would call your text-to-speech service.
function tone(hz: number, ms = 400) {
  const rate = 44100, n = Math.floor((ms / 1000) * rate), s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = 0.25 * Math.sin((2 * Math.PI * hz * i) / rate);
  return encodeWav(s, rate);
}

const stage = createStage();               // one audio engine, created on first use
const seq = sequence<number>(stage)
  .items([392, 440, 523])                  // anything you like; Suono never looks inside
  .produce(async (hz) => tone(hz))         // return the audio bytes for one item
  .key((hz) => `tone:${hz}`)               // a cache key, so a replay skips produce()
  .gap((_hz, next) => (next ? 250 : 0))    // the pause between clips, in milliseconds
  .onItemStart(({ index, onsetMs }) => console.log(`clip ${index} started at ${onsetMs}ms`))
  .build();

document.querySelector('button')!.addEventListener('click', () => {
  stage.unlock();                          // must run inside the tap, for iOS
  seq.play();
});
```

Then drive it with `seq.pause()`, `seq.resume()` and `seq.stop()`. To start the next part instantly, call `seq.warm(items)` ahead of time and Suono will have the audio ready.

The pieces you'll reach for most:

| Call | What it gives you |
| --- | --- |
| `createStage()` | The shared audio engine: `unlock()`, `play()`, `clockMs()`, `stopAll()` |
| `sequence(stage)` | The playlist, built as a chain: `.items().produce().key().gap().build()` |
| `seq.play()` / `pause()` / `resume()` / `stop()` | The transport. `stop()` also aborts the request in flight |
| `seq.warm(items)` | Preload audio before it is needed |
| `stage.meter(stream)` | A live loudness level for a microphone or a call |
| `encodeWav(samples, rate)` | Turn raw samples into a playable WAV, in the browser or Node |

## Where else it fits

Anything that plays audio as an ordered series of short clips:

- **Read-aloud** for articles, e-books or chat replies, sentence by sentence, from any text-to-speech service.
- **Voice assistants**, where the user starts talking and playback has to stop at once. `stop()` also cancels the request in flight.
- **Language lessons and audio flashcards**, with set pauses between prompts, and the next lesson preloaded.
- **Audio guides and narrated walkthroughs**, stepping through clips in order.
- **Voice and video calls**: `meter`, `amplify` and `gainStream` give you a "speaking" ring, a boost for a quiet voice and a microphone volume control.

## How Lattice uses it

In the **Studio**, Lattice's editor in the browser, **read-aloud** plays a deck's narration through one Suono stage, and Cadenza moves the caption highlight in time with it. The Studio's **live calls** use Suono's meter and volume controls for the speaking ring and the volume sliders. **Lessons** and the narrated product tour speak through it too.

Suono powers the website and the Studio only. The Lattice engine and its command-line tool don't depend on it.

## What it doesn't do

- **It isn't a voice.** Suono doesn't turn text into speech; bring any service that returns audio bytes.
- **It doesn't download.** It never fetches a URL. Your `produce` function does that, with your own keys.
- **It isn't a mixer.** There are no effects, no multi-track mixing and no recording. One sequence plays at a time.
- **No streaming yet.** Each clip arrives whole. Playback needs a browser; the WAV and cache helpers also run in Node.
