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
postdates both. Over `examples/*.md` + `test/integration/baseline-decks/*.md`, **53 of 161 decks
carry at least one blockquote (186 lines)**. Quote the root set with the number: it moves with HEAD
and with which directories are walked — an earlier draft said "52 of 156 / 180" from the same command
before this branch's own demo deck existed, and a checker measuring a wider set got 52 of 160 / 176.
The load-bearing fact is the ratio, about a third of decks; the denominator is not a constant.

It is now spoken last, as its own paragraph block so the beat before it is the
paragraph tier. A layout that CLAIMS its trailing block keeps it inside the stage
where the body walker already says it. The guard against saying it twice asks whether the BODY
ALREADY CONTAINS THIS BLOCK, as a whole sentence — see § "What the second checker found" for why
neither `stage.contains`, a substring test, nor block equality is the right predicate.

**This is the larger half of the change.** A punchline that is not paced well is a
smaller problem than a punchline nobody hears.

## Honest scope of the timing half

Emphasis buys silence exactly where more narration still follows on the same slide. A span that ends
in a slide's FINAL cue buys nothing, because the hold is spent in the gap after a cue and
`CaptionTrack.durationMs` is the last cue's end — that gap is discarded.

An earlier draft of this note explained that no-op as "`SLIDE_PAUSE_MS` (1400 ms) already follows, so
charging 250 more would pay twice for the same silence." **That was wrong**, and wrong in the
comfortable direction: it made a discarded value sound like a deliberate saving. There is no slide
pause anywhere in the `.vtt` timeline — `read-along-vtt.js` advances by `durationMs` alone, and
`slideBeatMs` is read only by Present. The real mechanism is arithmetic, not policy.

That is why the coda is **spoken but not weighted**. A coda is appended last, so an ordinary
single-block one always ends in the final cue. Deleting `.cell-coda` from `EMPHASIS_SOURCES` leaves
`examples/emphasis-narration.vtt` byte-identical — on the deck whose whole job is to show the feature
— so it was withdrawn rather than left claiming to work.

**No committed caption golden changes.** All nine regenerate byte-identically, and the eight that
predate this branch match `origin/main`. An earlier draft claimed "five changed goldens, ~1 s of added
silence each"; that described the first cut, whose spans were misplaced by the identity-guard defect
below, and it survived one revision past the revert that fixed it.

**The blast radius is far wider than the diff suggests, and the diff cannot show it.** `speakCoda`
changes narration TEXT on **284 of 3402 slides, across 72 decks** — measured by rendering every
committed deck under `examples/`, `test/integration/baseline-decks/` and `lib/components/` (329 decks)
through `lib/engine`, then running `projectDeckToSpeech` from `origin/main` and from this branch over
the same sections and counting the slides whose text differs. Only **nine** `.vtt` files are committed
(`git ls-files '*.vtt'`), so every other deck's captions change silently at export with no golden to
move. That asymmetry is
worth knowing before trusting a green diff on this module.

The method is stated because the number is the kind this branch keeps getting wrong: an independent
checker measured "roughly 280 over 327 decks" and the two agree, but only because both name what they
walked. A corpus figure without its root set is not reproducible — the same mistake as the blockquote
count above.

## The defect this design shipped once, and the fix

**The identity rule was written out four times and one copy was wrong.** The emulator mutates its
projection array in place when `narrateChart` fires (`projected[i] = chart`), so the guard 65 lines
later compared the resolved narration against the *already-substituted* string. It passed trivially
on exactly the slides it exists to reject and handed char offsets measured against the figure
projection to a different string: **83 stale spans over 77 slides in 15 committed decks**, and 29 of
the 34 spans in the first cut of the five changed goldens were misplaced. The bake and Present were
correct, because `applyChartNarration` returns a copy.

The rule now lives in ONE place — `emphasisForResolved` in `lib/core/read-along-build.js` — and every
producer calls it with a pre-substitution snapshot. Writing an invariant out per-caller is how three
right copies and one wrong one ship together, which is the case HARD RULE #1 is about.

**There were four producers, not three.** `shareCaptions` (the Studio's "Captions (.vtt)" download)
was missed on the first pass while its sibling `shareHtmlPlayer` was wired, so the same deck exported
seven holds from the CLI and none from the Studio.

**Neither was reachable by any test**, and that is the more useful finding. A checker mutated each
consumer to drop its `weight` argument and the whole suite stayed green: a dropped third argument
silently defaults, and it only shows as a 250 ms drift against audio CI never synthesizes. There is
no cheap behavioral oracle for that; there is a structural one, so
`test/unit/core/narration-gap-census.test.js` pins every call site of the shared formula and fails
when one stops passing the weight.

**One coda guard was correct by accident.** `stage.contains(coda)` answers "is this inside the walked
stage", which is equivalent to "was it already spoken" only while the component's walker is
`speakGeneric` — `speakStats`, `speakBigNumber` and `speakQuote` do not walk the coda, so a
stage-less slide of those four would have gone silent again with the guard appearing to work. It now
asks the question directly: is this text already in the body.

## What the second checker found — the fix pass was the unreviewed part

The first checker audited the revision BEFORE its own findings were addressed, so the fixes it
prompted had nobody on them. A second pass over just those changes found two blocking defects, both
introduced by that fix pass. Recording the pattern as much as the bugs: **on this line of work, every
fix pass has shipped a new defect**, and neither of these was reachable by the gates.

**1 · The new coda guard silently DROPPED content.** Replacing `stage.contains(coda)` with
`body.includes(text)` swapped one wrong predicate for another: `includes` is a SUBSTRING test, so a
coda whose words also appear inside a longer body sentence was dropped entirely. A body reading
"We must decide now, before the window closes and the option lapses." lost the coda "We must decide
now" — and a punchline restating a phrase from the body is the ordinary shape of a punchline. The
irony is exact: a branch whose subject is a coda nobody hears introduced a second way not to hear one.

Block equality is wrong in the other direction — `speakGeneric` emits a claimed coda in SENTENCE FLOW
with the block before it, one paragraph rather than two, so comparing whole blocks misses it and the
slide says its coda twice. The predicate that is right is neither: match the TERMINATED form, and only
where it begins at a sentence boundary. `saysAlready()` does that, and both directions are pinned.

**2 · The `.cell-coda` emphasis source was inert**, per § Honest scope. Withdrawn.

**3 · The four producers do NOT spend identical beats, and a changelog line said they did.** The
`.vtt` deriver advances by `durationMs` and so drops any gap after a slide's final cue;
`player-core.mjs` holds `g` on the final cue deliberately ("so the slide boundary does not land on the
final syllable"). That seam PREDATES this branch — the `.vtt` never carried post-final silence — but
this branch adds a new per-deck quantity that lands exactly on it, which is the reason the coda source
was withdrawn rather than made to count. Making the final gap count is the named follow-on, and it is
a change to what the `.vtt` contains, not a tweak.

**4 · Several claims in this note were false** and are corrected above: five changed goldens (zero),
six committed `.vtt` files (nine), and the `SLIDE_PAUSE_MS` explanation for the final-cue no-op. All
three described the pre-revert state and survived a revision past the revert.

**What held.** The emulator snapshot is correctly placed (nothing else mutates `projected` between it
and the guard); `emphasisForResolved`'s sparse-index discipline is right; the bake, Present and
`shareHtmlPlayer` guards read the correct operand; every generated bundle's export list is complete;
all nine goldens regenerate byte-identically and the eight pre-existing ones match `origin/main`.

## What is NOT verified

No one has **listened**. The caption tracks are real artifacts from the real CLI
export and the timings are measured, but synthesizing audio needs a TTS key this
sandbox must not spend (HARD RULE #24), so the claim that a weighted deck *sounds*
better is unverified. The reachable evidence is the `.vtt` timings and the identity
of the three producers' gap formula, and that is what is claimed here.
