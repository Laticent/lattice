export interface CalibrationState {
    /** Recent ratio samples (measuredDur / estDur), newest last, capped at CALIBRATION_WINDOW. */
    samples: number[];
    /** Total CLEAN observations folded in (may exceed samples.length — samples are windowed). */
    n: number;
    /** Caller-supplied epoch ms of the last accepted observation (0 if none). */
    updatedAt: number;
}
/** Recent-sample window the median is taken over — small, so `k` tracks the current voice. */
export declare const CALIBRATION_WINDOW = 15;
/** Clean samples required before `k` is allowed to leave 1.0 (avoid fitting on noise). */
export declare const CALIBRATION_MIN_N = 5;
/** `k` clamp — one pathological clip (decode stall, truncated synth) can't wreck pacing. */
export declare const CALIBRATION_MIN_K = 0.6;
export declare const CALIBRATION_MAX_K = 1.6;
/** A fresh, uncalibrated state (k resolves to 1.0). */
export declare function emptyCalibration(): CalibrationState;
/**
 * Fold one observation into the state, returning a NEW state (never mutates the input). A sample
 * is the ratio `measuredDurMs / estDurMs`. Unclean samples — non-finite, non-positive durations,
 * or a ratio outside the sane band — are REJECTED (state returned unchanged) so a stalled or
 * truncated clip can't poison `k`. `atMs` is the caller's clock (defaults to the existing
 * updatedAt, keeping the fn pure); pass Date.now() from the consumer.
 */
export declare function observe(state: CalibrationState, estDurMs: number, measuredDurMs: number, atMs?: number): CalibrationState;
/**
 * The current per-voice rate scalar. 1.0 until CALIBRATION_MIN_N clean samples have landed, then
 * the windowed-median ratio clamped to [CALIBRATION_MIN_K, CALIBRATION_MAX_K]. Multiply the
 * syllable estimate by this.
 */
export declare function rateScale(state: CalibrationState | null | undefined): number;
/** Serialize for localStorage. Returns a compact JSON-safe object. */
export declare function serializeCalibration(state: CalibrationState): CalibrationState;
/** Restore from a parsed localStorage value, tolerating any malformed shape (→ empty). */
export declare function deserializeCalibration(raw: unknown): CalibrationState;
