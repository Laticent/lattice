---
status: shipped
summary: Add the PARAGRAPH / topic-shift pause tier (the deepest prosodic break) to the read-aloud estimator, closing the "paragraph pauses aren't token-scoped" follow-up from the pace-model doc. A paragraph boundary is a blank line, not a trailing glyph, so the shared speech projection (prose-projection.mjs projectDeckToSpeech) emits a blank line between a slide's LEAD (title) and its BODY, and a paragraph-aware segmenter (segment.ts splitParagraphs) tags the cue before it with endsParagraph. buildTrack widens that cue's inter-cue gap to PARAGRAPH_PAUSE_MS (the clip's own trailing silence is unchanged), and the clocked player (read-aloud.ts gapMs, via a new Suono index param) uses the SAME shared interCueGapMs formula so audio and silent estimate space topics identically. Sentence list is byte-identical to splitSentences (cue↔clip alignment preserved). AFTER a first on-device pass showed the highlight lagging, an adversarial trio confirmed the clock accounting is SOUND (no desync) but the beat was spent as DEAD time: the fixes — hold the highlight through the gap instead of going dark (cursor.ts), beat only lead→body not every block (prose-projection.mjs), and PARAGRAPH_PAUSE_MS 1000→750. Exported .vtt/readAlong cue timings shift; cue TEXT unchanged. Real-TTS pacing is UNVERIFIED in the sandbox; on-device re-sign-off owed.
companion:
  - ./2026-07-13-estimator-trailing-silence-and-number-syllables.md
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-11-manifest-speech-contract.md
---

# Paragraph-level pauses — the deepest prosodic tier

**Status:** SHIPPED
**Thread:** read-aloud narration quality (follows `2026-07-13-estimator-trailing-silence-and-number-syllables.md`)
**Branch:** `claude/paragraph-pauses-kg6xkg`

## Why

The pace-model doc (`2026-07-12-narration-pace-model.md` §3) names four boundary tiers — comma, clause,
sentence, **paragraph/topic (~900–1200 ms)** — but only the first three shipped: they're keyed by a
trailing glyph (`pauseAfter`), and **a paragraph boundary is a blank line, not a glyph.** It was logged
as "not token-scoped — a follow-up." This is that follow-up.

## The finding that shaped the scope

The obvious reading of "paragraph pause" is "honor blank lines in the narration text." But the
**primary narration path erases them**: the shared speech projection (`prose-projection.mjs`
`projectDeckToSpeech`, the kernel both Present and the export use) joined every block with a **single
space** (`out.join(' ')`), and `splitSentences` collapses all whitespace on its first line. So a slide's
narration reached `buildTrack` as one flat run — there were **no paragraph boundaries to detect**. A
blank line only survived in a hand-authored multi-paragraph speaker note (a minority path).

So "paragraph pauses" was really three different features. The maintainer picked **B — structural block
beats**: the value isn't in author blank lines, it's in putting a beat between a slide's *distinct
blocks* (heading → body → stat group), which is where the projection had flattened the structure away.

## The model

Three coordinated pieces, one boundary tier:

1. **The projection emits the boundary** (`prose-projection.mjs`). `projectDeckToSpeech` places a
   single blank line (`\n\n`) between the **lead** (eyebrow + heading, one title unit) and the **body**
   — the one topic shift on a slide. Body blocks stay space-joined (sentence flow); a `normalizeProjected`
   helper keeps the beat while collapsing every other whitespace. *(An earlier draft beat between EVERY
   body block too — that was walked back after on-device review; see the trio section.)* The raw-markdown
   fallback (`slide-speech.js`) is deliberately **unchanged** — it can't tell a block from a list item.

2. **A paragraph-aware segmenter** (`segment.ts` `splitParagraphs`). Returns the **same sentence list
   `splitSentences` gives** — plus the set of sentence indices that end a paragraph. The identical
   sentence list is load-bearing: the audio path segments clips with the whitespace-collapsing
   `splitSentences` (mirrored in `voice-model.js`), and **a cue must map 1:1 to its clip**. A blank line
   is honored as a boundary only where the text before it ends with a terminator (so it coincides with a
   real sentence split); a blank line mid-sentence **merges** across the break, exactly as the
   whitespace-collapse would — pinned by a test asserting `splitParagraphs(t).sentences ===
   splitSentences(t)` over many inputs.

3. **`buildTrack` + the clocked player apply the deeper gap through ONE shared formula.** A
   paragraph-final cue carries `endsParagraph: true`. Its **clip end is unchanged** — a paragraph adds
   no phonemes, so the last word's own sentence-final silence (`clipTrailingMs`) is the same; the
   paragraph tier only widens the **inter-cue gap**. Both the silent estimate (`track.ts` starts the
   next cue at `cueEnd + interCueGapMs(...)`) and the clocked player (`read-aloud.ts` `gapMs`) call the
   SAME `interCueGapMs(display, endsParagraph)` = `(endsParagraph ? PARAGRAPH_PAUSE_MS : pauseAfter) −
   clipTrailingMs`, so they space cues **identically** — they must, or the highlight races into (or
   lags behind) the audio at a boundary. The clocked path needed one additive Suono change: `gapMs` now
   receives the item **index** (`sequence.ts`), so it can look up `track.cues[from + index].endsParagraph`.

   *(Maker-checker fix.)* An earlier draft used a hardcoded `PARAGRAPH_EXTRA_BREATH_MS = PARAGRAPH_PAUSE_MS
   − 550`, which assumed the boundary terminator's pause was always 550 ms; for an **ellipsis-ended**
   paragraph (`…`, pause 650) the clocked gap then ran ~100 ms longer than the estimate/`.vtt`
   predicted — a brief highlight-race at that boundary. Deriving the gap per-cue from the actual
   terminator (the shared `interCueGapMs`) removes the divergence: `.`→615 ms, `…`→545 ms on **both**
   paths.

`PARAGRAPH_PAUSE_MS = 750` (the floor of the research range, lowered from 1000 after on-device review),
a multiple of 10 (the `CLIP_TRAILING_FRACTION` partition-safety rule).

## On-device regression → adversarial trio → reshape

A first on-device pass reported the caption highlight "way off and behind." The maintainer called for
the **full adversarial trio** (HARD RULE #25). All three converged:

- **The clock accounting is SOUND — it is NOT a desync.** The audio genuinely `sleep`s for the gap
  (`suono/sequence.ts`), `stage.clockMs()` advances through it, the reported clip onset already includes
  it, and `reader.align()` re-pins every cue — so the pause balances exactly across estimate, audio, and
  highlight, and cannot compound on the clocked path. (Independent-checker + red-team numeric sims.)
- **The beat was spent as DEAD time.** At a boundary `cursor.at()` returned `null` for the whole pause,
  so the highlight went **dark** — the eye finishes the line, jumps ahead, and the highlight rests on
  nothing → read as "behind" (Munger). And the projection beat between EVERY block → many ~1 s dark
  voids per slide (magnitude).
- **Red-team edge:** on a voice that ignores our gaps and reports no onsets (browser `speechSynthesis`,
  or iOS where `align` under-fires) the inflated estimate can drift ~1 s/paragraph. Reduced-but-not-
  eliminated; logged as a residual for the on-device pass (Studio bans browser voice in prod).

**Reshape (all folded):** (1) **hold** the last word lit through the gap instead of going dark
(`cursor.ts`) — kills the "resting on nothing," and helps the pre-existing sentence gaps too; (2) beat
**only lead→body**, not every block (`prose-projection.mjs`); (3) `PARAGRAPH_PAUSE_MS` **1000→750**;
(4) reconcile the latent arg nit — both paths now pass the cue's **last display word** to
`interCueGapMs` (`toSpoken` softens a trailing `:`/`;` to `,`, so the spoken form's terminator could
differ ~40–105 ms). The sync machinery (`align`, add-to-both) was confirmed correct and left untouched.

## Blast radius / export bytes

**Changes exported bytes.** Cue timings feed `toVtt` and the `readAlong` manifest; a paragraph-final
cue now gets a deeper gap, so every cue AFTER a paragraph boundary starts later. Cue **text**, cue
STARTS before the first boundary, and word-level inline timestamps within a cue are unaffected in shape.
The projection output also changes (block seams are `\n\n`), but that is an internal narration string,
not an exported artifact — the exported `.vtt` cue **text** is still the display words. Per the Quality
Bar this is an **export-sign-off** change; a before/after sample is in the PR.

Shared-kernel note (HARD RULE #1): the projection change lands in the one shared `prose-projection.mjs`,
so Present and the export stay identical. Bundles regenerated: `@slidewright/cadenza` (cadence/track/
segment), `player-core` (prose-projection), `read-along-core`.

## Verification honesty (HARD RULE #23)

The **modeling** is deterministic and unit-tested: the segmenter's alignment invariant, the paragraph
beat's gap math, the projection's lead→body behavior, the hold-through-gap cursor, the constants.
Whether the beat *sounds* right on a real clocked voice cannot be checked here (no audio clock/device).
The first device pass FAILED (the "dead time" above); the **reshaped version was re-tested on-device by
the maintainer (2026-07-14) and confirmed aligning** — the highlight tracks the voice. That retires the
UNVERIFIED caveat: the held highlight + shorter, once-per-slide beat hold up on the real surface.

## Files

- `docs/src/lib/cadenza/cadence.ts` — `PARAGRAPH_PAUSE_MS` (750), `interCueGapMs` (the shared gap formula).
- `docs/src/lib/cadenza/segment.ts` — `splitParagraphs` (CRLF-aware; never flags the final cue).
- `docs/src/lib/cadenza/track.ts` — `Cue.endsParagraph`; the paragraph gap.
- `docs/src/lib/cadenza/cursor.ts` — **hold the last word through the inter-cue gap** (no dark void).
- `docs/src/lib/cadenza/index.ts` — export the new surface.
- `lib/transformers/prose-projection.mjs` — the lead→body beat + `normalizeProjected`.
- `docs/src/lib/suono/{types,sequence}.ts` — `gapMs` gains the item `index`.
- `docs/src/components/studio/read-aloud.ts` — the clocked paragraph breath (keyed on the last display word).
- Tests: `segment.test.ts`, `track.test.ts`, `cadence.test.ts`, `cursor.test.ts`, `prose-projection.test.js`.
- Bundles: cadenza + player-core + read-along-core + emulator. `CHANGELOG.md`.
