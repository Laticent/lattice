import { describe, expect, it } from 'vitest';
import { splitParagraphs, splitSentences, splitWords } from './segment';

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

describe('splitParagraphs', () => {
  it('has NO paragraph boundary for single-paragraph text (identical to splitSentences)', () => {
    const t = 'Revenue grew. We beat plan.';
    const { sentences, paragraphEnd } = splitParagraphs(t);
    expect(sentences).toEqual(splitSentences(t));
    expect(paragraphEnd.size).toBe(0);
  });

  it('marks the sentence BEFORE a blank line as a paragraph end', () => {
    const { sentences, paragraphEnd } = splitParagraphs('Alpha. Beta.\n\nGamma. Delta.');
    expect(sentences).toEqual(['Alpha.', 'Beta.', 'Gamma.', 'Delta.']);
    expect([...paragraphEnd]).toEqual([1]); // beat AFTER "Beta." (index 1)
  });

  it('handles several paragraphs, marking each non-final boundary', () => {
    const { sentences, paragraphEnd } = splitParagraphs('One.\n\nTwo. Three.\n\nFour.');
    expect(sentences).toEqual(['One.', 'Two.', 'Three.', 'Four.']);
    expect([...paragraphEnd].sort((a, b) => a - b)).toEqual([0, 2]); // after "One." and after "Three."
  });

  it('does NOT break a paragraph that ends without a terminator — it MERGES, matching splitSentences', () => {
    // A blank line mid-sentence (a terminator-less block / hand-wrapped note) must not desync the
    // cue↔clip mapping: the sentence list stays identical to the whitespace-collapsing splitter.
    const t = 'A run-on tail\n\nthat continues. Then a real end.';
    const { sentences, paragraphEnd } = splitParagraphs(t);
    expect(sentences).toEqual(splitSentences(t)); // ['A run-on tail that continues.', 'Then a real end.']
    expect(paragraphEnd.size).toBe(0); // the blank line fell mid-sentence → no beat
  });

  it('honors a CRLF blank line as a paragraph boundary (Windows-authored notes)', () => {
    const { sentences, paragraphEnd } = splitParagraphs('First para.\r\n\r\nSecond para.');
    expect(sentences).toEqual(['First para.', 'Second para.']);
    expect([...paragraphEnd]).toEqual([0]);
  });

  it('does NOT flag the final cue when a blank line merely TRAILS the text', () => {
    const { sentences, paragraphEnd } = splitParagraphs('Hello. World.\n\n');
    expect(sentences).toEqual(['Hello.', 'World.']);
    expect(paragraphEnd.size).toBe(0); // a beat "after the last cue" is meaningless
  });

  it('the sentence list ALWAYS equals splitSentences (cue↔clip alignment invariant)', () => {
    const cases = [
      'Solo sentence.',
      'A.\n\nB.\n\nC.',
      'No terminator here\n\nso it merges. Done.',
      'Trailing blank lines.\n\n\n\nSecond para.',
      'Mixed. Two here.\n\nOne there. And more.',
      '  Leading space.\n\n  Indented para.  ',
    ];
    for (const t of cases) {
      expect(splitParagraphs(t).sentences, t).toEqual(splitSentences(t));
    }
  });
});

describe('splitWords', () => {
  it('splits on whitespace and drops blanks', () => {
    expect(splitWords('We beat plan by eight points.')).toEqual([
      'We', 'beat', 'plan', 'by', 'eight', 'points.',
    ]);
  });
});
