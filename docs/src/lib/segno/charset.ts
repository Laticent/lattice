/**
 * Character sets over UTF-16 code units, as sorted, disjoint, inclusive ranges.
 *
 * UTF-16 units and not code points, on purpose: every string API in the engine and in
 * Lattice's kernels counts units, and the parser bake-off found that the two libraries
 * that counted code points instead (Ohm, Lezer) silently read emoji-heavy input
 * differently. One unit of measure everywhere.
 */

/** A set of code units: `[lo, hi, lo, hi, ...]`, sorted, disjoint, non-adjacent. */
export type CharSet = readonly number[];

export const MAX_UNIT = 0xffff;
export const EMPTY: CharSet = [];
export const ANY: CharSet = [0, MAX_UNIT];

/** Normalize a list of `[lo, hi]` pairs into canonical form. */
export function fromRanges(pairs: ReadonlyArray<readonly [number, number]>): CharSet {
  const sorted = pairs.filter(([lo, hi]) => lo <= hi).map(([lo, hi]) => [lo, hi] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out: number[] = [];
  for (const [lo, hi] of sorted) {
    const n = out.length;
    if (n && lo <= out[n - 1] + 1) out[n - 1] = Math.max(out[n - 1], hi);
    else out.push(lo, hi);
  }
  return out;
}

/** The set of the characters in `s` (each UTF-16 unit). */
export function ofChars(s: string): CharSet {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    pairs.push([c, c]);
  }
  return fromRanges(pairs);
}

export function ofRange(from: string, to: string): CharSet {
  return fromRanges([[from.charCodeAt(0), to.charCodeAt(0)]]);
}

export function union(...sets: CharSet[]): CharSet {
  const pairs: Array<[number, number]> = [];
  for (const s of sets) for (let i = 0; i < s.length; i += 2) pairs.push([s[i], s[i + 1]]);
  return fromRanges(pairs);
}

export function complement(s: CharSet): CharSet {
  const out: Array<[number, number]> = [];
  let next = 0;
  for (let i = 0; i < s.length; i += 2) {
    if (s[i] > next) out.push([next, s[i] - 1]);
    next = s[i + 1] + 1;
  }
  if (next <= MAX_UNIT) out.push([next, MAX_UNIT]);
  return fromRanges(out);
}

export function intersect(a: CharSet, b: CharSet): CharSet {
  const out: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i], b[j]);
    const hi = Math.min(a[i + 1], b[j + 1]);
    if (lo <= hi) out.push([lo, hi]);
    if (a[i + 1] < b[j + 1]) i += 2;
    else j += 2;
  }
  return fromRanges(out);
}

export function isEmpty(s: CharSet): boolean {
  return s.length === 0;
}

export function equal(a: CharSet, b: CharSet): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function has(s: CharSet, c: number): boolean {
  for (let i = 0; i < s.length; i += 2) {
    if (c < s[i]) return false;
    if (c <= s[i + 1]) return true;
  }
  return false;
}

/** A readable description, for grammar errors and parse diagnostics. */
export function describe(s: CharSet, limit = 8): string {
  if (equal(s, ANY)) return 'any character';
  const parts: string[] = [];
  const show = (c: number) => {
    if (c === 32) return 'space';
    if (c === 9) return 'tab';
    if (c === 10) return 'newline';
    if (c < 32 || (c >= 0x7f && c <= 0xa0)) return `U+${c.toString(16).toUpperCase().padStart(4, '0')}`;
    return JSON.stringify(String.fromCharCode(c));
  };
  for (let i = 0; i < s.length && parts.length < limit; i += 2) {
    parts.push(s[i] === s[i + 1] ? show(s[i]) : `${show(s[i])}–${show(s[i + 1])}`);
  }
  if (s.length / 2 > limit) parts.push('…');
  return parts.join(', ');
}

/**
 * A membership test compiled for the hot path: a byte table for ASCII (where nearly every
 * decision in real input is made) and a range scan above it.
 */
export function compileTest(s: CharSet): (c: number) => boolean {
  const ascii = new Uint8Array(128);
  const high: number[] = [];
  for (let i = 0; i < s.length; i += 2) {
    for (let c = s[i]; c <= Math.min(s[i + 1], 127); c++) ascii[c] = 1;
    if (s[i + 1] > 127) high.push(Math.max(s[i], 128), s[i + 1]);
  }
  if (!high.length) return (c) => c >= 0 && c < 128 && ascii[c] === 1;
  return (c) => {
    if (c < 0) return false;
    if (c < 128) return ascii[c] === 1;
    for (let i = 0; i < high.length; i += 2) {
      if (c < high[i]) return false;
      if (c <= high[i + 1]) return true;
    }
    return false;
  };
}
