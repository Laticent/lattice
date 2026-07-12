import { describe, expect, it } from 'vitest';
import { lookupLexicon } from './lexicon';
import { integerToWords, isEnglishLang, numberToWords, spokenWordCount, toSpoken, toSpokenText, unmatchedAcronyms } from './normalize';

// The locale guard (#919): Cadenza's say-as (lexicon, number-to-words, fiscal/period parser)
// is US-English, so a non-English deck bypasses it — the display token passes through — while
// the author's own `acronyms:` registry is honored in every language. English decks (absent or
// `en`/`en-*`) are byte-identical to today.
describe('isEnglishLang', () => {
	it('treats absent / empty / en / en-* as English (the default)', () => {
		for (const t of [undefined, '', 'en', 'EN', 'en-US', 'en-GB', ' En-us ']) expect(isEnglishLang(t)).toBe(true);
	});
	it('treats any other tag as non-English', () => {
		for (const t of ['fr', 'de', 'es', 'ja', 'fr-FR', 'zh-Hans', 'pt-BR']) expect(isEnglishLang(t)).toBe(false);
	});
});

describe('toSpoken — trailing-colon hard-stop softening (#904 live-narration regression)', () => {
	// A projected "label: value" caption ("components: 53") is voiced by Kokoro as just
	// "components" — the colon is a hard stop that drops the value. Soften a TRAILING
	// colon/semicolon to a comma in the SPOKEN form so the value is spoken; the DISPLAY
	// token keeps its colon (caption/.vtt glyphs are display-text).
	it('softens a trailing colon to a comma in the spoken form', () => {
		expect(toSpoken('components:')).toBe('components,');
		expect(toSpoken('revenue:')).toBe('revenue,');
		// A number-bearing label word keeps its say-as, colon softened.
		expect(toSpoken('Q3:')).toBe('third quarter,');
	});
	it('softens a trailing semicolon too', () => {
		expect(toSpoken('first;')).toBe('first,');
	});
	it('does NOT touch a mid-token colon (times, ratios) — only a TRAILING one', () => {
		expect(toSpoken('3:30')).toBe('3:30');
		expect(toSpoken('16:9')).toBe('16:9');
	});
	it('the display word is unchanged — only the SPOKEN form softens', () => {
		// toSpokenText joins spoken forms; the caller keeps the display token separately.
		expect(toSpokenText('components: 53')).toBe('components, fifty-three');
	});
});

describe('toSpoken — decorative separator glyphs read as a pause', () => {
	// A standalone interpunct / pipe / bullet has no good TTS reading; speak it as a comma
	// pause so an eyebrow like "Lattice · A guided tour" narrates naturally. Display unchanged.
	it('translates a standalone separator glyph to a comma', () => {
		for (const g of ['·', '|', '•', '∙', '‖', '・']) expect(toSpoken(g)).toBe(',');
	});
	it('reads a "·"/"|"-separated eyebrow with a pause, not a literal glyph', () => {
		expect(toSpokenText('Lattice · A guided tour')).toBe('Lattice , A guided tour');
		expect(toSpokenText('Board | Q3 2026')).toBe('Board , third quarter two thousand twenty-six');
	});
	it('leaves a separator glyph INSIDE a token alone (voice ids, URLs)', () => {
		expect(toSpoken('Heart·US')).toBe('Heart·US');
		expect(toSpoken('a|b')).toBe('a|b');
	});
	it('translates separators in every language (they read badly everywhere)', () => {
		expect(toSpoken('·', { lang: 'fr' })).toBe(',');
	});
});

describe('toSpoken — locale guard', () => {
	it('non-English deck: fiscal / percent / number tokens pass through unexpanded', () => {
		expect(toSpoken('FY26', { lang: 'fr' })).toBe('FY26');
		expect(toSpoken('40%', { lang: 'fr' })).toBe('40%');
		expect(toSpoken('1,024', { lang: 'de' })).toBe('1,024');
		expect(toSpoken('$4.2M', { lang: 'es' })).toBe('$4.2M');
	});
	it('English deck (absent or en) still expands — byte-identical to today', () => {
		expect(toSpoken('FY26')).toBe('fiscal year twenty-six');
		expect(toSpoken('FY26', { lang: 'en' })).toBe('fiscal year twenty-six');
		expect(toSpoken('FY26', { lang: 'en-US' })).toBe('fiscal year twenty-six');
		expect(toSpoken('40%', { lang: 'en' })).toBe('forty percent');
	});
	it('honors the author acronym registry even in a non-English deck (author owns it)', () => {
		const acronyms = new Map([['CRO', 'directeur des revenus']]);
		expect(toSpoken('CRO', { lang: 'fr', acronyms })).toBe('directeur des revenus');
		// …including a punctuation-adjacent token (peel + core lookup still runs).
		expect(toSpoken('CRO,', { lang: 'fr', acronyms })).toBe('directeur des revenus,');
	});
	it('toSpokenText applies the guard across a whole non-English sentence', () => {
		expect(toSpokenText('CA FY26 +40%', { lang: 'fr' })).toBe('CA FY26 +40%');
		expect(toSpokenText('CA FY26 +40%')).not.toBe('CA FY26 +40%'); // English expands it
	});
});

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

describe('unmatchedAcronyms (discovery signal, §16)', () => {
  it('flags multi-letter all-caps tokens NOTHING expands (would read letter-by-letter)', () => {
    // XYZ/ZZZ are unknown to the lexicon → passthrough → flagged.
    expect(unmatchedAcronyms('We track XYZ and ZZZ every week.')).toEqual(['XYZ', 'ZZZ']);
  });

  it('does NOT flag a token the built-in lexicon expands (it is spoken as words)', () => {
    // GTM → "go to market", KPI → "key performance indicator": expanded, so NOT flagged.
    expect(unmatchedAcronyms('Our GTM and KPI both improved.')).toEqual([]);
  });

  it('does NOT flag a token in the deck acronym registry (author already handled it)', () => {
    const acronyms = new Map([['XYZ', 'ex wye zee corp']]);
    expect(unmatchedAcronyms('We track XYZ and ZZZ.', { acronyms })).toEqual(['ZZZ']);
  });

  it('is edge-trim + case + length aware: skips lower/Mixed case, single letters, punctuation edges', () => {
    // `**XYZ**`/`(XYZ)` still register (edge-trimmed); `SaaS`/`A`/`api` do not.
    expect(unmatchedAcronyms('See **XYZ**, then (XYZ) again — plus SaaS, api, and A.')).toEqual(['XYZ']);
  });

  it('returns each token once, in first-seen order', () => {
    expect(unmatchedAcronyms('QQQ then PPP then QQQ again.')).toEqual(['QQQ', 'PPP']);
  });

  it('leaves digit-bearing shorthand to the fiscal/pattern layer (pure A–Z only)', () => {
    expect(unmatchedAcronyms('FY26 and 3PL and B2B are not flagged.')).toEqual([]);
  });

  it('edge-trims linearly on a token of many non-alphanumerics (no polynomial backtracking)', () => {
    // The old `[^A-Za-z0-9]+$` trailing strip was a CodeQL polynomial-ReDoS shape; the index-scan
    // edgeTrim must handle a long non-alnum run fast and correctly (yields nothing to flag here).
    const token = `${'/'.repeat(50000)}x${'/'.repeat(50000)}`;
    expect(unmatchedAcronyms(token)).toEqual([]); // trims to 'x' → not multi-letter all-caps
    // and a genuine acronym wrapped in a long slash run still registers, edge-trimmed:
    expect(unmatchedAcronyms(`${'/'.repeat(2000)}XYZ${'/'.repeat(2000)}`)).toEqual(['XYZ']);
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

  // COLLISION GUARD (§15) — the always-on dictionary holds ONLY unambiguous tokens.
  // Encodes the IT/US lesson and the CRO/CMO demotion as CI, so a future well-meaning
  // add of a word-collision or a bimodal acronym fails a test rather than a boardroom.
  it('author acronym registry beats the built-in dictionary AND the patterns', () => {
    const reg = new Map([
      ['CRO', 'conversion rate optimization'], // demoted term the author reclaims
      ['ARR', 'a r r'], // override an always-on expansion
      ['FY26', 'fiscal twenty-six the year of us'], // beats the fiscal parser
      ['ACME', 'ackme'], // a name (not an acronym) — pronunciation
    ]);
    expect(toSpoken('CRO', { acronyms: reg })).toBe('conversion rate optimization');
    expect(toSpoken('ARR', { acronyms: reg })).toBe('a r r');
    expect(toSpoken('FY26', { acronyms: reg })).toBe('fiscal twenty-six the year of us');
    expect(toSpoken('ACME', { acronyms: reg })).toBe('ackme');
    expect(toSpoken('CRO.', { acronyms: reg })).toBe('conversion rate optimization.'); // terminator kept
    // Case-sensitive, whole-token: lowercase and an unregistered token are untouched.
    expect(toSpoken('cro', { acronyms: reg })).toBe('cro');
    expect(toSpoken('KPI', { acronyms: reg })).toBe('key performance indicator'); // falls to built-in
    expect(toSpokenText('Our CRO owns FY26.', { acronyms: reg })).toBe(
      'Our conversion rate optimization owns fiscal twenty-six the year of us.',
    );
  });

  it('collision guard: no always-on key expands a common word or a bimodal acronym', () => {
    // Common English words (any case) must pass through untouched.
    for (const w of ['it', 'us', 'or', 'in', 'on', 'is', 'as', 'we', 'an', 'so', 'no', 'do', 'go', 'IT', 'US', 'OR', 'IP', 'AR']) {
      expect(toSpoken(w)).toBe(w);
    }
    // Sanity: an unambiguous acronym still expands (the guard didn't neuter the dictionary).
    expect(toSpoken('EBITDA')).toBe('ee bit dah');
    expect(toSpoken('COO')).toBe('chief operating officer'); // monosemic, kept
    expect(toSpoken('ARR')).toBe('annual recurring revenue');
  });

  // KNOWN-BIMODAL DENYLIST (§15) — the real enforcement of "unambiguous in a
  // SaaS/tech-growth boardroom": each token below flips meaning by industry (the
  // CRO/CMO class), so it must NEVER auto-expand — the author declares the meaning
  // via `acronyms:`. Re-adding any of these to always-on fails HERE, not in a
  // boardroom. (Also covers the word/name collisions IT/US/… as a superset.)
  it('collision guard: known cross-domain bimodal acronyms never auto-expand', () => {
    const KNOWN_BIMODAL = [
      'LTV', 'SMB', 'MFA', 'CAC', 'EPS', 'SAM', 'SOM', 'CRO', 'CMO', // demoted cross-domain
      'MSA', 'SOW', // rejected widening traps (Metropolitan Statistical Area; the verb "sow")
      'IT', 'US', 'IP', 'AR', 'OR', // word/name collisions
    ];
    for (const t of KNOWN_BIMODAL) {
      expect(toSpoken(t)).toBe(t); // passes through — no always-on entry claims it
    }
  });

  it('widening: safe product/legal terms expand; the "sow" trap does not', () => {
    expect(toSpoken('DAU')).toBe('daily active users');
    expect(toSpoken('SKU')).toBe('skew');
    expect(toSpoken('NDA')).toBe('non-disclosure agreement');
    expect(toSpoken('MAU')).toBe('monthly active users'); // cased
    expect(toSpoken('mau')).toBe('mau'); // the name "Mau" stays safe (cased key)
    expect(toSpokenText('reap what you sow')).toBe('reap what you sow'); // SOW never always-on
  });
});
