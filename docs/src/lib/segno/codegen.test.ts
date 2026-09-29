// @vitest-environment node
// The generated notation parser is the one that ships; the closure-compiled one is the
// reference. They must agree on EVERY input — the same tree, or the same error at the same
// offset — and the checked-in generated file must be what the generator writes today.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { generate } from './codegen';
import { toNodes } from './flat';
import { alt, compile, type GrammarSpec, many, many1, noneOf, oneOf, range, ref, seq } from './grammar';
import { parse as generatedFlat } from './notation.generated';
import { notationSpec } from './notation-grammar';

// The generated parser writes a flat tree; rebuild the object tree to compare with the reference.
const generated = (s: string) => {
  const r = generatedFlat(s);
  return r.ok ? { ok: true, node: toNodes(r.tree, 'span', 0, s.length) } : r;
};

const reference = compile(notationSpec);

// Seeded, so a failure reproduces.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEEDS = ['{BETA, tag, c4}', '[{Effort, 0..10, 5}, Reach]', '[, Reach]', 'after=Design', '"a, b"', '{a, "q\\"x", b=[1,2]}', '$4.2M', '{x = {y, z}}'];
const ALPHABET = [...'{}[],="\\| abcxyz019.$-\t', '\u{1F600}', 'é'];

describe('generated parser = reference parser', () => {
  it('agrees on 20,000 fuzzed spans', () => {
    const r = rng(11);
    let tested = 0;
    for (let k = 0; k < 20000; k++) {
      const chars = [...SEEDS[Math.floor(r() * SEEDS.length)]];
      for (let e = 0; e < 1 + Math.floor(r() * 3); e++) {
        const at = Math.floor(r() * (chars.length + 1));
        const pick = ALPHABET[Math.floor(r() * ALPHABET.length)];
        const op = r();
        if (op < 0.4) chars.splice(at, 0, pick);
        else if (op < 0.7) chars.splice(at, 1);
        else chars.splice(at, 1, pick);
      }
      const s = chars.join('');
      expect(generated(s)).toEqual(reference.parse(s));
      tested++;
    }
    expect(tested).toBe(20000);
  });

  it('agrees on deep nesting (both stop at the cap)', () => {
    const deep = `${'{a, '.repeat(200)}b${'}'.repeat(200)}`;
    expect(generated(deep)).toEqual(reference.parse(deep));
  });
});

describe('the checked-in generated file is fresh', () => {
  // Skipped under tools/mutate-segno.mjs only: there a codegen mutant must be caught by behavior.
  it.skipIf(!!process.env.SEGNO_MUTATE)('matches what the generator writes from notation-grammar.ts', () => {
    const file = readFileSync(new URL('./notation.generated.ts', import.meta.url), 'utf8');
    const banner = file.slice(0, file.indexOf('\n\n') + 2);
    expect(file).toBe(generate(notationSpec, { banner }));
  });
});

describe('generate() refuses what compile() refuses', () => {
  it('throws on a non-LL(1) grammar', () => {
    expect(() => generate({ start: 's', rules: { s: seq(many(oneOf('a')), 'a') } })).toThrow(/could either repeat/);
    expect(() => generate({ start: 's', rules: { s: many(noneOf(',')) } })).not.toThrow();
  });
});

describe('generated rule names', () => {
  it('a rule name that is not an identifier is refused, not emitted as broken code', () => {
    expect(() => generate({ start: 'my-rule', rules: { 'my-rule': seq('a') } })).toThrow(/must be an identifier/);
  });
  it('an Object member name is not a rule', () => {
    expect(() => generatedFlat('', 'constructor')).toThrow(/no rule/);
  });
});

// Generated code for a grammar other than the notation: transpiled and loaded in-process.
const esbuild = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
function load(spec: GrammarSpec) {
  const mod = { exports: {} as { parse?: typeof generatedFlat } };
  new Function('module', 'exports', esbuild.transformSync(generate(spec), { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
  const parse = mod.exports.parse as typeof generatedFlat;
  return (s: string) => {
    const r = parse(s);
    return r.ok ? { ok: true, node: toNodes(r.tree, spec.start, 0, s.length) } : r;
  };
}

describe('generated = compiled, on shapes the notation does not use', () => {
  it('a choice by a range above ASCII', () => {
    const spec: GrammarSpec = { start: 's', rules: { s: many1(alt(range('\u00e0', '\u00ff'), oneOf('a'))) } };
    const gen = load(spec);
    const ref_ = compile(spec);
    for (const s of ['\u00e0', '\u00e9a', '\u00ff', 'a\u00f0', '\u0100', '\u00df']) expect(gen(s), JSON.stringify(s)).toEqual(ref_.parse(s));
  });
  it('the nesting count unwinds between siblings: 100 flat records are not 100 deep', () => {
    const spec: GrammarSpec = { start: 'list', rules: { list: seq('[', many(ref('item')), ']'), item: alt(ref('list'), 'a') } };
    const gen = load(spec);
    const flat = `[${'[a]'.repeat(100)}]`;
    expect(gen(flat).ok).toBe(true);
    expect(gen(flat)).toEqual(compile(spec).parse(flat));
  });
});
