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
  ANY, type CharSet, compileTest, complement, describe, EMPTY, intersect, isEmpty, ofChars,
  ofRange, union,
} from './charset.js';

// ── the vocabulary ──────────────────────────────────────────────────────────

export type Expr =
  | { readonly t: 'lit'; readonly s: string }
  | { readonly t: 'set'; readonly cs: CharSet; readonly label?: string }
  | { readonly t: 'seq'; readonly xs: readonly Expr[] }
  | { readonly t: 'alt'; readonly xs: readonly Expr[] }
  | { readonly t: 'many'; readonly x: Expr; readonly min: 0 | 1 }
  | { readonly t: 'opt'; readonly x: Expr }
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
export const set = (cs: CharSet, label?: string): Expr => ({ t: 'set', cs, label });
/** One of these characters. */
export const oneOf = (chars: string, label?: string): Expr => set(ofChars(chars), label);
/** Any character NOT in `chars` (and not in the extra sets). */
export const noneOf = (chars: string, label?: string, ...more: CharSet[]): Expr =>
  set(complement(union(ofChars(chars), ...more)), label);
/** One character in `from`..`to`. */
export const range = (from: string, to: string, label?: string): Expr => set(ofRange(from, to), label);
/** Any one character. */
export const any = (): Expr => set(ANY, 'any character');
export const seq = (...xs: Part[]): Expr => ({ t: 'seq', xs: xs.map(part) });
export const alt = (...xs: Part[]): Expr => ({ t: 'alt', xs: xs.map(part) });
export const many = (x: Part): Expr => ({ t: 'many', x: part(x), min: 0 });
export const many1 = (x: Part): Expr => ({ t: 'many', x: part(x), min: 1 });
export const opt = (x: Part): Expr => ({ t: 'opt', x: part(x) });
/** A reference to another rule, so rules can recurse (a record holds values). */
export const ref = (name: string): Expr => ({ t: 'ref', name });
/** Keep this span in the parse tree as a node of `kind`. */
export const node = (kind: string, x: Part): Expr => ({ t: 'node', kind, x: part(x) });

export interface GrammarSpec {
  readonly start: string;
  readonly rules: Readonly<Record<string, Expr>>;
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
}

export type ParseResult = { ok: true; node: Node } | { ok: false; error: ParseError };

// ── the compiler's own errors ───────────────────────────────────────────────

/** A grammar that is not LL(1). `problems` lists every violation with its rule path. */
export class GrammarError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`segno: this grammar is not linear (LL(1)):\n  - ${problems.join('\n  - ')}`);
    this.name = 'GrammarError';
  }
}

// ── analysis: nullable, FIRST and FOLLOW for every expression ───────────────

interface Info {
  nullable: boolean;
  first: CharSet;
  follow: CharSet;
  followEnd: boolean; // the end of input may follow
  path: string;
}

class Analysis {
  readonly info = new Map<Expr, Info>();
  constructor(readonly spec: GrammarSpec) {
    for (const [name, body] of Object.entries(spec.rules)) this.visit(body, name);
    if (!Object.hasOwn(spec.rules, spec.start)) throw new GrammarError([`start rule "${spec.start}" is not defined`]);
  }

  private visit(e: Expr, path: string) {
    if (this.info.has(e)) return;
    this.info.set(e, { nullable: false, first: EMPTY, follow: EMPTY, followEnd: false, path });
    switch (e.t) {
      case 'seq': case 'alt': e.xs.forEach((x, i) => { this.visit(x, `${path} › ${e.t}[${i}]`); }); break;
      case 'many': this.visit(e.x, `${path} › ${e.min ? 'many1' : 'many'}`); break;
      case 'opt': this.visit(e.x, `${path} › opt`); break;
      case 'node': this.visit(e.x, `${path} › ${e.kind}`); break;
      case 'ref': if (!Object.hasOwn(this.spec.rules, e.name)) throw new GrammarError([`${path}: unknown rule "${e.name}"`]); break;
      default: break;
    }
  }

  /** Fixpoint for nullable + FIRST over every expression, across rule references. */
  firstSets() {
    let changed = true;
    while (changed) {
      changed = false;
      for (const [e, inf] of this.info) {
        const { nullable, first } = this.compute(e);
        if (nullable !== inf.nullable || first.length !== inf.first.length || first.some((v, i) => v !== inf.first[i])) {
          inf.nullable = nullable;
          inf.first = first;
          changed = true;
        }
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
      case 'ref': { const i = this.get(this.spec.rules[e.name]); return { nullable: i.nullable, first: i.first }; }
    }
  }

  /** Fixpoint for FOLLOW: what may come right after each expression. */
  followSets() {
    const start = this.get(this.spec.rules[this.spec.start]);
    start.followEnd = true;
    let changed = true;
    const add = (e: Expr, cs: CharSet, end: boolean) => {
      const i = this.get(e);
      const next = union(i.follow, cs);
      if (next.length !== i.follow.length || next.some((v, k) => v !== i.follow[k]) || (end && !i.followEnd)) {
        i.follow = next;
        i.followEnd = i.followEnd || end;
        changed = true;
      }
    };
    while (changed) {
      changed = false;
      for (const [e, inf] of this.info) {
        const { follow, followEnd } = inf;
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
          case 'ref': add(this.spec.rules[e.name], follow, followEnd); break;
          default: break;
        }
      }
    }
  }

  /** Every LL(1) violation, with the path of the expression that causes it. */
  check(): string[] {
    const problems: string[] = [];
    for (const [e, inf] of this.info) {
      if (e.t === 'alt') {
        for (let a = 0; a < e.xs.length; a++) {
          for (let b = a + 1; b < e.xs.length; b++) {
            const both = intersect(this.get(e.xs[a]).first, this.get(e.xs[b]).first);
            if (!isEmpty(both)) problems.push(`${inf.path}: branches ${a} and ${b} can both start with ${describe(both)}`);
          }
        }
        const empty = e.xs.map((x, k) => (this.get(x).nullable ? k : -1)).filter((k) => k >= 0);
        if (empty.length > 1) problems.push(`${inf.path}: branches ${empty.join(' and ')} can all match nothing`);
        if (empty.length === 1) {
          const others = union(...e.xs.filter((_, k) => k !== empty[0]).map((x) => this.get(x).first));
          const clash = intersect(others, inf.follow);
          if (!isEmpty(clash)) problems.push(`${inf.path}: branch ${empty[0]} matches nothing, and ${describe(clash)} could either start another branch or follow`);
        }
      }
      if (e.t === 'many' || e.t === 'opt') {
        const body = this.get(e.x);
        const what = e.t === 'opt' ? 'opt' : e.min ? 'many1' : 'many';
        if (body.nullable) problems.push(`${inf.path}: the body of ${what} can match nothing, so the loop could spin without consuming`);
        const clash = intersect(body.first, inf.follow);
        if (!isEmpty(clash)) problems.push(`${inf.path}: after ${what}, ${describe(clash)} could either repeat the body or follow it`);
      }
    }
    // Left recursion: a rule that reaches itself through a nullable prefix.
    for (const name of Object.keys(this.spec.rules)) {
      const seen = new Set<string>();
      const stack: string[] = [name];
      while (stack.length) {
        const r = stack.pop() as string;
        for (const next of this.leadingRefs(this.spec.rules[r])) {
          if (next === name) { problems.push(`rule "${name}" can reach itself without consuming a character (left recursion)`); stack.length = 0; break; }
          if (!seen.has(next)) { seen.add(next); stack.push(next); }
        }
      }
    }
    return [...new Set(problems)];
  }

  /** The rules an expression can enter before consuming anything. */
  /**
   * The rules that can reach themselves through references — the only ones whose nesting can
   * grow with the input. A reference to any other rule needs no depth count: `quoted` cannot
   * call itself, so the cap is spent only where recursion is possible.
   */
  recursiveRules(): Set<string> {
    const refs = new Map<string, string[]>();
    const collect = (e: Expr, out: string[]) => {
      switch (e.t) {
        case 'seq': case 'alt': for (const x of e.xs) collect(x, out); break;
        case 'many': case 'opt': case 'node': collect(e.x, out); break;
        case 'ref': out.push(e.name); break;
      }
    };
    for (const [name, body] of Object.entries(this.spec.rules)) { const out: string[] = []; collect(body, out); refs.set(name, out); }
    const onCycle = new Set<string>();
    for (const start of refs.keys()) {
      const seen = new Set<string>();
      const stack = [...(refs.get(start) ?? [])];
      while (stack.length) {
        const r = stack.pop() as string;
        if (r === start) { onCycle.add(start); break; }
        if (seen.has(r)) continue;
        seen.add(r);
        stack.push(...(refs.get(r) ?? []));
      }
    }
    return onCycle;
  }

  private leadingRefs(e: Expr): string[] {
    switch (e.t) {
      case 'ref': return [e.name];
      case 'seq': {
        const out: string[] = [];
        for (const x of e.xs) { out.push(...this.leadingRefs(x)); if (!this.get(x).nullable) break; }
        return out;
      }
      case 'alt': return e.xs.flatMap((x) => this.leadingRefs(x));
      case 'many': case 'opt': case 'node': return this.leadingRefs(e.x);
      default: return [];
    }
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
    const seen = new Set<string>();
    const add = (x: string) => { if (!parts.includes(x)) parts.push(x); };
    const walk = (x: Expr): void => {
      switch (x.t) {
        case 'lit': add(JSON.stringify(x.s)); return;
        case 'set': add(x.label ?? describe(x.cs)); return;
        case 'seq': for (const y of x.xs) { walk(y); if (!this.nullable(y)) return; } return;
        case 'alt': for (const y of x.xs) walk(y); return;
        case 'many': case 'opt': case 'node': walk(x.x); return;
        case 'ref':
          if (seen.has(x.name)) return;
          seen.add(x.name);
          walk(this.spec.rules[x.name]);
      }
    };
    walk(e);
    if (!parts.length) return 'end of input';
    return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}`;
  }
}

// ── code generation: one closure per expression, dispatch by table ──────────

interface State {
  s: string;
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
  const an = analyze(spec);

  const matchers = new Map<Expr, Matcher>();
  const ruleMatchers = new Map<string, Matcher>();
  const recursive = an.recursiveRules();
  const code = (st: State) => (st.i < st.s.length ? st.s.charCodeAt(st.i) : -1);
  const fail = (st: State, expected: string): false => {
    if (!st.err) st.err = { at: st.i, expected, found: st.i < st.s.length ? st.s[st.i] : null };
    return false;
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
            if (st.i < st.s.length && st.s.charCodeAt(st.i) === ch) { st.i++; return true; }
            return fail(st, want);
          };
          break;
        }
        m = (st) => {
          if (st.s.startsWith(s, st.i)) { st.i += s.length; return true; }
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
        const xs = e.xs.map(build);
        const tests = e.xs.map(firstTest);
        const empty = e.xs.findIndex((x) => an.info.get(x)?.nullable);
        // ASCII dispatch table: the branch for each code 0..127, or -1.
        const table = new Int8Array(128).fill(-1);
        for (let c = 0; c < 128; c++) for (let k = 0; k < tests.length; k++) if (tests[k](c)) { table[c] = k; break; }
        const want = an.expectedAt(e);
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
            const n = s.length;
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
          if (st.depth >= MAX_DEPTH) return fail(st, `at most ${MAX_DEPTH} levels of nesting`);
          st.depth++;
          const ok = (ruleMatchers.get(name) as Matcher)(st);
          st.depth--;
          return ok;
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

  for (const [name, body] of Object.entries(spec.rules)) ruleMatchers.set(name, build(body));

  return {
    spec,
    parse(input: string, rule = spec.start): ParseResult {
      const m = ruleMatchers.get(rule);
      if (!m) throw new Error(`segno: no rule "${rule}"`);
      const st: State = { s: input, i: 0, stack: [[]], err: null, depth: 0 };
      const ok = m(st);
      if (ok && st.i < input.length) fail(st, 'end of input');
      if (!ok || st.err) return { ok: false, error: st.err as ParseError };
      return { ok: true, node: { kind: rule, from: 0, to: input.length, kids: st.stack[0] } };
    },
  };
}

/** Check a grammar without building it: the LL(1) violations, or an empty list. */
export function lint(spec: GrammarSpec): string[] {
  try {
    compile(spec);
    return [];
  } catch (e) {
    if (e instanceof GrammarError) return [...e.problems];
    throw e;
  }
}
