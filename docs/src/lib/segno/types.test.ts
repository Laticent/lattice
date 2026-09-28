// @vitest-environment node
// One number reader and one time reader for every chart. They must read exactly what the
// shipped kernels read today (lib/core/chart-values.js, lib/core/gantt-time.js) — a migration
// that changes what `1,25M` means would be the bug this library exists to remove.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readNumber, readTime } from './types';

const require = createRequire(import.meta.url);
const chartValues = require('../../../../lib/core/chart-values.js');
const ganttTime = require('../../../../lib/core/gantt-time.js');

const NUMBERS = [
  '42', '-1.2', '12%', '$4.2M', '-$0.8M', '$-0.8M', '\u22121.2M', '($1.2M)', '+12M', '1,25M', '1.234.567', '1,234.5',
  '900.000', '12k', '1.2bn', '4 beds', 'PROJ-42', '2024', '0.5k', '€3', '\u20305', '5\u2030', '(5)', '5)', '1e5', '--5', '$$$5',
  '', ' ', 'abc', '12kg', '1,2,3', '.5', '5.', '((5))',
];
const TIMES = ['2026-03-15', '2026-13-01', '2026-02-30', 'Q1', 'q4', '2026 Q1', '2026Q2', 'Jan', 'Sept', 'September', '2026 Jan', 'Marketing', '2026-03', 'Q5', ' Q2 ', ''];

describe('readNumber agrees with chart-values.js', () => {
  for (const s of NUMBERS) {
    it(JSON.stringify(s), () => {
      const want = chartValues.isValuePill(s) ? chartValues.signedValue(s) : null;
      const got = readNumber(s);
      if (want === null || !Number.isFinite(want.value)) expect(got).toBeUndefined();
      else expect({ value: got?.value, signed: got?.signed }).toEqual({ value: want.value, signed: want.signed });
    });
  }
  it('reads the unit that is left after the magnitude letter', () => {
    expect(readNumber('12%')?.unit).toBe('%');
    expect(readNumber('$1.2M')?.unit).toBe('');
    expect(readNumber('12kg')?.unit).toBe('kg');
  });
});

describe('readTime agrees with gantt-time.js', () => {
  for (const s of TIMES) {
    it(JSON.stringify(s), () => {
      const want = ganttTime.parseTimePoint(s);
      expect(readTime(s) ?? null).toEqual(want);
    });
  }
});

describe('readNumber on hostile input', () => {
  it('a long run of tabs is rejected in linear time (CodeQL: polynomial regex)', () => {
    const s = `1${'\t'.repeat(50_000)}x!`;
    const t = performance.now();
    expect(readNumber(s)).toBeUndefined();
    expect(performance.now() - t).toBeLessThan(50); // the old pattern took ~2.8 s here
  });
});
