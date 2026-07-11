import { describe, expect, it } from 'vitest';
import { lookupLexicon } from './lexicon';
import { integerToWords, numberToWords, spokenWordCount, toSpoken, toSpokenText } from './normalize';

describe('numberToWords', () => {
  it('reads integers with scale groups', () => {
    expect(integerToWords(0)).toBe('zero');
    expect(integerToWords(19)).toBe('nineteen');
    expect(integerToWords(42)).toBe('forty-two');
    expect(integerToWords(305)).toBe('three hundred five');
    expect(integerToWords(1024)).toBe('one thousand twenty-four');
    expect(integerToWords(4_200_000)).toBe('four million two hundred thousand');
  });

  it('reads decimals digit-by-digit after the point', () => {
    expect(numberToWords(4.2)).toBe('four point two');
    expect(numberToWords(18.5)).toBe('eighteen point five');
    expect(numberToWords(-3)).toBe('negative three');
  });
});

describe('toSpoken', () => {
  it('expands money with a magnitude suffix and keeps trailing punctuation', () => {
    expect(toSpoken('$4.2M')).toBe('four point two million dollars');
    expect(toSpoken('$4.2M.')).toBe('four point two million dollars.');
    expect(toSpoken('£3,200')).toBe('three thousand two hundred pounds');
  });

  it('expands percentages and bare magnitude numbers', () => {
    expect(toSpoken('18.5%')).toBe('eighteen point five percent');
    expect(toSpoken('4.2M')).toBe('four point two million');
    expect(toSpoken('1,024')).toBe('one thousand twenty-four');
  });

  it('maps known abbreviations and passes everything else through', () => {
    expect(toSpoken('Q3')).toBe('third quarter');
    expect(toSpoken('revenue')).toBe('revenue');
    expect(toSpoken('grew,')).toBe('grew,');
  });

  it('reframes signed deltas ONLY when a unit is present; a bare signed number is a plain sign', () => {
    expect(toSpoken('+9%')).toBe('up nine percent');
    expect(toSpoken('−18d')).toBe('down eighteen days'); // U+2212 minus + unit
    expect(toSpoken('-18d')).toBe('down eighteen days'); // ASCII minus behaves identically
    expect(toSpoken('+$180M')).toBe('up one hundred eighty million dollars');
    // Bare signed numbers are NOT deltas — a phone code / temperature, not up/down.
    expect(toSpoken('+44')).toBe('forty-four');
    expect(toSpoken('−40')).toBe('negative forty');
    expect(toSpoken('-2')).toBe('negative two');
    expect(toSpoken('+')).toBe('+'); // a lone sign never reframes
  });

  it('expands finance/units with singular/plural agreement', () => {
    expect(toSpoken('2pp')).toBe('two percentage points');
    expect(toSpoken('1pp')).toBe('one percentage point'); // singular
    expect(toSpoken('25bps')).toBe('twenty-five basis points');
    expect(toSpoken('4.2×')).toBe('four point two times'); // × U+00D7
    expect(toSpoken('4.2x')).toBe('four point two times');
    expect(toSpoken('18d')).toBe('eighteen days');
    expect(toSpoken('1d')).toBe('one day'); // singular
    expect(toSpoken('3D')).toBe('3D'); // capital D is NOT a duration
    expect(toSpoken('1990s')).toBe('1990s'); // a decade, NOT "seconds"
  });

  it('speaks section references, preserving every citation digit (trailing zeros)', () => {
    expect(toSpoken('§1798.140(o)')).toBe('section one thousand seven hundred ninety-eight point one four zero, subsection o');
    expect(toSpoken('§1798.100')).toBe('section one thousand seven hundred ninety-eight point one zero zero'); // zeros kept
    expect(toSpoken('§6501')).toBe('section six thousand five hundred one');
    expect(toSpoken('§101(a)(5)')).toBe('section one hundred one, subsection a, subsection five');
  });

  it('drops decorative middot separators instead of speaking them', () => {
    expect(toSpoken('·')).toBe('');
    expect(toSpokenText('Financial · Q3')).toBe('Financial  third quarter'); // the · drops to nothing
  });

  it('opts in domain packs only when asked, and threads domains through toSpokenText', () => {
    expect(toSpoken('v.')).toBe('v.'); // no domain → passthrough
    expect(toSpoken('v.', { domains: ['legal'] })).toBe('versus');
    expect(toSpoken('CCPA', { domains: ['legal'] })).toBe('C C P A');
    expect(toSpoken('saas')).toBe('sass'); // BASE, always on
    expect(toSpoken('saas.')).toBe('sass.'); // a real terminator on a non-abbreviation is kept
    expect(toSpoken('h2')).toBe('h2'); // lowercase → NOT "second half" (heading/chemistry safe)
    expect(toSpoken('H2')).toBe('second half'); // UPPERCASE half reads via the case-sensitive pattern
    expect(toSpokenText('Under §1798.140 the CCPA applies.', { domains: ['legal'] })).toBe(
      'Under section one thousand seven hundred ninety-eight point one four zero the C C P A applies.',
    );
  });

  it('lookupLexicon: BASE always on, domain packs opt-in', () => {
    expect(lookupLexicon('§')).toBe('section');
    expect(lookupLexicon('v.')).toBeNull();
    expect(lookupLexicon('v.', ['legal'])).toBe('versus');
    expect(lookupLexicon('__proto__')).toBeNull(); // prototype-safe
  });

  it('display and spoken diverge in word count (the normalization gap)', () => {
    // One displayed token → five spoken words: exactly why timing rides `spoken`.
    expect(spokenWordCount(toSpoken('$4.2M'))).toBe(5);
    expect(spokenWordCount(toSpoken('up'))).toBe(1);
  });
});

describe('toSpokenText', () => {
  it('expands every token in a passage, leaving plain words alone', () => {
    expect(toSpokenText('Revenue grew to $4.2M this quarter, up 18.5% from Q3.')).toBe(
      'Revenue grew to four point two million dollars this quarter, up eighteen point five percent from third quarter.',
    );
  });

  it('is a no-op on prose with no figures', () => {
    expect(toSpokenText('That is the fastest growth in our history.')).toBe(
      'That is the fastest growth in our history.',
    );
  });

  it('collapses whitespace to single spaces (via splitWords)', () => {
    expect(toSpokenText('  beat   plan  ')).toBe('beat plan');
  });
});

describe('fiscal / calendar period shorthand (§14)', () => {
  it('reads FY/CY with a year — the motivating "F Y 26" fix', () => {
    expect(toSpoken('FY26')).toBe('fiscal year twenty-six'); // short year, no century inference
    expect(toSpoken('FY2026')).toBe('fiscal year two thousand twenty-six');
    expect(toSpoken("FY'26")).toBe('fiscal year twenty-six'); // apostrophe absorbed
    expect(toSpoken('CY24')).toBe('calendar year twenty-four');
    expect(toSpoken('FY26.')).toBe('fiscal year twenty-six.'); // terminator preserved
  });

  it('reads leading-zero years as years, not a dropped-zero cardinal', () => {
    expect(toSpoken('FY05')).toBe('fiscal year oh five'); // NOT "fiscal year five"
    expect(toSpoken('FY09')).toBe('fiscal year oh nine');
    expect(toSpoken('FY00')).toBe('fiscal year two thousand');
    expect(toSpoken('4Q08')).toBe('fourth quarter fiscal oh eight');
  });

  it('reads quarters and halves as ordinals, with or without a year', () => {
    expect(toSpoken('Q3')).toBe('third quarter'); // bare, via the lexicon
    expect(toSpoken('4Q24')).toBe('fourth quarter fiscal twenty-four');
    expect(toSpoken('3Q')).toBe('third quarter');
    expect(toSpoken("Q3'26")).toBe('third quarter fiscal twenty-six');
    expect(toSpoken('H1')).toBe('first half');
    expect(toSpoken('2H')).toBe('second half');
    expect(toSpoken('1H26')).toBe('first half fiscal twenty-six');
  });

  it('is case-sensitive — lowercase prose and formulae are never mistaken for periods', () => {
    expect(toSpoken('fy26')).toBe('fy26'); // lowercase → untouched
    expect(toSpoken('h2')).toBe('h2');
    expect(toSpoken('H2O')).toBe('H2O'); // anchored $ stops the half pattern
    expect(toSpoken('5Q')).toBe('5Q'); // no 5th quarter
    expect(toSpoken('Q324')).toBe('Q324'); // Q-first year needs the apostrophe (Q3'24)
  });

  it('flows through a sentence', () => {
    expect(toSpokenText('Bookings up in Q3 FY26 versus 1H25.')).toBe(
      'Bookings up in third quarter fiscal year twenty-six versus first half fiscal twenty-five.',
    );
  });
});

describe('say-as lexicon — expand / word / spell (§14)', () => {
  it('expands everyday initialisms to words (the house default)', () => {
    expect(toSpoken('ARR')).toBe('annual recurring revenue');
    expect(toSpoken('KPI')).toBe('key performance indicator');
    expect(toSpoken('API')).toBe('application programming interface');
    expect(toSpoken('CEO')).toBe('chief executive officer');
    expect(toSpoken('EPS')).toBe('earnings per share');
    expect(toSpoken('YTD')).toBe('year to date');
    expect(toSpoken('R&D')).toBe('research and development');
    expect(toSpoken('P&L')).toBe('profit and loss');
  });

  it('says lexicalized acronyms as words, not spelled or expanded', () => {
    expect(toSpoken('EBITDA')).toBe('ee bit dah');
    expect(toSpoken('CAGR')).toBe('cagger');
    expect(toSpoken('GAAP')).toBe('gap');
    expect(toSpoken('SaaS')).toBe('sass');
  });

  it('BASE_CASED: expands an uppercase acronym but never the lowercase word', () => {
    expect(toSpoken('COGS')).toBe('cost of goods sold');
    expect(toSpoken('cogs')).toBe('cogs'); // the machine part
    expect(toSpoken('TAM')).toBe('total addressable market');
    expect(toSpoken('MoM')).toBe('month over month');
    expect(toSpoken('CY')).toBe('calendar year');
    expect(toSpoken('Cy')).toBe('Cy'); // the name, untouched (cy is NOT in lowercased BASE)
    expect(toSpoken('cy')).toBe('cy');
  });

  it('does NOT expand common words in the all-caps register of titles/eyebrows/CTAs', () => {
    // The cased tier still fires in all-caps, so IT/US (common words there) are OUT.
    expect(toSpokenText('ABOUT US')).toBe('ABOUT US');
    expect(toSpokenText('WHY IT MATTERS')).toBe('WHY IT MATTERS');
    expect(toSpoken('IT')).toBe('IT');
    expect(toSpoken('US')).toBe('US');
  });
});
