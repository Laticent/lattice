// @vitest-environment node
/**
 * attempt(x, { max, next }): the bounded ordered choice phase 3 needs for flowchart rows
 * (engineering/decisions/2026-09-28-segno-unified-inline-notation.md § Flowchart rows need a
 * bounded attempt). What it must keep: a grammar that compiles still parses in linear time, never
 * throws on input, and reads the same in both runtimes. What the checker must refuse: an attempt
 * that can reach another attempt, an until() inside one, and an attempt that can match nothing.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { generate } from './codegen.js';
import { toNodes } from './flat.js';
import { type Expr, GrammarError, type GrammarSpec, type Node } from './grammar.js';
import { alt, attempt, chars, compile, greedy, lint, MAX_ATTEMPT, many, many1, node, noneOf, opt, ref, seq, until } from './index.js';

const esbuild = createRequire(import.meta.url)('esbuild') as typeof import('esbuild');
type GenResult = { ok: true; tree: Parameters<typeof toNodes>[0] } | { ok: false; error: { at: number; expected: string; found: string | null } };
function gen(spec: GrammarSpec): (s: string) => GenResult {
  const mod = { exports: {} as { parse: (s: string) => GenResult } };
  new Function('module', 'exports', esbuild.transformSync(generate(spec), { loader: 'ts', format: 'cjs' }).code)(mod, mod.exports);
  return mod.exports.parse;
}
/** Parse in both runtimes, require the same answer, and return compile()'s. */
function both(spec: GrammarSpec, input: string) {
  const a = compile(spec).parse(input);
  const g = gen(spec)(input);
  const b = g.ok ? { ok: true, node: toNodes(g.tree, spec.start, 0, input.length) } : g;
  expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  return a;
}
const spans = (n: Node, out: string[] = []): string[] => {
  for (const k of n.kids) { out.push(`${k.kind}:${k.from}-${k.to}`); spans(k, out); }
  return out;
};

const letter = chars('abcdefghijklmnopqrstuvwxyz');
const SP = ' ';
// The flowchart shape in miniature: at a word start, `-x->` is an arrow and `-x` a word.
const arrow = node('arrow', seq('-', many(letter), '->'));
const word = node('word', seq(noneOf(SP), greedy(many(noneOf(SP)))));
const row = (first: Expr): GrammarSpec => ({ start: 'row', rules: { row: many(alt(chars(SP), first)) } });

describe('attempt(): what the checker accepts', () => {
  it('a strict choice between an arrow and a word is refused', () => {
    expect(lint(row(alt(arrow, word))).join('\n')).toMatch(/branches 0 and 1 can both start with "-"/);
  });

  it('accepts the overlap when the attempt comes first', () => {
    expect(lint(row(alt(attempt(arrow, { max: 8, next: SP }), word)))).toEqual([]);
  });

  it('refuses the overlap when the attempt comes after the branch it overlaps', () => {
    expect(lint(row(alt(word, attempt(arrow, { max: 8, next: SP })))).join('\n')).toMatch(/branches 0 and 1 can both start/);
  });

  it('still refuses two ordinary branches that overlap, beside an attempt', () => {
    const spec = row(alt(attempt(arrow, { max: 8, next: SP }), word, node('dash', '-')));
    expect(lint(spec).join('\n')).toMatch(/branches 1 and 2 can both start with "-"/);
  });

  it('refuses an attempt inside an attempt', () => {
    const spec: GrammarSpec = { start: 's', rules: { s: attempt(seq('a', attempt('b', { max: 1, next: 'c' })), { max: 4, next: 'c' }) } };
    expect(lint(spec).join('\n')).toMatch(/can reach another attempt/);
  });

  it('refuses an attempt that reaches another through a rule', () => {
    const spec: GrammarSpec = {
      start: 's',
      rules: { s: alt(attempt(seq('a', ref('inner')), { max: 4, next: ' ' }), 'b'), inner: alt(attempt('x', { max: 1, next: ' ' }), 'y') },
    };
    expect(lint(spec).join('\n')).toMatch(/can reach another attempt \(through rule "inner"\)/);
  });

  it('refuses an attempt reached through recursion (it would multiply once per level)', () => {
    const spec: GrammarSpec = { start: 's', rules: { s: alt(attempt(seq('(', opt(ref('s')), ')'), { max: 8, next: ' ' }), 'x') } };
    expect(lint(spec).join('\n')).toMatch(/can reach another attempt \(through rule "s"\)/);
  });

  it('accepts attempts side by side and one after another (they never multiply)', () => {
    const spec: GrammarSpec = {
      start: 's',
      rules: { s: many(alt(attempt(seq('a', 'b'), { max: 2, next: 'c' }), attempt(seq('a', 'c'), { max: 2, next: 'c' }), chars('abc'))) },
    };
    expect(lint(spec)).toEqual([]);
    expect(both(spec, 'acabcab').ok).toBe(true);
  });

  it('refuses until() inside an attempt, directly or through a rule', () => {
    const direct: GrammarSpec = { start: 's', rules: { s: attempt(seq('/*', until('*/')), { max: 16, next: ' ' }) } };
    const viaRule: GrammarSpec = { start: 's', rules: { s: attempt(seq('/', ref('c')), { max: 16, next: ' ' }), c: seq('*', until('*/')) } };
    expect(lint(direct).join('\n')).toMatch(/cannot contain until\(\)/);
    expect(lint(viaRule).join('\n')).toMatch(/cannot contain until\(\).*through rule "c"/);
  });

  it('refuses an attempt whose body can match nothing', () => {
    expect(lint({ start: 's', rules: { s: seq(attempt(opt('a'), { max: 1, next: 'b' }), 'b') } }).join('\n')).toMatch(/body of attempt can match nothing/);
  });

  it('checks the body against `next` and the end, not against what follows the attempt', () => {
    // Inside the attempt a run of letters stops at a space; what follows the attempt (another
    // letter, through the word branch) does not make the body's loop ambiguous.
    const spec = row(alt(attempt(node('w', many1(letter)), { max: 8, next: SP }), word));
    expect(lint(spec)).toEqual([]);
    // But the body's own decisions stay strict: a loop that can also end on `next` is refused.
    expect(lint({ start: 's', rules: { s: attempt(seq(many(chars('a ')), ' '), { max: 4, next: ' ' }) } }).join('\n')).toMatch(/could either repeat the body or follow it/);
  });

  it('refuses a hand-built attempt the constructor would have refused', () => {
    const hand = (max: unknown, next: unknown): GrammarSpec => ({
      start: 's',
      rules: { s: alt({ t: 'attempt', x: seq('a', 'b'), max, next } as unknown as Expr, 'a') },
    });
    expect(lint(hand(1e9, [32, 32])).join('\n')).toMatch(/max must be a whole number from 1 to 256, not 1000000000/);
    expect(lint(hand('2', [32, 32])).join('\n')).toMatch(/max must be a whole number/);
    for (const bad of [null, [32], [null, null], ['a', 'b'], [40, 32], [1.5, 40], [-1, 3], [0, 0x10000]]) {
      expect(lint(hand(2, bad)).join('\n'), JSON.stringify(bad)).toMatch(/next must be a CharSet/);
      expect(() => compile(hand(2, bad)), JSON.stringify(bad)).toThrow(GrammarError);
    }
    expect(lint({ start: 's', rules: { s: { t: 'set', cs: [null, null] } as unknown as Expr } }).join('\n')).toMatch(/a set must be a CharSet/);
    expect(lint(hand(2, [32, 32]))).toEqual([]);
  });

  it('validates its options', () => {
    expect(() => attempt('a', { max: 0, next: ' ' })).toThrow(/max from 1/);
    expect(() => attempt('a', { max: MAX_ATTEMPT + 1, next: ' ' })).toThrow(/max from 1/);
    expect(() => attempt('a', { max: 1.5, next: ' ' })).toThrow(/max from 1/);
    expect(() => attempt('a', { max: 4 } as unknown as { max: number; next: string })).toThrow(/needs a `next` set/);
    expect(() => attempt('a', { max: 4, next: null } as unknown as { max: number; next: string })).toThrow(/needs a `next` set/);
    expect(() => attempt('a', { max: 4, next: 5 } as unknown as { max: number; next: string })).toThrow(/needs a `next` set/);
  });
});

describe('attempt(): what it reads', () => {
  const spec = row(alt(attempt(arrow, { max: 8, next: SP }), word));

  it('keeps the attempt when it parses and a `next` character or the end follows', () => {
    const r = both(spec, 'a -x-> b');
    expect(r.ok && spans(r.node)).toEqual(['word:0-1', 'arrow:2-6', 'word:7-8']);
    const end = both(spec, 'a -x->');
    expect(end.ok && spans(end.node)).toEqual(['word:0-1', 'arrow:2-6']);
  });

  it('rewinds and hands the character on when the attempt does not parse', () => {
    const r = both(spec, '-x b');
    expect(r.ok && spans(r.node)).toEqual(['word:0-2', 'word:3-4']);
  });

  it('rewinds when the attempt parses but no `next` character follows (`->x` is a word)', () => {
    const r = both(spec, 'a ->x b');
    expect(r.ok && spans(r.node)).toEqual(['word:0-1', 'word:2-5', 'word:6-7']);
  });

  it('reads at most `max` characters: a longer arrow is a word', () => {
    const r = both(spec, '-abcdef-> z'); // 9 characters, max 8
    expect(r.ok && spans(r.node)).toEqual(['word:0-9', 'word:10-11']);
    const fits = both(spec, '-abcde-> z'); // 8
    expect(fits.ok && spans(fits.node)).toEqual(['arrow:0-8', 'word:9-10']);
  });

  it('sees the end of its window as the end of the input (a literal cannot run past it)', () => {
    const lits: GrammarSpec = { start: 's', rules: { s: many(alt(attempt(node('k', seq('ab', 'cd')), { max: 3, next: SP }), node('c', chars('abcd ')))) } };
    const r = both(lits, 'abcd');
    expect(r.ok && spans(r.node)).toEqual(['c:0-1', 'c:1-2', 'c:2-3', 'c:3-4']);
  });

  it('drops the nodes a failed attempt kept', () => {
    const tagged = row(alt(attempt(node('arrow', seq(node('shaft', '-'), node('label', many(letter)), '->')), { max: 8, next: SP }), word));
    const r = both(tagged, '-ab z');
    expect(r.ok && spans(r.node)).toEqual(['word:0-3', 'word:4-5']);
  });

  // The PR's red team and inversion review: both runtimes try attempts BEFORE the empty branch,
  // wherever it is listed, so an attempt that can start what follows the choice would win over
  // matching nothing and refuse input the empty branch reads ("ab" here). Refused, as an
  // ordinary branch overlapping that FOLLOW is.
  it('refuses an attempt that can start what follows a choice that can match nothing', () => {
    const after: GrammarSpec = { start: 's', rules: { s: seq(alt(attempt(node('a', seq('a', 'b')), { max: 2, next: 'c' }), seq()), chars('a'), 'x') } };
    const before: GrammarSpec = { start: 's', rules: { s: seq(alt(opt('q'), attempt(seq('a', 'b'), { max: 2, next: '' })), chars('a'), many(chars('ab'))) } };
    expect(lint(after).join('\n')).toMatch(/matches nothing, and "a" could either start another branch or follow/);
    expect(lint(before).join('\n')).toMatch(/matches nothing, and "a" could either start another branch or follow/);
  });

  it('a failed attempt beside an empty branch hands the character on to it', () => {
    const s: GrammarSpec = { start: 's', rules: { s: seq(alt(attempt(node('a', seq('a', 'b')), { max: 2, next: 'c' }), seq()), 'c') } };
    expect(lint(s)).toEqual([]);
    expect(both(s, 'abc').ok).toBe(true);
    const r = both(s, 'ac'); // the attempt fails at "c", the empty branch takes over, "c" is expected and "a" found
    expect(!r.ok && r.error).toEqual({ at: 0, expected: '"c"', found: 'a' });
  });

  it('a later branch\'s error is the one reported, not the failed attempt\'s', () => {
    const s: GrammarSpec = { start: 's', rules: { s: alt(attempt(seq('-', '>'), { max: 2, next: SP }), seq('-', 'x')) } };
    const r = both(s, '-y');
    expect(!r.ok && r.error).toEqual({ at: 1, expected: '"x"', found: 'y' });
  });

  // Outside a choice a failed attempt is an error, and it says WHY the attempt failed: an earlier
  // version reported what the attempt's first character should have been — `expected "-", found
  // "-"` (the red team and the inversion review).
  it('outside a choice, a failed attempt reports why it failed', () => {
    const s: GrammarSpec = { start: 's', rules: { s: seq('a', attempt(seq('-', many(chars('x')), '->'), { max: 6, next: SP }), ' ') } };
    expect(both(s, 'a-x-> ').ok).toBe(true);
    const inner = both(s, 'a-x- ');
    expect(!inner.ok && inner.error).toEqual({ at: 3, expected: '"->"', found: '-' });
    const next = both(s, 'a-x->y');
    expect(!next.ok && next.error).toEqual({ at: 5, expected: 'space or end of input', found: 'y' });
    const window = both(s, 'a-xxxxxx-> ');
    expect(!window.ok && window.error).toEqual({ at: 7, expected: 'the end within 6 characters', found: 'x' });
    // A literal the window cuts in two (the second checker): the text DOES hold "bc" there, so
    // the error is the window's, not 'expected "bc", found "b"'.
    const cut: GrammarSpec = { start: 's', rules: { s: seq(attempt(seq('a', 'bc'), { max: 2, next: SP }), ' ') } };
    const r = both(cut, 'abc ');
    expect(!r.ok && r.error).toEqual({ at: 2, expected: 'the end within 2 characters', found: 'c' });
    // A loop the window stops: the body wanted more than max, not a space.
    const loop: GrammarSpec = { start: 's', rules: { s: seq(attempt(many1(chars('abcd')), { max: 3, next: SP }), ' ') } };
    const l = both(loop, 'abcd ');
    expect(!l.ok && l.error).toEqual({ at: 3, expected: 'the end within 3 characters', found: 'd' });
  });

  it('restores the nesting depth a failed attempt spent', () => {
    // The attempt recurses through `p` (allowed: `p` holds no attempt) and fails deep inside;
    // the depth it spent must not count against the rest of the parse.
    const s: GrammarSpec = {
      start: 's',
      maxDepth: 4,
      rules: {
        s: many(alt(attempt(node('p', ref('p')), { max: 16, next: ' ' }), chars('() '))),
        p: seq('(', opt(ref('p')), ')'),
      },
    };
    expect(lint(s)).toEqual([]);
    // Three unclosed levels fail the attempt; then `(())` still nests within the cap of 4.
    const r = both(s, '((( (())');
    expect(r.ok).toBe(true);
  });
});

describe('attempt(): the generated parser', () => {
  // x_K explains why a BARE attempt failed; an attempt in a choice hands its character on instead
  // and never reads it. Emitting it anyway left four unused functions in the committed flowchart
  // row parser (PR #2545's code-quality scan).
  it('writes the failure explanation only for an attempt used bare', () => {
    const arrow = () => attempt(node('a', seq('-', '>')), { max: 4, next: ' ' });
    const inChoice = generate({ start: 'r', rules: { r: many(alt(arrow(), chars('-> x', 'c'))) } });
    const bare = generate({ start: 'r', rules: { r: seq(arrow(), many(chars('x', 'x'))) } });
    expect(inChoice).toMatch(/function t_0\(/);
    expect(inChoice).not.toMatch(/function x_0\(/);
    expect(bare).toMatch(/function x_0\(/);
    expect(bare).toMatch(/err = x_0\(\)/);
  });
});

describe('attempt(): the linear bound', () => {
  // Every word start opens an attempt that reads its whole window and fails: the worst case.
  const spec = row(alt(attempt(arrow, { max: 64, next: SP }), word));
  const hostile = (n: number) => `-${'x'.repeat(62)} `.repeat(Math.ceil(n / 64)).slice(0, n);

  it('costs at most max x input with one attempt per position, in both runtimes', () => {
    const c = compile(spec);
    const g = gen(spec);
    const time = (f: () => unknown) => { let best = Infinity; for (let k = 0; k < 5; k++) { const t = performance.now(); f(); best = Math.min(best, performance.now() - t); } return best; };
    const input = hostile(256_000);
    expect(c.parse(input).ok).toBe(true);
    expect(g(input).ok).toBe(true);
    // 256k characters, each read about twice: generous ceilings that a quadratic parse
    // (a window running to the end of the input) misses by orders of magnitude.
    expect(time(() => c.parse(input))).toBeLessThan(1_500);
    expect(time(() => g(input))).toBeLessThan(1_500);
  });

  // A run LONGER than the window, under an attempt at every position. The generator finishes a
  // long run with a regular expression, which cannot stop at a window's end; used inside an
  // attempt it read the rest of the run each time — 8.7 s at 160k characters where the parse
  // takes 0.15 s. The tree was right throughout, so only a timing catches it.
  it('a loop inside an attempt reads no further than the window, however long the run', () => {
    const a = chars('a');
    const g = gen({ start: 'r', rules: { r: many(alt(attempt(seq(many(a), 'b'), { max: 256, next: ' ' }), a)) } });
    const time = (s: string) => { g(s); let best = Infinity; for (let k = 0; k < 3; k++) { const t = performance.now(); g(s); best = Math.min(best, performance.now() - t); } return best; };
    expect(g('a'.repeat(1000)).ok).toBe(true);
    // 160k characters, each read about 256 times by design (max x input): about 0.15 s here. The
    // quadratic version took about 60x that.
    expect(time('a'.repeat(160_000))).toBeLessThan(2_000);
  });
});

// ── random grammars with attempts, against a reference interpreter ─────────
// The reference is the documented semantics written as plainly as possible: positions as return
// values, no shared state, nothing to save or restore, and choices tried in order with
// backtracking (PEG) rather than dispatched. Only `set` reads a character class.
const ALPHA = ['a', 'b', 'c'];
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
    if (k < 0.7) return chars(ALPHA.filter(() => r() < 0.6).join('') || 'a');
    if (k < 0.8) return seq(pick(ALPHA) + pick(ALPHA));
    return ref(pick(RULES));
  }
  const sub = () => randomExpr(r, depth - 1);
  const attemptOf = () => attempt(sub(), { max: 1 + Math.floor(r() * 4), next: [...ALPHA, 'd'].filter(() => r() < 0.4).join('') || 'd' });
  switch (Math.floor(r() * 9)) {
    // An attempt beside a branch that can match nothing, then a successor: the shape where an
    // attempt can shadow the empty branch (the checker must refuse it when the two overlap).
    case 8: return seq(r() < 0.5 ? alt(attemptOf(), opt(sub())) : alt(opt(sub()), attemptOf()), sub());
    case 0: return seq(sub(), sub());
    case 1: return alt(sub(), sub());
    case 2: return alt(attemptOf(), sub(), sub());
    case 3: return alt(attemptOf(), attemptOf(), sub());
    case 4: return opt(sub());
    case 5: return r() < 0.5 ? many(sub()) : many1(sub());
    case 6: return attemptOf();
    default: return node(pick(['x', 'y']), sub());
  }
}

type Out = { end: number; kids: Node[] } | null;
function reference(spec: GrammarSpec, s: string, stats: { fellThrough: number }) {
  // Which expressions can match nothing: its own fixpoint over the rules, not analyze()'s.
  const nullable = new Map<Expr, boolean>();
  const canBeEmpty = (e: Expr): boolean => {
    switch (e.t) {
      case 'lit': case 'set': return false;
      case 'seq': return e.xs.every(canBeEmpty);
      case 'alt': return e.xs.some(canBeEmpty);
      case 'many': return e.min === 0 || canBeEmpty(e.x);
      case 'opt': return true;
      case 'ref': return nullable.get(spec.rules[e.name]) ?? false;
      case 'node': case 'attempt': return canBeEmpty(e.x);
      case 'until': return e.orEnd;
    }
  };
  for (let changed = true; changed; ) {
    changed = false;
    for (const body of Object.values(spec.rules)) {
      const v = canBeEmpty(body);
      if (v !== (nullable.get(body) ?? false)) { nullable.set(body, v); changed = true; }
    }
  }
  const inSet = (cs: readonly number[], c: number) => {
    for (let k = 0; k < cs.length; k += 2) if (c >= cs[k] && c <= cs[k + 1]) return true;
    return false;
  };
  const tryIt = (e: Extract<Expr, { t: 'attempt' }>, i: number, n: number): Out => {
    const r = run(e.x, i, Math.min(n, i + e.max));
    if (r && (r.end >= n || inSet(e.next, s.charCodeAt(r.end)))) return r;
    stats.fellThrough++;
    return null;
  };
  const run = (e: Expr, i: number, n: number): Out => {
    switch (e.t) {
      case 'lit': return i + e.s.length <= n && s.startsWith(e.s, i) ? { end: i + e.s.length, kids: [] } : null;
      case 'set': return i < n && inSet(e.cs, s.charCodeAt(i)) ? { end: i + 1, kids: [] } : null;
      case 'seq': {
        let at = i;
        const kids: Node[] = [];
        for (const x of e.xs) { const r = run(x, at, n); if (!r) return null; at = r.end; kids.push(...r.kids); }
        return { end: at, kids };
      }
      // ORDERED CHOICE, in the order written, with backtracking: no FIRST sets and no dispatch,
      // so this does not restate how the runtimes choose. Where the checker's LL(1) promise
      // holds, the first branch that matches is the one dispatch would pick; where a branch can
      // still be reached after another fails, the two disagree, and that is a checker hole
      // (an earlier version restated the runtimes' dispatch, and could not see one). The one
      // rule taken from Segno rather than PEG is its documented one: a branch that can match
      // nothing is the FALLBACK, tried after every branch that cannot, wherever it is listed.
      // So this reference cannot see an attempt that shadows that fallback, because the rule
      // that lets it is the one copied here; the unit tests above pin that refusal instead.
      // (Measured: reopening it passed 8,000 grammars here and failed a unit test above.)
      case 'alt': {
        for (const x of e.xs) {
          if (canBeEmpty(x)) continue;
          const r = x.t === 'attempt' ? tryIt(x, i, n) : run(x, i, n);
          if (r) return r;
        }
        for (const x of e.xs) { if (!canBeEmpty(x)) continue; const r = run(x, i, n); if (r) return r; }
        return null;
      }
      case 'opt': { const r = run(e.x, i, n); return r ?? { end: i, kids: [] }; }
      case 'many': {
        let at = i;
        const kids: Node[] = [];
        if (e.min) { const r = run(e.x, at, n); if (!r) return null; at = r.end; kids.push(...r.kids); }
        for (;;) { const r = run(e.x, at, n); if (!r || r.end === at) break; at = r.end; kids.push(...r.kids); }
        return { end: at, kids };
      }
      case 'ref': return run(spec.rules[e.name], i, n);
      case 'node': { const r = run(e.x, i, n); return r && { end: r.end, kids: [{ kind: e.kind, from: i, to: r.end, kids: r.kids }] }; }
      case 'attempt': return tryIt(e, i, n);
      case 'until': throw new Error('the random grammars do not use until()');
    }
  };
  const r = run(spec.rules[spec.start], 0, s.length);
  return r && r.end === s.length ? { ok: true, node: { kind: spec.start, from: 0, to: s.length, kids: r.kids } } : { ok: false };
}

const ALL: string[] = [''];
for (let n = 1; n <= 5; n++) for (const s of ALL.filter((x) => x.length === n - 1)) for (const c of [...ALPHA, 'd']) if (!(n === 5 && c === 'd')) ALL.push(s + c);

describe('random grammars with attempts: compiled = reference, generated = compiled', () => {
  it('holds on 8,000 random grammars, every string up to 5 characters', () => {
    const r = rng(2519);
    let compiled = 0;
    let refused = 0;
    let generatedChecked = 0;
    const stats = { fellThrough: 0 };
    const bad: string[] = [];
    for (let g = 0; g < 8000 && bad.length < 3; g++) {
      const spec: GrammarSpec = { start: 'r0', rules: Object.fromEntries(RULES.map((k) => [k, randomExpr(r, 3)])) };
      let grammar: ReturnType<typeof compile>;
      try { grammar = compile(spec); } catch (e) { if (!(e instanceof GrammarError)) throw e; refused++; continue; }
      if (!JSON.stringify(spec).includes('"attempt"')) continue;
      compiled++;
      const g2 = g % 2 === 0 ? gen(spec) : null;
      for (const s of ALL) {
        const got = grammar.parse(s);
        const want = reference(spec, s, stats);
        if (got.ok !== want.ok || (got.ok && JSON.stringify(got.node) !== JSON.stringify((want as { node: Node }).node))) {
          bad.push(`grammar #${g}, ${JSON.stringify(s)}: compiled ${JSON.stringify(got)}, reference ${JSON.stringify(want)}`);
        }
        if (g2) {
          const gr = g2(s);
          const asNodes = gr.ok ? { ok: true, node: toNodes(gr.tree, 'r0', 0, s.length) } : gr;
          if (JSON.stringify(asNodes) !== JSON.stringify(got)) bad.push(`grammar #${g}, ${JSON.stringify(s)}: generated ${JSON.stringify(asNodes)} vs compiled ${JSON.stringify(got)}`);
          generatedChecked++;
        }
      }
    }
    expect(bad).toEqual([]);
    // At seed 2519: 290 compile with an attempt, 7,259 refused, 170,786 generated-parser
    // comparisons, 146,745 attempts that failed and rewound.
    if (process.env.SEGNO_FUZZ_STATS) console.error({ compiled, refused, generatedChecked, fellThrough: stats.fellThrough });
    // Not vacuous: grammars with attempts compile, attempts fail and rewind, codegen runs.
    expect(compiled).toBeGreaterThan(250);
    expect(stats.fellThrough).toBeGreaterThan(50_000);
    expect(generatedChecked).toBeGreaterThan(100_000);
  }, 120_000);
});
