// Cadenza — display → spoken normalization.
//
// A caption word carries TWO forms: what's DISPLAYED ("$4.2M", "Q3", "18.5%") and
// what's SPOKEN ("four point two million dollars", "third quarter", "eighteen point
// five percent"). They diverge in length — one displayed token can be several spoken
// words — so timing (cadence.ts) is computed on the SPOKEN form while the caption
// renders the DISPLAY glyphs. This module maps one display token → its spoken form.
//
// Deterministic and pure. It never invents content: an unrecognized token passes
// through unchanged (its display IS its spoken form). No locale libs — a compact,
// dependency-free English expansion covering the boardroom cases (money, percent,
// plain numbers, a small abbreviation set).

import { type LexDomain, lookupLexicon } from './lexicon';
import { splitWords } from './segment';

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', ' thousand', ' million', ' billion', ' trillion'];

const MAGNITUDE: Record<string, string> = { k: 'thousand', m: 'million', b: 'billion', t: 'trillion' };

/** Read an integer 0..999 as words. */
function tripletToWords(n: number): string {
  let out = '';
  if (n >= 100) {
    out += `${ONES[Math.floor(n / 100)]} hundred`;
    n %= 100;
    if (n) out += ' ';
  }
  if (n >= 20) {
    out += TENS[Math.floor(n / 10)];
    if (n % 10) out += `-${ONES[n % 10]}`;
  } else if (n > 0) {
    out += ONES[n];
  }
  return out;
}

/** Read a non-negative integer as words (up to trillions). */
export function integerToWords(n: number): string {
  if (!Number.isFinite(n) || n < 0) return String(n);
  if (n === 0) return 'zero';
  const groups: number[] = [];
  let x = Math.floor(n);
  while (x > 0) {
    groups.push(x % 1000);
    x = Math.floor(x / 1000);
  }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(tripletToWords(groups[i]) + SCALES[i]);
  }
  return parts.join(' ');
}

/** Read a number (possibly decimal) as words: 4.2 → "four point two". */
export function numberToWords(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  const neg = value < 0;
  const abs = Math.abs(value);
  const [intPart, decPart] = String(abs).split('.');
  let out = integerToWords(Number(intPart));
  if (decPart) {
    out += ' point ' + decPart.split('').map((d) => ONES[Number(d)]).join(' ');
  }
  return (neg ? 'negative ' : '') + out;
}

/**
 * Read a citation/reference number preserving EVERY digit — the fraction is read
 * from the raw string, digit by digit, so `§1798.100` keeps its trailing zeros
 * ("… point one zero zero") instead of collapsing to `.1`. `numberToWords` can't
 * do this: it coerces through `Number()`, which drops trailing decimal zeros and
 * would speak a different, wrong statute subsection.
 */
function citationNumber(str: string): string {
  const [intPart, decPart] = String(str).split('.');
  let out = integerToWords(Number(intPart.replace(/,/g, '')));
  if (decPart !== undefined) {
    out += ' point ' + decPart.split('').map((d) => ONES[Number(d)] ?? d).join(' ');
  }
  return out;
}

/** "N unit(s)" with singular/plural agreement on the numeric value (1 → singular). */
function unitWords(numStr: string, singular: string): string {
  const n = Number(numStr.replace(/,/g, ''));
  return `${numberToWords(n)} ${singular}${n === 1 ? '' : 's'}`;
}

const ORDINALS = ['', 'first', 'second', 'third', 'fourth'];

/**
 * Read a fiscal/calendar year figure — a two-digit `26` stays "twenty-six" (no century
 * inference: the house choice is the short year, §14); a leading-zero pair reads as a
 * year, not a bare cardinal (`05`→"oh five", `00`→"two thousand" — `Number("05")`
 * would drop the zero and speak "five", wrong for FY2005/FY2009); a four-digit `2026`
 * reads "two thousand twenty-six". Never a spelled "two six".
 */
function yearWords(digits: string): string {
  if (digits.length === 2 && digits[0] === '0') {
    return digits === '00' ? 'two thousand' : `oh ${ONES[Number(digits[1])]}`;
  }
  return numberToWords(Number(digits));
}

/**
 * Map one displayed token to its spoken form. Recognizes money ($4.2M, £3,200),
 * percentages (18.5%), signed deltas (+9% → "up nine percent"), units
 * (2pp, 25bps, 4.2×, 18d), section refs (§1798.140(o)), plain numbers (1,024 /
 * 3.5), and the lexicon (abbreviations/symbols/initialisms); anything else passes
 * through unchanged. `opts.domains` opts in domain lexicon packs (legal/finance)
 * for tokens that only resolve inside a domain (e.g. legal `v.` → "versus").
 */
/**
 * A deck's author-supplied acronym registry: display token → spoken expansion, already
 * parsed from `acronyms:` front-matter (lib/core/resolve-captions). Consulted BEFORE the
 * built-in dictionary and every derivational pattern, so the author always wins — a
 * whole-token, case-sensitive match, the same shape the built-in lexicon uses.
 */
export type AcronymRegistry = ReadonlyMap<string, string>;

export interface SpokenOpts {
  domains?: readonly LexDomain[];
  acronyms?: AcronymRegistry;
}

export function toSpoken(display: string, opts: SpokenOpts = {}): string {
  const tok = String(display ?? '').trim();
  if (!tok) return '';
  const domains = opts.domains ?? [];
  const acronyms = opts.acronyms;

  // Author registry FIRST — the whole token, before anything else (a deck's `CRO` wins
  // over the built-in dictionary AND over the fiscal parser).
  if (acronyms?.has(tok)) return acronyms.get(tok) as string;

  // Whole-token lexicon next, before peeling punctuation — so a period-bearing
  // abbreviation (`v.`, `art.`, `U.S.C.`) matches its key rather than losing the
  // period to the terminator peel. The abbreviation's own period is part of it,
  // not a sentence end, and its spoken form ("versus") carries no terminator.
  const whole = lookupLexicon(tok, domains);
  if (whole !== null) return whole;

  // Preserve trailing sentence punctuation so cadence still sees the terminator.
  const punct = tok.match(/[.,!?;:…]+$/)?.[0] ?? '';
  const core = punct ? tok.slice(0, -punct.length) : tok;

  return spokenCore(core, domains, acronyms) + punct;
}

function spokenCore(core: string, domains: readonly LexDomain[], acronyms?: AcronymRegistry): string {
  if (!core) return core;

  // 0. Author registry (case-sensitive whole token) — beats the built-in dictionary and
  //    every pattern below, so a deck owns its own vocabulary.
  if (acronyms?.has(core)) return acronyms.get(core) as string;

  // 1. Lexicon (whole-token abbreviations, symbols, initialisms).
  const lex = lookupLexicon(core, domains);
  if (lex !== null) return lex;

  // 1b. Fiscal / calendar period shorthand carrying a year or a leading quarter/half
  //     digit (bare Q1–Q4 come through the lexicon above). CASE-SENSITIVE on the
  //     UPPERCASE letters, so lowercase prose and formulae never fire: `H2` → "second
  //     half" but `h2`/`H2O` are untouched (the anchored `$` also stops `H2O`). An
  //     optional apostrophe (`FY'26`) is absorbed; the year reads literally (§14).
  //       FY26 / FY2026 / CY24 → "fiscal|calendar year <year>"
  //       4Q24 / 3Q / Q3'26   → "<ordinal> quarter[ fiscal <year>]"
  //       1H26 / 2H / H1      → "<ordinal> half[ fiscal <year>]"
  const fyear = core.match(/^(FY|CY)['’]?(\d{2}|\d{4})$/);
  if (fyear) return `${fyear[1] === 'FY' ? 'fiscal' : 'calendar'} year ${yearWords(fyear[2])}`;
  const nQ = core.match(/^([1-4])Q['’]?(\d{2}|\d{4})?$/);
  if (nQ) return `${ORDINALS[Number(nQ[1])]} quarter${nQ[2] ? ` fiscal ${yearWords(nQ[2])}` : ''}`;
  // Q-first WITH a year requires the apostrophe (`Q3'26`) — a bare `Q324` is not a
  // period (the digit-first `4Q24` form and bare `Q3` cover the rest), so it stays put.
  const qY = core.match(/^Q([1-4])['’](\d{2}|\d{4})$/);
  if (qY) return `${ORDINALS[Number(qY[1])]} quarter fiscal ${yearWords(qY[2])}`;
  const nH = core.match(/^([12])H['’]?(\d{2}|\d{4})?$/);
  if (nH) return `${ORDINALS[Number(nH[1])]} half${nH[2] ? ` fiscal ${yearWords(nH[2])}` : ''}`;
  const hN = core.match(/^H([12])$/);
  if (hN) return `${ORDINALS[Number(hN[1])]} half`;

  // 2. Signed prefix. Before a DELTA-BEARING value (%, pp, bps, ×, day, currency,
  //    magnitude) a '+'/'−'(U+2212)/'-' reads as "up"/"down"; before a BARE number
  //    it is a plain sign ("negative two"), NOT a delta — a bare "+44"/"−40" is a
  //    phone code / temperature, not a rise/fall. Both minus glyphs (ASCII '-' and
  //    typographic '−') behave identically, so visually-indistinguishable source
  //    never narrates two different ways.
  const sign = core.match(/^([+−-])(.+)$/);
  if (sign) {
    const rest = sign[2];
    if (/^[\d,]+(?:\.\d+)?$/.test(rest)) {
      const n = numberToWords(Number(rest.replace(/,/g, '')));
      return sign[1] === '+' ? n : `negative ${n}`;
    }
    const restSpoken = spokenCore(rest, domains, acronyms);
    if (restSpoken !== rest) return `${sign[1] === '+' ? 'up' : 'down'} ${restSpoken}`;
  }

  // 3. Section reference: "§1798.140(o)" → "section … subsection o". The citation
  //    number preserves every digit (§1798.100 keeps its trailing zeros) — it is
  //    NOT routed through numberToWords/Number(), which would drop them and speak a
  //    different, wrong section. A digit-GROUPED reading ("seventeen ninety-eight")
  //    is a logged refinement; the subsection markers (a)/(1)/(B) are all read
  //    "subsection X".
  const section = core.match(/^(§+)\s*(.*)$/);
  if (section) {
    const word = section[1].length > 1 ? 'sections' : 'section';
    const subs = [...section[2].matchAll(/\(([a-z0-9]+)\)/gi)].map((m) => m[1]);
    const base = section[2].replace(/\([a-z0-9]+\)/gi, '').trim();
    const baseSpoken = /^[\d,]+(?:\.\d+)?$/.test(base) ? citationNumber(base) : spokenCore(base, domains, acronyms);
    let out = base ? `${word} ${baseSpoken}` : word;
    for (const s of subs) out += `, subsection ${spokenCore(s, domains, acronyms)}`;
    return out;
  }

  // Money: optional currency symbol, grouped number, optional magnitude suffix.
  const money = core.match(/^([$£€])([\d,]+(?:\.\d+)?)([kmbt])?$/i);
  if (money) {
    const unit = money[1] === '$' ? 'dollars' : money[1] === '£' ? 'pounds' : 'euros';
    const num = numberToWords(Number(money[2].replace(/,/g, '')));
    const mag = money[3] ? ` ${MAGNITUDE[money[3].toLowerCase()]}` : '';
    return `${num}${mag} ${unit}`;
  }

  // Percent.
  const pct = core.match(/^([\d,]+(?:\.\d+)?)%$/);
  if (pct) return `${numberToWords(Number(pct[1].replace(/,/g, '')))} percent`;

  // Percentage points / basis points (finance deltas: 2pp, 25bps). Singular when
  // the value is exactly 1 ("1pp" → "one percentage point").
  const pp = core.match(/^([\d,]+(?:\.\d+)?)pp$/i);
  if (pp) return unitWords(pp[1], 'percentage point');
  const bps = core.match(/^([\d,]+(?:\.\d+)?)bps$/i);
  if (bps) return unitWords(bps[1], 'basis point');

  // Multiplier: "4.2×" / "4.2x" → "four point two times".
  const mult = core.match(/^([\d,]+(?:\.\d+)?)\s*[×x]$/);
  if (mult) return unitWords(mult[1], 'time');

  // Duration: "18d" → "eighteen days". Lower-case `d` only (so "3D" is untouched),
  // and NOT seconds — "1990s"/"90s" read as decades/plurals far more often than
  // "seconds", so that mapping is deliberately omitted (logged refinement).
  const dur = core.match(/^([\d,]+(?:\.\d+)?)d$/);
  if (dur) return unitWords(dur[1], 'day');

  // Bare number with a magnitude suffix (4.2M → "four point two million").
  const magNum = core.match(/^([\d,]+(?:\.\d+)?)([kmbt])$/i);
  if (magNum) {
    return `${numberToWords(Number(magNum[1].replace(/,/g, '')))} ${MAGNITUDE[magNum[2].toLowerCase()]}`;
  }

  // Plain number (with optional grouping commas).
  const num = core.match(/^-?[\d,]+(?:\.\d+)?$/);
  if (num) return numberToWords(Number(core.replace(/,/g, '')));

  return core;
}

/**
 * Expand every token in a passage to its spoken form — the whole-sentence version of
 * `toSpoken`, for feeding a TTS the words to SAY rather than the glyphs to show
 * ("Revenue grew to $4.2M." → "Revenue grew to four point two million dollars.").
 * A caller that speaks raw display text gets the TTS's own (often wrong) number
 * parsing; this gives it Cadenza's instead. `opts.domains` opts in domain lexicon
 * packs. Pure.
 */
export function toSpokenText(text: string, opts: SpokenOpts = {}): string {
  return splitWords(text)
    .map((w) => toSpoken(w, opts))
    .join(' ');
}

/** Count spoken sub-words in an expansion ("four point two million dollars" → 5). */
export function spokenWordCount(spoken: string): number {
  return String(spoken ?? '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean).length;
}

/**
 * The multi-letter ALL-CAPS tokens in `text` that pass through `toSpoken` UNCHANGED —
 * i.e. neither the author registry (`opts.acronyms`) nor the built-in lexicon expands
 * them, so a TTS spells them letter-by-letter (`ROI` → "arr oh eye"). This is the
 * discovery signal behind the deck lint's "did you mean to add these to `acronyms:`?"
 * hint. Each token is edge-trimmed of non-alphanumerics (so `**ROI**`, `(API)` still
 * register), tested as a pure A–Z run of length ≥ 2 (digit-bearing shorthand like `FY26`
 * is left to the fiscal parser), and returned unique in first-seen order. Pure.
 */
export function unmatchedAcronyms(text: string, opts: SpokenOpts = {}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of splitWords(text)) {
    const tok = raw.replace(/^[^A-Za-z0-9]+/, '').replace(/[^A-Za-z0-9]+$/, '');
    if (!/^[A-Z]{2,}$/.test(tok) || seen.has(tok)) continue; // multi-letter all-caps, once each
    seen.add(tok);
    if (toSpoken(tok, opts) === tok) out.push(tok); // passthrough ⇒ expanded by nothing
  }
  return out;
}
