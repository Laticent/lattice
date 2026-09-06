---
status: shipped
summary: >
  Narration priced time by structure alone — syllables, punctuation glyphs and flat
  boundary constants — so a deck's key claim was paced exactly like its footnote and
  nothing on a slide could buy itself room. Adds an emphasis tier fed by what the
  AUTHOR already marked (`**bold**`, the coda), spent at the seam between cues where
  both playback paths already insert real silence. Uncovered the larger defect
  underneath: the `.cell-coda` sits outside `.cell-stage` and every body walker is
  stage-scoped, so a slide's closing "so what" was never narrated at all — across 52
  of 156 committed decks. Records why the hold sits at the seam rather than mid-cue
  (a TTS clip contains no pause the engine invented, so the highlight would drift),
  why spans are matched by unique substring, and why a cue holds where a passage ENDS.
---

# Narration emphasis: the first pause tier keyed on meaning

**2026-09-06** · `lib/core` · `docs/src/lib/cadenza` · `lib/transformers/prose-projection.mjs`

## The complaint, and the claim I falsified instead

The report was that narration "does not place any weight based on the content and
therefore doesn't let slides and important information breathe."

An earlier branch (#2079) answered a different question. It built an instrument to
price how long a slide needs to be *looked at*, measured that narration already runs
far longer than assumed — 40.6 s on a diagram slide, not the 4.3 s the projection
alone suggests — and concluded the premise was false. It was not. What that work
disproved was "slides are too short", which nobody claimed. The actual sentence has
two halves, and the first half was verifiable in the data model rather than arguable:

```ts
interface Cue  { display; words; startMs; endMs; charOffset; endsParagraph? }
interface Word { display; spoken; startMs; endMs; charOffset }
```

No weight. No emphasis. No salience. `pauseAfter()` is a reverse scan for trailing
punctuation glyphs, and the complete ladder was syllables → word duration,
punctuation → pause, blank line → 750 ms, slide → 1400, section → 2600. Every rung
keys on a glyph or a boundary. Nothing read what the content meant, or what the
author had marked. The complaint was an accurate description of the code.

**The lesson worth carrying: 40 seconds of uniform narration is not breathing room.**
Measuring the wall's width and reporting that it was wide enough answered nothing.

## What the salience signal is — and what it is not

It is not TF-IDF, `wink-nlp`, or a MiniLM embedding, all of which were considered on
the earlier branch. **The deck already says what matters and narration threw it
away.** `**bold**` is the author pressing the button; a coda is the slide's closing
"so what" by construction. Both are author-declared, already parsed, and free.

Excluded on purpose: `mark-*` treatments are slide-level finishes rather than
per-phrase emphasis; `em`/`i` carries a term of art in this house style, not stress;
a `big-number`'s figure deserves it but is the li's own text rather than a wrappable
element, so it needs a component rule instead of a selector, and is the first thing
to add next.

## Three decisions, each with the failure it avoids

**1 · The hold is spent at the seam between cues, never inside one.** The inter-cue
gap is the one place both playback paths already insert real silence — the silent
estimate advances the next cue by it, the clocked player hands it to Suono as the
breath between clips. A mid-cue hold has no counterpart in the audio, because the TTS
clip is synthesized from the sentence's own words and contains no such pause, so the
caption highlight would drift against the voice for the rest of that sentence. The
cue is the finest unit emphasis can be spent on without desyncing the two paths.

A corollary worth stating: calibration reads `cue.endMs - cue.startMs`, so keeping
the hold in the gap also keeps invented silence out of the voice-pace measurement.
Inflating a cue's span would teach calibration the voice is slower than it is —
the same class of defect `CLIP_TRAILING_FRACTION` was introduced to fix.

**2 · Spans are matched by unique substring, not threaded through the projection.**
The narration is assembled by a dozen helpers that reorder as they go — `speakStats`
fronts a KPI's value ahead of its label, `speakBigNumber` strips nested lists — so
carrying an offset from DOM to output would mean touching every one, with an
off-by-one anywhere putting a pause in the wrong place. Searching the finished string
leaves the text byte-identical and confines the feature to one function. A phrase
appearing twice is skipped. **The asymmetry is the point: a missed emphasis paces
exactly like today; a misplaced one reads as a defect.**

**3 · A cue holds where a passage ENDS, not wherever it touches.** Real output found
this after the first version shipped green tests. `examples/radar-narration.md`'s
key-insight codas run three and four sentences; weighting every cue a passage
overlapped spent four holds *inside* one insight — 1000 ms dripped through the very
passage it was meant to set apart. That is not emphasis, it is just slower, and it
contradicts the contrast argument the step cap rests on. Word weight now answers "is
this emphasized"; cue weight answers "did a passage finish here", which is what buys
silence. A short bolded phrase is unaffected — a span inside one cue both starts and
ends there.

## The defect this uncovered: the coda was never spoken

`lib/core/coda.js` lifts a slide's trailing editorial beats into one `.cell-coda`
appended at the tail of the section body. `stageOf` returns `.cell-stage`, that cell
is its **sibling**, and every body walker is stage-scoped — so the most prominent
editorial line on the slide was silent in captions and read-aloud. Nothing recorded
it as a choice: neither the projection nor the speech contract
(`2026-07-11-manifest-speech-contract.md`) mentions the coda, and the coda kernel
postdates both. 52 of 156 committed decks carry at least one blockquote, 180 in total.

It is now spoken last, as its own paragraph block so the beat before it is the
paragraph tier. A layout that CLAIMS its trailing block keeps it inside the stage
where the body walker already says it; `stage.contains` stops the double-speak.

**This is the larger half of the change.** A punchline that is not paced well is a
smaller problem than a punchline nobody hears.

## Honest scope of the timing half

Measured on `examples/emphasis-narration.md`: 7 holds fire and **1 buys time**. The
other 6 land on a slide's final cue, where the hold is a no-op because
`SLIDE_PAUSE_MS` (1400 ms) already follows — charging 250 more would be paying twice
for the same silence. That matters because the common emphasized passage *is* last:
a coda closes the slide. So emphasis buys silence exactly where more narration still
follows on the same slide, and the coda's win is that it is spoken at all.

On the five committed caption goldens carrying codas: ~1 s of added silence per
4-minute deck. The three without codas are byte-identical, which is the causality
check.

## What is NOT verified

No one has **listened**. The caption tracks are real artifacts from the real CLI
export and the timings are measured, but synthesizing audio needs a TTS key this
sandbox must not spend (HARD RULE #24), so the claim that a weighted deck *sounds*
better is unverified. The reachable evidence is the `.vtt` timings and the identity
of the three producers' gap formula, and that is what is claimed here.
