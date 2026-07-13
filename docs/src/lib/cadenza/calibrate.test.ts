import { describe, expect, it } from 'vitest';
import {
  CALIBRATION_MAX_K,
  CALIBRATION_MIN_K,
  CALIBRATION_MIN_N,
  CALIBRATION_WINDOW,
  deserializeCalibration,
  emptyCalibration,
  observe,
  rateScale,
  serializeCalibration,
} from './calibrate';

// Per-voice pace calibration (2026-07-12-per-voice-pace-calibration.md): fold the per-sentence
// ratio measured/predicted into a robust windowed-median scalar k, clamped, that scales the
// syllable estimate to a voice's true rate. The accumulator is pure + time-free.

const seed = (ratios: number[], est = 100) => {
  let s = emptyCalibration();
  for (const r of ratios) s = observe(s, est, est * r, 1);
  return s;
};

describe('rateScale — 1.0 until enough clean samples, then clamped windowed median', () => {
  it('stays exactly 1.0 below the minimum sample count', () => {
    const s = seed(Array(CALIBRATION_MIN_N - 1).fill(1.3));
    expect(rateScale(s)).toBe(1);
  });
  it('resolves to the median ratio once MIN_N samples land', () => {
    const s = seed(Array(CALIBRATION_MIN_N).fill(1.3));
    expect(rateScale(s)).toBeCloseTo(1.3, 5);
  });
  it('null/empty state is 1.0 (uncalibrated default)', () => {
    expect(rateScale(null)).toBe(1);
    expect(rateScale(emptyCalibration())).toBe(1);
  });
  it('clamps a fast voice up to MIN_K and a slow voice down to MAX_K', () => {
    expect(rateScale(seed(Array(CALIBRATION_MIN_N).fill(0.2)))).toBe(CALIBRATION_MIN_K);
    expect(rateScale(seed(Array(CALIBRATION_MIN_N).fill(4)))).toBe(CALIBRATION_MAX_K);
  });
});

describe('observe — robust to noise, windowed, immutable', () => {
  it('rejects unclean samples (non-finite, non-positive, out-of-band ratio) without changing state', () => {
    const base = seed(Array(CALIBRATION_MIN_N).fill(1.1));
    expect(observe(base, 0, 500).n).toBe(base.n); // estDur <= 0
    expect(observe(base, 100, 0).n).toBe(base.n); // measuredDur <= 0
    expect(observe(base, 100, Number.NaN).n).toBe(base.n); // non-finite
    expect(observe(base, 100, 100 * 100).n).toBe(base.n); // ratio 100 >> band → rejected
  });
  it('a single wild-but-in-band outlier cannot drag k far (median, not mean)', () => {
    // Nine samples at 1.0, one at 4.0 (in-band). Mean would jump; median stays ~1.0.
    const s = seed([1, 1, 1, 1, 4, 1, 1, 1, 1, 1]);
    expect(rateScale(s)).toBeCloseTo(1, 5);
  });
  it('does not mutate the input state', () => {
    const before = seed([1.2, 1.2]);
    const snapshot = JSON.parse(JSON.stringify(before));
    observe(before, 100, 130);
    expect(before).toEqual(snapshot);
  });
  it('windows to the most recent CALIBRATION_WINDOW samples but keeps the full count n', () => {
    const s = seed(Array(CALIBRATION_WINDOW + 10).fill(1.0));
    expect(s.samples.length).toBe(CALIBRATION_WINDOW);
    expect(s.n).toBe(CALIBRATION_WINDOW + 10);
  });
  it('tracks a rate change: recent samples win as the window slides', () => {
    // Start slow (1.4), then the voice speeds up (0.8) for a full window.
    let s = seed(Array(CALIBRATION_WINDOW).fill(1.4));
    expect(rateScale(s)).toBeCloseTo(1.4, 5);
    for (let i = 0; i < CALIBRATION_WINDOW; i++) s = observe(s, 100, 80, 2);
    expect(rateScale(s)).toBeCloseTo(0.8, 5);
  });
  it('records the caller-supplied timestamp only on an accepted sample', () => {
    const s0 = emptyCalibration();
    const s1 = observe(s0, 100, 120, 999);
    expect(s1.updatedAt).toBe(999);
    const s2 = observe(s1, 0, 120, 1234); // rejected — timestamp unchanged
    expect(s2.updatedAt).toBe(999);
  });
});

describe('serialize / deserialize — survives a round-trip and tolerates garbage', () => {
  it('round-trips a state', () => {
    const s = seed([1.1, 0.9, 1.2, 1.0, 1.05]);
    expect(deserializeCalibration(serializeCalibration(s))).toEqual(s);
  });
  it('malformed input degrades to an empty state, never throws', () => {
    expect(deserializeCalibration(null)).toEqual(emptyCalibration());
    expect(deserializeCalibration('nope')).toEqual(emptyCalibration());
    expect(deserializeCalibration({ samples: 'x', n: 'y' })).toEqual(emptyCalibration());
  });
  it('drops non-numeric samples and re-windows an over-long array', () => {
    const restored = deserializeCalibration({
      samples: [1, 'bad', 2, null, ...Array(CALIBRATION_WINDOW).fill(1)],
      n: 999,
    });
    expect(restored.samples.length).toBe(CALIBRATION_WINDOW);
    expect(restored.samples.every((x) => typeof x === 'number')).toBe(true);
    expect(restored.n).toBe(999);
  });
});
