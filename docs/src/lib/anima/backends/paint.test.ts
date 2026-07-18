// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { resolveColor, withAlpha } from './paint';

describe('withAlpha', () => {
  it('applies alpha to rgb() / rgba()', () => {
    expect(withAlpha('rgb(255, 128, 0)', 0.5)).toBe('rgba(255, 128, 0, 0.5)');
    expect(withAlpha('rgba(10, 20, 30, 0.9)', 0.25)).toBe('rgba(10, 20, 30, 0.25)');
  });
  it('applies alpha to #rgb and #rrggbb', () => {
    expect(withAlpha('#f80', 0.5)).toBe('rgba(255, 136, 0, 0.5)');
    expect(withAlpha('#ff8800', 0.5)).toBe('rgba(255, 136, 0, 0.5)');
  });
  it('alpha >= 1 is a no-op (returns the colour unchanged)', () => {
    expect(withAlpha('rgb(1, 2, 3)', 1)).toBe('rgb(1, 2, 3)');
    expect(withAlpha('#abc', 2)).toBe('#abc');
  });
  it('clamps a negative alpha to 0', () => {
    expect(withAlpha('rgb(1,2,3)', -1)).toBe('rgba(1, 2, 3, 0)');
  });
  it('leaves an unparseable colour unchanged (no NaN corruption)', () => {
    // A format normalization (resolveColor→rgb) is what makes withAlpha total in practice.
    expect(withAlpha('not-a-color', 0.5)).toBe('not-a-color');
  });
});

describe('resolveColor', () => {
  it('falls back deterministically when a token cannot resolve (no live cascade in jsdom)', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const out = resolveColor('var(--nope)', host, '#123456');
    expect(typeof out).toBe('string');
    expect(out.length).toBeGreaterThan(0);
  });
  it('returns the fallback for an empty input', () => {
    const host = document.createElement('div');
    expect(resolveColor(undefined, host, '#654321')).toBe('#654321');
  });
});
