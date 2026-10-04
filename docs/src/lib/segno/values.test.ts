// @vitest-environment node
// `@laticent/segno/values` is the value readers alone: the SAME functions the main entry exports,
// so a consumer that takes the small entry reads exactly what the `number()` and `time()` types read.
import { describe, expect, it } from 'vitest';
import { readNumber as fromIndex, readTime as timeFromIndex } from './index';
import { readNumber as fromNumber, readTime } from './values';

describe('the values entry', () => {
  it('re-exports the main entry\'s readers, not copies', () => {
    expect(fromNumber).toBe(fromIndex);
    expect(readTime).toBe(timeFromIndex);
  });
  it('reads what the number type reads', () => {
    expect(fromNumber('1,25M')?.value).toBe(1250000);
    expect(fromNumber('($1.2M)')).toEqual({ value: -1200000, signed: true, unit: '' });
    expect(fromNumber('0..10')).toBeUndefined();
  });
  it('reads what the time type reads', () => {
    expect(readTime('2026 Q3')).toEqual({ kind: 'q', year: 2026, idx: 2 });
    expect(readTime('2026-13-01')).toBeUndefined();
  });
});
