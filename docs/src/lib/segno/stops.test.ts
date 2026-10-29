// @vitest-environment node
// `stops`: a node kind that ends the parse where it closes, and `parse(input, rule, from)` to
// resume. Both runtimes must agree on the tree, on `end`, and on every refusal.
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { ANY } from './charset';
import { generate } from './codegen';
import { toNodes } from './flat';
import { alt, attempt, compile, GrammarError, type GrammarSpec, greedy, lint, many, many1, node, noneOf, oneOf, restrict, seq, until } from './grammar';

const esbuild = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
function load(spec: GrammarSpec) {
  const mod = { exports: {} as Record<string, unknown> };
  new Function('module', 'exports', esbuild.transformSync(generate(spec), { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
  return mod.exports as { parse: (s: string, rule?: string, from?: number) => { ok: boolean; tree?: { buf: Int32Array; top: number; kinds: string[]; end: number }; error?: unknown } };
}

// `!` ends the parse; everything else is read.
const bang: GrammarSpec = { start: 'top', stops: ['stop'], rules: { top: many(alt(node('stop', '!'), node('word', greedy(many1(noneOf('!')))))) } };
// The same stop kind as the whole body of an attempt: `ab(` stops, `ab` alone does not.
const tried: GrammarSpec = {
  start: 'top',
  stops: ['open'],
  rules: { top: many(alt(attempt(node('open', seq('a', 'b', '(')), { max: 8, next: ANY }), noneOf('')) ) },
};

const both = (spec: GrammarSpec, input: string, from?: number) => {
  const c = compile(spec).parse(input, undefined, from);
  const g = load(spec).parse(input, undefined, from);
  expect(g.ok).toBe(c.ok);
  if (c.ok && g.ok) {
    expect(g.tree?.end).toBe(c.end);
    expect(toNodes(g.tree as never, 'top', from ?? 0, c.end as number).kids).toEqual(c.node.kids);
  }
  return c;
};

describe('stops', () => {
  it('ends the parse where the stop node closes, and says where', () => {
    const r = both(bang, 'ab!cd');
    expect(r.ok && r.end).toBe(3);
    expect(r.ok && r.node.kids.map((k) => k.kind)).toEqual(['word', 'stop']);
  });
  it('reads to the end when nothing stops it', () => {
    const r = both(bang, 'abcd');
    expect(r.ok && r.end).toBe(4);
  });
  it('resumes from an offset, in both runtimes', () => {
    const r = both(bang, 'ab!cd!ef', 3);
    expect(r.ok && r.end).toBe(6);
    expect(r.ok && r.node.kids[0]).toMatchObject({ kind: 'word', from: 3, to: 5 });
  });
  it('stops inside an attempt that holds the whole node, and passes the attempt that fails', () => {
    expect(both(tried, 'xab(yy')).toMatchObject({ ok: true, end: 4 });
    expect(both(tried, 'xabyy')).toMatchObject({ ok: true, end: 5 });
  });
  it('cuts the input at the stop: a node around it closes there, and what follows it sees the end', () => {
    const wrapped: GrammarSpec = { start: 'top', stops: ['stop'], rules: { top: node('outer', seq(many(noneOf('!')), node('stop', '!'), many(noneOf('')))) } };
    const r = both(wrapped, 'ab!cd');
    expect(r.ok && r.end).toBe(3);
    expect(r.ok && r.node.kids[0]).toMatchObject({ kind: 'outer', from: 0, to: 3 });
  });
  it('fails when a required element follows the stop, since it sees the end of input', () => {
    const needs: GrammarSpec = { start: 'top', stops: ['stop'], rules: { top: seq(node('stop', '!'), 'x') } };
    expect(compile(needs).parse('!x').ok).toBe(false);
    expect(load(needs).parse('!x').ok).toBe(false);
  });
  it('does not stop for an attempt that is rewound, and the parse reads on', () => {
    const picky: GrammarSpec = {
      start: 'top',
      stops: ['open'],
      rules: { top: many(alt(attempt(node('open', seq('a', 'b', '(')), { max: 8, next: 'x' }), noneOf(''))) },
    };
    // `ab(` followed by `y`: the attempt's next check fails, so it is rewound and `ab(y` is read as text.
    expect(both(picky, 'ab(yz')).toMatchObject({ ok: true, end: 5 });
    expect(both(picky, 'ab(xz')).toMatchObject({ ok: true, end: 3 });
  });
  it('fails a multi-character literal after a stop, in both runtimes', () => {
    const lit: GrammarSpec = { start: 'top', stops: ['stop'], rules: { top: seq(node('stop', '!'), 'bc') } };
    expect(compile(lit).parse('!bc').ok).toBe(false);
    expect(load(lit).parse('!bc').ok).toBe(false);
    const loop: GrammarSpec = { start: 'top', stops: ['stop'], rules: { top: many(seq(node('stop', 'a'), 'bc')) } };
    expect(compile(loop).parse('abcabc').ok).toBe(false);
    expect(load(loop).parse('abcabc').ok).toBe(false);
  });
  it('does not let `until` read past the stop, and the runtimes agree', () => {
    const open: GrammarSpec = { start: 'top', stops: ['stop'], rules: { top: seq(node('stop', '!'), until('zz', { orEnd: true })) } };
    expect(both(open, '!abzzc')).toMatchObject({ ok: true, end: 1 });
    expect(both(open, '!abc')).toMatchObject({ ok: true, end: 1 });
    const needs: GrammarSpec = { start: 'top', stops: ['stop'], rules: { top: seq(node('stop', '!'), until('zz')) } };
    expect(compile(needs).parse('!abzzc').ok).toBe(false);
    expect(load(needs).parse('!abzzc').ok).toBe(false);
  });
  it('takes `from` only for a grammar with stops', () => {
    const plain: GrammarSpec = { start: 'top', rules: { top: many(noneOf('')) } };
    expect(() => compile(plain).parse('abcd', undefined, 2)).toThrow(/from is for a grammar with stops/);
  });
  it('lints and restricts a stops list', () => {
    expect(lint({ ...bang, stops: ['nope'] })).not.toEqual([]);
    expect(lint(bang)).toEqual([]);
    expect(restrict(bang, { nodes: ['stop'] }).stops).toEqual([]);
    expect(restrict(bang, { nodes: ['word'] }).stops).toEqual(['stop']);
  });
  it('refuses a stop that names no node kind', () => {
    expect(() => compile({ ...bang, stops: ['nope'] })).toThrow(GrammarError);
    expect(() => generate({ ...bang, stops: ['nope'] })).toThrow(GrammarError);
  });
  it('refuses a start offset outside the input', () => {
    expect(() => compile(bang).parse('ab', undefined, 3)).toThrow(/from must be/);
    expect(() => load(bang).parse('ab', undefined, -1)).toThrow(/from must be/);
  });
  it('leaves a grammar with no stops as it was: no end, no offset in the generated source', () => {
    const plain: GrammarSpec = { start: 'top', rules: { top: many(oneOf('ab')) } };
    expect(compile(plain).parse('ab')).not.toHaveProperty('end');
    expect(generate(plain)).not.toMatch(/HALT|from = 0/);
  });
});
