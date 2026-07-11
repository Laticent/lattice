---
marp: true
theme: indaco
paginate: true
color-mode: dark
footer: "SlideWright · read-along captions"
---

<!-- _class: title silent -->

# Every deck can read itself aloud.

`Feature · read-along captions`

Speaker notes become timed WebVTT captions — one `--captions` flag, no audio to record, no key to buy. The narration you already wrote ships as an accessible caption track next to the deck.

<!-- Welcome. This deck is about read-along captions: the speaker notes you already write can now ship as a timed caption track, right next to the exported deck. -->

---

<!-- _class: divider -->

## The narration is already there — in your speaker notes.

Every slide's `<!-- note -->` is what you'd say out loud. Read-along captions take that text and lay it on a timeline, word by word, so a viewer can follow along or read instead of listen.

<!-- The key idea: your speaker notes are already the narration. We just put them on a timeline, word by word, so a reader can follow along. -->

---

## One flag, two kinds of file.

- Deck-level
  - `deck.vtt` — one continuous track across the whole talk, each slide offset by the ones before it.
- Per-slide
  - `deck.01.vtt`, `deck.02.vtt` — each starts at zero, for a player that captions one slide at a time.

<!-- Passing captions writes two kinds of file. A single deck-level VTT with one continuous timeline, and per-slide parts that each start at zero. Use whichever your player wants. -->

---

## The timing is honest, and it is free.

Captions are timed from Cadenza's estimate — a words-per-minute model tuned to how narration is actually paced. No microphone, no text-to-speech key, no cloud round-trip. It runs offline, and it is deterministic: the same notes always yield the same track.

<!-- The timing comes from Cadenza's estimate model, tuned to real narration pace. It's free, offline, and deterministic — the same notes always produce the same caption timing. -->

---

## Numbers read the way you say them.

A note that mentions four point two million dollars, or eighteen percent, is spoken as words — not glyphs. The caption shows what you wrote; the timing follows how it is actually said.

<!-- Notice how numbers work. A figure like $4.2M or 18% is timed as the words you'd actually speak — four point two million dollars, eighteen percent — while the caption still shows the original text. -->

---

## It rides beside every export.

The `.vtt` is a sidecar, not baked into the deck's bytes. Export a PDF, an HTML player, a PPTX — the caption files sit next to it, ready for any WebVTT-aware player. Your existing artifact is untouched.

<!-- Captions are a sidecar file — they never change the bytes of your PDF or HTML. Whatever you export, the VTT sits right beside it, ready for any player that speaks WebVTT. -->

---

<!-- _class: light -->

## One line at the command line.

`lattice deck.md deck.pdf --captions`

That is the whole feature. Speaker notes in, caption track out — accessible by default, and honest about its timing.

<!-- And that's the whole thing: add captions to the command, and your speaker notes come out as an accessible caption track. Thanks for watching — or reading. -->
