// The adversarial trio's findings before Segno's first npm version, each pinned
// (engineering/decisions/2026-10-08-library-trio-before-publish.md).
import { describe, expect, it } from 'vitest';
import { alt, charRange, chars, compile, GrammarError, lint, lit, SchemaError } from './index.js';

describe('a character set holds only characters one UTF-16 unit long', () => {
  it('refuses a character outside the Basic Multilingual Plane, and points at lit()', () => {
    expect(() => chars('😀😁')).toThrow(/use lit\(\)/);
    expect(() => charRange('\u{1F600}', '\u{1F64F}')).toThrow(/use lit\(\)/);
    // lit() matches the whole character, as before.
    expect(compile({ start: 'a', rules: { a: lit('😁') } }).parse('😁').ok).toBe(true);
  });

  it('refuses a range that runs backwards', () => {
    expect(() => charRange('z', 'a')).toThrow(/runs backwards/);
    expect(() => charRange('a', 'z')).not.toThrow();
  });
});

describe('a rule named __proto__', () => {
  it('is refused as a GrammarError, not a TypeError, when the spec comes from JSON', () => {
    const spec = JSON.parse('{"start":"a","rules":{"a":{"t":"ref","name":"__proto__"},"__proto__":{"t":"lit","s":"x"}}}');
    expect(() => compile(spec)).toThrow(GrammarError);
  });
});

describe('lint() bounds its report on a wide alternation', () => {
  it('names ten pairs and counts the rest, in well under a second', () => {
    const xs = Array.from({ length: 3000 }, (_, i) => lit(`k${i}`));
    const t = performance.now();
    const problems = lint({ start: 's', rules: { s: alt(...xs) } });
    expect(performance.now() - t).toBeLessThan(1000); // 12.7 s and 4,498,500 strings before
    expect(problems.filter((p) => /can both start with/.test(p))).toHaveLength(10);
    // Branches 1-4 name their 1 + 2 + 3 + 4 pairs; the other 2,995 overlapping branches are counted.
    expect(problems.some((p) => /2995 more branches can start with a character an earlier branch takes/.test(p))).toBe(true);
  });

  it('still names every pair when there are few', () => {
    const problems = lint({ start: 's', rules: { s: alt(lit('ab'), lit('ac'), lit('ad')) } });
    expect(problems.filter((p) => /can both start with/.test(p))).toHaveLength(3);
  });
});

describe('the error classes keep their identity across separately bundled copies', () => {
  it('instanceof reads the registered brand, not the prototype chain', () => {
    // What a second copy of the class (another entry's bundle, another realm) constructs: a plain
    // Error carrying the same registered brand.
    const fromOtherCopy = Object.defineProperty(new Error('x'), Symbol.for('@laticent/segno/SchemaError'), { value: true });
    expect(fromOtherCopy instanceof SchemaError).toBe(true);
    expect(new Error('x') instanceof SchemaError).toBe(false);
    expect(new SchemaError(['p']) instanceof SchemaError).toBe(true);
    expect(new GrammarError(['p']) instanceof GrammarError).toBe(true);
    expect(new GrammarError(['p']) instanceof SchemaError).toBe(false);
  });
});
