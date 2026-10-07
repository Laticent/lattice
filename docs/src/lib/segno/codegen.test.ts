// @vitest-environment node
// The generated notation parser is the one that ships; the closure-compiled one is the
// reference. They must agree on EVERY input — the same tree, or the same error at the same
// offset — and the checked-in generated file must be what the generator writes today.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { complement, fromRanges, has } from './charset';
import { generate } from './codegen';
import { toNodes } from './flat';
import { alt, compile, type GrammarSpec, many, many1, noneOf, oneOf, range, ref, seq, set } from './grammar';
import { attempt, node } from './index';
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

describe('a set with many ranges above ASCII is searched, not chained', () => {
  // Every other code unit from U+0080 up, plus a few ASCII letters: 32k ranges. Past 16 high
  // ranges both runtimes binary-search them (codegen.ts HIGH_CHAIN, charset.ts HIGH_SCAN).
  const pairs: Array<[number, number]> = [[97, 99]];
  for (let c = 128; c <= 0xffff; c += 2) pairs.push([c, c]);
  const X = fromRanges(pairs);
  const all = Array.from({ length: 0x10000 }, (_, c) => String.fromCharCode(c)).join('');

  it('every code unit lands on the side has() puts it, in both runtimes', () => {
    const spec: GrammarSpec = { start: 's', rules: { s: many(alt(node('in', set(X)), node('out', set(complement(X))))) } };
    expect(generate(spec)).toContain('inRanges(');
    const got = load(spec)(all);
    expect(got).toEqual(compile(spec).parse(all));
    const kids = (got as { ok: true; node: { kids: ReadonlyArray<{ kind: string; from: number }> } }).node.kids;
    expect(kids.length).toBe(0x10000);
    expect(kids.every((k) => (k.kind === 'in') === has(X, k.from))).toBe(true);
  });
  it('a hand-built set in descending order reads the same as sorted, in both runtimes', () => {
    // grammar.ts checks each pair's shape, not their order; the search sorts what it is given.
    const cs: number[] = [];
    for (let c = 400; c >= 130; c -= 10) cs.push(c, c);
    const spec: GrammarSpec = { start: 's', rules: { s: seq(many({ t: 'set', cs }), ';') } };
    const x = '\u0190\u0186\u0082\u00f0;';
    expect(load(spec)(x)).toEqual(compile(spec).parse(x));
    expect(compile(spec).parse(x).ok).toBe(true);
  });
  it('a loop over the set stops at the first code unit outside it', () => {
    const spec: GrammarSpec = { start: 's', rules: { s: seq(many(set(X)), '!') } };
    for (const s of ['!', 'a\u0080\uffff!', '\u0080\u0081!', 'abcd!', '\ufffe\u0082\u0083']) expect(load(spec)(s), JSON.stringify(s)).toEqual(compile(spec).parse(s));
  });
  it('reads 256k characters inside attempt windows in linear time, in both runtimes', () => {
    const spec: GrammarSpec = { start: 'r', rules: { r: many(alt(attempt(seq('<', many(set(X)), '>'), { max: 256, next: ' ' }), ' ', set(X))) } };
    const unit = `<${Array.from({ length: 253 }, (_, k) => String.fromCharCode(128 + 2 * ((k * 37) % 32000))).join('')}> `;
    const input = unit.repeat(1000);
    const g = load(spec);
    const c = compile(spec);
    const time = (f: () => unknown) => { f(); let best = Infinity; for (let k = 0; k < 3; k++) { const t = performance.now(); f(); best = Math.min(best, performance.now() - t); } return best; };
    expect(g(input).ok).toBe(true);
    // About 6 ms each here; a one-comparison-per-range chain took 11.4 s (generated) and 1.5 s
    // (compile()). Generous ceilings, far below either.
    expect(time(() => g(input))).toBeLessThan(300);
    expect(time(() => c.parse(input))).toBeLessThan(300);
  });
});

describe('generate(), from the adversarial review', () => {
  it('refuses a rule named __proto__, which an object literal would read as the prototype', () => {
    expect(() => generate({ start: '__proto__', rules: { ['__proto__']: seq('a') } })).toThrow(/must be an identifier/);
  });
  it('a hand-built set holding the end-of-input code cannot make the generated loop spin', () => {
    // Run in a child process with a deadline: a loop that spins would hang THIS process, and
    // Vitest cannot interrupt a synchronous loop, so the test would never report.
    const spec: GrammarSpec = { start: 's', rules: { s: seq('a', many(set([-1, -1]))) } };
    const js = esbuild.transformSync(generate(spec), { loader: 'ts', format: 'esm' }).code;
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `${js}\nconsole.log(JSON.stringify(parse('a').ok))`], { encoding: 'utf8', timeout: 5000 });
    expect(run.signal, 'the generated parser spun').toBeNull();
    expect(run.stdout.trim()).toBe(JSON.stringify(compile(spec).parse('a').ok));
  });
  it('nested many1 grows the generated code linearly, not exponentially', () => {
    let e = oneOf('a');
    for (let k = 0; k < 20; k++) e = seq(String.fromCharCode(66 + k), many1(e), String.fromCharCode(98 + k));
    const t = performance.now();
    const src = generate({ start: 's', rules: { s: e } });
    expect(src.length).toBeLessThan(200_000); // 531 MB before
    expect(performance.now() - t).toBeLessThan(500); // 33.7 s before
    const spec: GrammarSpec = { start: 's', rules: { s: seq('X', many1(seq('Y', many1(oneOf('a')), 'y')), 'x') } };
    for (const s of ['XYayx', 'XYaayYayx', 'Xx', 'XYyx', 'XYax']) expect(load(spec)(s), s).toEqual(compile(spec).parse(s));
  });
});
