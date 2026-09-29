// @vitest-environment node
// The compiler's two promises, checked on grammars nobody wrote by hand:
//   1. SOUND: a grammar that compiles accepts exactly its language. Each random grammar's
//      language is enumerated by brute force (every string up to MAX_LEN over the alphabet),
//      and the compiled parser must accept those strings and refuse every other one.
//   2. ONE PARSER: generate()'s straight-line code gives the same tree or the same error as
//      compile()'s closures, on every one of those strings.
// Grammars are random, seeded (a failure reproduces from its seed), and include recursion, so
// the refusals are exercised too. Floors on how many compile (and have a language of more than
// one string) keep it from going vacuous; SEGNO_FUZZ_STATS=1 with --disableConsoleIntercept prints the counts (at seed 2462:
// 756 compile, 340 of them non-trivial, 5,244 refused, 413,657 generated-parser comparisons).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { generate } from './codegen';
import { toNodes } from './flat';
import { alt, compile, type Expr, GrammarError, type GrammarSpec, many, many1, node, oneOf, opt, ref, seq } from './grammar';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as typeof import('esbuild');

const ALPHA = ['a', 'b', 'c'];
const MAX_LEN = 5;
const RULES = ['r0', 'r1', 'r2'];

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

function randomExpr(r: () => number, depth: number): Expr {
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  if (depth <= 0 || r() < 0.3) {
    const k = r();
    if (k < 0.5) return seq(pick(ALPHA));
    if (k < 0.7) return oneOf(ALPHA.filter(() => r() < 0.6).join('') || 'a');
    if (k < 0.8) return seq(pick(ALPHA) + pick(ALPHA)); // a two-character literal
    return ref(pick(RULES));
  }
  const sub = () => randomExpr(r, depth - 1);
  switch (Math.floor(r() * 6)) {
    case 0: return seq(sub(), sub());
    case 1: return alt(sub(), sub());
    case 2: return alt(sub(), sub(), sub());
    case 3: return opt(sub());
    case 4: return r() < 0.5 ? many(sub()) : many1(sub());
    default: return node(pick(['x', 'y']), sub());
  }
}

// ── the brute-force language: every string up to MAX_LEN, by fixpoint over the rules ──
type Lang = Set<string>;
function language(spec: GrammarSpec): Map<string, Lang> {
  const L = new Map<string, Lang>(Object.keys(spec.rules).map((k) => [k, new Set<string>()]));
  const cat = (a: Lang, b: Lang) => {
    const out = new Set<string>();
    for (const x of a) for (const y of b) if (x.length + y.length <= MAX_LEN) out.add(x + y);
    return out;
  };
  const ev = (e: Expr): Lang => {
    switch (e.t) {
      case 'lit': return new Set(e.s.length <= MAX_LEN ? [e.s] : []);
      case 'set': return new Set(ALPHA.filter((c) => { const u = c.charCodeAt(0); for (let i = 0; i < e.cs.length; i += 2) if (u >= e.cs[i] && u <= e.cs[i + 1]) return true; return false; }));
      case 'seq': return e.xs.reduce((acc, x) => cat(acc, ev(x)), new Set(['']));
      case 'alt': return new Set(e.xs.flatMap((x) => [...ev(x)]));
      case 'opt': return new Set(['', ...ev(e.x)]);
      case 'many': {
        const body = ev(e.x);
        let acc = e.min ? new Set(body) : new Set(['']);
        for (;;) { const next = new Set([...acc, ...cat(acc, body)]); if (next.size === acc.size) return acc; acc = next; }
      }
      case 'ref': return L.get(e.name) ?? new Set();
      case 'node': return ev(e.x);
    }
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const [k, e] of Object.entries(spec.rules)) {
      const next = ev(e);
      if (next.size !== L.get(k)!.size) { L.set(k, next); changed = true; }
    }
  }
  return L;
}

const ALL: string[] = [''];
for (let n = 1; n <= MAX_LEN; n++) for (const s of ALL.filter((x) => x.length === n - 1)) for (const c of [...ALPHA, 'd']) if (!(n === MAX_LEN && c === 'd')) ALL.push(s + c);

function loadGenerated(spec: GrammarSpec) {
  const js = esbuild.transformSync(generate(spec), { loader: 'ts', format: 'cjs' }).code;
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', js)(mod, mod.exports);
  return mod.exports.parse as (s: string) => { ok: true; tree: Parameters<typeof toNodes>[0] } | { ok: false; error: unknown };
}

describe('random grammars: compiled = brute force, generated = compiled', () => {
  it('holds on 6,000 random grammars, every string up to 5 characters', () => {
    const r = rng(2462);
    let compiled = 0;
    let refused = 0;
    let generatedChecked = 0;
    let nontrivial = 0;
    const bad: string[] = [];
    for (let g = 0; g < 6000 && bad.length < 3; g++) {
      const spec: GrammarSpec = { start: 'r0', rules: Object.fromEntries(RULES.map((k) => [k, randomExpr(r, 3)])) };
      let grammar: ReturnType<typeof compile>;
      try { grammar = compile(spec); } catch (e) { if (!(e instanceof GrammarError)) throw e; refused++; continue; }
      compiled++;
      const lang = language(spec).get('r0')!;
      if (lang.size > 1) nontrivial++;
      const gen = g % 2 === 0 ? loadGenerated(spec) : null; // codegen on half: esbuild per grammar is the slow part
      for (const s of ALL) {
        const got = grammar.parse(s);
        if (got.ok !== lang.has(s)) bad.push(`grammar #${g}, ${JSON.stringify(s)}: parser ${got.ok}, language ${lang.has(s)}`);
        if (gen) {
          const gr = gen(s);
          const asNodes = gr.ok ? { ok: true, node: toNodes(gr.tree, 'r0', 0, s.length) } : gr;
          if (JSON.stringify(asNodes) !== JSON.stringify(got)) bad.push(`grammar #${g}, ${JSON.stringify(s)}: generated ${JSON.stringify(asNodes)} vs compiled ${JSON.stringify(got)}`);
          generatedChecked++;
        }
      }
    }
    expect(bad).toEqual([]);
    // Not vacuous: plenty compile, plenty are refused, and codegen ran on a real share.
    if (process.env.SEGNO_FUZZ_STATS) console.error({ compiled, nontrivial, refused, generatedChecked });
    expect(compiled).toBeGreaterThan(600);
    expect(nontrivial).toBeGreaterThan(300);
    expect(refused).toBeGreaterThan(3000);
    expect(generatedChecked).toBeGreaterThan(300_000);
  }, 60_000);
});
