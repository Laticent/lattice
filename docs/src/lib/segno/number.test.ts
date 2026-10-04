// @vitest-environment node
// `@laticent/segno/number` is the number reader alone: the SAME function the main entry exports,
// so a consumer that takes the small entry reads exactly what the `number()` type reads.
import { describe, expect, it } from 'vitest';
import { readNumber as fromIndex } from './index';
import { readNumber as fromNumber } from './number';

describe('the number entry', () => {
  it('re-exports the main entry\'s reader, not a copy', () => {
    expect(fromNumber).toBe(fromIndex);
  });
  it('reads what the number type reads', () => {
    expect(fromNumber('1,25M')?.value).toBe(1250000);
    expect(fromNumber('($1.2M)')).toEqual({ value: -1200000, signed: true, unit: '' });
    expect(fromNumber('0..10')).toBeUndefined();
  });
});
