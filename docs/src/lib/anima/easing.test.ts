import { describe, expect, it } from 'vitest';
import { clamp01, EASINGS, ease } from './easing';

describe('ease', () => {
  it('every curve maps 0→0 and 1→1 and clamps out-of-range input', () => {
    for (const name of EASINGS) {
      expect(ease(name, 0)).toBeCloseTo(0, 6);
      expect(ease(name, 1)).toBeCloseTo(1, 6);
      expect(ease(name, -1)).toBeCloseTo(0, 6);
      expect(ease(name, 2)).toBeCloseTo(1, 6);
    }
  });

  it('every curve is monotonic non-decreasing', () => {
    for (const name of EASINGS) {
      let prev = Number.NEGATIVE_INFINITY;
      for (let i = 0; i <= 20; i++) {
        const v = ease(name, i / 20);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it('ease-in-out is continuous at the midpoint (both branches → 0.5)', () => {
    expect(ease('ease-in-out', 0.5)).toBeCloseTo(0.5, 6);
  });

  it('ease-in lags and ease-out leads at the midpoint; linear is exact', () => {
    expect(ease('ease-in', 0.5)).toBeLessThan(0.5);
    expect(ease('ease-out', 0.5)).toBeGreaterThan(0.5);
    expect(ease('linear', 0.5)).toBeCloseTo(0.5, 6);
  });

  it('an off-union name falls back to linear (robust public surface)', () => {
    expect(ease('bogus' as never, 0.3)).toBeCloseTo(0.3, 6);
  });

  it('clamp01 bounds to [0,1]', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(0.3)).toBe(0.3);
  });
});
