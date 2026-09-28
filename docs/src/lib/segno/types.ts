/**
 * Value types: what a bare word or a quoted string MEANS once a slot asks for it.
 *
 * A type is `{ cls, read }`. `read(text, quoted)` returns the value, or `undefined` when the
 * spelling is not this type's. `cls` is the type's PRECEDENCE CLASS, which is how a bare
 * word finds its parameter without the engine guessing: a slot binds a word to the one
 * parameter in the highest class that accepts it, and a schema in which two parameters of
 * the same class could both accept one word does not build (schema.ts).
 *
 *   vocab  — declared words: enum values, their aliases, flags, color slots
 *   id     — `#api`
 *   number — `42` `-$0.8M` `12%` `($1.2M)` `1,25M`
 *   time   — `2026-03-15` `2026 Q1` `Q3` `Jan`
 *   range  — `0..10` `Q1..Q3`
 *   text   — anything, and the ONLY class a quoted string can land in
 *
 * The number and time readers carry the rules Lattice's kernels settled after real decks
 * broke them (lib/core/chart-values.js, lib/core/gantt-time.js): four sign spellings, the
 * accounting parenthesis, European separators, the magnitude letter, calendar round-trips.
 * One reader each, for every chart.
 */

export type Cls = 'vocab' | 'id' | 'number' | 'time' | 'range' | 'text';
export const CLASS_ORDER: readonly Cls[] = ['vocab', 'id', 'number', 'time', 'range', 'text'];

export interface Type<T> {
  readonly cls: Cls;
  /** A short name for messages and docs: "a number", "one of tag, pill". */
  readonly describe: string;
  /** The words this type claims, lower-cased (vocab class only), for the ambiguity check. */
  readonly words?: readonly string[];
  /** The value, or undefined when this spelling is not this type's. */
  read(text: string, quoted: boolean): T | undefined;
  /** For vocab types: the canonical spelling a word resolves to (for per-deck consistency). */
  canonical?(text: string): string | undefined;
  /** Only ever bound by `name=value`, never by a bare word (see `named`). */
  readonly namedOnly?: boolean;
}

/**
 * A parameter that must be written `name=value`. Use it when two parameters share a type —
 * journey's `mood=4` and `volume=120` are both numbers, so a bare `4` could be either, and the
 * schema would not build. Named-only parameters take no part in bare-word binding.
 */
export function named<T>(t: Type<T>): Type<T> {
  return { ...t, namedOnly: true, describe: `${t.describe}, written name=value` };
}

/** Any text. Quoted text is only ever this type. */
export const text = (): Type<string> => ({
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
  return {
    cls: 'vocab',
    describe: `one of ${values.join(', ')}`,
    words: [...map.keys()],
    read: (s, quoted) => (quoted ? undefined : map.get(s.toLowerCase())),
    canonical: (s) => map.get(s.toLowerCase()),
  };
}

/** A declared word that switches something on: `milestone`, `total`, `dashed`. */
export function flag(word: string, options: { aliases?: readonly string[] } = {}): Type<true> {
  const words = [word, ...(options.aliases ?? [])].map((w) => w.toLowerCase());
  return {
    cls: 'vocab',
    describe: `"${word}"`,
    words,
    read: (s, quoted) => (!quoted && words.includes(s.toLowerCase()) ? true : undefined),
    canonical: (s) => (words.includes(s.toLowerCase()) ? word : undefined),
  };
}

/** A categorical color slot `c1`…`cN`. The ceiling is the SLOT's, so `c9` on an 8-slot chart names the limit. */
export function color(options: { max: number }): Type<number> {
  const words = Array.from({ length: options.max }, (_, i) => `c${i + 1}`);
  return {
    cls: 'vocab',
    describe: `a color c1–c${options.max}`,
    words,
    read: (s, quoted) => {
      if (quoted) return undefined;
      const m = /^c([1-9]\d?)$/i.exec(s);
      if (!m) return undefined;
      const n = Number(m[1]);
      return n >= 1 && n <= options.max ? n : undefined;
    },
    canonical: (s) => s.toLowerCase(),
  };
}

/** An id: `#api`. Lower-case letters, digits and hyphens, starting with a letter or digit. */
export const id = (): Type<string> => ({
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
// A WHOLLY numeric pill: optional sign or `(`, up to three symbol characters (a currency),
// an optional inner sign, a digit run, an optional short unit, an optional `)`.
const NUMERIC = /^[(+\-\u2212]?\s*[^\w\s]{0,3}\s*[-\u2212]?\d[\d,.]*\s*(?:%|\u2030|[A-Za-z]{1,6})?\s*\)?$/;

/** `1,234` groups; `1,25` is a decimal comma; two or more dots group; one dot is a decimal point. */
function normalizeSeparators(s: string): string {
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;
  if (commas && !dots) return /,\d{3}(?!\d)/.test(s) && !/,\d{1,2}(?!\d)/.test(s) ? s.replace(/,/g, '') : s.replace(/,/g, '.');
  if (dots > 1 && !commas) return s.replace(/\./g, '');
  if (commas && dots) return s.replace(/,/g, '');
  return s;
}

export function readNumber(raw: string): NumberValue | undefined {
  const t = raw.trim();
  // `..` is the range delimiter and never part of a number. Without this, the separator rule
  // (two or more dots group) read `0..10` as 10 — a range silently became its upper end.
  if (!t || t.includes('..') || !NUMERIC.test(t)) return undefined;
  let s = normalizeSeparators(t);
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
  const lead = s.match(/^[-\u2212]\s*/);
  if (lead) { neg = !neg; s = s.slice(lead[0].length); }
  const m = s.match(/-?\d*\.?\d+/);
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

export const number = (): Type<NumberValue> => ({
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

export const time = (): Type<TimePoint> => ({
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
  return {
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
}
