// Cadenza — the ESTIMATOR (the one cadence source of truth).
//
// Turns a word's SPOKEN form into an estimated duration, and names the pauses that
// fall at punctuation. This is the deterministic baseline: it's what drives the
// silent read-along (no audio) and the caption clock before TTS re-anchors it.
//
// ONE cadence source: the three colliding reading speeds in the tree today
// (SPEAK_WPM=135, WORDS_PER_MINUTE=155, and ad-hoc timers) reconcile to the
// PACE_WPM presets below. Nothing else should carry a wpm constant.

import { spokenWordCount } from './normalize';

export type Pace = 'slow' | 'moderate' | 'fast';

/** Words per minute per curated preset (the single reading-speed source). */
export const PACE_WPM: Record<Pace, number> = { slow: 120, moderate: 145, fast: 175 };

/** Pause added AFTER a word carrying this trailing punctuation, in ms. */
const PAUSE_MS: Record<string, number> = {
  ',': 160, ';': 220, ':': 220,
  '.': 360, '!': 360, '?': 360, '…': 420,
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
 * Estimate the spoken duration of one caption word, from its SPOKEN form. Each
 * spoken sub-word gets the base per-word time (60000/wpm), scaled mildly by its
 * length so "revenue" takes longer than "up". A multi-word expansion ("four point
 * two million dollars") sums its sub-words — which is exactly why $4.2M dwells
 * longer than its four glyphs suggest.
 */
export function estimateWordMs(spoken: string, pace: Pace = 'moderate'): number {
  const base = 60000 / PACE_WPM[pace];
  const subWords = String(spoken ?? '').trim().split(/[\s-]+/).filter(Boolean);
  if (!subWords.length) return 0;
  let ms = 0;
  for (const w of subWords) {
    // Length weight around a ~4.5-char average, clamped so nothing is silly.
    const weight = Math.max(0.55, Math.min(1.9, w.replace(/[^A-Za-z0-9]/g, '').length / 4.5));
    ms += base * weight;
  }
  return Math.round(ms);
}

/** Reading dwell for a whole line, scaled to its spoken length — for a teaching pause. */
export function readMs(spoken: string, pace: Pace = 'moderate'): number {
  const words = spokenWordCount(spoken);
  const raw = 300 + (60000 / PACE_WPM[pace]) * words;
  return Math.round(Math.min(6000, Math.max(1000, raw)));
}
