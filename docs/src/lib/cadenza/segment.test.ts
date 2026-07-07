import { describe, expect, it } from 'vitest';
import { splitSentences, splitWords } from './segment';

describe('splitSentences', () => {
  it('breaks at terminators and collapses whitespace', () => {
    expect(splitSentences('Revenue grew.  That is our best quarter!')).toEqual([
      'Revenue grew.',
      'That is our best quarter!',
    ]);
    expect(splitSentences('One\n\ntwo three')).toEqual(['One two three']);
  });

  it('keeps a trailing fragment with no terminator', () => {
    expect(splitSentences('A finished one. And an unfinished one')).toEqual([
      'A finished one.',
      'And an unfinished one',
    ]);
  });

  it('is empty for blank input', () => {
    expect(splitSentences('')).toEqual([]);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('splitWords', () => {
  it('splits on whitespace and drops blanks', () => {
    expect(splitWords('We beat plan by eight points.')).toEqual([
      'We', 'beat', 'plan', 'by', 'eight', 'points.',
    ]);
  });
});
