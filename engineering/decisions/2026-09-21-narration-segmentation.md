---
status: shipped
summary: >
  The abbreviation over-split from the 2026-09-20 audit's Finding 3, fixed, plus the
  under-split it mirrors. A cue is a caption line, a re-anchor unit AND one synthesized
  TTS clip, so "Dr. Chen approved it." cost two clips and an inserted silence. The fix is
  a spurious-break predicate shared by splitSentences and splitParagraphs: fold a break
  back when the word before it is an abbreviation, when the fragment after it starts with
  punctuation that cannot open a sentence, or when a terminator sits inside a closer and a
  lowercase continuation follows. Measured on examples/reflow-legal.md: 72 cues to 61.
  Two regressions this branch created and then closed are the real content — a first draft
  put `No.` and `Art.` in the always-merge set and swallowed two real sentences, and the
  closing-quote break alone stranded six em-dash asides as their own cues. voice-model.js's
  byte-identical copy of the segmenter was deleted rather than doubled: it had no caller.
companion:
  - ./2026-09-20-narration-audit.md
  - ./2026-07-07-cadenza-caption-timeline.md
  - ./2026-07-08-library-shape-cadenza-vetrina.md
---

# An abbreviation's period is not a sentence end (2026-09-21)

**The symptom.** `gallery.vtt` shipped `Cal.` and `Civ.` as standalone caption cues, and
the voice read them that way: "Cal." — stop — "Civ." — stop — "Code section seventeen
ninety-eight point one four zero." Three clips and two inserted silences where a listener
expects one citation.

**The root cause is a comment that stopped being true.** `segment.ts` broke after any
`[.!?…]` followed by whitespace, and its header justified the over-split: *"over-splitting
an abbreviation costs a tiny extra gap, never a correctness bug."* That was right when a
cue was only a caption line. It stopped being right at `read-aloud.ts:684`, which
synthesizes **one TTS clip per cue**. A cue is now three things at once — a caption line,
the re-anchor unit, and one clip — so a spurious break costs a synthesis round-trip and a
real silence, and `track.ts` prices the words either side of it from the wrong string.

## What changed

One predicate, `isSpuriousBreak(left, right)`, consulted by **both** `splitSentences` and
`splitParagraphs`. Three independent reasons a break is not a sentence end:

1. **`CONTINUATION_START`** — the fragment after the break starts with punctuation that
   cannot open a sentence: an em or en dash introducing an aside, a `§` continuing a
   citation, an `&` joining a two-part code name, a closing bracket. This is the general
   rule; the named abbreviation lists below are the cases it cannot see.
2. **A terminator INSIDE a closer, with a lowercase continuation.** The new closer break
   (below) is what makes `He said "Go now." Then he left.` two cues; the same shape
   mid-sentence is an aside — `A tone marker (tone-pass / …) sets a color.` — and the
   case of the next word is what tells them apart.
3. **An abbreviation before the period**, in three graded classes.

And the mirror defect: the break regex now allows one closing quote or bracket between the
terminator and the whitespace, so a quoted sentence ends its cue instead of running on.

### The three abbreviation classes, and why there are three rather than one

| class | merges when | why it cannot be unconditional |
|---|---|---|
| `ABBREV_ALWAYS` | always | a title, a legal code, a latin connective — each *labels* what follows, so something always comes after |
| `ABBREV_BEFORE_DIGIT` | a digit follows | `Sept. 20` is a date, `No. 4` a reference — and `no`, `art`, `ch`, `fig` are ordinary English words |
| `ABBREV_BEFORE_LOWER` + `INITIALISM` | a lowercase letter follows | `Acme Inc.` and `the U.S.` both end real sentences; a capital after them starts a new one |

**The grading is the whole design, and a first draft proved it by getting it wrong.**
`no` and `art` went into `ABBREV_ALWAYS` because `No. 4` and `Art. 5` are real
abbreviations. Measured on `examples/system-design-foundations.md`, that merged two real
sentences into their neighbors:

```
"At ten fifteen another team asked Maya to fix a flaky test in their repository.
 She said no. That refusal is the boundary…"          ← "She said no." swallowed
"No. Thirty tables and questions nobody has asked yet…" ← "No." swallowed
```

That is the over-split's mirror and the worse of the two: an over-split costs a pause, an
over-merge loses a sentence boundary the author wrote. Both moved to
`ABBREV_BEFORE_DIGIT`, where `No. 4` still merges and `She said no.` cannot. `pub`,
`stat`, `const`, `tit` and `supp` were dropped outright — each is an ordinary word or a
code keyword, none appears in the 186 shipped decks, and the citations that use them
(`Colo. Rev. Stat. §6-1-1301`) are carried by the `§` rule instead.

## Both regressions were found by scanning the corpus, not by reasoning

`tools/…` has no gate for this, so the instrument was a throwaway script that runs **both
segmenters over every line of all 186 shipped decks** and prints every line where they
disagree. It is the reason this note can name the two regressions rather than guess at
them, and it is worth re-running for any future change here. The first pass reported 111
differing lines; reading all 100 distinct shapes is what surfaced:

- **Six em-dash asides stranded as their own cues**, created by the closing-quote break —
  `The reading opens with the shape — "A diamond." — then fan-in coalesces.` became three
  cues. `CONTINUATION_START` is the fix, and it generalizes past the six.
- **Three parentheses split mid-sentence** — `A tone marker (tone-pass / …) sets a color.`
  Reason 2 above is the fix.
- **The two swallowed sentences** above.

The final pass differs on 95 lines across the corpus, every one of them read and
classified: citations merged, quoted sentences correctly split, asides kept whole.

## What is NOT verified

**Nobody has listened.** Every number here is the emitted `.vtt` bytes or a value computed
inside Cadenza — the same limit the audit records for itself (HARD RULE #23). Whether the
removed silences are audibly better is the thing that needs an ear, and no sandbox has one.

**The `-->` non-finding, recorded because it looks alarming.** The corpus scan reports the
closer break splitting `<!-- _footer: "…" -->` into a fragment that is just `-->`, which in
a `.vtt` would be a cue-timing separator and a structurally invalid file. It is an artifact
of the scan, which reads raw deck lines; `blankHtmlComments` removes comments long before
narration sees them. Checked on the real export: **3888 cues across 295 sidecars from eight
decks that carry such comments, zero malformed, and no cue text containing `-->` at all.**

**One pre-existing over-split was fixed here rather than logged.** `gantt` spells a span
`2026 Q1 .. 2026 Q4`, and the run of two periods broke as a terminator — on `main` too,
identically, across nine shipped decks including the gallery. It is off the path of the
abbreviation work but inside the same function, which #18 makes a fix-in-place rather than
a follow-up issue. Three periods are deliberately left alone: an authored `...` can end a
sentence, and the house ellipsis is `…` anyway. Found by reading the emitted caption bytes
for `examples/data-viz-gallery.md`, not by any test.

**A known limit, asserted rather than left to be discovered.** One initialism directly
followed by another (`Tex. Bus. & Com.`, `N.H. R.S.A. §358-A:2`) is undecidable from shape
alone, so the break stands. It costs an extra cue on a two-abbreviation citation; guessing
would cost a merged pair of real sentences.

## The second splitter is gone, not doubled

`voice-model.js` carried a byte-identical copy of `splitSentences`, a sanctioned local copy
because that module must load under plain node. Keeping it would have meant duplicating the
abbreviation tables. It had **no production caller** — voice-model is a byte source now and
no longer owns `speak()`, so `read-aloud.ts` segments from `track.cues`, i.e. from Cadenza —
and its only importers were its own two tests. It was deleted and the parity test retired
with it, which is exactly the end state `2026-07-08-library-shape-cadenza-vetrina.md:119`
planned: *"the hand-copied splitters become deletable — one source of truth, parity tests
retired."* The behavior the parity test guarded is now asserted directly, on the one
remaining implementation, in `segment.test.ts`.

## Tests

34 cases in `docs/src/lib/cadenza/segment.test.ts`, each built from the deck the finding
names rather than from a model of the input. Every guard is **mutation-proved**: 17
mutations of the implementation, each one failing at least one test, recorded in the PR.
Two tests earned their place only because a mutation survived them first — the terminator
guard was unreachable until `abbrevKey` stopped peeling the period, and the closing-quote
peel is load-bearing only when the continuation is capitalized.
