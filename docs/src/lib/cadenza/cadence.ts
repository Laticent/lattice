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
 *  TTS doubling ladder (see the decision doc). Paragraph-level pauses aren't token-scoped and
 *  are a logged follow-up. */
const PAUSE_MS: Record<string, number> = {
  ',': 200, ';': 350, ':': 350,
  '.': 550, '!': 550, '?': 550, '…': 650,
};

/** The longest trailing pause implied by a token's punctuation (0 if none). */
export function pauseAfter(display: string): number {
  const m = String(display ?? '').match(/[.,!?;:…]+$/);
  if (!m) return 0;
  let max = 0;
  for (const ch of m[0]) max = Math.max(max, PAUSE_MS[ch] ?? 0);
  return max;
}

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
 */
export function estimateWordMs(spoken: string, pace: Pace = 'moderate'): number {
  const s = String(spoken ?? '').trim();
  if (!s) return 0;
  return Math.round(SYLLABLE_MS[pace] * syllableCount(s));
}

/** Reading dwell for a whole line, scaled to its spoken length — for a teaching pause. */
export function readMs(spoken: string, pace: Pace = 'moderate'): number {
  const words = spokenWordCount(spoken);
  const raw = 300 + (60000 / PACE_WPM[pace]) * words;
  return Math.round(Math.min(6000, Math.max(1000, raw)));
}
