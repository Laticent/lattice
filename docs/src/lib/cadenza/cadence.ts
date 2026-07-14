// Cadenza — the ESTIMATOR (the one cadence source of truth).
//
// Turns a word's SPOKEN form into an estimated duration, and names the pauses that
// fall at punctuation. This is the deterministic baseline: it's what drives the
// silent read-along (no audio) and the caption clock before TTS re-anchors it.
//
// The model is prosody-grounded (engineering/decisions/2026-07-12-narration-pace-model.md,
// grounded in a speech-science deep-research pass), NOT an ad-hoc wpm × char-length guess:
//   • word duration scales with SYLLABLES, not characters (~200 ms/syllable articulation);
//   • pauses are GRADED by boundary depth (comma < clause < sentence < …);
//   • the syllable before a boundary LENGTHENS (phrase-final lengthening).
// One source: nothing else in the tree carries a reading-speed constant. Structured so a
// later thread can CALIBRATE the coefficients per-voice against the measured TTS onsets the
// diagnostics overlay captures — the constants below are the deterministic default.

import { spokenWordCount } from './normalize';

export type Pace = 'slow' | 'moderate' | 'fast';

/** Words per minute per curated preset — for readMs (a whole-line teaching dwell) only.
 *  Word DURATION rides the syllable model (SYLLABLE_MS) below, not this. */
export const PACE_WPM: Record<Pace, number> = { slow: 120, moderate: 150, fast: 175 };

/** ARTICULATION cost per SYLLABLE (ms), excluding pauses — the pure speaking rate. English
 *  read-aloud runs ~200 ms/syllable (~4.5 syll/s at ~183 wpm oral reading; Brysbaert 2019 +
 *  syllable-duration norms). The GROSS ~150 wpm boardroom pace emerges from this plus the
 *  graded pauses below. The speed pref scales this preset. */
export const SYLLABLE_MS: Record<Pace, number> = { slow: 250, moderate: 205, fast: 165 };

/** Phrase-final lengthening — the pre-boundary syllable stretches (Klatt: ~+40 ms). Added to ANY
 *  word carrying trailing punctuation (every prosodic boundary — comma, clause, sentence), so the
 *  pre-boundary word ENDS later, exactly where a highlight tends to run ahead of the voice. A flat
 *  +30 rather than Klatt's boundary-graded ~+40; calibration can refine the grade later. */
export const FINAL_LENGTHEN_MS = 30;

/** Pause added AFTER a word carrying this trailing punctuation, in ms — GRADED by boundary
 *  depth (read/presentation register): comma/minor ~200, clause (`;`/`:`) ~350, sentence
 *  (`.`/`?`/`!`) ~550, trailing-off (`…`) ~650. Sourced from read-speech pause norms + the
 *  TTS doubling ladder (see the decision doc). Paragraph/topic-shift pauses are a DEEPER tier that
 *  isn't token-scoped (a paragraph boundary is a blank line, not a glyph) — see `PARAGRAPH_PAUSE_MS`.
 *  Keep every value a MULTIPLE OF 10: `CLIP_TRAILING_FRACTION` splits each
 *  pause into `round(0.7p)` (clip silence) + `round(0.3p)` (breath), which sums back to `p` exactly
 *  only when `p` isn't ≡5 mod 10 (else both halves land on `.5` and round up, e.g. p=5 → 4+2=6). The
 *  partition test in `cadence.test.ts` fails loud if a future value breaks this. */
const PAUSE_MS: Record<string, number> = {
  ',': 200, ';': 350, ':': 350,
  '.': 550, '!': 550, '?': 550, '…': 650,
};

/** The boundary pause at a PARAGRAPH / topic shift — the deepest prosodic break, above the sentence
 *  tier (§3 of the pace-model doc: ~900–1200 ms in read/presentation register). It is NOT token-scoped:
 *  a paragraph boundary is a blank line between structural blocks (the speech projection emits one
 *  between a slide's heading and body, and between distinct body blocks), not a trailing glyph — so it
 *  rides a per-cue `endsParagraph` flag rather than `pauseAfter`. A paragraph-final cue's LAST word
 *  still carries its own sentence terminator, so the clip's own trailing silence (`clipTrailingMs`) is
 *  unchanged; the paragraph tier only widens the inter-cue BREATH to `PARAGRAPH_PAUSE_MS − clipTrailingMs`.
 *  A multiple of 10, per the partition note above. Tuned to the FLOOR of the research range (~700–800,
 *  not the ~1000 mid) after on-device review: a deep dark pause at every block seam read as the
 *  highlight lagging, so the beat is kept short (and the highlight now HOLDS through it — see cursor.ts). */
export const PARAGRAPH_PAUSE_MS = 750;

/** The longest trailing pause implied by a token's punctuation (0 if none). Scans the trailing run
 *  of boundary glyphs from the END — a linear reverse scan, NOT a `/[…]+$/` regex, whose `+` retries
 *  at every start position (polynomial on a long punctuation run — a ReDoS on untrusted deck text,
 *  the same class `edgeTrim` in normalize.ts avoids). Stops at the first non-boundary char. */
export function pauseAfter(display: string): number {
  const s = String(display ?? '');
  let max = 0;
  for (let i = s.length - 1; i >= 0; i--) {
    const p = PAUSE_MS[s[i]];
    if (p === undefined) break; // left the trailing punctuation run
    if (p > max) max = p;
  }
  return max;
}

/** The share of a boundary pause that lies INSIDE the TTS clip as its own sentence-final silence —
 *  a synthesized clip does NOT end the instant the last phoneme does; it carries trailing silence
 *  (Klatt's phrase-final lengthening + the voice's own tail). The complementary 0.3 is the inter-clip
 *  BREATH the player inserts BETWEEN clips (voice-model.js `SENTENCE_PAUSE_MS` + read-aloud's `gapMs`,
 *  both `pauseAfter × 0.3`). Splitting the pause this way — clip-internal silence here, breath there —
 *  is what lets a cue's SPAN cover what the clip actually spans; before it, the whole pause fell into
 *  the inter-cue gap and none into the cue, so the calibration residual (measured clip ÷ estimated cue
 *  span) tracked PUNCTUATION DEPTH instead of the voice's real difficulty. `cadence.ts` can't import
 *  the node-loadable `voice-model.js`, so the two live apart; `cadence.test.ts` pins them complementary. */
export const CLIP_TRAILING_FRACTION = 0.7;

/** The clip-internal trailing silence a token's trailing punctuation implies, ms (0 if none). Added
 *  to a cue's end so the cue's duration spans the whole TTS clip, not just up to the last phoneme —
 *  see `CLIP_TRAILING_FRACTION`. Rounded so it stays an integer ms alongside `pauseAfter`. */
export function clipTrailingMs(display: string): number {
  return Math.round(pauseAfter(display) * CLIP_TRAILING_FRACTION);
}

/** The inter-cue BREATH after a cue whose last word is `display`: the boundary pause — the PARAGRAPH
 *  tier when `endsParagraph`, else the sentence/glyph pause — minus the clip's own trailing silence
 *  (which already lives INSIDE the cue's end, `clipTrailingMs`). This is THE ONE gap formula both the
 *  silent estimate (`track.ts` advances the next cue to `cueEnd + interCueGapMs`) and the clocked
 *  player (`read-aloud.ts` `gapMs`) use, so they can't drift — they MUST space cues identically or the
 *  highlight races into (or lags behind) the audio at a boundary. Deriving the paragraph breath
 *  per-cue from the actual terminator (not a constant that assumes a 550 ms sentence pause) is what
 *  keeps an ellipsis-ended paragraph (`…`, pause 650) consistent across the two paths. */
export function interCueGapMs(display: string, endsParagraph = false): number {
  const boundary = endsParagraph ? PARAGRAPH_PAUSE_MS : pauseAfter(display);
  return boundary - clipTrailingMs(display);
}

/** Exact syllable counts for the small, CLOSED set of spoken-expansion words the vowel-group
 *  heuristic below MIScounts, all for the same reason — a silent `e` the trailing-`e` rule can't see:
 *   • "nineteen" / "ninety" (`numberToWords`): the MEDIAL magic-`e` in "nine" sits mid-word, so the
 *     heuristic reads 3 beats when the voice says 2 ("nine-teen", "nine-ty"). Every figure built from
 *     those atoms inherits it (19, 90–99, 1990, $1.9M, …).
 *   • "times" (the `×`/`x` multiplier, `unitWords(_, 'time')` for any value ≠ 1 — "4.2×" → "four point
 *     two times"): the plural `s` blocks the trailing-silent-`e` drop that correctly gives the
 *     singular "time" = 1, so the heuristic reads 2 where the voice says 1 (/taɪmz/).
 *  A general medial-silent-`e` rule can't be added safely — it regresses ordinary words ("generate"
 *  → 2, "severance" → 2) — but the number/unit vocabulary is closed and owned upstream, so we give
 *  exactly its miscounted words their true counts. These are the ONLY divergences across the whole
 *  emitted vocabulary (ONES/TENS/SCALES, "hundred/point/dollars/percent/percentage/basis/…", ordinals).
 *  Keyed lowercase; consulted before the heuristic. The count is correct for the WORD regardless of
 *  source, so an author who literally types "ninety" or "times" benefits too. */
const SYLLABLE_OVERRIDES: Record<string, number> = {
  nineteen: 2,
  ninety: 2,
  times: 1,
};

/**
 * Estimate the number of spoken SYLLABLES in an already-spoken passage — a lightweight,
 * dependency-free English heuristic (count vowel-letter groups per word; drop a common
 * silent trailing `e`; floor 1 per word). ~85% accurate, which is plenty for TIMING (an
 * off-by-one syllable is only ~200 ms, and per-voice calibration tightens it later); a
 * pronunciation dictionary would be far heavier for a marginal gain. Digits are assumed
 * pre-expanded to words upstream (toSpoken); a stray digit run counts ~1 syllable/digit.
 */
export function syllableCount(spoken: string): number {
  // Fold apostrophes FIRST so a contraction stays ONE token ("I'll" → "Ill" → 1 vowel
  // group), not split on the apostrophe into a vowelless remnant ("ll") that the
  // initialism rule below would mis-count as spelled-out letters. Both straight and curly.
  const raw = String(spoken ?? '').replace(/['’]/g, '');
  const tokens = raw.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let total = 0;
  for (const tok of tokens) {
    if (/^\d+$/.test(tok)) {
      total += tok.length; // pre-expansion is the norm; a bare digit run is ~1 syllable/digit
      continue;
    }
    const w = tok.toLowerCase();
    const override = SYLLABLE_OVERRIDES[w];
    if (override !== undefined) {
      // A closed-vocabulary word the vowel-group heuristic gets wrong (a number-expansion word with
      // a medial silent `e`) — use its true count rather than the miscount. See SYLLABLE_OVERRIDES.
      total += override;
      continue;
    }
    const groups = w.match(/[aeiouy]+/g);
    let n = groups ? groups.length : 0;
    if (n === 0) {
      // A vowelless token: an ALL-CAPS one is an initialism the voice SPELLS OUT ("PDF" →
      // "P D F" ≈ 3 beats, "HTML" → 4). A lowercase vowelless token is an interjection or
      // rare word ("hmm", "nth", "tsk") — one beat. Case is the signal that separates them;
      // it's why we keep the token's original case until here instead of lowercasing upfront.
      total += tok.length > 1 && tok === tok.toUpperCase() ? tok.length : 1;
      continue;
    }
    // Silent trailing `e` ("make" = 1), but NOT a syllabic `-le` ("table" = 2).
    if (n > 1 && /[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w)) n -= 1;
    total += Math.max(1, n);
  }
  return Math.max(1, total);
}

/**
 * Estimate the spoken duration of one caption word, from its SPOKEN form: SYLLABLE_MS ×
 * syllables. A multi-word expansion ("four point two million dollars") counts all its
 * syllables — which is exactly why "$4.2M" dwells far longer than its four glyphs suggest.
 *
 * `rateScale` is the per-voice calibration multiplier (default 1 = the deterministic norm; see
 * `calibrate.ts`). A calibrated voice that runs slower than the default passes `rateScale > 1`
 * to stretch the estimate to its measured pace; only the syllable articulation scales, not the
 * boundary pauses (those calibrate separately, later).
 */
export function estimateWordMs(spoken: string, pace: Pace = 'moderate', rateScale = 1): number {
  const s = String(spoken ?? '').trim();
  if (!s) return 0;
  const k = Number.isFinite(rateScale) && rateScale > 0 ? rateScale : 1;
  return Math.round(SYLLABLE_MS[pace] * syllableCount(s) * k);
}

/** Reading dwell for a whole line, scaled to its spoken length — for a teaching pause. */
export function readMs(spoken: string, pace: Pace = 'moderate'): number {
  const words = spokenWordCount(spoken);
  const raw = 300 + (60000 / PACE_WPM[pace]) * words;
  return Math.round(Math.min(6000, Math.max(1000, raw)));
}
