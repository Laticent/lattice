---
status: shipped
summary: Fix two systematic errors an adversarial trio flagged in the read-aloud narration estimator, both at the source (the estimator's DATA, not a compensating fudge). (1) TRAILING-SILENCE — a sentence's boundary pause was assigned wholly to the inter-cue gap and excluded from the cue's own end, so a cue's estimated duration stopped at the last phoneme while the real TTS clip runs on through its sentence-final silence; per-voice calibration then compared measured-clip to that estimate, so the residual tracked PUNCTUATION DEPTH instead of the voice's difficulty. The boundary pause now splits — a clip-internal share (CLIP_TRAILING_FRACTION 0.7) folds into the cue's end so the span covers the clip, the complementary 0.3 stays the inter-cue breath, and the two partition the pause exactly (pinned cross-file against voice-model.js). (2) NUMBER SYLLABLES — the vowel-group heuristic miscounted three closed-vocabulary expansion words whose silent e it can't see: "nineteen"/"ninety" (medial magic-e in "nine" → read as 3, so 19/90-99/1990/$1.9M dwelt a beat too long) and "times" (the x-multiplier plural, whose s hides the silent e of "time" → read as 2); a small SYLLABLE_OVERRIDES map gives all three their true counts. Exported .vtt/readAlong cue-END timestamps shift later by each cue's clip-trailing silence (word-level and cue STARTS byte-identical). Real-TTS accuracy is UNVERIFIED in the sandbox (no audio clock/device); the modeling math is unit-tested. Partly de-risks the parked apply-k thread (a cleaner estimate is its substrate).
companion:
  - ./2026-07-12-narration-pace-model.md
  - ./2026-07-13-pace-calibration-apply-and-rewriter.md
  - ./2026-07-12-per-voice-pace-calibration.md
---

# Estimator timing errors — trailing silence & number syllables

**Status:** SHIPPED (fix the estimator's data)
**Thread:** read-aloud narration quality (follows `2026-07-12-narration-pace-model.md`; second step of the "fix the estimator's data" pivot after the Acronyms panel, #959)
**Branch:** `claude/estimator-timing-errors-kg6xkg`

## Why

The adversarial trio that reviewed the apply-`k`/rewriter design
(`2026-07-13-pace-calibration-apply-and-rewriter.md` § *Adversarial trio verdict*) named several
**estimator defects** that must be fixed *before* any residual-based feature can trust the estimate —
"number/currency/acronym/proper-noun mis-syllabification, **trailing-silence bias so the flag tracks
punctuation depth**." The maintainer pivoted to **fix the estimator's data first**. The Acronyms-in-
Lexicon panel (#959) covered acronym/proper-noun pronunciations (the author escape hatch). This slice
takes the next two: the **trailing-silence / cue-span** bias and the **number-syllable** miscount.
Proper nouns are intentionally SKIPPED — the shipped Lexicon/Acronyms author escape hatch already
covers them; a heuristic would reinvent it.

## The two errors, and the fixes

### 1. Trailing silence — a cue's span didn't cover the clip

**Before.** `buildTrack` (`track.ts`) laid each word end-to-end, and after the LAST word advanced the
clock by the full boundary pause (`clock = endMs + pause`) — but set `cueEnd = lastWord.endMs`, i.e.
**excluding** that pause. So the whole sentence-final pause fell into the gap *between* cues, and a
cue's estimated duration stopped at its last phoneme.

**Why it's a bias, not a wash.** A real TTS clip for one sentence does **not** end the instant the
last phoneme does — it carries its own sentence-final silence (phrase-final lengthening + the voice's
tail). Per-voice calibration (`read-aloud.ts` `onItemStart`) folds `measuredClipDuration ÷ (cue.endMs
− cue.startMs)`. With the trailing silence in the numerator (measured clip) but not the denominator
(estimate), the residual grew with the **depth of the terminator** — a `.`/`?`/`!` sentence looked
"slower" than a `,`-heavy one purely because of punctuation. That's exactly the confound the trio
called out: the calibration `k` (and any future residual-based "hard-to-say" flag) tracked
punctuation depth, not the voice's real articulation difficulty.

**Fix.** Split the boundary pause into the two physically distinct pieces it always was:

- **clip-internal trailing silence** → folds into the cue's end (`CLIP_TRAILING_FRACTION = 0.7`);
- **inter-clip breath** → stays the gap before the next cue (the complementary `0.3`, already what
  `voice-model.js` `SENTENCE_PAUSE_MS` and `read-aloud.ts` `gapMs` insert between clips).

`cueEnd = lastWord.endMs + clipTrailingMs(lastWord.display)` where `clipTrailingMs = round(pauseAfter
× 0.7)`. The clock advance is unchanged (still the full pause), so the next cue's **start is
byte-identical** and the inter-cue gap is exactly the breath. The two pieces **partition** the pause
(`round(0.7p) + round(0.3p) === p` for every class — pinned by a cross-file test). Now `cue.endMs −
cue.startMs` covers what the clip spans, so the calibration residual reflects difficulty, not
punctuation.

A welcome side effect on the **clocked** path: `cursor.align()` rescales a cue's words to the measured
span using this estimate. With the trailing silence now inside the span, the last word's highlight
**releases into the sentence-final silence** instead of being stretched to the clip's final sample —
a highlight resting slightly *ahead* of the voice, which the pace-model doc (§5, asymmetric lip-sync
tolerance) calls the forgivable direction (a lagging highlight is the error to avoid).

### 2. Number syllables — "nineteen"/"ninety" over-counted

`toSpoken` expands numbers to words upstream (`$1.9M` → "one point nine million dollars"), and
`syllableCount` counts vowel groups over the expansion. The heuristic strips a **trailing** silent
`e` ("nine" → 1, "time" → 1) but can't see one hidden mid-word or behind a plural `s` — three
expansion words diverge for that one reason:

- **"nineteen" / "ninety"** carry the magic-`e` of "nine" **mid-word**, so the heuristic reads 3
  vowel groups (`i · e · ee` / `i · e · y`) where the voice says 2 ("nine-teen", "nine-ty"). Every
  figure built from those atoms inherits it — 19, 90–99, 1990, `$1.9M`, "ninety-nine".
- **"times"** — the `×`/`x` multiplier emits the plural via `unitWords(_, 'time')` for any value ≠ 1
  (`4.2×` → "four point two **times**"); the plural `s` blocks the trailing-silent-`e` drop that
  correctly gives the singular "time" = 1, so the heuristic reads 2 where the voice says 1 (/taɪmz/).

**Fix.** A small `SYLLABLE_OVERRIDES` map (`nineteen: 2, ninety: 2, times: 1`) consulted before the
heuristic. The count is correct for the *word* regardless of source, so an author who literally types
"ninety" or "times" benefits too. A **general** medial-silent-`e` rule was considered and
**rejected**: it regresses ordinary English ("generate" → 2, "severance" → 2, "basement" is a
coincidental win but "generate" is a real loss). The number/unit vocabulary is **closed and owned
upstream**, so exact counts for its miscounted words is the safe, honest fix. An exhaustive recompute
of the heuristic vs. truth over the *entire* emitted vocabulary (ONES/TENS/SCALES, "hundred", "point",
"million", "percent", "dollars", ordinals, "basis", "day(s)", …) confirms these three are the **only**
divergences — the third ("times") was caught by the maker-checker pass after the first two.

## Blast radius / export bytes

**This changes exported bytes.** `cue.endMs` feeds `toVtt` (cue-end timestamp) and the `readAlong`
export manifest (`lib/core/read-along-build.js` → `@slidewright/cadenza` `buildTrack`), so exported
`.vtt` and `readAlong` **cue-END timestamps shift later** by each cue's clip-trailing silence.
Word-level inline `<timestamp>`s, every cue **START**, and all caption **TEXT** are byte-identical.
The number fix also shifts word *durations* for number-bearing captions (fewer syllables → shorter
dwell), which moves the inline word timestamps *after* an affected number within its cue. Per the
Quality Bar this is an **export-sign-off** change — a before/after `.vtt` sample is in the PR for the
maintainer's inspection; held for merge authorization.

## Verification honesty (HARD RULE #23)

Whether these estimates match **real TTS timing** cannot be validated here — the sandbox has no audio
clock and no device. What IS verified: the **modeling math** is deterministic and unit-tested
(`cadence.test.ts`, `track.test.ts`, `cursor.test.ts`) — the pause partition, the cue-span extension,
the inter-cue-gap = breath identity, the align release-into-silence, and the number counts (both in
isolation and through real `toSpoken` expansions). The claim "captions read better" is **UNVERIFIED**
and marked so; the true test is an on-device narration pass with a clocked voice (cloud Kokoro).

## Relation to the parked apply-`k` thread

`2026-07-13-pace-calibration-apply-and-rewriter.md` is parked (blocked) on the estimator being
trustworthy. This de-biasing is part of the substrate that thread needs: a residual computed against
a cue span that covers the clip is a cleaner signal than one confounded by punctuation depth. It does
**not** implement apply-`k` or the rewriter — those remain parked pending the maintainer's direction.

## Files

- `docs/src/lib/cadenza/cadence.ts` — `CLIP_TRAILING_FRACTION`, `clipTrailingMs`, `SYLLABLE_OVERRIDES`.
- `docs/src/lib/cadenza/track.ts` — fold clip-trailing silence into `cueEnd`.
- Tests: `cadence.test.ts`, `track.test.ts`, `cursor.test.ts`.
- Regenerated bundles: `@slidewright/cadenza` (`docs/src/lib/cadenza/dist/`) + `read-along-core.generated.js`.
- `CHANGELOG.md` `## Unreleased`.
