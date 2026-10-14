/**
 * Value types: what a bare word or a quoted string MEANS once a slot asks for it.
 *
 * A type is `{ cls, read }`. `read(text, quoted)` returns the value, or `undefined` when the
 * spelling is not this type's. `cls` is the type's PRECEDENCE CLASS, which is how a bare
 * word finds its parameter without the engine guessing: a slot binds a word to the one
 * parameter in the highest class that accepts it, and a schema in which two parameters of
 * the same class could both accept one word does not build (schema.ts).
 *
 *   vocab  — declared words: enum values, their aliases, flags, indexed slots like c1…c12
 *   id     — `#api`
 *   number — `42` `-$0.8M` `12%` `($1.2M)` `1,25M`
 *   time   — `2026-03-15` `2026 Q1` `Q3` `Jan`
 *   range  — `0..10` `Q1..Q3`
 *   text   — anything, and the ONLY class a quoted string can land in
 *
 * The number and time readers are for numbers and dates as PEOPLE write them, not as a
 * programming language does: four sign spellings, the accounting parenthesis `($1.2M)`, European
 * separators `1.234,5`, a magnitude letter `k` `M` `B`, a unit, and quarters and months as well as
 * dates. The rules were settled in Lattice's chart readers after real slides broke them, and a
 * parity test in this folder holds the two identical.
 */

export type Cls = 'vocab' | 'id' | 'number' | 'time' | 'range' | 'text';
const BUILT_IN = new WeakSet<object>();
/** Mark a type as one of Segno's own: its `read` only looks at the text it is given. */
function own<T extends object>(t: T): T {
  // Frozen, so a caller cannot swap in a `read` that parses and keep the mark.
  Object.freeze(t);
  BUILT_IN.add(t);
  return t;
}
/**
 * Is this one of Segno's own types (a `range` or `named` only if what it wraps is)? Their `read`
 * never parses a span, so a slot may read them while it walks the parser's reused buffer
 * (schema.ts, the fast read). A caller's own type may do anything, so it is not asked there. A
 * copy of a built-in (`{ ...text(), read }`) is not marked, which is the point.
 */
/** @internal */
export const isBuiltIn = (t: object): boolean => BUILT_IN.has(t);

export const CLASS_ORDER: readonly Cls[] = ['vocab', 'id', 'number', 'time', 'range', 'text'];

export interface Type<T> {
  readonly cls: Cls;
  /** A short name for messages and docs: "a number", "one of tag, pill". */
  readonly describe: string;
  /** The words this type claims, lower-cased (vocab class only), for the ambiguity check. */
  readonly words?: readonly string[];
  /** The value, or undefined when this spelling is not this type's. */
  read(text: string, quoted: boolean): T | undefined;
  /** For vocab types: the canonical spelling a word resolves to (for per-document consistency). */
  canonical?(text: string): string | undefined;
  /** Only ever bound by `name=value`, never by a bare word (see `named`). */
  readonly namedOnly?: boolean;
  /**
   * For a word this type does NOT take but plainly meant to (`c13` where colors stop at `c12`),
   * the message that names why; undefined otherwise. The binder asks before falling back to
   * "not anything this record takes", so the author is told the limit, not the vocabulary.
   */
  near?(text: string): string | undefined;
}

/**
 * A parameter that must be written `name=value`. Use it when two parameters share a type —
 * journey's `mood=4` and `volume=120` are both numbers, so a bare `4` could be either, and the
 * schema would not build. Named-only parameters take no part in bare-word binding.
 */
export function named<T>(t: Type<T>): Type<T> {
  const n = { ...t, namedOnly: true, describe: `${t.describe}, written name=value` };
  return isBuiltIn(t) ? own(n) : n;
}

/** Any text. Quoted text is only ever this type. */
export const text = (): Type<string> => own({
  cls: 'text',
  describe: 'text',
  read: (s) => s,
});

export interface EnumOptions {
  /** Extra spellings per value: `{ done: ['yes', 'pass'] }`. */
  readonly aliases?: Readonly<Record<string, readonly string[]>>;
}

/** One of a closed set of words, case-insensitive, with optional aliases. */
/** A word an author can type bare: not starting or ending with space, and none of `, = { } [ ] " |`. */
const TYPEABLE = /^[^,={}[\]"|\s](?:[^,={}[\]"|]*[^,={}[\]"|\s])?$/;

export function oneOf<const V extends string>(values: readonly V[], options: EnumOptions = {}): Type<V> {
  const map = new Map<string, V>();
  const claim = (word: string, v: V) => {
    // A word must be typeable bare: no separator, no quote, no bracket, no edge space.
    if (!TYPEABLE.test(word)) throw new Error(`segno: "${word}" cannot be written as a bare word — it holds a separator, quote, bracket or edge space`);
    const k = word.toLowerCase();
    const had = map.get(k);
    if (had !== undefined && had !== v) throw new Error(`segno: "${word}" is an alias of both "${had}" and "${v}"`);
    map.set(k, v);
  };
  for (const v of values) claim(v, v);
  for (const [v, alts] of Object.entries(options.aliases ?? {})) {
    if (!values.includes(v as V)) throw new Error(`segno: alias target "${v}" is not one of ${values.join(', ')}`);
    for (const a of alts) claim(a, v as V);
  }
  return own({
    cls: 'vocab',
    describe: `one of ${values.join(', ')}`,
    words: [...map.keys()],
    read: (s, quoted) => (quoted ? undefined : map.get(s.toLowerCase())),
    canonical: (s) => map.get(s.toLowerCase()),
  });
}

/** A declared word that switches something on: `milestone`, `total`, `dashed`. */
export function flag(word: string, options: { aliases?: readonly string[] } = {}): Type<true> {
  const words = [word, ...(options.aliases ?? [])].map((w) => w.toLowerCase());
  for (const w of words) if (!TYPEABLE.test(w)) throw new Error(`segno: "${w}" cannot be written as a bare word — it holds a separator, quote, bracket or edge space`);
  return own({
    cls: 'vocab',
    describe: `"${word}"`,
    words,
    read: (s, quoted) => (!quoted && words.includes(s.toLowerCase()) ? true : undefined),
    canonical: (s) => (words.includes(s.toLowerCase()) ? word : undefined),
  });
}

/**
 * An indexed slot: a prefix and a number, `c1`…`c12` or `s1`…`s5`, as a palette names its colors or
 * a scale its steps. The ceiling is the SLOT's, so `c9` where 8 are allowed is an error that names
 * the limit. Case-insensitive; no leading zero (`c04` is not `c4`). Lattice's color slots are
 * `indexed('c', { max: 12, label: 'a color' })`.
 */
/** The largest `max` an indexed slot takes. */
export const MAX_INDEXED = 1000;

export function indexed(prefix: string, options: { max: number; label?: string }): Type<number> {
  if (!/^[a-z]+$/i.test(prefix)) throw new Error(`segno: an indexed prefix is letters only, not "${prefix}"`);
  // The ceiling is a vocabulary: every word is precomputed for the lookup table and the
  // ambiguity check, so it is capped where that stays cheap (a billion would allocate a billion).
  if (!Number.isInteger(options.max) || options.max < 1 || options.max > MAX_INDEXED) throw new Error(`segno: an indexed max is a whole number from 1 to ${MAX_INDEXED}, not ${options.max}`);
  const p = prefix.toLowerCase();
  const { max } = options;
  const words = Array.from({ length: max }, (_, i) => `${p}${i + 1}`);
  const range = `${p}1–${p}${max}`;
  return own({
    cls: 'vocab',
    describe: options.label ? `${options.label} ${range}` : range,
    words,
    read: (s, quoted) => {
      if (quoted || s.length <= p.length || s.slice(0, p.length).toLowerCase() !== p) return undefined;
      let n = 0;
      for (let i = p.length; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 48 || c > 57 || (i === p.length && c === 48)) return undefined;
        n = n * 10 + (c - 48);
        if (n > max) return undefined;
      }
      return n;
    },
    canonical: (s) => s.toLowerCase(),
    near: (s) => {
      if (s.length <= p.length || s.slice(0, p.length).toLowerCase() !== p || !/^[1-9]\d*$/.test(s.slice(p.length))) return undefined;
      return `"${s}" is past the limit — this takes ${range}`;
    },
  });
}

/** An id: `#api`. Lower-case letters, digits and hyphens, starting with a letter or digit. */
export const id = (): Type<string> => own({
  cls: 'id',
  describe: 'an id like #api',
  read: (s, quoted) => {
    if (quoted) return undefined;
    const m = /^#([a-z0-9][a-z0-9-]{0,39})$/i.exec(s);
    return m ? m[1].toLowerCase() : undefined;
  },
});

// ── numbers ────────────────────────────────────────────────────────────────

export interface NumberValue {
  readonly value: number;
  /** A sign was written: `+12M`, `-12M`, `\u221212M` (U+2212) or `(12M)`. */
  readonly signed: boolean;
  /** The unit as typed: `%`, `\u2030`, `kg`, or '' — after the magnitude letter is applied. */
  readonly unit: string;
}

const MAGNITUDE: Readonly<Record<string, number>> = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9, T: 1e12 };
// A WHOLLY numeric pill, in one of three shapes: `(…)` around an unsigned number, the accounting
// negative; one sign before an optional symbol prefix (`-$0.8M`); or one sign after it (`$-0.8M`).
// The symbol prefix is up to three characters that are not a sign, a parenthesis or a separator
// (`$`, `€`, `~`). The digits are one well-formed number: US groups (`1,234.5`), EU groups
// (`1.234,5`), one decimal point or comma (`12.5`, `1,25`), or a bare fraction (`.5`). Then an
// optional unit (`%`, U+2030, or one to six letters). The same language as chart-values.js's
// pattern, written so no two `\s*` runs are separated only by an optional piece: there, a failing
// match on a long run of tabs tried every way to split it, and 20,000 tabs took 420 ms.
//
// The older, looser pattern let a typo become a different number with no warning: `--5` read -5,
// `(5` and `5)` read 5, `1,2,3` read 1.2 with the unit `.3`, and `1.2.3.4x` read 1234
// (followups.d/2609-p2). Those are not numbers now; `malformedNumber` says why, and lint names it.
// A dash (U+2010 to U+2015, the small and fullwidth hyphen-minus U+FE58, U+FE63, U+FF0D) is not a symbol: `\u20135`
// read as +5 with the dash taken for a currency. It is refused, and `malformedNumber` says so.
const SYM = '[^\\w\\s+\\-\\u2212\\u2010-\\u2015\\ufe58\\ufe63\\uff0d().,]';
const CORE = '(?:\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?|\\.\\d+)';
const TAIL = '\\s*(?:(?:%|\\u2030|[A-Za-z]{1,6})\\s*)?';
export const NUMERIC = new RegExp(
  `^(?:\\(\\s*(?:${SYM}{1,3}\\s*)?${CORE}${TAIL}\\)|[+\\-\\u2212]?\\s*(?:${SYM}{1,3}\\s*)?${CORE}${TAIL}|${SYM}{1,3}\\s*[+\\-\\u2212]${CORE}${TAIL})$`,
);
// The older pattern: what LOOKS like an attempt at a number. A string it accepts and NUMERIC does
// not is a malformed number, which a chart must not read as prose with a figure in it.
export const NUMBER_SHAPED = /^[(+\-\u2212]?\s*(?:[^\w\s]{1,3}\s*)?[-\u2212]?\d[\d,.]*\s*(?:(?:%|\u2030|[A-Za-z]{1,6})\s*)?\)?$/;

// A European number: dot-grouped thousands, then ONE decimal comma, as the whole string (`1.234,5`,
// `€1.234.567,89M`, `(1.234,5)`). Only this shape swaps the two separators. Anything looser keeps
// the US reading, so prose the lenient fallback scans (`grew 3.5%, margin 12%`) is not multiplied.
const EU_NUMBER = /^[^\d,.]*\d{1,3}(?:\.\d{3})+,\d+[^\d,.]*$/;

// ISO 80000-1 digit grouping: a whole number whose thousands are separated by single spaces
// (`12 000`, `1 234,5`, `€12 000k`), a no-break, narrow no-break or thin space as well. The spaces
// are removed before anything else reads the number, so it plots, speaks and lints as one value:
// before this it was not a value at all, and the lenient fallback read its first group (`1 234` → 1).
// Only exact three-digit groups after the first, and only on a whole value: a sign or currency
// before it, a unit after it, as a value pill allows, so `4 beds`, `Q1 2025`, `Q1 120` and
// `Top 100 500` keep their reading. With space grouping the comma can only be the decimal mark
// (ISO 80000-1), so `1 000,000` is 1000, not a million.
const ISO_GROUPED = /^([(+\-\u2212]?\s*(?:[^\w\s]{1,3}\s*)?[-\u2212]?)(\d{1,3}(?:[ \u00A0\u202F\u2009]\d{3})+)(?:([.,])(\d+))?(\s*(?:(?:%|\u2030|[A-Za-z]{1,6})\s*)?\)?)$/;
function collapseIsoGroups(s: string): string {
  const m = ISO_GROUPED.exec(s);
  return m ? m[1] + m[2].replace(/[ \u00A0\u202F\u2009]/g, '') + (m[4] ? `.${m[4]}` : '') + m[5] : s;
}

/**
 * `1,234` groups; `1,25` is a decimal comma; two or more dots group; one dot is a decimal point.
 * With both, a whole European number (`1.234,5`, see EU_NUMBER) reads its comma as the decimal, and
 * anything else deletes the commas (`1,234.5`): both read 1234.5. Deleting the commas from `1.234,5`
 * read it as 1.2345, a thousandfold misread.
 */
function normalizeSeparators(s: string): string {
  s = collapseIsoGroups(s);
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (commas && !dots) return /,\d{3}(?!\d)/.test(s) && !/,\d{1,2}(?!\d)/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  if (dots > 1 && !commas) return s.replace(/\./g, '');
  if (commas && dots) return EU_NUMBER.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  return s;
}

/**
 * The fast path: one pass over the characters for the shapes real decks write — `5`, `12.5`,
 * `$1.2M`, `-$0.8M`, `62%`, `($1.2M)`, `140kg` — and `null` for anything else (a comma, two
 * dots, a space inside, a longer symbol prefix), which `readNumber` hands to the full reader
 * below. It reproduces that reader's answer exactly on the shapes it accepts; `types.test.ts`
 * fuzzes the two against each other. The full reader was eight regular-expression passes per
 * token, and a number is read for every value in every chart.
 *
 * The rules it mirrors, each from `chart-values.js`: `(…)` is negative; a leading `-` or
 * U+2212 flips the sign; a `-` or U+2212 directly before the digits that the lead did not take is the
 * number's own sign; a magnitude letter (`k` `M` `B` `bn` `T`) must end the word; the sign is
 * "written" when the part before the digits holds `+`, `-` or U+2212, or the whole is `(…)`.
 */
export function readNumberFast(t: string): NumberValue | null | undefined {
  const n = t.length;
  let i = 0;
  // Prefix: at most three symbol characters from the everyday set, no spaces. Anything the full
  // reader refuses (a second sign, a `(` that is not first, a sign inside `(…)`) goes to it.
  let signs = 0;
  let symBeforeSign = false;
  while (i < n && i < 4) {
    const c = t.charCodeAt(i);
    const sym = c === 36 || c === 0x20ac || c === 0xa3 || c === 0xa5;
    if (c === 43 || c === 45 || c === 0x2212) signs++;
    else if (c === 40 && i > 0) return null;
    // A sign sits before the symbols (`-$0.8M`) or after them (`$-0.8M`), never between two
    // (`$-$2`): that shape goes to the full reader, which refuses it.
    else if (sym && signs && symBeforeSign) return null;
    else if (sym && !signs) symBeforeSign = true;
    if (c === 40 || c === 43 || c === 45 || c === 0x2212 || sym) i++;
    else break;
  }
  if (i > 3 || signs > 1) return null;
  const digitsFrom = i;
  while (i < n && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57) i++;
  if (i === digitsFrom) return null;
  if (i < n && t.charCodeAt(i) === 46) {
    i++;
    const fracFrom = i;
    while (i < n && t.charCodeAt(i) >= 48 && t.charCodeAt(i) <= 57) i++;
    if (i === fracFrom) return null;
  }
  const digitsTo = i;
  if (i < n && (t.charCodeAt(i) === 44 || t.charCodeAt(i) === 46)) return null;
  // Tail: an optional unit (`%`, U+2030, or one to six ASCII letters), then an optional `)`.
  const unitFrom = i;
  const u = i < n ? t.charCodeAt(i) : -1;
  if (u === 37 || u === 0x2030) i++;
  else while (i < n && ((t.charCodeAt(i) | 32) >= 97 && (t.charCodeAt(i) | 32) <= 122)) i++;
  if (i - unitFrom > 6) return null;
  const unitTo = i;
  const closes = i < n && t.charCodeAt(i) === 41;
  if (closes) i++;
  if (i !== n) return null;

  const opens = t.charCodeAt(0) === 40;
  if (opens !== closes || (opens && signs)) return null;
  const paren = opens && closes;
  // With the parenthesis pair gone, a leading sign flips; the digits' own `-` is what is left.
  let p = paren ? 1 : 0;
  let neg = paren;
  const lead = t.charCodeAt(p);
  if (p < digitsFrom && (lead === 45 || lead === 0x2212)) { neg = !neg; p++; }
  let x = Number.parseFloat(t.slice(digitsFrom, digitsTo));
  if (digitsFrom > p && (t.charCodeAt(digitsFrom - 1) === 45 || t.charCodeAt(digitsFrom - 1) === 0x2212)) x = -x;
  if (!Number.isFinite(x)) return undefined;
  const unit = t.slice(unitFrom, unitTo);
  const mag = unit === 'bn' || (unit.length === 1 && 'kKmMBbT'.includes(unit)) ? unit : '';
  const value = mag ? x * MAGNITUDE[mag] : x;
  let signed = paren;
  for (let k = opens ? 1 : 0; k < digitsFrom && !signed; k++) {
    const c = t.charCodeAt(k);
    if (c === 43 || c === 45 || c === 0x2212) signed = true;
  }
  // The full reader strips one trailing `)` from a plain unit, but keeps it after a magnitude
  // letter when the whole is not a (…) pair: `5M)` has the unit `)`.
  const rest = mag ? (closes && !paren ? ')' : '') : unit;
  return { value: neg ? -Math.abs(value) : value, signed, unit: rest };
}

export function readNumber(raw: string): NumberValue | undefined {
  const t = raw.trim();
  if (t) {
    const fast = readNumberFast(t);
    if (fast !== null) return fast;
  }
  return readNumberFull(t);
}

/** The full reader: every shape `chart-values.js` accepts. Exported for the parity test only. */
export function readNumberFull(t: string): NumberValue | undefined {
  // `..` is the range delimiter and never part of a number. Without this, the separator rule
  // (two or more dots group) read `0..10` as 10 — a range silently became its upper end.
  // An ISO-grouped number (`12 000`) is one value; NUMERIC has no room for its spaces.
  t = collapseIsoGroups(t);
  if (!t || t.includes('..') || !NUMERIC.test(t)) return undefined;
  let s = normalizeSeparators(t);
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  const lead = s.match(/^[-\u2212]\s*/);
  if (lead) { neg = !neg; s = s.slice(lead[0].length); }
  // U+2212 right before the digits (`$\u22125`) is a minus like `-`; it read as +5.
  const m = s.replace(/\u2212(?=[\d.])/, '-').match(/-?\d*\.?\d+/);
  if (!m || m.index === undefined) return undefined;
  const n = Number.parseFloat(m[0]);
  if (!Number.isFinite(n)) return undefined;
  const after = s.slice(m.index + m[0].length).trim();
  const mag = after.match(/^(bn|[kKmMBbT])\b/);
  const value = mag ? n * MAGNITUDE[mag[1]] : n;
  const beforeDigits = t.replace(/^\(/, '').split(/\d/)[0];
  const signed = /^\(.*\)$/.test(t) || /[+\-\u2212]/.test(beforeDigits);
  const unit = mag ? after.slice(mag[1].length).trim() : after.replace(/\)$/, '').trim();
  return { value: neg ? -Math.abs(value) : value, signed, unit };
}

const CORE_ONLY = new RegExp(`^${CORE}$`);
/**
 * Why a string that LOOKS like a number (NUMBER_SHAPED) is not one, or undefined when it is a
 * number or plainly not an attempt at one. Lint quotes this, so an author learns why `--5` did not
 * plot instead of watching the chart draw something else.
 */
export function malformedNumber(raw: string): string | undefined {
  const t = collapseIsoGroups(raw.trim());
  if (!t || t.includes('..') || !NUMBER_SHAPED.test(t) || readNumber(t) !== undefined) return undefined;
  const at = t.search(/\d/);
  const before = t.slice(0, at);
  if (/[\u2010-\u2015\ufe58\ufe63\uff0d]/.test(before)) return 'it has a dash where a minus sign goes: type `-`';
  const signs = (before.match(/[+\-\u2212]/g) || []).length;
  const inner = /\(/.test(before.slice(1)) && t.endsWith(')');
  if (signs + (t.startsWith('(') && t.endsWith(')') ? 1 : 0) + (inner ? 1 : 0) > 1) return 'it has two signs';
  // `$(1,234)`: a paired accounting negative, but the `(` must come first, as in `($1,234)`.
  if (inner) return 'its `(` must come first, before any symbol';
  if (t.startsWith('(') !== t.endsWith(')') || /\(/.test(before.slice(1))) return 'its parentheses do not pair';
  const digits = /\d[\d,.]*/.exec(t.slice(at))?.[0] ?? '';
  if (!CORE_ONLY.test(digits)) return 'its digits are not one number (group thousands in threes, with one decimal mark)';
  return 'it is not written as one number';
}

export const number = (): Type<NumberValue> => own({
  cls: 'number',
  describe: 'a number',
  read: (s, quoted) => (quoted ? undefined : readNumber(s)),
});

// ── time ───────────────────────────────────────────────────────────────────

export type TimePoint =
  | { readonly kind: 'date'; readonly day: number }
  | { readonly kind: 'q'; readonly year: number | null; readonly idx: number }
  | { readonly kind: 'm'; readonly year: number | null; readonly idx: number };

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function readTime(raw: string): TimePoint | undefined {
  const s = raw.trim();
  if (!s) return undefined;
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    const y = +d[1];
    const mo = +d[2] - 1;
    const dd = +d[3];
    const t = Date.UTC(y, mo, dd);
    const dt = new Date(t);
    // Date.UTC rolls 2026-13-01 into 2027; a date that does not round-trip is not a date.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== dd) return undefined;
    return { kind: 'date', day: Math.round(t / 86400000) };
  }
  const q = s.match(/^(?:(\d{4})\s*)?Q([1-4])$/i);
  if (q) return { kind: 'q', year: q[1] ? +q[1] : null, idx: +q[2] - 1 };
  const m = s.match(/^(?:(\d{4})\s*)?([A-Za-z]+)$/);
  if (m) {
    const w = m[2].toLowerCase();
    let mi = w.length === 3 ? MONTHS.indexOf(w) : -1;
    if (mi < 0) mi = MONTHS_FULL.indexOf(w);
    if (mi >= 0) return { kind: 'm', year: m[1] ? +m[1] : null, idx: mi };
  }
  return undefined;
}

export const time = (): Type<TimePoint> => own({
  cls: 'time',
  describe: 'a time (2026-03-15, 2026 Q1, Q3, Jan)',
  read: (s, quoted) => (quoted ? undefined : readTime(s)),
});

// ── ranges ─────────────────────────────────────────────────────────────────

export interface Range<T> {
  readonly from: T;
  readonly to: T;
}

/** `a..b` over another type. `..` is the only range delimiter; the first one splits. */
export function range<T>(of: Type<T>): Type<Range<T>> {
  const r: Type<Range<T>> = {
    cls: 'range',
    describe: `a range of ${of.describe} (a..b)`,
    read: (s, quoted) => {
      if (quoted) return undefined;
      const at = s.indexOf('..');
      if (at < 0) return undefined;
      const from = of.read(s.slice(0, at).trim(), false);
      const to = of.read(s.slice(at + 2).trim(), false);
      return from !== undefined && to !== undefined ? { from, to } : undefined;
    },
  };
  return isBuiltIn(of) ? own(r) : r;
}
