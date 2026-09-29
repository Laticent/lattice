// @vitest-environment node
// One number reader and one time reader for every chart. They must read exactly what the
// shipped kernels read today (lib/core/chart-values.js, lib/core/gantt-time.js) — a migration
// that changes what `1,25M` means would be the bug this library exists to remove.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { readNumber, readNumberFast, readNumberFull, readTime } from './types';

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

describe('readNumber fast path = the full reader', () => {
  it('agrees on 300,000 fuzzed tokens', () => {
    const A = ['(', ')', '+', '-', '−', '$', '€', '£', '¥', '1', '2', '0', '9', '.', ',', '%', '‰', 'k', 'M', 'B', 'b', 'n', 'T', 'g', 'x', ' ', '#'];
    let seed = 11;
    const rnd = (m: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % m; };
    let differ = 0;
    for (let k = 0; k < 300_000; k++) {
      let s = '';
      const len = 1 + rnd(8);
      for (let j = 0; j < len; j++) s += A[rnd(A.length)];
      const a = readNumber(s);
      const b = readNumberFull(s.trim());
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        differ++;
        if (differ < 5) expect({ s, a }).toEqual({ s, a: b });
      }
    }
    expect(differ).toBe(0);
  });
  it('the shapes decks write read the same both ways', () => {
    for (const s of ['5', '12.5', '$1.2M', '-$0.8M', '$-0.8M', '(12M)', '($1.2M)', '(-5)', '--5', '62%', '140kg', '5M)', '(5M', '+12.0M', '−12M', '3bn', '1e5', '007'])
      expect(readNumber(s), s).toEqual(readNumberFull(s));
  });
});

// A seeded generator, so a failure reproduces from its seed.
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };

describe('readNumber fast path is really taken', () => {
  it('every shape decks write takes the single-pass reader, not the fallback', () => {
    for (const s of ['5', '12.5', '$1.2M', '-$0.8M', '$-0.8M', '62%', '(12M)', '($1.2M)', '140kg', '+12M', '\u221212M', '3bn', '0.5k'])
      expect(readNumberFast(s), s).not.toBeNull();
  });
  it('and hands the shapes it does not handle to the full reader', () => {
    for (const s of ['1,25M', '1.234.567', '4 beds', '$ 5']) expect(readNumberFast(s), s).toBeNull();
  });
});

describe('readNumber and readTime agree with the kernels on fuzzed input', () => {
  it('readNumber = chart-values.js on 100,000 fuzzed tokens', () => {
    const A = ['(', ')', '+', '-', '\u2212', '$', '\u20ac', '1', '2', '0', '9', '.', ',', '%', '\u2030', 'k', 'M', 'B', 'b', 'n', 'T', 'g', 'x', ' ', '#'];
    const r = rng(101);
    const bad: string[] = [];
    for (let k = 0; k < 100_000 && bad.length < 5; k++) {
      let s = '';
      const len = 1 + Math.floor(r() * 8);
      for (let j = 0; j < len; j++) s += A[Math.floor(r() * A.length)];
      if (s.includes('..')) continue; // `..` is a range in Segno and never a number
      const want = chartValues.isValuePill(s) ? chartValues.signedValue(s) : null;
      const got = readNumber(s);
      const same = want === null || !Number.isFinite(want.value) ? got === undefined : got !== undefined && Object.is(got.value, want.value) && got.signed === want.signed;
      if (!same) bad.push(`${JSON.stringify(s)}: kernel ${JSON.stringify(want)}, segno ${JSON.stringify(got)}`);
    }
    expect(bad).toEqual([]);
  });
  it('readTime = gantt-time.js on 50,000 fuzzed tokens', () => {
    const PARTS = ['2026', '2025', '-', '01', '02', '13', '30', '31', '15', ' ', 'Q', 'q', '1', '4', '5', 'Jan', 'jan', 'Sept', 'September', 'Dec', 'x'];
    const r = rng(202);
    const bad: string[] = [];
    for (let k = 0; k < 50_000 && bad.length < 5; k++) {
      let s = '';
      const len = 1 + Math.floor(r() * 5);
      for (let j = 0; j < len; j++) s += PARTS[Math.floor(r() * PARTS.length)];
      const want = ganttTime.parseTimePoint(s);
      const got = readTime(s) ?? null;
      if (JSON.stringify(want) !== JSON.stringify(got)) bad.push(`${JSON.stringify(s)}: kernel ${JSON.stringify(want)}, segno ${JSON.stringify(got)}`);
    }
    expect(bad).toEqual([]);
  });
});
