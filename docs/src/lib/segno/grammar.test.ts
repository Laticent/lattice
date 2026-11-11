// @vitest-environment node
// The compiler's promise: a grammar compiles only if it is LL(1) over characters, and a grammar
// that compiles parses in linear time. Every refusal below is a shape the parser bake-off
// measured going quadratic or worse in a library (engineering/decisions/2026-09-28-parser-library-bakeoff.md).
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { alt, any, compile, type Expr, GrammarError, type GrammarSpec, lint, many, many1, node, noneOf, oneOf, opt, range, ref, seq } from './grammar';

// Work counts in place of stopwatches (HARD RULE #32, F1). The root's helpers are CommonJS.
const { countReads } = createRequire(import.meta.url)('../../../../test/helpers/property-reads.js') as {
  countReads: <T>(root: T, key: string, options?: { limit?: number | ((nodes: number) => number) }) => { value: T; reads: () => number; nodes: number };
};
const { charReads } = createRequire(import.meta.url)('../../../../test/helpers/work-count.js') as {
  charReads: <T>(fn: () => T) => { result: T; scanned: number; reads: number };
};
/**
 * Run `fn` on a copy of `spec` whose every expression counts its visits (a read of its tag `t`), with the number of
 * distinct expressions (a piece reused at every level is one). A walk over the grammar as a GRAPH visits each piece
 * a bounded number of times; walked as a tree, a piece reused twice per level costs 2^depth. Past the bound the
 * count throws, so a regression fails at once instead of hanging the runner.
 */
const PER_PIECE = 100;
function visits<T>(spec: GrammarSpec, fn: (s: GrammarSpec) => T): { result: T; visits: number; size: number } {
  const c = countReads(spec, 't', { limit: (pieces) => PER_PIECE * pieces });
  const result = fn(c.value);
  return { result, visits: c.reads(), size: c.nodes };
}

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
    expect(problems.join()).toMatch(/left recursion/);
    // With no base case there is no branch conflict to catch it: only the left-recursion check does.
    expect(lint({ start: 's', rules: { s: seq(ref('s'), 'a') } }).join()).toMatch(/"s" can reach itself/);
    expect(lint({ start: 's', rules: { s: seq(opt('x'), ref('s'), 'a') } }).join()).toMatch(/"s" can reach itself/);
  });

  it('two branches that can both match nothing (one input, two trees)', () => {
    // The language is the same either way, so only this check can see it: the parser would pick
    // a tree the grammar does not determine.
    expect(lint({ start: 's', rules: { s: alt(node('x', opt('a')), node('y', opt('b'))) } }).join()).toMatch(/branches 0 and 1 can all match nothing/);
  });

  it('an empty branch, when another branch starts with what follows the choice', () => {
    // After `a`, the parser cannot tell "the a branch" from "the empty branch, then the a after".
    expect(lint({ start: 's', rules: { s: seq(alt('a', opt('c')), 'a') } }).join()).toMatch(/branch 1 matches nothing, and "a" could either start another branch or follow/);
  });

  it('FOLLOW looks through an empty sibling', () => {
    // `many(c)` is followed by `opt(b)` OR, when that is empty, by `c`: the loop clashes with `c`.
    expect(lint({ start: 's', rules: { s: seq(many('c'), opt('b'), 'c') } }).join()).toMatch(/after many, "c" could either repeat/);
  });

  it('a loop body is followed by its own start', () => {
    // In `many(b many(b))`, "bb" is one pass or two: the inner loop clashes with the next pass.
    expect(lint({ start: 's', rules: { s: many(seq('b', many('b'))) } }).join()).toMatch(/after many, "b" could either repeat/);
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

  it('is linear: 16x the input costs about 16x the work, never 256x', () => {
    // Work is what charReads counts (test/helpers/work-count.js): every character the parser reads, searches or
    // copies, the same on any machine. It replaced a best-of-seven stopwatch ratio (HARD RULE #32, F1).
    const work = (n: number) => {
      const s = `[${Array.from({ length: n }, () => '7').join(',')}]`;
      const w = charReads(() => g.parse(s));
      return w.reads + w.scanned;
    };
    const small = work(4000);
    const big = work(64000);
    expect(big / Math.max(small, 1)).toBeLessThan(32); // 16.0 measured; quadratic would be ~256
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

  it('a range above ASCII includes both its ends and nothing past them', () => {
    const h = compile({ start: 's', rules: { s: many1(range('\u00e0', '\u00ff')) } });
    expect(['\u00e0', '\u00ff', '\u00e9'].map((c) => h.parse(c).ok)).toEqual([true, true, true]);
    expect(['\u00df', '\u0100'].map((c) => h.parse(c).ok)).toEqual([false, false]);
  });
});

describe('rule names', () => {
  it('a rule named like an Object member is still unknown', () => {
    expect(() => compile({ start: 's', rules: { s: ref('toString') } })).toThrow(GrammarError);
    expect(() => compile({ start: 'hasOwnProperty', rules: { s: seq('a') } })).toThrow(GrammarError);
  });
});

describe('analysis cost on long rule chains', () => {
  // A chain listed bottom-up (`r4000` first) used to cost one fixpoint round per rule in
  // FIRST/FOLLOW, and recursiveRules() searched from every rule: 12.4 s for 4,000 rules. Both
  // fixpoints are worklists seeded in dependency order now, and recursion comes from one SCC
  // pass; 43 ms measured.
  const chain = (n: number, bottomUp: boolean) => {
    const rules: Record<string, ReturnType<typeof seq>> = {};
    const order = Array.from({ length: n + 1 }, (_, i) => (bottomUp ? n - i : i));
    for (const i of order) rules[`r${i}`] = i === n ? seq('x') : seq('a', ref(`r${i + 1}`));
    return { start: 'r0', rules, maxDepth: 1000 };
  };
  for (const bottomUp of [false, true]) {
    it(`a 4,000-rule chain listed ${bottomUp ? 'bottom-up' : 'top-down'} lints and compiles in a bounded number of visits per piece`, () => {
      const { visits: v, size } = visits(chain(4000, bottomUp), (spec) => {
        expect(lint(spec)).toEqual([]);
        return compile(spec);
      });
      expect(v, `${v} visits for ${size} pieces`).toBeLessThan(PER_PIECE * size); // 392,066 and 408,066 for 12,002
      expect(compile(chain(40, bottomUp)).parse(`${'a'.repeat(40)}x`).ok).toBe(true);
    });
  }
});

describe('a piece reused at every level costs once, not once per path', () => {
  // Each level uses the level below twice, as one JS object. Walked as a tree, that is 2^depth:
  // compile() took 473 ms and generate() 921 ms at depth 22, doubling per level. Walked as a
  // graph, a few milliseconds at any depth.
  it('compile() and generate() at depth 24', async () => {
    const { generate } = await import('./codegen');
    let e = seq('x');
    for (let k = 0; k < 24; k++) e = seq(seq('a', many(oneOf('bcd')), 'e'), alt(seq('y', e), seq('z', e)));
    const spec = { start: 's', rules: { s: e } };
    const { result: g, visits: v, size } = visits(spec, (sp) => {
      generate(sp);
      return compile(sp);
    });
    expect(v, `${v} visits for ${size} pieces`).toBeLessThan(PER_PIECE * size); // 10,286 for 266
    expect(g.parse(`abey${'aez'.repeat(23)}x`).ok).toBe(true);
  });
  // From the checker: the left-recursion check (leadingRefs) and the "expected …" text
  // (expectedAt) walked a reused nullable prefix once per path too.
  it('the left-recursion check and the error text, at depth 24', () => {
    let lead: Expr = ref('t');
    for (let k = 0; k < 24; k++) lead = seq(opt(lead), opt(lead), String.fromCharCode(97 + (k % 26)));
    const lr = visits({ start: 's', rules: { s: lead, t: seq('t') } }, lint);
    expect(lr.visits, `${lr.visits} visits for ${lr.size} pieces`).toBeLessThan(PER_PIECE * lr.size); // 1,615 for 100
    let n: Expr = opt(oneOf(''));
    for (let k = 0; k < 24; k++) n = seq(node('p', n), node('q', n));
    const er = visits({ start: 's', rules: { s: alt(seq(n, 'a'), seq(n, 'b')) } }, (sp) => compile(sp).parse('c'));
    expect(er.visits, `${er.visits} visits for ${er.size} pieces`).toBeLessThan(PER_PIECE * er.size); // 1,555 for 79
    const r = er.result;
    expect(r.ok ? '' : r.error.expected).toMatch(/"a" or "b"/);
  });
});
