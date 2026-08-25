---
marp: true
theme: indaco
paginate: true
color-mode: dark
footer: "SlideWright · read-along captions"
acronyms:
  ARR: annual recurring revenue
  NDR: net dollar retention
captions:
  6: Your registry taught it ARR and NDR, so this slide speaks them in full — from the front matter captions map, keyed by slide number.
---

<!-- _class: title silent -->

# Every deck can read itself aloud.

`Feature · read-along captions`

Your slides become a timed WebVTT caption track — one `--captions` flag, no audio to record, no key to buy. The words already on the slide ship as an accessible caption file next to the deck.

<!-- Open cold. Let the title sit for a beat before the first word — this one earns a pause. -->

---

<!-- _class: divider -->

## The narration is already there — on the slide.

A slide already says something. Read-along captions read what is there — the heading, the prose, a chart's computed facts — and lay it on a timeline, word by word, so a viewer can follow along or read instead of listen.

<!-- This is the slide people push back on — give them a second. Nobody expects the deck to already contain its own narration. -->

---

## One flag, two kinds of file.

- Deck-level
  - `deck.vtt` — one continuous track across the whole talk, each slide offset by the ones before it.
- Per-slide
  - `deck.01.vtt`, `deck.02.vtt` — each starts at zero, for a player that captions one slide at a time.

<!-- Passing captions writes two kinds of file. A single deck-level VTT with one continuous timeline, and per-slide parts that each start at zero. Use whichever your player wants. -->

---

## The timing is honest, and it is free.

Captions are timed from Cadenza's estimate — a words-per-minute model tuned to how narration is actually paced. No microphone, no text-to-speech key, no cloud round-trip. It runs offline, and it is deterministic: the same slides always yield the same track.

<!-- Deterministic is the word to lean on here. Same input, same track, every time — that is what makes it safe to commit. -->

---

## Numbers read the way you say them.

A slide that says `$4.2M`, or `18%`, is timed as four point two million dollars and eighteen percent — spoken as words, not glyphs. The caption shows what you wrote; the timing follows how it is actually said.

<!-- If anyone asks about currency or locale, that is the locale-guard deck, not this one. Don't get pulled in. -->

---

## Say it your way — the acronym registry.

Add an `acronyms:` block to your front matter and the narration expands the ones you own — `ARR` becomes "annual recurring revenue," `NDR` becomes "net dollar retention" — while the caption still shows the crisp glyph. The author owns the vocabulary, even overriding the built-in dictionary.

This slide's spoken line comes from the front-matter `captions:` map — keyed by this slide's number — which the acronym registry then expands.

---

## Any slide can override what it says.

A `<!-- caption: … -->` comment is the exact read-as text for one slide. It *replaces* the generated line whole — an override is the caption, not an addition to it.

Speaker notes are not in this chain at all. A note is yours; if a line is meant to be heard, it belongs in a `caption:`.

<!-- caption: This spoken line comes from the slide's own caption comment, which replaces the line generated from the slide's content. -->

<!-- This note is the proof of the next slide's claim: it rides in the PDF and the PPTX for you, and it is nowhere in the .vtt. Nothing you write here is ever spoken. -->

---

## It rides beside every export.

The `.vtt` is a sidecar, not baked into the deck's bytes. Export a PDF, an HTML player, a PPTX — the caption files sit next to it, ready for any WebVTT-aware player. Your existing artifact is untouched.

<!-- Captions are a sidecar file — they never change the bytes of your PDF or HTML. Whatever you export, the VTT sits right beside it, ready for any player that speaks WebVTT. -->

---

<!-- _class: light -->

## One line at the command line.

`lattice deck.md deck.pdf --captions`

That is the whole feature. Slides in, caption track out — accessible by default, and honest about its timing.

<!-- Close on the flag, not on the theory. One word on the command line is the whole ask. -->
