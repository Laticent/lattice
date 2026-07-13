// Cadenza — per-voice pace calibration.
//
// The pace model (cadence.ts) is a deterministic DEFAULT (~200 ms/syllable). Every TTS voice
// has its own true rate, so we fit a single robust scalar `k` per voice from the per-sentence
// ratio the cursor already measures — `measuredClipDuration / modelPredictedDuration` — and feed
// `k` back as a multiplier on the estimate. `k > 1` → the voice is slower than the default;
// `k < 1` → faster. See engineering/decisions/2026-07-12-per-voice-pace-calibration.md.
//
// Pure and time-free: the caller supplies timestamps, so the accumulator is deterministic and
// unit-testable. It owns no storage — the consumer persists CalibrationState (per voice) itself.

export interface CalibrationState {
  /** Recent ratio samples (measuredDur / estDur), newest last, capped at CALIBRATION_WINDOW. */
  samples: number[];
  /** Total CLEAN observations folded in (may exceed samples.length — samples are windowed). */
  n: number;
  /** Caller-supplied epoch ms of the last accepted observation (0 if none). */
  updatedAt: number;
}

/** Recent-sample window the median is taken over — small, so `k` tracks the current voice. */
export const CALIBRATION_WINDOW = 15;
/** Clean samples required before `k` is allowed to leave 1.0 (avoid fitting on noise). */
export const CALIBRATION_MIN_N = 5;
/** `k` clamp — one pathological clip (decode stall, truncated synth) can't wreck pacing. */
export const CALIBRATION_MIN_K = 0.6;
export const CALIBRATION_MAX_K = 1.6;
/** A single sample outside this ratio band is a broken measurement, not a slow/fast voice —
 *  reject it before it reaches the window (wider than the k clamp so moderate outliers still
 *  inform the median, which the clamp then bounds). */
const SAMPLE_MIN_RATIO = 0.2;
const SAMPLE_MAX_RATIO = 5;

/** A fresh, uncalibrated state (k resolves to 1.0). */
export function emptyCalibration(): CalibrationState {
  return { samples: [], n: 0, updatedAt: 0 };
}

/**
 * Fold one observation into the state, returning a NEW state (never mutates the input). A sample
 * is the ratio `measuredDurMs / estDurMs`. Unclean samples — non-finite, non-positive durations,
 * or a ratio outside the sane band — are REJECTED (state returned unchanged) so a stalled or
 * truncated clip can't poison `k`. `atMs` is the caller's clock (defaults to the existing
 * updatedAt, keeping the fn pure); pass Date.now() from the consumer.
 */
export function observe(
  state: CalibrationState,
  estDurMs: number,
  measuredDurMs: number,
  atMs?: number,
): CalibrationState {
  if (
    !Number.isFinite(estDurMs) ||
    !Number.isFinite(measuredDurMs) ||
    estDurMs <= 0 ||
    measuredDurMs <= 0
  ) {
    return state;
  }
  const ratio = measuredDurMs / estDurMs;
  if (ratio < SAMPLE_MIN_RATIO || ratio > SAMPLE_MAX_RATIO) return state;

  const samples = state.samples.concat(ratio);
  if (samples.length > CALIBRATION_WINDOW) samples.splice(0, samples.length - CALIBRATION_WINDOW);
  return {
    samples,
    n: state.n + 1,
    updatedAt: atMs ?? state.updatedAt,
  };
}

/** Median of a numeric array (avg of the two middles for even length). Empty → 1. */
function median(xs: number[]): number {
  if (!xs.length) return 1;
  const s = xs.slice().sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * The current per-voice rate scalar. 1.0 until CALIBRATION_MIN_N clean samples have landed, then
 * the windowed-median ratio clamped to [CALIBRATION_MIN_K, CALIBRATION_MAX_K]. Multiply the
 * syllable estimate by this.
 */
export function rateScale(state: CalibrationState | null | undefined): number {
  if (!state || state.n < CALIBRATION_MIN_N || !state.samples.length) return 1;
  const k = median(state.samples);
  return Math.min(CALIBRATION_MAX_K, Math.max(CALIBRATION_MIN_K, k));
}

/** Serialize for localStorage. Returns a compact JSON-safe object. */
export function serializeCalibration(state: CalibrationState): CalibrationState {
  return { samples: state.samples.slice(), n: state.n, updatedAt: state.updatedAt };
}

/** Restore from a parsed localStorage value, tolerating any malformed shape (→ empty). */
export function deserializeCalibration(raw: unknown): CalibrationState {
  if (!raw || typeof raw !== 'object') return emptyCalibration();
  const r = raw as Record<string, unknown>;
  const samples = Array.isArray(r.samples)
    ? r.samples.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    : [];
  if (samples.length > CALIBRATION_WINDOW) samples.splice(0, samples.length - CALIBRATION_WINDOW);
  const n = typeof r.n === 'number' && Number.isFinite(r.n) ? Math.max(0, Math.floor(r.n)) : samples.length;
  const updatedAt = typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : 0;
  return { samples, n, updatedAt };
}
