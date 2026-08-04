// Narration synth latency — the measurement behind "what is the SLA for each model?"
//
// There is no published latency SLA for OpenRouter's /audio/speech route (it is a
// router over upstream providers; its terms cover availability and billing, not
// per-request latency), and per-model latency moves with upstream load, input length,
// and the network the presenter is actually on. So the only number worth having is the
// one measured from THIS device against THIS model — which is what this records.
//
// A small rolling reservoir per voice, in localStorage. Two consumers:
//   · the read-aloud diagnostics overlay, which shows p50/p95 so the number is visible
//   · `resolveLookahead` (narration-prefs.js), which sizes the prefetch window from p95
//     rather than from a hardcoded guess — a presenter on hotel wifi warms deeper than
//     one on a fiber desk, without either having to think about it.
//
// Node-safe and dependency-free, for the same reason voice-model.js is (it imports this):
// plain JS, no `@/` alias, no TypeScript import, every entry point guards `localStorage`.

const KEY_PREFIX = 'lattice-narration-lat:';
/** Samples retained per voice. Enough for a stable p95, small enough that the whole
 *  record stays a short JSON array in localStorage. */
const WINDOW = 40;

function read(voiceKey) {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + voiceKey);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => Number.isFinite(n) && n >= 0) : [];
  } catch {
    return [];
  }
}

/**
 * Record one measured synth wall-clock, in ms, for a voice.
 *
 * ONLY real network/compute attempts belong here — never a cache hit. A hit is ~0 ms and
 * would drag p95 toward zero, which would then shrink the prefetch window on exactly the
 * decks whose warm-ahead is working, and re-open the cold-start gap it exists to close.
 */
export function recordLatency(voiceKey, ms) {
  if (!voiceKey || !Number.isFinite(ms) || ms < 0) return;
  try {
    const next = read(voiceKey);
    next.push(Math.round(ms));
    while (next.length > WINDOW) next.shift();
    localStorage.setItem(KEY_PREFIX + voiceKey, JSON.stringify(next));
  } catch {
    /* storage unavailable / full — measurement is never worth breaking playback for */
  }
}

/** `{n, p50, p95}` for a voice; zeros when nothing has been measured yet. */
export function latencyStats(voiceKey) {
  const samples = read(voiceKey).slice().sort((a, b) => a - b);
  if (!samples.length) return { n: 0, p50: 0, p95: 0 };
  // Nearest-rank percentile — for a reservoir this small it is the honest estimator;
  // interpolation would invent precision the sample count doesn't support.
  const at = (p) => samples[Math.min(samples.length - 1, Math.ceil((p / 100) * samples.length) - 1)];
  return { n: samples.length, p50: at(50), p95: at(95) };
}

/** Forget a voice's samples (a model/voice switch makes old timings meaningless). */
export function clearLatency(voiceKey) {
  try {
    localStorage.removeItem(KEY_PREFIX + voiceKey);
  } catch {
    /* nothing to clear */
  }
}
