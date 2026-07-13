// Per-voice pace calibration store — the localStorage side of the calibration model
// (engineering/decisions/2026-07-12-per-voice-pace-calibration.md). Deliberately tiny and
// dependency-light (mirrors readaloud-overlay-prefs.ts): the read-aloud controller records the
// per-sentence measured/predicted ratio here, and the diagnostics overlay reads the fitted `k`.
//
// The accumulator itself (pure, framework-free) lives in cadenza's calibrate.ts; this module is
// just the per-voice PERSISTENCE + a same-page change signal. State is per user, per device,
// per voice — no server, matching the bring-your-own-key posture.

import {
  type CalibrationState,
  deserializeCalibration,
  emptyCalibration,
  observe,
  rateScale as rateScaleOf,
  serializeCalibration,
} from '@/lib/cadenza/index';

const KEY_PREFIX = 'lattice-readaloud-cal:';
type Listener = (voiceKey: string) => void;
const listeners = new Set<Listener>();

/** Normalize a voice label into a stable, storage-safe key (empty → 'unknown'). */
export function voiceKeyOf(label: string | null | undefined): string {
  const s = String(label ?? '').trim().toLowerCase();
  return s ? s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown' : 'unknown';
}

/** Load the persisted calibration for a voice (empty if none / malformed / no storage). */
export function loadCalibration(voiceKey: string): CalibrationState {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + voiceKey);
    if (!raw) return emptyCalibration();
    return deserializeCalibration(JSON.parse(raw));
  } catch {
    return emptyCalibration();
  }
}

function save(voiceKey: string, state: CalibrationState): void {
  try {
    localStorage.setItem(KEY_PREFIX + voiceKey, JSON.stringify(serializeCalibration(state)));
  } catch {
    /* storage full / unavailable — calibration is best-effort */
  }
  for (const fn of listeners) {
    try {
      fn(voiceKey);
    } catch {}
  }
}

/**
 * Fold one sentence's (predicted, measured) duration into a voice's calibration and persist it.
 * Returns the updated state. `atMs` is the wall clock (defaults to Date.now()). No-op-safe: an
 * unclean sample leaves the stored state unchanged (see calibrate.ts `observe`).
 *
 * Read-modify-write is last-writer-wins across tabs (two tabs narrating the same voice could drop
 * a sample) — acceptable under the per-device best-effort posture; calibration is a soft signal.
 */
export function recordObservation(
  voiceKey: string,
  estDurMs: number,
  measuredDurMs: number,
  atMs: number = Date.now(),
): CalibrationState {
  const next = observe(loadCalibration(voiceKey), estDurMs, measuredDurMs, atMs);
  save(voiceKey, next);
  return next;
}

/** The fitted rate scalar for a voice (1.0 until enough clean samples — see calibrate.ts). */
export function calibratedRateScale(voiceKey: string): number {
  return rateScaleOf(loadCalibration(voiceKey));
}

/** Clear one voice's calibration, or ALL of them when no key is given. */
export function resetCalibration(voiceKey?: string): void {
  try {
    if (voiceKey) {
      localStorage.removeItem(KEY_PREFIX + voiceKey);
    } else {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(KEY_PREFIX)) localStorage.removeItem(k);
      }
    }
  } catch {}
  for (const fn of listeners) {
    try {
      fn(voiceKey ?? '');
    } catch {}
  }
}

/** Subscribe to same-page calibration changes (the overlay re-reads on fire). Returns unsubscribe. */
export function onCalibrationChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
