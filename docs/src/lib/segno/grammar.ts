/**
 * The grammar vocabulary and its compiler.
 *
 * A grammar is data: a map of named rules built from eight constructors — `lit`, `set`,
 * `seq`, `alt`, `many`, `many1`, `opt`, `ref` — plus `node`, which marks what the parse
 * tree keeps. `compile` checks the grammar and turns it into a parser.
 *
 * THE CHECK IS THE POINT. A grammar compiles only if it can be read left to right with ONE
 * character of lookahead and no backtracking (LL(1), over characters):
 *
 *   - every `alt` decides its branch from the next character: no two branches may start
 *     with the same character, and at most one may match nothing;
 *   - every `many`/`opt` decides whether to go round again from the next character: its
 *     body may not match nothing, and may not start with a character that could also
 *     FOLLOW the loop;
 *   - no rule may reach itself without consuming a character (left recursion).
 *
 * A grammar that passes is parsed in time proportional to its input, always: every step
 * either consumes a character or ends the parse, and no decision is ever revisited. That
 * is what the parser bake-off (engineering/decisions/2026-09-28-parser-library-bakeoff.md)
 * could not get from any library on our two context-sensitive grammars, and what the
 * shipped kernels only have by careful review. Here it is a property of compiling at all.
 */

import {
  ANY, type CharSet, compileTest, complement, describe, EMPTY, fromRanges, intersect, isEmpty,
  MAX_UNIT, ofChars, ofRange, union,
} from './charset.js';

// ── the vocabulary ──────────────────────────────────────────────────────────

export type Expr =
  | { readonly t: 'lit'; readonly s: string }
  | { readonly t: 'set'; readonly cs: CharSet; readonly label?: string }
  | { readonly t: 'seq'; readonly xs: readonly Expr[] }
  | { readonly t: 'alt'; readonly xs: readonly Expr[] }
  | { readonly t: 'many'; readonly x: Expr; readonly min: 0 | 1; readonly greedy?: true }
  | { readonly t: 'opt'; readonly x: Expr; readonly greedy?: true }
  | { readonly t: 'until'; readonly s: string; readonly orEnd: boolean }
  | { readonly t: 'attempt'; readonly x: Expr; readonly max: number; readonly next: CharSet }
  | { readonly t: 'ref'; readonly name: string }
  | { readonly t: 'node'; readonly kind: string; readonly x: Expr };

type Part = Expr | string;
const part = (p: Part): Expr => (typeof p === 'string' ? lit(p) : p);

/** A literal string. */
export const lit = (s: string): Expr => {
  if (!s) throw new Error('segno: lit() needs at least one character');
  return { t: 'lit', s };
};
/** One character from a set. `label` names it in error messages ("a digit"). */
export const set = (cs: CharSet, label?: string): Expr => ({ t: 'set', cs: normalize(cs), label });

/**
 * A set as the engine needs it: sorted, merged pairs inside 0..0xFFFF. `set()` is public, so a
 * hand-built set may hold anything, and a code below 0 is the parser's END OF INPUT: a set
 * holding -1 made the generated loop `while (c === -1) i++` spin forever at the end.
 */
function normalize(cs: CharSet): CharSet {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i + 1 < cs.length; i += 2) {
    const lo = Math.max(0, Math.ceil(cs[i]));
    const hi = Math.min(MAX_UNIT, Math.floor(cs[i + 1]));
    if (lo <= hi) pairs.push([lo, hi]);
  }
  return fromRanges(pairs);
}
/** One of these characters. */
// The engine reads UTF-16 code units, so a set can hold only characters that are one unit each. A
// character outside the Basic Multilingual Plane (an emoji) is two, and a set built from its halves
// matched neither half alone and parsed nothing, silently. Refused here instead; `lit()` matches one.
function oneUnit(ch: string, where: string): void {
  if (ch.length !== 1) throw new Error(`segno: ${where}: "${ch}" is not one character — use lit() for a sequence or a character outside the Basic Multilingual Plane`);
  const c = ch.charCodeAt(0);
  if (c >= 0xd800 && c <= 0xdfff) throw new Error(`segno: ${where}: "${ch}" is half of a character outside the Basic Multilingual Plane — use lit() to match the whole character`);
}

export const oneOf = (chars: string, label?: string): Expr => {
  for (const ch of chars) oneUnit(ch, `chars(${JSON.stringify(chars)})`);
  return set(ofChars(chars), label);
};
/** Any character NOT in `chars` (and not in the extra sets). */
export const noneOf = (chars: string, label?: string, ...more: CharSet[]): Expr =>
  set(complement(union(ofChars(chars), ...more)), label);
/** One character in `from`..`to`. */
export const range = (from: string, to: string, label?: string): Expr => {
  const where = `charRange(${JSON.stringify(from)}, ${JSON.stringify(to)})`;
  oneUnit(from, where);
  oneUnit(to, where);
  if (from > to) throw new Error(`segno: ${where}: the range runs backwards, so it can match nothing`);
  return set(ofRange(from, to), label);
};
/** Any one character. */
export const any = (): Expr => set(ANY, 'any character');
export const seq = (...xs: Part[]): Expr => ({ t: 'seq', xs: xs.map(part) });
export const alt = (...xs: Part[]): Expr => ({ t: 'alt', xs: xs.map(part) });
export const many = (x: Part): Expr => ({ t: 'many', x: part(x), min: 0 });
export const many1 = (x: Part): Expr => ({ t: 'many', x: part(x), min: 1 });
export const opt = (x: Part): Expr => ({ t: 'opt', x: part(x) });
/**
 * Mark a loop (`many`, `many1`) or an `opt` GREEDY: when the next character could either go
 * round again or start what follows, it always goes round. This is "longest match", the rule
 * every lexer uses, and it is what the parser already does — the mark only tells the checker
 * the overlap is meant. It costs nothing at run time and keeps the linear bound: a step still
 * either consumes a character or stops. The checker still refuses a greedy loop whose
 * successor could NEVER be reached because the loop always eats its first character.
 */
export const greedy = (x: Part): Expr => {
  const e = part(x);
  if (e.t === 'many') return { t: 'many', x: e.x, min: e.min, greedy: true };
  if (e.t === 'opt') return { t: 'opt', x: e.x, greedy: true };
  throw new Error('segno: greedy() takes many(), many1() or opt()');
};
/**
 * Everything up to and including the literal `end`: a comment to its close, a script to its
 * `</script>`. One forward search, and the parse never goes back over what it searched.
 * When `end` never appears the parse fails there, unless `orEnd` is set, which reads to the end
 * of the input instead (an unclosed comment at the end of a file).
 *
 * The search is the engine's own `indexOf`, whose slow case costs about (input length) x
 * (terminator length). So the terminator is capped at `MAX_UNTIL` characters: with the cap, the
 * cost per character is bounded by a constant of the ENGINE, not of whoever wrote the grammar.
 * (Measured by the prototype's red team: a 16,384-character terminator cost 1.5 µs per input
 * character; a 32-character one, 4 ns.)
 */
export const MAX_UNTIL = 64;
export const until = (end: string, options: { orEnd?: boolean } = {}): Expr => {
  if (!end) throw new Error('segno: until() needs at least one character');
  if (end.length > MAX_UNTIL) throw new Error(`segno: until() takes a terminator of at most ${MAX_UNTIL} characters`);
  return { t: 'until', s: end, orEnd: !!options.orEnd };
};
/**
 * A BOUNDED ATTEMPT: read `x` on at most `max` characters, and keep it only if the character
 * after it is in `next` (or the input ends). Otherwise rewind to where it started, as if it had
 * never been tried. This is the one place the parser goes back, and it goes back a bounded
 * distance: each attempt reads at most `max` characters. So each position of the input costs at
 * most the sum of `max` over the attempts tried there, and those are bounded by the grammar
 * (attempts side by side in a choice, or in rules entered without consuming): linear in the
 * input, with a constant the grammar sets, as every choice's cost already is. A failure past
 * the nesting cap inside an attempt is that attempt failing, so the character passes on.
 *
 * As a branch of `alt`, an attempt may start with the same characters as the branches AFTER it:
 * when it fails, the character passes to them (and to a branch that matches nothing), in order.
 * That overlap is the only one the checker accepts, and only when the attempt comes first.
 * Anywhere else, a failed attempt is an ordinary parse error.
 *
 * The checker refuses an attempt that can reach another attempt (directly or through rule
 * references): nested attempts would multiply their `max` values, and an attempt reached through
 * recursion once per level. It also refuses `until()` inside an attempt (its search would run
 * past the window to the end of the input) and an attempt whose `x` can match nothing.
 *
 * Inside `x`, the end of the window reads as the end of the input, and `x` is checked as LL(1)
 * against `next` and the end: the attempt's own decisions are strict; only the attempt as a whole
 * is tried. (Phase 3's flowchart rows: `A -x-> B` is an arrow and `A -x B` a word, and the two
 * part only at the closing shaft, up to 64 characters past the `-`.)
 */
export const MAX_ATTEMPT = 256;
export const attempt = (x: Part, options: { max: number; next: string | CharSet }): Expr => {
  const { max, next } = options;
  if (!Number.isInteger(max) || max < 1 || max > MAX_ATTEMPT) {
    throw new Error(`segno: attempt() takes a max from 1 to ${MAX_ATTEMPT} characters, not ${max}`);
  }
  if (typeof next !== 'string' && !Array.isArray(next)) throw new Error('segno: attempt() needs a `next` set: the characters that may follow it, as a string or a CharSet');
  return { t: 'attempt', x: part(x), max, next: typeof next === 'string' ? ofChars(next) : normalize(next) };
};
/** A reference to another rule, so rules can recurse (a record holds values). */
export const ref = (name: string): Expr => ({ t: 'ref', name });
/** Keep this span in the parse tree as a node of `kind`. */
export const node = (kind: string, x: Part): Expr => ({ t: 'node', kind, x: part(x) });

export interface GrammarSpec {
  readonly start: string;
  readonly rules: Readonly<Record<string, Expr>>;
  /**
   * How deep rule references may nest, for this grammar (default `MAX_DEPTH`, 64). A document
   * format nests deeper than an inline span; the ceiling is `MAX_DEPTH_LIMIT`. Past the cap the
   * parse is an error, never a stack overflow.
   */
  readonly maxDepth?: number;
}

// ── the parse tree ──────────────────────────────────────────────────────────

/** A kept span of input. `from`/`to` are UTF-16 offsets; `kids` are the nodes inside it. */
export interface Node {
  readonly kind: string;
  readonly from: number;
  readonly to: number;
  readonly kids: readonly Node[];
}

export interface ParseError {
  /** Where the parse stopped, as a UTF-16 offset. */
  readonly at: number;
  /** What would have been accepted there. */
  readonly expected: string;
  /** The character found there, or null at the end of the input. */
  readonly found: string | null;
  /** `'stack'` when the parse stopped because the call stack ran out before the nesting cap, not
   *  because the input is wrong. Test this rather than comparing `expected` with STACK_EXHAUSTED,
   *  whose wording may change. Absent on an ordinary syntax error. */
  readonly code?: 'stack';
}

export type ParseResult = { ok: true; node: Node } | { ok: false; error: ParseError };

// ── the compiler's own errors ───────────────────────────────────────────────

/** A grammar that is not LL(1). `problems` lists every violation with its rule path. */
// Branded like SchemaError (schema.ts), so `instanceof` holds across the separately bundled entries.
const GRAMMAR_ERROR = Symbol.for('@laticent/segno/GrammarError');

export class GrammarError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`segno: this grammar is not linear (LL(1)):\n  - ${problems.join('\n  - ')}`);
    this.name = 'GrammarError';
    Object.defineProperty(this, GRAMMAR_ERROR, { value: true });
  }

  static [Symbol.hasInstance](x: unknown): boolean {
    return typeof x === 'object' && x !== null && (x as Record<symbol, unknown>)[GRAMMAR_ERROR] === true;
  }
}

// ── analysis: nullable, FIRST and FOLLOW for every expression ───────────────

/** What cannot come next after an expression: `a ∪ (b ∩ before)` (see `excludedSets`). */
interface Excluded {
  a: CharSet;
  b: CharSet;
}

interface Info {
  nullable: boolean;
  first: CharSet;
  follow: CharSet;
  followEnd: boolean; // the end of input may follow
  path: string;
}

/**
 * The strongly connected components of a graph over `names` (Tarjan's algorithm), dependencies
 * first. Iterative, so a long chain cannot overflow the stack.
 */
function sccs(names: readonly string[], edges: ReadonlyMap<string, readonly string[]>): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const groups: string[][] = [];
  let next = 0;
  for (const root of names) {
    if (index.has(root)) continue;
    const work: Array<[string, number]> = [[root, 0]];
    index.set(root, next); low.set(root, next); next++; stack.push(root); onStack.add(root);
    while (work.length) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      const refs = edges.get(v) ?? [];
      if (i < refs.length) {
        frame[1]++;
        const w = refs[i];
        if (!index.has(w)) {
          index.set(w, next); low.set(w, next); next++; stack.push(w); onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v) as number, index.get(w) as number));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work[work.length - 1][0];
        low.set(u, Math.min(low.get(u) as number, low.get(v) as number));
      }
      if (low.get(v) === index.get(v)) {
        const group: string[] = [];
        let w: string;
        do { w = stack.pop() as string; onStack.delete(w); group.push(w); } while (w !== v);
        groups.push(group);
      }
    }
  }
  return groups;
}

/** A CharSet as the passes assume it: pairs of whole numbers in 0..0xFFFF, each low to high. */
const CHARSET_SHAPE = 'must be a CharSet: pairs of whole numbers from 0 to 65535, each low to high';
function isCharSet(cs: unknown): boolean {
  if (!Array.isArray(cs) || cs.length % 2 !== 0) return false;
  for (let k = 0; k < cs.length; k += 2) {
    const lo = cs[k];
    const hi = cs[k + 1];
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi > MAX_UNIT || lo > hi) return false;
  }
  return true;
}

class Analysis {
  readonly info = new Map<Expr, Info>();
  constructor(readonly spec: GrammarSpec) {
    for (const [name, body] of Object.entries(spec.rules)) this.visit(body, name);
    if (!Object.hasOwn(spec.rules, spec.start)) throw new GrammarError([`start rule "${spec.start}" is not defined`]);
  }

  /** Record every expression with its rule path, in preorder. Iterative, so deep nesting cannot overflow the stack. */
  private visit(root: Expr, rootPath: string) {
    const stack: Array<[Expr, string]> = [[root, rootPath]];
    while (stack.length) {
      const [e, path] = stack.pop() as [Expr, string];
      if (this.info.has(e)) continue;
      this.info.set(e, { nullable: false, first: EMPTY, follow: EMPTY, followEnd: false, path });
      switch (e.t) {
        // A hand-built set is checked too: `[null, null]` crashed the passes after this one.
        case 'set': if (!isCharSet(e.cs)) throw new GrammarError([`${path}: a set ${CHARSET_SHAPE}`]); break;
        case 'seq': case 'alt': for (let i = e.xs.length - 1; i >= 0; i--) stack.push([e.xs[i], `${path} › ${e.t}[${i}]`]); break;
        case 'many': stack.push([e.x, `${path} › ${e.min ? 'many1' : 'many'}`]); break;
        case 'opt': stack.push([e.x, `${path} › opt`]); break;
        case 'node': stack.push([e.x, `${path} › ${e.kind}`]); break;
        case 'attempt':
          // A grammar is data and may be built by hand: the constructor's checks again, before
          // any pass reads `next` (a null one crashed the FOLLOW pass) or trusts `max` (the
          // cost bound; a string one made the runtimes disagree).
          if (!Number.isInteger(e.max) || e.max < 1 || e.max > MAX_ATTEMPT) throw new GrammarError([`${path}: an attempt's max must be a whole number from 1 to ${MAX_ATTEMPT}, not ${String(e.max)}`]);
          if (!isCharSet(e.next)) throw new GrammarError([`${path}: an attempt's next ${CHARSET_SHAPE}`]);
          stack.push([e.x, `${path} › attempt`]);
          break;
        case 'ref': if (!Object.hasOwn(this.spec.rules, e.name)) throw new GrammarError([`${path}: unknown rule "${e.name}"`]); break;
        default: break;
      }
    }
  }


  /**
   * Who reads whom: `users.get(x)` is every expression whose nullable/FIRST is computed from `x`'s
   * (its parents, and for a rule body every `ref` to that rule). Built once, for the worklists.
   */
  private usersOf(): Map<Expr, Expr[]> {
    const users = new Map<Expr, Expr[]>();
    const use = (x: Expr, by: Expr) => {
      const list = users.get(x);
      if (list) list.push(by);
      else users.set(x, [by]);
    };
    for (const e of this.info.keys()) {
      switch (e.t) {
        case 'seq': case 'alt': for (const x of e.xs) use(x, e); break;
        case 'many': case 'opt': case 'node': case 'attempt': use(e.x, e); break;
        case 'ref': use(this.spec.rules[e.name], e); break;
        default: break;
      }
    }
    return users;
  }

  /**
   * Fixpoint for nullable + FIRST over every expression, across rule references. A worklist,
   * seeded in DEPENDENCY order (children before parents, a rule's references before the rule, by
   * the SCC groups): outside a cycle every expression is then computed once, from final inputs,
   * however the rules are listed. Only rules that reach each other iterate. (Sweeping every
   * expression per round cost a round per rule on a chain listed bottom-up, 12.8 s for 4,000
   * rules; a parents-first queue still cost a round per rule on a chain whose FIRST sets grow.)
   */
  firstSets() {
    const users = this.usersOf();
    const queue = this.dependencyOrder();
    const queued = new Set<Expr>(queue);
    for (let k = 0; k < queue.length; k++) {
      const e = queue[k];
      queued.delete(e);
      const inf = this.get(e);
      const { nullable, first } = this.compute(e);
      if (nullable === inf.nullable && first.length === inf.first.length && first.every((v, i) => v === inf.first[i])) continue;
      inf.nullable = nullable;
      inf.first = first;
      for (const u of users.get(e) ?? []) {
        if (!queued.has(u)) { queued.add(u); queue.push(u); }
      }
    }
  }

  private get(e: Expr) {
    return this.info.get(e) as Info;
  }

  private compute(e: Expr): { nullable: boolean; first: CharSet } {
    switch (e.t) {
      case 'lit': return { nullable: false, first: ofChars(e.s[0]) };
      case 'set': return { nullable: false, first: e.cs };
      case 'seq': {
        let first: CharSet = EMPTY;
        for (const x of e.xs) {
          const i = this.get(x);
          first = union(first, i.first);
          if (!i.nullable) return { nullable: false, first };
        }
        return { nullable: true, first };
      }
      case 'alt': return {
        nullable: e.xs.some((x) => this.get(x).nullable),
        first: union(...e.xs.map((x) => this.get(x).first)),
      };
      case 'many': { const i = this.get(e.x); return { nullable: e.min === 0 || i.nullable, first: i.first }; }
      case 'opt': return { nullable: true, first: this.get(e.x).first };
      case 'node': { const i = this.get(e.x); return { nullable: i.nullable, first: i.first }; }
      // An attempt that succeeds consumed what `x` did; one whose `x` can match nothing is refused.
      case 'attempt': { const i = this.get(e.x); return { nullable: i.nullable, first: i.first }; }
      case 'ref': { const i = this.get(this.spec.rules[e.name]); return { nullable: i.nullable, first: i.first }; }
      // Any character can start the text before the terminator; it matches nothing only when
      // `orEnd` lets it stop at the end of the input.
      case 'until': return { nullable: e.orEnd, first: ANY };
    }
  }

  /**
   * Every expression, children before parents, rule by rule in the SCC groups' order (a rule's
   * references first). Iterative, so a deep expression cannot overflow the stack here.
   */
  private dependencyOrder(): Expr[] {
    const out: Expr[] = [];
    const seen = new Set<Expr>();
    const { groups } = this.ruleGroups();
    for (const group of groups) {
      for (const name of group) {
        const stack: Array<[Expr, boolean]> = [[this.spec.rules[name], false]];
        while (stack.length) {
          const [e, done] = stack.pop() as [Expr, boolean];
          if (done) { out.push(e); continue; }
          if (seen.has(e)) continue;
          seen.add(e);
          stack.push([e, true]);
          switch (e.t) {
            case 'seq': case 'alt': for (let k = e.xs.length - 1; k >= 0; k--) stack.push([e.xs[k], false]); break;
            case 'many': case 'opt': case 'node': case 'attempt': stack.push([e.x, false]); break;
            default: break;
          }
        }
      }
    }
    return out;
  }

  /**
   * Fixpoint for FOLLOW: what may come right after each expression. A worklist, as `firstSets()`
   * is: FOLLOW flows from an expression to its children (and from a `ref` to the rule's body), so
   * an expression is re-pushed into its children only when its own FOLLOW grew.
   */
  followSets() {
    const start = this.get(this.spec.rules[this.spec.start]);
    start.followEnd = true;
    const queue: Expr[] = [...this.info.keys()];
    const queued = new Set<Expr>(queue);
    const add = (e: Expr, cs: CharSet, end: boolean) => {
      const i = this.get(e);
      const next = union(i.follow, cs);
      if (next.length !== i.follow.length || next.some((v, k) => v !== i.follow[k]) || (end && !i.followEnd)) {
        i.follow = next;
        i.followEnd = i.followEnd || end;
        if (!queued.has(e)) { queued.add(e); queue.push(e); }
      }
    };
    for (let q = 0; q < queue.length; q++) {
      const e = queue[q];
      queued.delete(e);
      const { follow, followEnd } = this.get(e);
      switch (e.t) {
        case 'seq': {
          let cs = follow;
          let end = followEnd;
          for (let k = e.xs.length - 1; k >= 0; k--) {
            add(e.xs[k], cs, end);
            const x = this.get(e.xs[k]);
            cs = x.nullable ? union(x.first, cs) : x.first;
            end = x.nullable && end;
          }
          break;
        }
        case 'alt': for (const x of e.xs) add(x, follow, followEnd); break;
        case 'many': add(e.x, union(this.get(e.x).first, follow), followEnd); break;
        case 'opt': case 'node': add(e.x, follow, followEnd); break;
        // Inside an attempt, `x` is followed by what the attempt checks for — `next` or the end —
        // not by the attempt's context: whatever else comes next, the attempt rewinds.
        case 'attempt': add(e.x, e.next, true); break;
        case 'ref': add(this.spec.rules[e.name], follow, followEnd); break;
        default: break;
      }
    }
  }

  /** Every LL(1) violation, with the path of the expression that causes it. */
  check(): string[] {
    const problems: string[] = [];
    this.excludedSets();
    for (const [e, inf] of this.info) {
      if (e.t === 'alt') {
        // Pairs are named up to MAX_PAIRS per alternation, then counted. A grammar can arrive at
        // run time, and naming every pair of 3,000 overlapping branches took 12.7 s and 4.5M strings.
        // `seen` is the union of the earlier branches' FIRST sets (an attempt left out: it may
        // overlap what follows it), so a branch that overlaps none of them costs one intersection.
        const MAX_PAIRS = 10;
        let named = 0;
        let more = 0;
        let seen: CharSet = EMPTY;
        for (let b = 0; b < e.xs.length; b++) {
          const fb = this.get(e.xs[b]).first;
          if (!isEmpty(intersect(seen, fb))) {
            if (named >= MAX_PAIRS) more++;
            else {
              for (let a = 0; a < b && named < MAX_PAIRS; a++) {
                if (e.xs[a].t === 'attempt') continue;
                const both = intersect(this.get(e.xs[a]).first, fb);
                if (!isEmpty(both)) { problems.push(`${inf.path}: branches ${a} and ${b} can both start with ${describe(both)}`); named++; }
              }
            }
          }
          if (e.xs[b].t !== 'attempt') seen = union(seen, fb);
        }
        if (more) problems.push(`${inf.path}: ${more} more branch${more === 1 ? '' : 'es'} can start with a character an earlier branch takes`);
        const empty = e.xs.map((x, k) => (this.get(x).nullable ? k : -1)).filter((k) => k >= 0);
        if (empty.length > 1) problems.push(`${inf.path}: branches ${empty.join(' and ')} can all match nothing`);
        if (empty.length === 1) {
          // Attempts count here: the runtime tries them BEFORE the empty branch, wherever they are
          // listed, so an attempt that can start what follows would win over matching nothing
          // and refuse input the empty branch reads (the PR's red team and inversion review).
          const others = union(...e.xs.filter((_, k) => k !== empty[0]).map((x) => this.get(x).first));
          const clash = intersect(others, inf.follow);
          if (!isEmpty(clash)) problems.push(`${inf.path}: branch ${empty[0]} matches nothing, and ${describe(clash)} could either start another branch or follow`);
        }
      }
      if (e.t === 'attempt') {
        if (this.get(e.x).nullable) problems.push(`${inf.path}: the body of attempt can match nothing`);
        const inner = this.attemptsIn(e.x);
        if (inner.attempt) problems.push(`${inf.path}: an attempt can reach another attempt${inner.via ? ` (through rule "${inner.via}")` : ''}, which would multiply their reads`);
        if (inner.until) problems.push(`${inf.path}: an attempt cannot contain until(), whose search runs past the attempt's window${inner.untilVia ? ` (through rule "${inner.untilVia}")` : ''}`);
      }
      if (e.t === 'many' || e.t === 'opt') {
        const body = this.get(e.x);
        const what = e.t === 'opt' ? 'opt' : e.min ? 'many1' : 'many';
        if (body.nullable) problems.push(`${inf.path}: the body of ${what} can match nothing, so the loop could spin without consuming`);
        const clash = intersect(body.first, inf.follow);
        if (!isEmpty(clash) && !e.greedy) problems.push(`${inf.path}: after ${what}, ${describe(clash)} could either repeat the body or follow it`);
      }
      // A greedy loop always eats the characters it can take, so what comes after it in a
      // sequence must be able to start with something else, or it is dead code.
      if (e.t === 'seq') {
        let eaten: CharSet = EMPTY;
        for (let k = 0; k + 1 < e.xs.length; k++) {
          eaten = this.excludedAfter(e.xs[k], eaten);
          if (isEmpty(eaten)) continue;
          const after = e.xs.slice(k + 1);
          const restNullable = after.every((x) => this.get(x).nullable);
          let restFirst: CharSet = EMPTY;
          for (const x of after) { restFirst = union(restFirst, this.get(x).first); if (!this.get(x).nullable) break; }
          if (!restNullable && !isEmpty(restFirst) && isEmpty(intersect(restFirst, complement(eaten)))) {
            problems.push(`${inf.path}: seq[${k + 1}] can never match: it must start with ${describe(restFirst)}, which the greedy loop before it always takes`);
          }
        }
      }
    }
    // Left recursion: a rule that reaches itself through a nullable prefix — exactly the rules on
    // a cycle of the "can enter before consuming" graph. One SCC pass; a search from every rule
    // cost quadratic time on a long chain.
    const names = Object.keys(this.spec.rules);
    const leads = new Map(names.map((n) => [n, this.leadingRefs(this.spec.rules[n])]));
    const onCycle = new Set<string>();
    for (const group of sccs(names, leads)) {
      if (group.length > 1 || (leads.get(group[0]) as string[]).includes(group[0])) for (const r of group) onCycle.add(r);
    }
    for (const name of names) if (onCycle.has(name)) problems.push(`rule "${name}" can reach itself without consuming a character (left recursion)`);
    return [...new Set(problems)];
  }

  /**
   * The characters that can NOT come next once an expression has matched, however it matched.
   * A loop only stops when the next character cannot start its body, so after a greedy `many`
   * that is the body's FIRST set. After an `opt` it is what holds on both paths: taken (what its body
   * leaves) and skipped (its FIRST, plus what was already excluded). After a choice it is what
   * holds after every branch. Anything else that consumes leaves nothing excluded.
   *
   * The answer depends on what was excluded BEFORE the expression, and it always has the shape
   * `a ∪ (b ∩ before)` (every step is a union or an intersection, and sets distribute), so each
   * expression is summarized once as the pair `{ a, b }`, and each rule once, in dependency
   * order (below), so a rule reached by many routes is still visited once. Walking references
   * instead re-walked a shared rule once per route: exponential, and a 25-rule grammar took
   * 10 s to compile (found by the PR's checker).
   *
   * Starting from empty gives the LEAST fixpoint, which is never larger than the true answer.
   * Too small only lets a grammar through, so the check can miss dead code but never refuses
   * a live successor. Only greedy loops make this matter: in a strict grammar the LL(1) check
   * already refuses a successor that a loop could take.
   */
  private excluded = new Map<Expr, Excluded>();

  private excludedSets() {
    const NONE: Excluded = { a: EMPTY, b: EMPTY };
    const names = Object.keys(this.spec.rules);
    const rules = new Map<string, Excluded>(names.map((k) => [k, NONE]));
    const same = (x: CharSet, y: CharSet) => x.length === y.length && x.every((v, i) => v === y[i]);
    this.excluded = new Map();

    // One expression's summary, given the current summaries of the rules it references. `memo`
    // is per round, so a rule that changes is re-read on the next round of its own group.
    const summarize = (e: Expr, memo: Map<Expr, Excluded>): Excluded => {
      const of = (x: Expr) => memo.get(x) as Excluded; // children are summarized first
      let out: Excluded;
      switch (e.t) {
        // Visit the body even though the loop's own answer does not depend on it: the check
        // reads the summary of every sequence, including one nested inside a loop. Skipping it
        // left nested sequences unsummarized, and the differential fuzz caught 400 missed
        // refusals in 60,000 grammars.
        // Only a GREEDY `many` counts. A plain loop stops on the same characters, but in a
        // grammar that passes the LL(1) check its body cannot start what follows it, so it can
        // never starve a successor; counting it only repeated that check's refusal under a
        // message that called the loop greedy (the /segno page's "greedy, then a quote" preset).
        // An `opt` counts whether or not it is greedy: it runs the same way either way, and it
        // only ever passes on what its body excludes, so a strict grammar gives it nothing.
        case 'many': of(e.x); out = e.greedy ? { a: this.get(e.x).first, b: EMPTY } : NONE; break;
        case 'opt': {
          const p = of(e.x);
          out = { a: intersect(p.a, this.get(e.x).first), b: union(p.a, p.b) };
          break;
        }
        case 'node': out = of(e.x); break;
        // Summarize the body (the check reads every sequence's summary); the attempt itself
        // leaves nothing excluded, the safe answer (too small only lets a grammar through).
        case 'attempt': of(e.x); out = NONE; break;
        case 'seq': {
          out = { a: EMPTY, b: ANY }; // the identity: what was excluded before stays excluded
          for (const x of e.xs) { const p = of(x); out = { a: union(p.a, intersect(p.b, out.a)), b: intersect(p.b, out.b) }; }
          break;
        }
        case 'alt': {
          let acc: Excluded | null = null;
          for (const x of e.xs) {
            const p = of(x);
            acc = acc === null ? p : {
              a: intersect(acc.a, p.a),
              b: union(intersect(acc.a, p.b), intersect(p.a, acc.b), intersect(acc.b, p.b)),
            };
          }
          out = acc ?? NONE;
          break;
        }
        case 'ref': out = rules.get(e.name) ?? NONE; break; // never followed: rules are solved below
        default: out = NONE; // lit, set, until: they consume, and anything may follow
      }
      return out;
    };
    // Children before parents with an explicit stack, so deep nesting cannot overflow it.
    const of = (root: Expr, memo: Map<Expr, Excluded>): Excluded => {
      const stack: Array<[Expr, boolean]> = [[root, false]];
      while (stack.length) {
        const [e, ready] = stack.pop() as [Expr, boolean];
        if (memo.has(e)) continue;
        if (ready) { memo.set(e, summarize(e, memo)); continue; }
        stack.push([e, true]);
        switch (e.t) {
          case 'seq': case 'alt': for (let k = e.xs.length - 1; k >= 0; k--) stack.push([e.xs[k], false]); break;
          case 'many': case 'opt': case 'node': case 'attempt': stack.push([e.x, false]); break;
          default: break;
        }
      }
      return memo.get(root) as Excluded;
    };

    // Solve the rules in DEPENDENCY ORDER: the groups of rules that reach each other (Tarjan's
    // strongly connected components, emitted dependencies first), each group to its own
    // fixpoint. A rule outside any cycle is then read once, after everything it references is
    // final. A single fixpoint over all rules in source order needed one round per rule on a
    // chain written top-down — quadratic, 21 s for 4,000 rules (found by the PR's fourth
    // checker). Iterative, so a long chain cannot overflow the stack.
    const { refsOf, groups } = this.ruleGroups();
    for (const group of groups) {
      const cyclic = group.length > 1 || (refsOf.get(group[0]) as string[]).includes(group[0]);
      let memo = new Map<Expr, Excluded>();
      for (let changed = true; changed; ) {
        changed = false;
        memo = new Map();
        for (const name of group) {
          const val = of(this.spec.rules[name], memo);
          const prev = rules.get(name) as Excluded;
          if (!same(val.a, prev.a) || !same(val.b, prev.b)) { rules.set(name, val); changed = true; }
        }
        if (!cyclic) break; // everything it reads is final already, so one round is the answer
      }
      for (const [e, v] of memo) this.excluded.set(e, v);
    }
  }

  /** What cannot come next after `e`, given `before` could not come next before it. */
  private excludedAfter(e: Expr, before: CharSet): CharSet {
    const p = this.excluded.get(e) ?? { a: EMPTY, b: EMPTY };
    return union(p.a, intersect(p.b, before));
  }

  /**
   * The rules that can reach themselves through references — the only ones whose nesting can
   * grow with the input. A reference to any other rule needs no depth count: `quoted` cannot
   * call itself, so the cap is spent only where recursion is possible.
   */
  recursiveRules(): Set<string> {
    // A rule is recursive when its group has more than one rule or it references itself. One
    // SCC pass; a search from every rule cost quadratic time on a long chain (1.1 s of a 4,000-rule
    // lint).
    const { refsOf, groups } = this.ruleGroups();
    const onCycle = new Set<string>();
    for (const group of groups) {
      if (group.length > 1 || (refsOf.get(group[0]) as string[]).includes(group[0])) for (const r of group) onCycle.add(r);
    }
    return onCycle;
  }

  /**
   * The rules grouped by which reach each other through references (Tarjan's strongly connected
   * components), dependencies first, with each rule's references. Iterative, so a long chain
   * cannot overflow the stack. Computed once and shared by `excludedSets()` and `recursiveRules()`.
   */
  private groupsMemo: { refsOf: Map<string, string[]>; groups: string[][] } | null = null;
  private ruleGroups(): { refsOf: Map<string, string[]>; groups: string[][] } {
    if (this.groupsMemo) return this.groupsMemo;
    const names = Object.keys(this.spec.rules);
    const refsOf = new Map<string, string[]>();
    for (const name of names) {
      // Preorder with an explicit stack (children pushed in reverse), so deep nesting cannot
      // overflow the call stack. A piece the grammar reuses (one JS object in several places) is
      // walked once: walked as a tree, a grammar that reuses each level twice cost 2^depth
      // (2.1 s at depth 24). A rule named twice is one edge; Tarjan's answer is the same.
      const out: string[] = [];
      const named = new Set<string>();
      const seen = new Set<Expr>();
      const stack: Expr[] = [this.spec.rules[name]];
      while (stack.length) {
        const e = stack.pop() as Expr;
        if (seen.has(e)) continue;
        seen.add(e);
        switch (e.t) {
          case 'ref': if (!named.has(e.name)) { named.add(e.name); out.push(e.name); } break;
          case 'seq': case 'alt': for (let k = e.xs.length - 1; k >= 0; k--) stack.push(e.xs[k]); break;
          case 'many': case 'opt': case 'node': case 'attempt': stack.push(e.x); break;
          default: break;
        }
      }
      refsOf.set(name, out);
    }
    const groups = sccs(names, refsOf);
    this.groupsMemo = { refsOf, groups };
    return this.groupsMemo;
  }


  /**
   * What an attempt's body can reach: another attempt, or an `until()`, directly or through
   * rule references (`via` names the first rule that leads there). Each rule is summarized once,
   * in dependency order, so a grammar with many attempts still costs one pass over its rules.
   */
  private reachMemo: Map<string, { attempt: boolean; until: boolean }> | null = null;
  attemptsIn(x: Expr): { attempt: boolean; until: boolean; via?: string; untilVia?: string } {
    const reach = this.ruleReach();
    const out: { attempt: boolean; until: boolean; via?: string; untilVia?: string } = { attempt: false, until: false };
    const stack: Expr[] = [x];
    const seen = new Set<Expr>();
    while (stack.length) {
      const e = stack.pop() as Expr;
      if (seen.has(e)) continue;
      seen.add(e);
      switch (e.t) {
        case 'attempt': out.attempt = true; break;
        case 'until': out.until = true; break;
        case 'ref': {
          const r = reach.get(e.name);
          if (r?.attempt && !out.attempt) { out.attempt = true; out.via = e.name; }
          if (r?.until && !out.until) { out.until = true; out.untilVia = e.name; }
          break;
        }
        case 'seq': case 'alt': for (const y of e.xs) stack.push(y); break;
        case 'many': case 'opt': case 'node': stack.push(e.x); break;
        default: break;
      }
    }
    return out;
  }

  private ruleReach(): Map<string, { attempt: boolean; until: boolean }> {
    if (this.reachMemo) return this.reachMemo;
    const { refsOf, groups } = this.ruleGroups();
    const reach = new Map<string, { attempt: boolean; until: boolean }>();
    const direct = (body: Expr) => {
      const out = { attempt: false, until: false };
      const stack: Expr[] = [body];
      const seen = new Set<Expr>();
      while (stack.length) {
        const e = stack.pop() as Expr;
        if (seen.has(e)) continue;
        seen.add(e);
        switch (e.t) {
          case 'attempt': out.attempt = true; stack.push(e.x); break;
          case 'until': out.until = true; break;
          case 'seq': case 'alt': for (const y of e.xs) stack.push(y); break;
          case 'many': case 'opt': case 'node': stack.push(e.x); break;
          default: break;
        }
      }
      return out;
    };
    // Groups come dependencies first, so every rule a group references outside itself is final;
    // the rules inside a group reach each other, so they share one answer.
    for (const group of groups) {
      const val = { attempt: false, until: false };
      for (const name of group) {
        const d = direct(this.spec.rules[name]);
        val.attempt ||= d.attempt;
        val.until ||= d.until;
        for (const r of refsOf.get(name) as string[]) {
          const v = reach.get(r);
          if (v) { val.attempt ||= v.attempt; val.until ||= v.until; }
        }
      }
      for (const name of group) reach.set(name, val);
    }
    this.reachMemo = reach;
    return reach;
  }

  /** The rules an expression can enter before consuming anything. Iterative (deep nesting). */
  private leadingRefs(e: Expr): string[] {
    const out: string[] = [];
    const named = new Set<string>();
    // A reused piece once, as in ruleGroups(): its only readers are sccs() and includes().
    const seen = new Set<Expr>();
    const stack: Expr[] = [e];
    while (stack.length) {
      const x = stack.pop() as Expr;
      if (seen.has(x)) continue;
      seen.add(x);
      switch (x.t) {
        case 'ref': if (!named.has(x.name)) { named.add(x.name); out.push(x.name); } break;
        case 'seq': {
          let k = 0;
          while (k < x.xs.length && this.get(x.xs[k]).nullable) k++;
          for (let j = Math.min(k, x.xs.length - 1); j >= 0; j--) stack.push(x.xs[j]);
          break;
        }
        case 'alt': for (let j = x.xs.length - 1; j >= 0; j--) stack.push(x.xs[j]); break;
        case 'many': case 'opt': case 'node': case 'attempt': stack.push(x.x); break;
        default: break;
      }
    }
    return out;
  }


  nullable(e: Expr): boolean {
    return this.get(e).nullable;
  }

  first(e: Expr): CharSet {
    return this.get(e).first;
  }

  /**
   * What a person should read as "expected" where `e` starts: the labels of the pieces that can
   * begin it ("a value", "\"{\"", "\"[\""), so a choice reads as a list of alternatives
   * rather than the union of its character ranges. A piece with no label falls back to its
   * characters.
   */
  expectedAt(e: Expr): string {
    const parts: string[] = [];
    const have = new Set<string>();
    const seen = new Set<string>();
    const add = (x: string) => { if (!have.has(x)) { have.add(x); parts.push(x); } };
    // Preorder, as the recursive walk it replaced: an explicit stack, children pushed in reverse,
    // so a chain of thousands of rules cannot overflow the call stack.
    // A reused piece is walked once: a second visit could only add labels already listed, so the
    // message and its order are unchanged, and the walk stops costing 2^depth.
    const walked = new Set<Expr>();
    const stack: Expr[] = [e];
    while (stack.length) {
      const x = stack.pop() as Expr;
      if (walked.has(x)) continue;
      walked.add(x);
      switch (x.t) {
        case 'lit': add(JSON.stringify(x.s)); break;
        case 'set': add(x.label ?? describe(x.cs)); break;
        case 'seq': {
          // The pieces up to and including the first that must consume.
          let k = 0;
          while (k < x.xs.length && this.nullable(x.xs[k])) k++;
          for (let j = Math.min(k, x.xs.length - 1); j >= 0; j--) stack.push(x.xs[j]);
          break;
        }
        case 'alt': for (let j = x.xs.length - 1; j >= 0; j--) stack.push(x.xs[j]); break;
        case 'many': case 'opt': case 'node': case 'attempt': stack.push(x.x); break;
        case 'until': add(`text ending in ${JSON.stringify(x.s)}`); break;
        case 'ref':
          if (seen.has(x.name)) break;
          seen.add(x.name);
          stack.push(this.spec.rules[x.name]);
      }
    }
    if (!parts.length) return 'end of input';
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
  }

}

// ── code generation: one closure per expression, dispatch by table ──────────

interface State {
  s: string;
  /** Where the input ends for this read: its length, or the end of an attempt's window. */
  n: number;
  i: number;
  stack: Node[][];
  err: ParseError | null;
  depth: number;
}

/**
 * How deep rule references may nest. Recursion follows the JavaScript call stack, so without
 * a cap `{{{{…` thirty thousand deep would throw a RangeError out of a parse that promised
 * never to throw on input. 64 is far past any real span and far short of any stack.
 */
export const MAX_DEPTH = 64;
/**
 * The most a grammar may raise its `maxDepth` to. Measured on Node 22's default stack with the
 * cap removed, for grammars with a few expressions per level: `compile()` overflowed at about
 * 2,300 nested references and the generated parser at about 8,600. That headroom is NOT a
 * guarantee: `compile()` spends a stack frame per expression, so a grammar with many expressions
 * between two references runs out far sooner (the prototype's checker hit it at ~150 levels),
 * and the generated parser, which inlines a level into one function, does not. Such a parse is
 * caught and reported as STACK_EXHAUSTED rather than thrown — but there the two runtimes can
 * disagree, as the shipped engine's already did (it threw).
 */
export const MAX_DEPTH_LIMIT = 1000;

/** What a parse reports when the stack runs out before the nesting cap does. */
export const STACK_EXHAUSTED = 'less deeply nested input (the stack ran out before the nesting cap)';

/**
 * A stack overflow, and nothing else. V8 and JavaScriptCore throw a RangeError "Maximum call
 * stack size exceeded"; SpiderMonkey an InternalError "too much recursion". Any other error —
 * a RangeError from allocating a typed array, say — is a bug and is thrown on.
 */
export function isStackOverflow(x: unknown): boolean {
  return x instanceof Error && /call stack size|too much recursion/i.test(x.message);
}

/** The nesting cap a spec asks for, checked against the ceiling. */
export function depthOf(spec: GrammarSpec): number {
  const d = spec.maxDepth ?? MAX_DEPTH;
  if (!Number.isInteger(d) || d < 1 || d > MAX_DEPTH_LIMIT) {
    // Not a GrammarError: that one's message calls the grammar "not linear", and this is a setting.
    throw new Error(`segno: maxDepth must be a whole number from 1 to ${MAX_DEPTH_LIMIT}, not ${d}`);
  }
  return d;
}

type Matcher = (st: State) => boolean;

export interface Grammar {
  readonly spec: GrammarSpec;
  /** Parse a whole input against the start rule (or another rule). Never throws on input. */
  parse(input: string, rule?: string): ParseResult;
}

/**
 * Check `spec` and build its parser. Throws `GrammarError` listing every LL(1) violation;
 * a grammar that compiles is linear-time by construction.
 */
/**
 * Run the LL(1) proof on `spec` and return its analysis (nullable and FIRST per expression).
 * Throws GrammarError listing every violation. `compile` and `generate` both start here, so
 * the two can never disagree about which grammars are allowed.
 */
export function analyze(spec: GrammarSpec) {
  const an = new Analysis(spec);
  an.firstSets();
  an.followSets();
  const problems = an.check();
  if (problems.length) throw new GrammarError(problems);
  return an;
}

export function compile(spec: GrammarSpec): Grammar {
  // A spec from JSON.parse can hold an own "__proto__" key, but `rules.__proto__` still reads
  // Object.prototype, so the analysis saw a rule that is not there and threw a TypeError.
  // (generate() refuses the name too, as a function name it cannot emit.)
  if (spec?.rules && Object.hasOwn(spec.rules, '__proto__')) throw new GrammarError(['"__proto__" cannot name a rule']);
  const an = analyze(spec);
  const maxDepth = depthOf(spec);

  const matchers = new Map<Expr, Matcher>();
  const ruleMatchers = new Map<string, Matcher>();
  const recursive = an.recursiveRules();
  const code = (st: State) => (st.i < st.n ? st.s.charCodeAt(st.i) : -1);
  const fail = (st: State, expected: string | (() => string)): false => {
    if (!st.err) st.err = { at: st.i, expected: typeof expected === 'string' ? expected : expected(), found: st.i < st.n ? st.s[st.i] : null };
    return false;
  };
  // A choice's "expected …" text lists everything that can start it, which on a long chain of
  // rules is long, and building it for every choice up front cost quadratic time (6.5 s to lint
  // 2,000 rules). Built on the error path instead, once.
  const expecting = (e: Expr) => {
    let text: string | null = null;
    return () => (text ??= an.expectedAt(e));
  };
  const firstTest = (e: Expr) => compileTest(an.info.get(e)?.first ?? EMPTY);

  const build = (e: Expr): Matcher => {
    const hit = matchers.get(e);
    if (hit) return hit;
    let m: Matcher;
    // Placeholder so recursive references resolve to the finished matcher.
    matchers.set(e, (st) => (m as Matcher)(st));
    switch (e.t) {
      case 'lit': {
        const s = e.s;
        const want = JSON.stringify(s);
        if (s.length === 1) {
          // One character is the common case (a bracket, a comma): compare the code, no substring.
          const ch = s.charCodeAt(0);
          m = (st) => {
            if (st.i < st.n && st.s.charCodeAt(st.i) === ch) { st.i++; return true; }
            return fail(st, want);
          };
          break;
        }
        m = (st) => {
          if (st.i + s.length <= st.n && st.s.startsWith(s, st.i)) { st.i += s.length; return true; }
          return fail(st, want);
        };
        break;
      }
      case 'set': {
        const test = compileTest(e.cs);
        const want = e.label ?? describe(e.cs);
        m = (st) => {
          if (test(code(st))) { st.i++; return true; }
          return fail(st, want);
        };
        break;
      }
      case 'seq': {
        const xs = e.xs.map(build);
        m = (st) => {
          for (let k = 0; k < xs.length; k++) if (!xs[k](st)) return false;
          return true;
        };
        break;
      }
      case 'alt': {
        if (e.xs.some((x) => x.t === 'attempt')) { m = buildTryingAlt(e.xs, expecting(e)); break; }
        const xs = e.xs.map(build);
        const tests = e.xs.map(firstTest);
        const empty = e.xs.findIndex((x) => an.info.get(x)?.nullable);
        // ASCII dispatch table: the branch for each code 0..127, or -1.
        const table = new Int8Array(128).fill(-1);
        for (let c = 0; c < 128; c++) for (let k = 0; k < tests.length; k++) if (tests[k](c)) { table[c] = k; break; }
        const want = expecting(e);
        m = (st) => {
          const c = code(st);
          let k = c >= 0 && c < 128 ? table[c] : -1;
          if (k < 0 && c >= 128) for (let j = 0; j < tests.length; j++) if (tests[j](c)) { k = j; break; }
          if (k < 0) k = empty;
          if (k < 0) return fail(st, want);
          return xs[k](st);
        };
        break;
      }
      case 'many': {
        const min = e.min;
        if (e.x.t === 'set') {
          // A run of characters from one set — every bare value, every run of spaces. One tight
          // loop instead of two closure calls and two set tests per character: this is where
          // most of a real span's time goes.
          const test = compileTest(e.x.cs);
          const want = e.x.label ?? describe(e.x.cs);
          m = (st) => {
            const s = st.s;
            const n = st.n;
            let i = st.i;
            while (i < n && test(s.charCodeAt(i))) i++;
            if (min && i === st.i) return fail(st, want);
            st.i = i;
            return true;
          };
          break;
        }
        const x = build(e.x);
        const test = firstTest(e.x);
        m = (st) => {
          if (min && !x(st)) return false;
          while (test(code(st))) if (!x(st)) return false;
          return true;
        };
        break;
      }
      case 'opt': {
        const x = build(e.x);
        const test = firstTest(e.x);
        m = (st) => (test(code(st)) ? x(st) : true);
        break;
      }
      case 'ref': {
        const name = e.name;
        if (!recursive.has(name)) {
          m = (st) => (ruleMatchers.get(name) as Matcher)(st);
          break;
        }
        m = (st) => {
          if (st.depth >= maxDepth) return fail(st, `at most ${maxDepth} levels of nesting`);
          st.depth++;
          const ok = (ruleMatchers.get(name) as Matcher)(st);
          st.depth--;
          return ok;
        };
        break;
      }
      case 'until': {
        const end = e.s;
        const orEnd = e.orEnd;
        const want = JSON.stringify(end);
        m = (st) => {
          const at = st.s.indexOf(end, st.i);
          if (at >= 0) { st.i = at + end.length; return true; }
          if (orEnd) { st.i = st.s.length; return true; }
          st.i = st.s.length;
          return fail(st, want);
        };
        break;
      }
      case 'attempt': {
        // Anywhere but an alt branch, a failed attempt is an ordinary error — and it reports why
        // the attempt failed, not what its first character should have been (which it was).
        const t = tryAttempt(e);
        const explain = explainAttempt(e);
        m = (st) => {
          if (t(st)) return true;
          if (!st.err) st.err = explain(st);
          return false;
        };
        break;
      }
      case 'node': {
        const x = build(e.x);
        const kind = e.kind;
        m = (st) => {
          const from = st.i;
          st.stack.push([]);
          const ok = x(st);
          const kids = st.stack.pop() as Node[];
          if (ok) st.stack[st.stack.length - 1].push({ kind, from, to: st.i, kids });
          return ok;
        };
        break;
      }
    }
    matchers.set(e, m);
    return m;
  };

  /**
   * An attempt that rewinds when it fails: position, kept nodes and the error go back to where
   * they were, so the caller sees a character nobody has read yet. (Nesting depth needs no
   * restoring here: this runtime's `ref` gives its level back on failure too. The generated
   * parser's does not, so `t_K` restores it.)
   */
  function tryAttempt(e: Extract<Expr, { t: 'attempt' }>): Matcher {
    const x = build(e.x);
    const max = e.max;
    const nextOk = compileTest(e.next);
    return (st) => {
      const i0 = st.i;
      const n0 = st.n;
      const kids = st.stack[st.stack.length - 1];
      const k0 = kids.length;
      const err0 = st.err;
      st.n = Math.min(n0, i0 + max);
      const ok = x(st);
      st.n = n0;
      if (ok && st.err === err0 && (st.i >= n0 || nextOk(st.s.charCodeAt(st.i)))) return true;
      st.i = i0;
      kids.length = k0;
      st.err = err0;
      return false;
    };
  }

  /**
   * Why a bare attempt failed, against the REAL input. Inside the window its end reads as the end
   * of the input, so the windowed run's own error can contradict the text (`expected "bc", found
   * "b"` where the window cut the literal). So read the body once more WITHOUT the window — it
   * makes the same decisions up to the window's end — and say what that shows: an error before
   * the end of the window, a body that needs more than `max` characters, or a missing `next`.
   * A bare attempt's failure ends the parse, so this runs at most once per parse.
   */
  function explainAttempt(e: Extract<Expr, { t: 'attempt' }>): (st: State) => ParseError {
    const x = build(e.x);
    const wantNext = `${describe(e.next)} or end of input`;
    const wantEnd = `the end within ${e.max} characters`;
    return (st) => {
      const i0 = st.i;
      const kids = st.stack[st.stack.length - 1];
      const k0 = kids.length;
      const err0 = st.err;
      const w = Math.min(st.n, i0 + e.max);
      const ok = x(st);
      const inner = st.err;
      const j = st.i;
      st.i = i0;
      kids.length = k0;
      st.err = err0;
      const at = (k: number, expected: string): ParseError => ({ at: k, expected, found: k < st.n ? st.s[k] : null });
      if (!ok && inner) return inner.at < w ? inner : at(w, wantEnd);
      return j > w ? at(w, wantEnd) : at(j, wantNext);
    };
  }

  /**
   * A choice with attempts among its branches. The checker lets an attempt overlap only the
   * branches AFTER it, and no other branch overlaps anything after it, so: try the attempts that
   * can start here, in order; then the one ordinary branch that can; then the empty branch.
   */
  function buildTryingAlt(branches: readonly Expr[], want: () => string): Matcher {
    const tries: Array<[(c: number) => boolean, Matcher]> = [];
    const plain: Array<[(c: number) => boolean, Matcher]> = [];
    let empty: Matcher | null = null;
    for (const x of branches) {
      if (x.t === 'attempt') { tries.push([firstTest(x), tryAttempt(x)]); continue; }
      if (an.info.get(x)?.nullable && !empty) empty = build(x);
      plain.push([firstTest(x), build(x)]);
    }
    return (st) => {
      const c = code(st);
      for (let k = 0; k < tries.length; k++) if (tries[k][0](c) && tries[k][1](st)) return true;
      for (let k = 0; k < plain.length; k++) if (plain[k][0](c)) return plain[k][1](st);
      if (empty) return empty(st);
      return fail(st, want);
    };
  }

  for (const [name, body] of Object.entries(spec.rules)) ruleMatchers.set(name, build(body));

  return {
    spec,
    parse(input: string, rule = spec.start): ParseResult {
      const m = ruleMatchers.get(rule);
      if (!m) throw new Error(`segno: no rule "${rule}"`);
      const st: State = { s: input, n: input.length, i: 0, stack: [[]], err: null, depth: 0 };
      let ok: boolean;
      try {
        ok = m(st);
      } catch (x) {
        // The backstop for a grammar whose levels are unusually deep in frames: the stack ran
        // out before `maxDepth` did. Report it as an error, never throw it — and do not name a
        // level count: the cap was not reached, and where the stack runs out depends on the
        // engine and on how warm its JIT is.
        if (!isStackOverflow(x)) throw x;
        return { ok: false, error: { at: st.i, expected: STACK_EXHAUSTED, found: st.i < input.length ? input[st.i] : null, code: 'stack' } };
      }
      if (ok && st.i < input.length) fail(st, 'end of input');
      if (!ok || st.err) return { ok: false, error: st.err as ParseError };
      return { ok: true, node: { kind: rule, from: 0, to: input.length, kids: st.stack[0] } };
    },
  };
}

/**
 * Check a grammar without building it: the LL(1) violations, or an empty list. It runs the same
 * analysis `compile()` and `generate()` start from, and the same `maxDepth` check, but builds no
 * parser — so a grammar nested thousands of levels deep lints, where building its closures
 * would exhaust the stack.
 */
export function lint(spec: GrammarSpec): string[] {
  try {
    analyze(spec);
    depthOf(spec);
    return [];
  } catch (e) {
    if (e instanceof GrammarError) return [...e.problems];
    throw e;
  }
}
