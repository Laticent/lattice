// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { MAX_INDEX_SPAN, readIndexList } from './index-list';

describe('readIndexList', () => {
  it('reads indices and ranges, either way round', () => {
    expect([...readIndexList('3-5 9')]).toEqual([3, 4, 5, 9]);
    expect([...readIndexList('5-3')]).toEqual([3, 4, 5]);
    expect([...readIndexList('  ')]).toEqual([]);
  });
  it('skips what it cannot read, and reports it when asked', () => {
    const invalid: string[] = [];
    expect([...readIndexList('2 x 4-y 7', invalid)]).toEqual([2, 7]);
    expect(invalid).toEqual(['x', '4-y']);
  });
  it('refuses a range wider than the span, rather than expanding it', () => {
    const invalid: string[] = [];
    expect(readIndexList(`1-${MAX_INDEX_SPAN + 1}`, invalid).size).toBe(0);
    expect(invalid).toEqual([`1-${MAX_INDEX_SPAN + 1}`]);
    expect(readIndexList(`1-${MAX_INDEX_SPAN}`).size).toBe(MAX_INDEX_SPAN);
  });
});
