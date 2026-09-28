// @vitest-environment node
// The compiler's promise: a grammar compiles only if it is LL(1) over characters, and a grammar
// that compiles parses in linear time. Every refusal below is a shape the parser bake-off
// measured going quadratic or worse in a library (engineering/decisions/2026-09-28-parser-library-bakeoff.md).
import { describe, expect, it } from 'vitest';
import { alt, any, compile, GrammarError, lint, many, many1, node, noneOf, oneOf, opt, ref, seq } from './grammar';

const digit = oneOf('0123456789', 'a digit');

describe('compile refuses what is not LL(1)', () => {
  it('two branches that start with the same character', () => {
    const problems = lint({ start: 's', rules: { s: alt(seq('a', 'b'), seq('a', 'c')) } });
    expect(problems.join()).toMatch(/branches 0 and 1 can both start with "a"/);
  });

  it('a loop whose body can match nothing (it would spin)', () => {
    const problems = lint({ start: 's', rules: { s: many(opt('a')) } });
    expect(problems.join()).toMatch(/can match nothing/);
  });

  it('a loop that could either repeat or stop on the same character', () => {
    // many(a) then a: after the loop, "a" could be either — a backtracking parser would try both.
    const problems = lint({ start: 's', rules: { s: seq(many('a'), 'a') } });
    expect(problems.join()).toMatch(/could either repeat the body or follow it/);
  });

  it('the partner-quote shape that made every library quadratic', () => {
    // "a quote opens only if a partner exists later" needs unbounded lookahead; the nearest
    // grammar shape (text that may contain the quote, then the quote) is refused.
    const problems = lint({ start: 's', rules: { s: seq('"', many(any()), '"') } });
    expect(problems.length).toBeGreaterThan(0);
  });

  it('left recursion', () => {
    const problems = lint({ start: 'e', rules: { e: alt(seq(ref('e'), '+', digit), digit) } });
    expect(problems.join()).toMatch(/left recursion|can both start/);
  });

  it('an unknown rule, and a missing start', () => {
    expect(() => compile({ start: 's', rules: { s: ref('nope') } })).toThrow(GrammarError);
    expect(() => compile({ start: 'x', rules: { s: digit } })).toThrow(GrammarError);
  });

  it('reports every problem, not only the first', () => {
    const problems = lint({ start: 's', rules: { s: seq(alt('a', 'ab'), many(opt('c'))) } });
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe('a grammar that compiles', () => {
  const g = compile({
    start: 'list',
    rules: {
      list: seq('[', opt(seq(ref('num'), many(seq(',', ref('num'))))), ']'),
      num: node('num', many1(digit)),
    },
  });

  it('parses and keeps the marked nodes with their ranges', () => {
    const r = g.parse('[12,3]');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.node.kids.map((k) => [k.from, k.to])).toEqual([[1, 3], [4, 5]]);
  });

  it('reports where it stopped and what it expected', () => {
    const r = g.parse('[12;3]');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.at).toBe(3);
      expect(r.error.found).toBe(';');
    }
  });

  it('rejects trailing input', () => {
    expect(g.parse('[1]x').ok).toBe(false);
  });

  it('is linear: 16x the input costs about 16x the time, never 256x', () => {
    // Best of seven single parses per size: a garbage-collection pause only ever ADDS time, so
    // the minimum is the parser's real cost. An average of five failed once on a cold machine.
    const t = (n: number) => {
      const s = `[${Array.from({ length: n }, () => '7').join(',')}]`;
      let best = Infinity;
      for (let k = 0; k < 7; k++) {
        const t0 = performance.now();
        g.parse(s);
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    t(2000); // warm
    const small = t(4000);
    const big = t(64000);
    expect(big / Math.max(small, 0.05)).toBeLessThan(64); // linear is ~16; quadratic would be ~256
  });

  it('caps nesting instead of overflowing the call stack', () => {
    const nest = compile({ start: 'e', rules: { e: alt(seq('(', ref('e'), ')'), 'x') } });
    expect(nest.parse('((x))').ok).toBe(true);
    const deep = `${'('.repeat(30000)}x${')'.repeat(30000)}`;
    const r = nest.parse(deep);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.expected).toMatch(/levels of nesting/);
  });

  it('handles characters above ASCII in sets', () => {
    const h = compile({ start: 's', rules: { s: many1(noneOf(',')) } });
    expect(h.parse('Ω😀é').ok).toBe(true);
    expect(h.parse('a,b').ok).toBe(false);
  });
});

describe('rule names', () => {
  it('a rule named like an Object member is still unknown', () => {
    expect(() => compile({ start: 's', rules: { s: ref('toString') } })).toThrow(GrammarError);
    expect(() => compile({ start: 'hasOwnProperty', rules: { s: seq('a') } })).toThrow(GrammarError);
  });
});
