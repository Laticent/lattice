// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
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

  // The corpus the retired voice-model parity test carried (2026-09-21). It pinned the
  // two implementations equal to each other, which said nothing about either being
  // RIGHT; these assert the values.
  it('keeps a mid-token dot intact — decimals, multipliers, currency', () => {
    expect(splitSentences('Revenue grew to $4.2M this quarter, up 18.5% from Q3. That is our best.')).toEqual([
      'Revenue grew to $4.2M this quarter, up 18.5% from Q3.',
      'That is our best.',
    ]);
    expect(splitSentences('We shipped 3.5x faster. Margins held at 30%.')).toEqual([
      'We shipped 3.5x faster.',
      'Margins held at 30%.',
    ]);
    expect(splitSentences('Revenue grew to $4.2M.')).toEqual(['Revenue grew to $4.2M.']);
  });
});

// ── The over-split ───────────────────────────────────────────────────────────
// Each case below is a MEASURED defect from
// engineering/decisions/2026-09-20-narration-audit.md § Finding 3, quoted from the
// deck or the shipped .vtt it was found in — not from a model of the input.
describe('splitSentences: an abbreviation period is not a sentence end', () => {
  it('does not strand a title — the "Doctor." full-stop-then-silence case', () => {
    expect(splitSentences('Dr. Chen approved it.')).toEqual(['Dr. Chen approved it.']);
  });

  it('does not strand an initialism mid-sentence', () => {
    expect(splitSentences('The U.S. market is flat. Europe grew.')).toEqual([
      'The U.S. market is flat.',
      'Europe grew.',
    ]);
  });

  it('folds a RUN of abbreviations back into one cue (gallery.vtt shipped Cal. and Civ. as cues)', () => {
    expect(splitSentences('Cal. Civ. Code §1798.140(o) is the definition.')).toEqual([
      'Cal. Civ. Code §1798.140(o) is the definition.',
    ]);
  });

  it('merges a corporate suffix before a lowercase continuation, and keeps a real break', () => {
    expect(splitSentences('Acme Inc. beat plan. Done?')).toEqual(['Acme Inc. beat plan.', 'Done?']);
    // The mirror: a capital after the suffix IS a new sentence, so it must still break.
    expect(splitSentences('A subsidiary of Acme Inc. Revenue grew.')).toEqual([
      'A subsidiary of Acme Inc.',
      'Revenue grew.',
    ]);
  });

  it('grades a month by what FOLLOWS it — a digit continues the date, a capital starts a sentence', () => {
    expect(splitSentences('We close Sept. 20 this year.')).toEqual(['We close Sept. 20 this year.']);
    expect(splitSentences('We ship in Sept. Then we rest.')).toEqual(['We ship in Sept.', 'Then we rest.']);
  });

  it('merges the latin connectives, which introduce rather than close', () => {
    expect(splitSentences('Use a token, e.g. --brand-500, not a hex.')).toEqual([
      'Use a token, e.g. --brand-500, not a hex.',
    ]);
  });

  // REGRESSION GUARD, from examples/system-design-foundations.md. `No.` and `Art.` label
  // a number, but "no" and "art" are also ordinary English words. A first draft put both
  // in ABBREV_ALWAYS and these two real sentences collapsed into their neighbors — the
  // over-split's mirror, and the worse of the two. Grading them by a following digit is
  // what keeps "No. 4" whole without swallowing "She said no."
  it('does not swallow a sentence ending in a word that is ALSO an abbreviation', () => {
    expect(splitSentences('See No. 4 for the detail.')).toEqual(['See No. 4 for the detail.']);
    expect(splitSentences('GDPR Art. 5(1)(e) applies.')).toEqual(['GDPR Art. 5(1)(e) applies.']);
    expect(splitSentences('She said no. That refusal is the boundary.')).toEqual([
      'She said no.',
      'That refusal is the boundary.',
    ]);
    expect(splitSentences('No. Thirty tables is not a size.')).toEqual([
      'No.',
      'Thirty tables is not a size.',
    ]);
    expect(splitSentences('The result is art. Then we shipped it.')).toEqual([
      'The result is art.',
      'Then we shipped it.',
    ]);
  });

  it('joins a two-part code name across its ampersand', () => {
    // examples/cover-paginate.md, verbatim.
    expect(splitSentences('Bus. & Com. §503.001 · CUBI')).toEqual(['Bus. & Com. §503.001 · CUBI']);
  });

  // Both lines below come from examples/reflow-legal.md, the deck the before/after .vtt
  // was measured on. On `main` "Federal: 15 U.S.C." was its own cue and the section
  // number started the next one.
  it('keeps a statutory citation whole — a code abbreviation precedes its section', () => {
    expect(splitSentences('Federal: 15 U.S.C. §6501 · COPPA.')).toEqual([
      'Federal: 15 U.S.C. §6501 · COPPA.',
    ]);
    expect(splitSentences('The rule is 16 C.F.R. Part 312 today.')).toEqual([
      'The rule is 16 C.F.R. Part 312 today.',
    ]);
  });

  it('treats a section symbol as a continuation for an UNLISTED initialism too', () => {
    // `r.s.a` is in no list; the § is the whole signal that the citation continues.
    expect(splitSentences('See R.S.A. §358-A:2 for the claim.')).toEqual([
      'See R.S.A. §358-A:2 for the claim.',
    ]);
    // The mirror — without the §, and with a capital following, it is a real break.
    expect(splitSentences('He works in D.C. Revenue grew.')).toEqual([
      'He works in D.C.',
      'Revenue grew.',
    ]);
  });

  // KNOWN LIMIT, asserted so it is a decision rather than a surprise. One initialism
  // directly followed by another is undecidable from the shape alone — "He lives in
  // N.H. R.S.A. governs…" reads both ways — so the break stands. It costs an extra cue
  // on a two-abbreviation citation; guessing would cost a merged pair of real sentences,
  // which is the worse error.
  it('leaves an initialism followed by another initialism split', () => {
    expect(splitSentences('See N.H. R.S.A. §358-A:2 for the claim.')).toEqual([
      'See N.H.',
      'R.S.A. §358-A:2 for the claim.',
    ]);
  });

  it('still breaks on ! and ? and … after an abbreviation-shaped word — only a PERIOD is ambiguous', () => {
    expect(splitSentences('Ask Dr? Chen knows.')).toEqual(['Ask Dr?', 'Chen knows.']);
  });

  // MUTATION GUARD. Delete the ABBREV_ALWAYS lookup and the first case below passes
  // anyway unless something asserts the UNMERGED shape is wrong; delete the whole
  // merge and these fail. An ordinary sentence must never be swallowed.
  it('does NOT merge an ordinary sentence break', () => {
    expect(splitSentences('Revenue grew. We beat plan.')).toEqual(['Revenue grew.', 'We beat plan.']);
    expect(splitSentences('It shipped. it shipped again.')).toEqual(['It shipped.', 'it shipped again.']);
    expect(splitSentences('Costs fell 12%. margin held.')).toEqual(['Costs fell 12%.', 'margin held.']);
    // A single initial is NOT an abbreviation here — "A." ending a list item must break.
    expect(splitSentences('A. B. C.')).toEqual(['A.', 'B.', 'C.']);
    // A filename-shaped token only merges into a lowercase continuation, never a capital.
    expect(splitSentences('Edit config.js. The build then runs.')).toEqual([
      'Edit config.js.',
      'The build then runs.',
    ]);
  });
});

// ── Punctuation that cannot open a sentence ──────────────────────────────────
// The closing-quote break above created these: a quoted phrase mid-sentence, followed
// by an em-dash aside, used to be one cue because the quote hid the period. Breaking
// on the quote is right; stranding the aside as its own cue is not. Measured on six
// shipped decks (diagram-narration, sequence-narration, typed-diagram-narration,
// xychart-narration, gallery-jargon, seven-steps-problem-to-code).
describe('splitSentences: a fragment cannot start with punctuation that never opens a sentence', () => {
  it('keeps an em-dash aside with the sentence it interrupts', () => {
    // examples/diagram-narration.md, verbatim.
    expect(splitSentences('The reading opens with the shape — "A diamond." — then fan-in coalesces.')).toEqual([
      'The reading opens with the shape — "A diamond." — then fan-in coalesces.',
    ]);
    // examples/seven-steps-problem-to-code.md, verbatim (curly quotes, en dash absent).
    expect(splitSentences('“…write your algorithm first.” — a Coursera learner')).toEqual([
      '“…write your algorithm first.” — a Coursera learner',
    ]);
  });

  it('keeps a range separator whole — gantt spells a span with two periods', () => {
    // examples/data-viz-gallery.md and eight other shipped decks, verbatim. This one
    // broke on `main` too; it is fixed here because it is the same function.
    expect(splitSentences('2026 Q1 .. 2026 Q4 today Q3')).toEqual(['2026 Q1 .. 2026 Q4 today Q3']);
    // THREE periods are left alone — an authored ellipsis can end a sentence.
    expect(splitSentences('He trailed off... Then he spoke.')).toEqual([
      'He trailed off...',
      'Then he spoke.',
    ]);
    // …and a single period is still a terminator, obviously.
    expect(splitSentences('It shipped. Then we left.')).toEqual(['It shipped.', 'Then we left.']);
  });

  it('keeps a closing bracket with what it closes', () => {
    expect(splitSentences('A tone marker (tone-pass / …) sets a color.')).toEqual([
      'A tone marker (tone-pass / …) sets a color.',
    ]);
  });

  it('does NOT swallow a real sentence that merely follows a quoted one', () => {
    // The under-split fix must survive this rule: a capital letter still opens a cue.
    expect(splitSentences('Setup was "3–4 weeks." It took 11.')).toEqual([
      'Setup was "3–4 weeks."',
      'It took 11.',
    ]);
    // A hyphen is NOT a continuation — a signed number opens a sentence.
    expect(splitSentences('Costs fell. -18% was the swing.')).toEqual([
      'Costs fell.',
      '-18% was the swing.',
    ]);
  });
});

// ── The under-split (the mirror defect) ──────────────────────────────────────
describe('splitSentences: a terminator inside a closing quote still ends the sentence', () => {
  it('breaks quoted dialogue into two cues instead of one run-on clip', () => {
    expect(splitSentences('He said "Go now." Then he left.')).toEqual([
      'He said "Go now."',
      'Then he left.',
    ]);
  });

  it('handles the curly quote, the guillemet and a closing bracket', () => {
    expect(splitSentences('She said “Ship it.” We shipped.')).toEqual([
      'She said “Ship it.”',
      'We shipped.',
    ]);
    expect(splitSentences('(See the note below.) Revenue grew.')).toEqual([
      '(See the note below.)',
      'Revenue grew.',
    ]);
  });

  it('does not break on a quote that is not preceded by a terminator', () => {
    expect(splitSentences('He called it "flat" last quarter.')).toEqual([
      'He called it "flat" last quarter.',
    ]);
  });

  it('peels the closer before reading the abbreviation, so the two rules compose', () => {
    expect(splitSentences('The filing named "Acme Inc." before the merger closed.')).toEqual([
      'The filing named "Acme Inc." before the merger closed.',
    ]);
    // These three are what the peel ALONE buys. Above, and in every quoted case in the
    // under-split block, a lowercase continuation would have merged them anyway via the
    // ENDS_CLOSED arm; here the continuation is capitalized or a digit, so the only thing
    // that can recognize the abbreviation is peeling the quote off before the lookup.
    // (Mutation-checked: without the peel these three split and nothing else does.)
    expect(splitSentences('The memo named "Dr." Chen as the approver.')).toEqual([
      'The memo named "Dr." Chen as the approver.',
    ]);
    expect(splitSentences('Filed under "No." 4 of the schedule.')).toEqual([
      'Filed under "No." 4 of the schedule.',
    ]);
    expect(splitSentences('The clause cited (Cal.) Civ. Code as controlling.')).toEqual([
      'The clause cited (Cal.) Civ. Code as controlling.',
    ]);
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

  // A paragraph that ENDS on an abbreviation is the one place the two functions can
  // disagree: splitParagraphs decides its own break from `endsClean`, while
  // splitSentences sees the blank line collapsed to a space and folds the abbreviation
  // back. Without the abbreviation half of `endsClean` this passes as one cue in the
  // single-string splitter and TWO cues here — a cue↔clip desync, which is a silently
  // wrong caption highlight rather than a test failure. (Mutation-checked: dropping
  // that half of the condition fails only this test.)
  it('does NOT break a paragraph that ends on an abbreviation', () => {
    const t = 'A subsidiary of Acme Inc.\n\nbeat plan last year.';
    const { sentences, paragraphEnd } = splitParagraphs(t);
    expect(sentences).toEqual(splitSentences(t)); // ['A subsidiary of Acme Inc. beat plan last year.']
    expect(sentences).toEqual(['A subsidiary of Acme Inc. beat plan last year.']);
    expect(paragraphEnd.size).toBe(0); // the blank line fell mid-sentence → no beat
  });

  it('the sentence list ALWAYS equals splitSentences (cue↔clip alignment invariant)', () => {
    const cases = [
      'Solo sentence.',
      'A.\n\nB.\n\nC.',
      'No terminator here\n\nso it merges. Done.',
      'Trailing blank lines.\n\n\n\nSecond para.',
      'Mixed. Two here.\n\nOne there. And more.',
      '  Leading space.\n\n  Indented para.  ',
      'Signed by Dr.\n\nChen on Sept.\n\n20.',      // abbreviation straddling a blank line
      'He said "Go now."\n\nThen he left.',           // a closer straddling a blank line
      'Filed under No.\n\n4 of the schedule.',
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
