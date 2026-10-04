// @vitest-environment node
/**
 * The three engine additions — greedy loops, until(), a per-grammar nesting cap — and the
 * guarantee they must not break: a grammar that compiles parses in linear time, never throws on
 * input, and reads the same in both runtimes.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { generate } from './codegen.js';
import { isStackOverflow } from './grammar.js';
import type { GrammarSpec } from './index.js';
import { alt, chars, compile, greedy, lint, MAX_DEPTH, MAX_DEPTH_LIMIT, MAX_UNTIL, many, many1, node, noneOf, opt, ref, STACK_EXHAUSTED, seq, until } from './index.js';

const letter = chars('abcdefghijklmnopqrstuvwxyz');
const word = node('w', seq(letter, many(letter)));

// Generated code, transpiled and loaded in-process the way codegen.test.ts does it.
const esbuild = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
type GenParse = (s: string) => { ok: boolean; tree?: { buf: Int32Array; top: number; kinds: string[] }; error?: { at: number; expected: string } };
async function gen(spec: GrammarSpec): Promise<GenParse> {
  const mod = { exports: {} as { parse: GenParse } };
  new Function('module', 'exports', esbuild.transformSync(generate(spec), { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
  return mod.exports.parse;
}

/** The kept spans as `kind:from-to`, preorder — comparable across the two runtimes. */
function spansOfNode(n: { kind: string; from: number; to: number; kids: readonly unknown[] }, out: string[] = []): string[] {
  for (const k of n.kids as Array<typeof n>) { out.push(`${k.kind}:${k.from}-${k.to}`); spansOfNode(k, out); }
  return out;
}
function spansOfFlat(t: { buf: Int32Array; top: number; kinds: string[] }): string[] {
  const out: string[] = [];
  for (let i = 0; i < t.top; i += 4) out.push(`${t.kinds[t.buf[i]]}:${t.buf[i + 1]}-${t.buf[i + 2]}`);
  return out;
}

describe('greedy()', () => {
  const words: GrammarSpec = { start: 's', rules: { s: many(alt(word, chars(' '))) } };
  const greedyWords: GrammarSpec = { start: 's', rules: { s: many(alt(node('w', seq(letter, greedy(many(letter)))), chars(' '))) } };

  it('the strict checker still refuses a run next to a run', () => {
    expect(lint(words).join('\n')).toMatch(/could either repeat the body or follow it/);
  });

  it('a greedy loop is accepted and takes the longest run', () => {
    expect(lint(greedyWords)).toEqual([]);
    const r = compile(greedyWords).parse('ab cde');
    expect(r.ok && spansOfNode(r.node)).toEqual(['w:0-2', 'w:3-6']);
  });

  it('refuses a greedy loop whose successor could never match', () => {
    const dead: GrammarSpec = { start: 's', rules: { s: seq(greedy(many(letter)), 's') } };
    expect(lint(dead).join('\n')).toMatch(/seq\[1\] can never match/);
    // Not dead, though an earlier draft of this test said it was: `abb` matches (the opt takes one b).
    const optThenSame: GrammarSpec = { start: 's', rules: { s: seq('a', greedy(opt('b')), 'b') } };
    expect(lint(optThenSame)).toEqual([]);
    expect(compile(optThenSame).parse('abb').ok).toBe(true);
  });

  it('sees through node() to the loop at the end', () => {
    const dead: GrammarSpec = { start: 's', rules: { s: seq(node('w', seq(letter, greedy(many(letter)))), 'x') } };
    expect(lint(dead).join('\n')).toMatch(/can never match/);
  });

  it('follows rule references (red team: this passed lint and matched nothing)', () => {
    const dead: GrammarSpec = { start: 'r', rules: { r: seq(ref('a'), 'a'), a: greedy(many('a')) } };
    expect(lint(dead).join('\n')).toMatch(/can never match/);
  });

  // The checker's three false refusals: each successor CAN match.
  it.each([
    ['an opt takes at most one', seq(greedy(opt('a')), 'a'), 'aa'],
    ['a nullable piece after the loop can hand on a fresh character', seq(seq(greedy(many('a')), opt('b')), 'a'), 'aba'],
    ['only the branches that END in the loop shadow what follows', seq(alt(seq('x', greedy(many('a'))), 'y'), 'a'), 'ya'],
    ['a space path reaches the successor', seq(node('w', seq(letter, greedy(many(letter)), opt(' '))), 'x'), 'ab x'],
  ])('does not refuse a successor that can match: %s', (_n, body, input) => {
    const spec: GrammarSpec = { start: 's', rules: { s: body } };
    expect(lint(spec)).toEqual([]);
    expect(compile(spec).parse(input).ok).toBe(true);
  });

  it('accepts a successor that can start with something the loop does not take', () => {
    // `x` is shadowed after letters, but `1` still reaches it: partial overlap is the feature.
    const ok: GrammarSpec = { start: 's', rules: { s: seq(greedy(many(letter)), alt('1', 'x')) } };
    expect(lint(ok)).toEqual([]);
    expect(compile(ok).parse('ab1').ok).toBe(true);
    expect(compile(ok).parse('abx').ok).toBe(false); // the loop took the x: greedy means what it says
  });

  it('only marks loops and opt', () => {
    expect(() => greedy(seq('a', 'b'))).toThrow(/greedy\(\) takes/);
  });

  it('still refuses an ambiguous choice: greedy is not ordered choice', () => {
    expect(lint({ start: 's', rules: { s: alt(seq('a', 'b'), seq('a', 'c')) } }).join('\n')).toMatch(/can both start/);
  });

  it('still refuses a greedy loop whose body can match nothing', () => {
    expect(lint({ start: 's', rules: { s: greedy(many(opt('a'))) } }).join('\n')).toMatch(/can match nothing/);
  });
});

describe('until()', () => {
  const comment: GrammarSpec = { start: 'c', rules: { c: seq('<!--', node('body', until('-->'))) } };
  const commentOrEnd: GrammarSpec = { start: 'c', rules: { c: seq('<!--', node('body', until('-->', { orEnd: true }))) } };

  it('reads to and through the terminator', () => {
    const r = compile(comment).parse('<!-- a -- b --->');
    expect(r.ok && spansOfNode(r.node)).toEqual(['body:4-16']);
  });

  it('fails at the end of input when the terminator never comes', () => {
    const r = compile(comment).parse('<!-- open');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toEqual({ at: 9, expected: '"-->"', found: null });
  });

  it('orEnd reads to the end instead', () => {
    expect(compile(commentOrEnd).parse('<!-- open').ok).toBe(true);
  });

  it('can start with anything, so a choice beside it is ambiguous', () => {
    expect(lint({ start: 's', rules: { s: alt(until('x'), 'a') } }).join('\n')).toMatch(/can both start/);
  });

  it('refuses an empty terminator, and one longer than MAX_UNTIL', () => {
    expect(() => until('')).toThrow(/at least one character/);
    expect(() => until('a'.repeat(MAX_UNTIL))).not.toThrow();
    // Red team: indexOf's slow case is input x terminator, so an unbounded terminator made the
    // per-character cost the grammar author's to choose (1.5 µs a character at 16k).
    expect(() => until('a'.repeat(MAX_UNTIL + 1))).toThrow(/at most 64 characters/);
  });

  it('the two runtimes agree', async () => {
    const p = await gen(comment);
    for (const s of ['<!---->', '<!-- x -->', '<!-- -- -->', '<!-- open', '<!--->', '<!-->']) {
      const a = compile(comment).parse(s); const b = p(s);
      expect(b.ok).toBe(a.ok);
      if (a.ok && b.ok && b.tree) expect(spansOfFlat(b.tree)).toEqual(spansOfNode(a.node));
      if (!a.ok && !b.ok) expect(b.error).toEqual(a.error);
    }
  });
});

describe('maxDepth', () => {
  const nest = (maxDepth?: number): GrammarSpec => ({ start: 'v', maxDepth, rules: { v: alt('x', seq('(', ref('v'), ')')) } });
  const deep = (d: number) => `${'('.repeat(d)}x${')'.repeat(d)}`;

  it('defaults to 64, with the same message as before', () => {
    const r = compile(nest()).parse(deep(MAX_DEPTH + 1));
    expect(!r.ok && r.error.expected).toBe('at most 64 levels of nesting');
  });

  it('a grammar can raise it, in both runtimes', async () => {
    const spec = nest(500);
    expect(compile(spec).parse(deep(499)).ok).toBe(true);
    expect(compile(spec).parse(deep(501)).ok).toBe(false);
    const p = await gen(spec);
    expect(p(deep(499)).ok).toBe(true);
    expect(p(deep(501)).error?.expected).toBe('at most 500 levels of nesting');
  });

  it('refuses a cap outside 1..MAX_DEPTH_LIMIT', () => {
    expect(() => compile(nest(MAX_DEPTH_LIMIT + 1))).toThrow(/maxDepth must be/);
    expect(() => compile(nest(0))).toThrow(/maxDepth must be/);
    expect(() => generate(nest(1.5))).toThrow(/maxDepth must be/);
  });

  it('never throws at the ceiling, in either runtime', async () => {
    const spec = nest(MAX_DEPTH_LIMIT);
    const p = await gen(spec);
    for (const d of [MAX_DEPTH_LIMIT - 1, MAX_DEPTH_LIMIT + 1, 50_000]) {
      expect(() => compile(spec).parse(deep(d))).not.toThrow();
      expect(() => p(deep(d))).not.toThrow();
    }
  });
});

describe('the stack backstop', () => {
  // Checker: compile() spends a frame per expression, so 30 wrappers between two references run
  // the stack out long before maxDepth. It must say so, not invent "at most 135 levels".
  let inner: import('./grammar.js').Expr = ref('b');
  for (let k = 0; k < 30; k++) inner = node('n', seq(inner));
  const thick: GrammarSpec = { start: 'b', maxDepth: MAX_DEPTH_LIMIT, rules: { b: seq('(', opt(inner), ')') } };
  const deep = (d: number) => `${'('.repeat(d)}${')'.repeat(d)}`;

  it('compile() reports the stack, not a made-up cap, and never throws', () => {
    const r = compile(thick).parse(deep(900));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.expected).toBe(STACK_EXHAUSTED);
  });

  it('KNOWN DIVERGENCE: the generated parser, one function per level, gets further', async () => {
    expect((await gen(thick))(deep(900)).ok).toBe(true);
  });

  it('catches a stack overflow and nothing else', () => {
    expect(isStackOverflow(new RangeError('Maximum call stack size exceeded'))).toBe(true);
    expect(isStackOverflow(new Error('too much recursion'))).toBe(true);
    expect(isStackOverflow(new RangeError('Invalid typed array length: 4294967296'))).toBe(false);
  });
});

describe('the guarantee, on a grammar that uses all three', () => {
  // A small document language: words, spaces, `{…}` blocks that nest, `/*…*/` comments.
  const doc: GrammarSpec = {
    start: 'run',
    maxDepth: 200,
    rules: {
      run: many(alt(
        node('w', seq(letter, greedy(many(letter)))),
        chars(' \n'),
        node('blk', seq('{', ref('run'), '}')),
        // `/` alone, or `/*…*/`: the CSS case. A greedy opt says "after a slash, a star always opens a comment".
        node('slash', seq('/', greedy(opt(node('c', seq('*', until('*/'))))))),
      )),
    },
  };

  it('compiles', () => expect(lint(doc)).toEqual([]));

  it('both runtimes give the same answer on 20,000 fuzzed inputs', async () => {
    const p = await gen(doc);
    const g = compile(doc);
    const alphabet = 'ab {}/* \n';
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed; };
    for (let k = 0; k < 20_000; k++) {
      let s = '';
      const len = rnd() % 40;
      for (let j = 0; j < len; j++) s += alphabet[rnd() % alphabet.length];
      const a = g.parse(s); const b = p(s);
      expect(b.ok, s).toBe(a.ok);
      if (a.ok && b.ok && b.tree) expect(spansOfFlat(b.tree), s).toEqual(spansOfNode(a.node));
      if (!a.ok && !b.ok) expect(b.error, s).toEqual(a.error);
    }
  });

  /** Best-of-5 time for `make(n)` and `make(8n)`; a linear parser's ratio is about 8. */
  function ratio(fn: (s: string) => unknown, make: (n: number) => string, n: number) {
    const best = (s: string) => { fn(s); let t = Infinity; for (let r = 0; r < 5; r++) { const a = performance.now(); fn(s); t = Math.min(t, performance.now() - a); } return t; };
    return best(make(8 * n)) / Math.max(best(make(n)), 0.05);
  }

  /**
   * The same grammar with every node() removed. compile() builds a tree of objects, and that
   * allocation grows a little faster than linear on very large inputs (garbage collection; the
   * shipped engine measures the same, 9-11x per 8x). The PARSE is what must be linear, so
   * compile() is timed without the tree. The generated parser writes a flat buffer and is timed
   * as is.
   */
  type E = import('./grammar.js').Expr;
  const strip = (e: E): E => {
    switch (e.t) {
      case 'node': return strip(e.x);
      case 'seq': case 'alt': return { ...e, xs: e.xs.map(strip) };
      case 'many': case 'opt': return { ...e, x: strip(e.x) };
      default: return e;
    }
  };
  const bare: GrammarSpec = { ...doc, rules: Object.fromEntries(Object.entries(doc.rules).map(([k, v]) => [k, strip(v)])) };

  it.each([
    ['many words', (n: number) => 'ab '.repeat(n)],
    ['one long word', (n: number) => 'a'.repeat(n)],
    ['many short comments', (n: number) => '/**/'.repeat(n)],
    ['a comment full of near-terminators', (n: number) => `/*${'**'.repeat(n)}*/`],
    ['an unclosed comment full of stars', (n: number) => `/*${'*'.repeat(n)}`],
    ['shallow blocks', (n: number) => '{a}'.repeat(n)],
  ])('grows linearly: %s', async (_name, make) => {
    const p = await gen(doc);
    const g = compile(bare);
    // 8x the input; a generous ceiling (3x the linear 8) so a noisy machine cannot fail a linear parser.
    expect(ratio((s) => g.parse(s), make, 20_000)).toBeLessThan(24);
    expect(ratio(p, make, 20_000)).toBeLessThan(24);
  });

  it('until() is linear even when every position half-matches its terminator', () => {
    // The worst case for a naive search: a terminator whose prefix repeats in the text.
    const g = compile({ start: 's', rules: { s: seq('<', until('aaab', { orEnd: true })) } });
    expect(ratio((s) => g.parse(s), (n) => `<${'aaa'.repeat(n)}`, 50_000)).toBeLessThan(24);
  });
});

it('greedy and until are inert in the shipped notation grammar', async () => {
  const { notationSpec } = await import('./notation-grammar.js');
  expect(JSON.stringify(notationSpec)).not.toMatch(/"greedy"|"until"/);
  expect(notationSpec.maxDepth).toBeUndefined();
});

// The checker's FIRST set for until() is every character, so this is refused rather than
// silently shadowing `b`: the prototype keeps "ambiguous choice" an error.
it('a choice between until() and a literal is refused', () => {
  expect(lint({ start: 's', rules: { s: many1(alt(until('x'), noneOf('x'))) } }).length).toBeGreaterThan(0);
});

// KNOWN GAP, pinned so it cannot be forgotten: greedy means "commit". The dead-code check only
// catches a successor that can NEVER match. When what follows the loop is OPTIONAL, the checker
// cannot see that some inputs needed it: here the loop commits to "b" as a line and then
// demands the newline that the last line does not have.
it('greedy can commit to a branch that later fails, and the checker does not flag it', () => {
  const lines: GrammarSpec = { start: 's', rules: { s: seq(greedy(many(seq(word, '\n'))), opt(word)) } };
  expect(lint(lines)).toEqual([]);                  // compiles…
  expect(compile(lines).parse('a\nb\n').ok).toBe(true);
  expect(compile(lines).parse('a\nb').ok).toBe(false); // …but a last line with no newline fails
});
