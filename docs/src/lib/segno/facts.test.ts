// @vitest-environment node
// R1 of engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md: the node cap, the
// roles table, and the facts a parse reports (limits, anomalies, coverage). The node cap must stop
// both runtimes at the same node, and a grammar that sets neither a cap nor a role must generate
// the parser it generated before.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { generate } from './codegen';
import { anomalies, coverage, facts, limitOf } from './facts';
import { toNodes } from './flat';
import { alt, attempt, compile, GrammarError, type GrammarSpec, lint, many, many1, NODES_EXHAUSTED, node, noneOf, oneOf, opt, ref, restrict, rolesOf, seq } from './grammar';
import { notationSpec } from './notation-grammar';

const esbuild = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
function load(spec: GrammarSpec) {
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', esbuild.transformSync(generate(spec), { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
  return mod.exports as {
    parse: (s: string, rule?: string) => { ok: true; tree: { buf: Int32Array; top: number; kinds: readonly string[] } } | { ok: false; error: { at: number; expected: string; found: string | null; code?: string } };
    ROLES?: readonly (string | null)[];
  };
}
const both = (spec: GrammarSpec) => {
  const ref0 = compile(spec);
  const gen = load(spec);
  return (s: string) => {
    const g = gen.parse(s);
    const gr = g.ok ? { ok: true, node: toNodes(g.tree, spec.start, 0, s.length) } : g;
    const r = ref0.parse(s);
    expect(gr).toEqual(r);
    return r;
  };
};

// Words, each a node and each followed by a space, with an attempt that keeps a `+word` node only
// before a space.
const words = (maxNodes?: number): GrammarSpec => ({
  start: 'doc',
  ...(maxNodes === undefined ? {} : { maxNodes }),
  rules: {
    doc: many(alt(attempt(node('plus', seq('+', node('w', many1(oneOf('abc'))))), { max: 8, next: ' ' }), seq(node('w', many1(oneOf('abc+'))), ' '), ' ')),
  },
});

describe('maxNodes', () => {
  it('stops both runtimes at the same node, with code "nodes"', () => {
    const run = both(words(3));
    expect(run('a b c ').ok).toBe(true);
    const r = run('a b c a ');
    expect(r).toEqual({ ok: false, error: { at: 6, expected: NODES_EXHAUSTED, found: 'a', code: 'nodes' } });
  });

  it('gives back the nodes an attempt rewinds', () => {
    // `+ab+` fails the attempt (the next character is `+`, not a space) after it entered two nodes,
    // then reads as one plain word: three nodes in all, which a cap of 3 allows only if the rewind
    // returned the attempt's two. The attempt's nodes count while it runs: at a cap of 2 it is
    // the attempt that reaches the cap, in both runtimes.
    const run = both(words(3));
    expect(run('a +ab+ b ').ok).toBe(true);
    expect(run('a +ab+ b c ').ok).toBe(false);
    expect(both(words(2))('a +ab+ ').ok).toBe(false);
  });

  it('agrees with compile() on 3,000 random inputs at caps 1 to 6', () => {
    let a = 7;
    const rnd = () => { a = (a * 1103515245 + 12345) >>> 0; return a / 2 ** 32; };
    const runs = [1, 2, 3, 4, 5, 6].map((c) => both(words(c)));
    for (let k = 0; k < 3000; k++) {
      const len = Math.floor(rnd() * 14);
      let s = '';
      for (let j = 0; j < len; j++) s += 'ab+ '[Math.floor(rnd() * 4)];
      runs[k % runs.length](s);
    }
  });

  it('grows the tape past the first buffer and still stops exactly at the cap', () => {
    const cap = 70_000; // past the 256-integer first buffer and the 65,536 reset
    const gen = load(words(cap));
    expect(gen.parse('a '.repeat(cap)).ok).toBe(true);
    const r = gen.parse('a '.repeat(cap + 1));
    expect(r.ok === false && r.error.code).toBe('nodes');
    expect(r.ok === false && r.error.at).toBe(cap * 2);
    // and the parser is reusable after a capped parse
    expect(gen.parse('a b ').ok).toBe(true);
  });

  it('bounds the memory a hostile input can hold (the 3M-character row)', () => {
    const gen = load(words(1000));
    const r = gen.parse('a '.repeat(1_500_000));
    expect(r.ok === false && r.error.code).toBe('nodes');
  });

  it('refuses a cap that is not a whole number in range, in lint and both builders', () => {
    // A setting, not an LL(1) problem: thrown as a plain Error, as a bad maxDepth is.
    for (const bad of [0, -1, 1.5, 2 ** 26 + 1, Number.NaN]) {
      const spec = words(bad);
      expect(() => lint(spec)).toThrow(/maxNodes must be a whole number/);
      expect(() => compile(spec)).toThrow(/maxNodes must be a whole number/);
      expect(() => generate(spec)).toThrow(/maxNodes must be a whole number/);
    }
    expect(lint(words(2 ** 26))).toEqual([]);
  });

  it('generates the same parser as before for a grammar that sets no cap and no role', () => {
    expect(generate(words())).not.toContain('CAP');
    expect(generate(words())).not.toContain('ROLES');
    expect(generate(words())).toContain('if (top + 4 > buf.length) grow();');
    expect(generate(words(10))).toContain('if (top + 4 > cap) grow();');
  });

  it('keeps the cap through restrict()', () => {
    expect(restrict(words(5), {}).maxNodes).toBe(5);
  });
});

describe('roles', () => {
  const spec: GrammarSpec = {
    start: 'doc',
    rules: { doc: many(alt(node('url', seq('<', many1(noneOf('<> ')), '>'), { role: 'ref' }), seq(node('word', many1(oneOf('ab'))), ' '), ' ')) },
  };
  it('labels a kind in compile() and in the generated ROLES table, by kind number', () => {
    expect(compile(spec).roles).toEqual({ url: 'ref' });
    const gen = load(spec);
    const r = gen.parse('ab <x> b ');
    if (!r.ok) throw new Error('parse failed');
    const refs: string[] = [];
    for (let k = 0; k < r.tree.top; k = r.tree.buf[k + 3]) if (gen.ROLES?.[r.tree.buf[k]] === 'ref') refs.push('ab <x> b '.slice(r.tree.buf[k + 1], r.tree.buf[k + 2]));
    expect(refs).toEqual(['<x>']);
  });
  it('refuses one kind with two roles', () => {
    const two: GrammarSpec = { start: 'a', rules: { a: alt(node('k', '1', { role: 'ref' }), node('k', '2', { role: 'directive' })) } };
    expect(() => compile(two)).toThrow(GrammarError);
    expect(() => generate(two)).toThrow(GrammarError);
    expect(() => rolesOf(two)).toThrow(/two roles/);
    expect(lint(two)).toEqual(['node "k" has two roles: "ref" and "directive"']);
  });
  it('leaves the shipped notation without a table', () => {
    expect(Object.keys(rolesOf(notationSpec))).toEqual([]);
  });
});

describe('facts', () => {
  it('finds each anomaly kind, merged into runs', () => {
    const s = '﻿a\u0000\u0000b‮c​d\u0085e\rf\r\ng\ud800h\udc00i\u{1F600}j﻿';
    const a = anomalies(s);
    expect(a.spans.map((x) => [x.kind, x.from, x.to])).toEqual([
      ['bom', 0, 1], ['nul', 2, 4], ['bidi-control', 5, 6], ['zero-width', 7, 8], ['c1-control', 9, 10],
      ['cr-without-lf', 11, 12], ['lone-surrogate', 16, 17], ['lone-surrogate', 18, 19], ['zero-width', 23, 24],
    ]);
    expect(a.counts).toEqual({ bom: 1, nul: 2, 'bidi-control': 1, 'zero-width': 2, 'c1-control': 1, 'cr-without-lf': 1, 'lone-surrogate': 2 });
    expect(a.truncated).toBe(false);
  });
  it('treats a valid surrogate pair and CRLF as ordinary', () => {
    expect(anomalies('a\u{1F600}\r\nb').spans).toEqual([]);
    expect(anomalies('\ud83d').spans).toEqual([{ kind: 'lone-surrogate', from: 0, to: 1 }]);
  });
  it('caps the run list and counts past it', () => {
    const a = anomalies('\u0000a'.repeat(50), 10);
    expect(a.spans.length).toBe(10);
    expect(a.truncated).toBe(true);
    expect(a.counts.nul).toBe(50);
  });
  it('reports coverage for both tree shapes, and the read prefix of a failure', () => {
    const spec = words();
    const g = compile(spec);
    const gen = load(spec);
    const s = 'a  ab  ';
    const want = { read: 7, unmarked: [[1, 3], [5, 7]], truncated: false };
    expect(coverage(s, g.parse(s))).toEqual(want);
    const r = gen.parse(s);
    expect(r.ok && coverage(s, r)).toEqual(want);
    expect(coverage('a x', g.parse('a x'))).toEqual({ read: 2, unmarked: null, truncated: false });
  });
  it('reports the same `found` from both runtimes when the cap fires inside an attempt window', () => {
    // The checker's repro: at the cap the generated parser's `n` is still the window's end.
    const spec: GrammarSpec = { start: 's', maxNodes: 1, rules: { s: seq(node('p', 'x'), attempt(seq('a', node('k', opt('c'))), { max: 1, next: 'b' }), 'b') } };
    expect(both(spec)('xab')).toEqual({ ok: false, error: { at: 2, expected: NODES_EXHAUSTED, found: 'b', code: 'nodes' } });
  });

  it('counts an attempt\'s nodes at their peak, even when the attempt would fail', () => {
    // Both runtimes stop here, though the winning parse holds one node: the documented contract.
    const spec: GrammarSpec = { start: 's', maxNodes: 2, rules: { s: seq(node('p', 'x'), alt(attempt(seq(node('k', 'a'), node('k2', 'a'), 'e'), { max: 5, next: 'b' }), seq('a', many('a'))), 'b') } };
    expect(both(spec)('xaab')).toMatchObject({ ok: false, error: { code: 'nodes' } });
    expect(compile({ ...spec, maxNodes: 3 }).parse('xaab').ok).toBe(true);
  });

  it('names the cap a parse hit: nodes, depth, or none', () => {
    const capped = words(1);
    const r = compile(capped).parse('a b ');
    expect(r.ok ? null : limitOf(capped, r.error)).toEqual({ cap: 'nodes', at: 2 });
    const deep: GrammarSpec = { start: 'v', maxDepth: 3, rules: { v: alt(seq('(', opt(ref('v')), ')'), 'x') } };
    const d = compile(deep).parse('(((((x)))))');
    expect(d.ok ? null : limitOf(deep, d.error)?.cap).toBe('depth');
    const plain = compile(deep).parse('(y');
    expect(plain.ok ? 'ok' : limitOf(deep, plain.error)).toBeNull();
    expect(facts(deep, '(x)', compile(deep).parse('(x)')).limits).toBeNull();
  });
});
