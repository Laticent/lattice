// Cadenza — display → spoken normalization.
//
// A caption word carries TWO forms: what's DISPLAYED ("$4.2M", "Q3", "18.5%") and
// what's SPOKEN ("four point two million dollars", "Q three", "eighteen point five
// percent"). They diverge in length — one displayed token can be several spoken
// words — so timing (cadence.ts) is computed on the SPOKEN form while the caption
// renders the DISPLAY glyphs. This module maps one display token → its spoken form.
//
// Deterministic and pure. It never invents content: an unrecognized token passes
// through unchanged (its display IS its spoken form). No locale libs — a compact,
// dependency-free English expansion covering the boardroom cases (money, percent,
// plain numbers, a small abbreviation set).

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = ['', ' thousand', ' million', ' billion', ' trillion'];

const MAGNITUDE: Record<string, string> = { k: 'thousand', m: 'million', b: 'billion', t: 'trillion' };

// Spoken forms for common boardroom abbreviations. Keys are lowercased.
const ABBREV: Record<string, string> = {
  q1: 'Q one', q2: 'Q two', q3: 'Q three', q4: 'Q four',
  fy: 'fiscal year', yoy: 'year over year', qoq: 'quarter over quarter',
  eod: 'end of day', eoy: 'end of year', ceo: 'C E O', cfo: 'C F O', kpi: 'K P I',
  arr: 'A R R', mrr: 'M R R', saas: 'saas', roi: 'R O I',
};

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
 * Map one displayed token to its spoken form. Recognizes money ($4.2M, £3,200),
 * percentages (18.5%), plain numbers (1,024 / 3.5), and a small abbreviation set;
 * anything else passes through unchanged.
 */
export function toSpoken(display: string): string {
  const tok = String(display ?? '').trim();
  if (!tok) return '';

  // Preserve trailing sentence punctuation so cadence still sees the terminator.
  const punct = tok.match(/[.,!?;:…]+$/)?.[0] ?? '';
  const core = punct ? tok.slice(0, -punct.length) : tok;

  const spoken = spokenCore(core);
  return spoken + punct;
}

function spokenCore(core: string): string {
  if (!core) return core;
  const lower = core.toLowerCase();
  if (Object.hasOwn(ABBREV, lower)) return ABBREV[lower];

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

/** Count spoken sub-words in an expansion ("four point two million dollars" → 5). */
export function spokenWordCount(spoken: string): number {
  return String(spoken ?? '')
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean).length;
}
