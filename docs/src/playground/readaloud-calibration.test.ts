import { beforeEach, describe, expect, it } from 'vitest';
import { CALIBRATION_MIN_N } from '@/lib/cadenza/index';
import {
  calibratedRateScale,
  loadCalibration,
  onCalibrationChange,
  recordObservation,
  resetCalibration,
  voiceKeyOf,
} from './readaloud-calibration';

// The per-voice localStorage side of pace calibration. The pure accumulator is covered by
// cadenza's calibrate.test.ts; this pins the persistence + keying + change signal.

beforeEach(() => {
  localStorage.clear();
});

describe('voiceKeyOf — a stable, storage-safe key per voice', () => {
  it('normalizes label punctuation/case and floors to "unknown"', () => {
    expect(voiceKeyOf('hexgrad/kokoro-82m · af_heart')).toBe('hexgrad-kokoro-82m-af-heart');
    expect(voiceKeyOf('Kokoro · AF_Heart')).toBe('kokoro-af-heart');
    expect(voiceKeyOf('')).toBe('unknown');
    expect(voiceKeyOf(null)).toBe('unknown');
  });
});

describe('recordObservation — accumulates + persists per voice', () => {
  it('folds clean samples and exposes the fit once MIN_N land', () => {
    const key = 'kokoro-af-heart';
    for (let i = 0; i < CALIBRATION_MIN_N - 1; i++) recordObservation(key, 100, 130, 1);
    expect(calibratedRateScale(key)).toBe(1); // below the threshold
    recordObservation(key, 100, 130, 1);
    expect(calibratedRateScale(key)).toBeCloseTo(1.3, 5);
    expect(loadCalibration(key).n).toBe(CALIBRATION_MIN_N);
  });

  it('keeps voices independent', () => {
    for (let i = 0; i < CALIBRATION_MIN_N; i++) recordObservation('voice-a', 100, 140, 1);
    for (let i = 0; i < CALIBRATION_MIN_N; i++) recordObservation('voice-b', 100, 80, 1);
    expect(calibratedRateScale('voice-a')).toBeCloseTo(1.4, 5);
    expect(calibratedRateScale('voice-b')).toBeCloseTo(0.8, 5);
  });

  it('survives a reload (round-trips through localStorage)', () => {
    for (let i = 0; i < CALIBRATION_MIN_N; i++) recordObservation('v', 100, 120, 1);
    // A fresh read (no in-memory state) still sees the persisted fit.
    expect(calibratedRateScale('v')).toBeCloseTo(1.2, 5);
    expect(loadCalibration('v').n).toBe(CALIBRATION_MIN_N);
  });
});

describe('resetCalibration', () => {
  it('clears one voice, leaving others', () => {
    for (let i = 0; i < CALIBRATION_MIN_N; i++) recordObservation('a', 100, 130, 1);
    for (let i = 0; i < CALIBRATION_MIN_N; i++) recordObservation('b', 100, 130, 1);
    resetCalibration('a');
    expect(loadCalibration('a').n).toBe(0);
    expect(loadCalibration('b').n).toBe(CALIBRATION_MIN_N);
  });
  it('clears ALL voices when no key is given', () => {
    for (let i = 0; i < CALIBRATION_MIN_N; i++) recordObservation('a', 100, 130, 1);
    for (let i = 0; i < CALIBRATION_MIN_N; i++) recordObservation('b', 100, 130, 1);
    resetCalibration();
    expect(loadCalibration('a').n).toBe(0);
    expect(loadCalibration('b').n).toBe(0);
  });
});

describe('onCalibrationChange', () => {
  it('fires on record and on reset, and unsubscribes cleanly', () => {
    const seen: string[] = [];
    const off = onCalibrationChange((k) => seen.push(k));
    recordObservation('v', 100, 120, 1);
    resetCalibration('v');
    off();
    recordObservation('v', 100, 120, 1); // no longer observed
    expect(seen).toEqual(['v', 'v']);
  });
});
