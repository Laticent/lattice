/**
 * Code generation: turn a checked grammar into JavaScript SOURCE.
 *
 * `compile()` builds a parser from closures, which is right for a grammar that arrives at
 * runtime (the demo page lets you write one). A grammar that ships — the inline notation — is
 * better as straight-line code: every character test inlined, every rule a plain function,
 * the input and the position in local variables. The profile of the closure parser spread its
 * time evenly over the closure chain and the garbage collector; generated code removes both.
 *
 * The output is a module with no imports and no `eval`, so it runs under any Content Security
 * Policy. It is checked in and kept fresh by a test (codegen.test.ts), and `grammar.test.ts`'s
 * properties hold for it because a test drives the closure parser and the generated one over
 * the same inputs and requires identical trees and errors.
 *
 * Only a grammar that `compile()` accepts is generated: the LL(1) proof is the same.
 */

import { ANY, type CharSet, complement, describe, equal, fromRanges, intersect, isEmpty } from './charset.js';
import { analyze, depthOf, type Expr, GrammarError, type GrammarSpec, MAX_DEPTH, STACK_EXHAUSTED } from './grammar.js';

/**
 * The next code unit, or -1 at the end of input. NOT `s.charCodeAt(i)` alone: past the end that
 * is NaN, and one NaN in a character variable makes V8 re-type every such variable as a double —
 * each comparison and table lookup then takes the slow path. Measured on the notation: pills
 * parsed at 134 ns fresh and at 371 ns once the parser had seen a few bracket lists, whose
 * loops read past the end. With -1 the variables stay small integers.
 */
const AT = '(i < n ? s.charCodeAt(i) : -1)';

/**
 * Past this many ranges above U+007F, a set is tested by binary search over a table of range
 * bounds instead of one comparison per range. A set of every other code unit (32k ranges) read
 * 256k characters inside attempt windows in 11.4 s as a chain, and 6 ms by search. The shipped
 * grammars' widest set is JS whitespace and its complement (8 and 9 high ranges), so their
 * parsers keep the inline chain: a chain of 16 is a few nanoseconds, and only non-ASCII input
 * reaches it.
 */
const HIGH_CHAIN = 16;

/** The search the generated module carries when a set has more than HIGH_CHAIN high ranges. */
const IN_RANGES = `// Is code unit \`c\` in one of the sorted, disjoint ranges [t[0], t[1]], [t[2], t[3]], …?
function inRanges(t: Uint16Array, c: number): boolean {
  let lo = 0;
  let hi = (t.length >> 1) - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (c < t[2 * m]) hi = m - 1;
    else if (c > t[2 * m + 1]) lo = m + 1;
    else return true;
  }
  return false;
}`;

/**
 * A JS boolean expression testing the code unit in `v` against `cs`. `v` is -1 at the end of input.
 * `tables` maps a 128-bit ASCII table to its name (`T0`…), and a list of high range bounds to its
 * name (`H0`…, keyed `H:` + bounds).
 */
function testExpr(cs: CharSet, v: string, tables: Map<string, string>): string {
  if (equal(cs, ANY)) return `(${v} >= 0)`; // -1 at the end fails
  const parts: string[] = [];
  const ascii: number[] = [];
  let high: string[] = [];
  const bounds: number[] = [];
  for (let k = 0; k < cs.length; k += 2) {
    const lo = cs[k];
    const hi = cs[k + 1];
    for (let c = lo; c <= Math.min(hi, 127); c++) ascii.push(c);
    if (hi > 127) {
      const a = Math.max(lo, 128);
      high.push(a === hi ? `${v} === ${a}` : `(${v} >= ${a} && ${v} <= ${hi})`);
      bounds.push(a, hi);
    }
  }
  if (high.length > HIGH_CHAIN) {
    // Sorted and merged first: a hand-built set need not be, and the chain it replaces did not care.
    const pairs: Array<[number, number]> = [];
    for (let k = 0; k < bounds.length; k += 2) pairs.push([bounds[k], bounds[k + 1]]);
    const sorted = fromRanges(pairs);
    bounds.length = 0;
    for (const b of sorted) bounds.push(b);
    const key = `H:${bounds.join(',')}`;
    let name = tables.get(key);
    if (!name) { name = `H${[...tables.keys()].filter((k) => k.startsWith('H:')).length}`; tables.set(key, name); }
    high = [`(${v} >= ${bounds[0]} && inRanges(${name}, ${v}))`];
  }
  if (ascii.length === 1) parts.push(`${v} === ${ascii[0]}`);
  else if (ascii.length === 2) parts.push(`${v} === ${ascii[0]} || ${v} === ${ascii[1]}`);
  else if (ascii.length) {
    // A 128-entry table for the ASCII half: one indexed load, however many characters.
    const bits = Array.from({ length: 128 }, (_, c) => (ascii.includes(c) ? 1 : 0)).join('');
    let name = tables.get(bits);
    if (!name) { name = `T${[...tables.keys()].filter((k) => !k.startsWith('H:')).length}`; tables.set(bits, name); }
    parts.push(`(${v} >= 0 && ${v} < 128 && ${name}[${v}] === 1)`);
  }
  parts.push(...high);
  return parts.length ? `(${parts.join(' || ')})` : 'false';
}

/** Generate an ES module exporting `parse(input, rule?)` with the same contract as `compile().parse`. */
export function generate(spec: GrammarSpec, options: { banner?: string } = {}): string {
  const an = analyze(spec); // throws GrammarError exactly as compile() does
  const maxDepth = depthOf(spec);
  // Rule names become identifiers (`r_<name>`), so they must be identifiers.
  // `__proto__` is an identifier but not a key: in the generated `RULES` object literal it would
  // set the prototype, and every parse starting there would throw "no rule".
  const badNames = Object.keys(spec.rules).filter((r) => !/^[A-Za-z_$][\w$]*$/.test(r) || r === '__proto__');
  if (badNames.length) throw new GrammarError(badNames.map((r) => `rule "${r}" cannot be generated: a rule name must be an identifier`));
  const tables = new Map<string, string>();
  // One global regular expression per set a loop scans: it matches one code unit OUTSIDE the set.
  const regexes = new Map<string, string>();
  const SCAN_JS = 16;
  const regexFor = (cs: CharSet): string => {
    const out = complement(cs);
    const hex = (c: number) => `\\u${c.toString(16).padStart(4, '0')}`;
    let cls = '';
    for (let k = 0; k < out.length; k += 2) cls += out[k] === out[k + 1] ? hex(out[k]) : `${hex(out[k])}-${hex(out[k + 1])}`;
    const src = cls ? `/[${cls}]/g` : '/[^\\s\\S]/g'; // an empty class: never matches, the run reaches the end
    let name = regexes.get(src);
    if (!name) { name = `R${regexes.size}`; regexes.set(src, name); }
    return name;
  };
  const recursive = an.recursiveRules();
  const kinds: string[] = [];
  // Attempts become functions of their own (`t_K` tries and rewinds, `b_K` is the body), written
  // after the rules. A grammar without one is generated exactly as before.
  const attempts = new Map<Expr, number>();
  // Each attempt's t_K and b_K, and its x_K (why a bare attempt failed) emitted only for an
  // attempt that is used bare: one inside a choice never reads it, and an unused function in a
  // committed parser is what a code-quality scan flags (phase 3b, PR #2545).
  const attemptFns: { k: number; tryAndBody: string; explain: string }[] = [];
  const explained = new Set<number>();
  // A reused piece is visited once: walked as a tree, a grammar that reuses each level twice
  // cost 2^depth here.
  const visited = new Set<Expr>();
  const hasAttempt = Object.values(spec.rules).some(function has(e: Expr): boolean {
    if (visited.has(e)) return false; // already answered false, or the walk has already stopped
    visited.add(e);
    switch (e.t) {
      case 'attempt': return true;
      case 'seq': case 'alt': return e.xs.some(has);
      case 'many': case 'opt': case 'node': return has(e.x);
      default: return false;
    }
  });
  let tmp = 0;
  const fresh = () => `c${tmp++}`;
  const q = (s: string) => JSON.stringify(s);
  const expected = (e: Expr) => {
    if (e.t === 'set') return e.label ?? describe(e.cs);
    if (e.t === 'lit') return JSON.stringify(e.s);
    return an.expectedAt(e);
  };

  // `known`: the code unit at `i` is already in variable `v` and proven to lie in `cs` — a choice
  // or a loop tested it to get here. The first piece that reads it then reuses the variable, and
  // skips a test the proof already passed, instead of reading and testing the same character
  // again. Only the piece at the current position may use it; anything after consumes first.
  type Known = { v: string; cs: CharSet } | undefined;
  const within = (a: CharSet, b: CharSet) => isEmpty(intersect(a, complement(b)));
  // A sub-expression the grammar uses in several places (one JS object, written once and reused)
  // is generated ONCE, as a function of its own, when its code is large. Copied into every place,
  // a Markdown grammar's inline-text loop made one 860-line rule that V8 deoptimized and rebuilt
  // again and again (about 130 ms a rebuild), and its copies never shared type feedback.
  const uses = new Map<Expr, number>();
  const countUses = (e: Expr): void => {
    const u = (uses.get(e) ?? 0) + 1;
    uses.set(e, u);
    if (u > 1) return; // its children were counted the first time
    switch (e.t) {
      case 'seq': case 'alt': e.xs.forEach(countUses); break;
      case 'many': case 'opt': case 'node': countUses(e.x); break;
      default: break; // an attempt's body is already a function of its own
    }
  };
  Object.values(spec.rules).forEach(countUses);
  const OUTLINE_MIN = 600; // characters of generated code; below this a call costs more than a copy
  const outlined = new Map<Expr, number | null>(); // null: measured, and small enough to copy
  const outlineFns: string[] = [];
  const gen = (e: Expr, ind: string, known?: Known, bare = false): string => {
    if (!bare && (uses.get(e) ?? 0) > 1 && e.t !== 'lit' && e.t !== 'set' && e.t !== 'ref' && e.t !== 'attempt') {
      let k = outlined.get(e);
      if (k === undefined) {
        const body = gen(e, '  ', undefined, true);
        k = body.length >= OUTLINE_MIN ? outlineFns.length : null;
        outlined.set(e, k);
        if (k !== null) outlineFns.push(`function e_${k}(): boolean {\n${body}  return true;\n}\n`);
      }
      if (k !== null) return `${ind}if (!e_${k}()) return false;\n`;
    }
    const at = known ? known.v : AT;
    switch (e.t) {
      case 'lit':
        if (e.s.length === 1 && known && within(known.cs, [e.s.charCodeAt(0), e.s.charCodeAt(0)])) return `${ind}i++;\n`;
        if (e.s.length === 1) return `${ind}if (${AT} !== ${e.s.charCodeAt(0)}) return fail(${q(expected(e))});\n${ind}i++;\n`;
        // Inside an attempt the input ends at the window, so a literal must fit before `n`.
        return `${ind}if (${hasAttempt ? `i + ${e.s.length} > n || ` : ''}!s.startsWith(${q(e.s)}, i)) return fail(${q(expected(e))});\n${ind}i += ${e.s.length};\n`;
      case 'set': {
        if (known && within(known.cs, e.cs)) return `${ind}i++;\n`;
        const c = fresh();
        return `${ind}{ const ${c} = ${AT}; if (!${testExpr(e.cs, c, tables)}) return fail(${q(expected(e))}); i++; }\n`;
      }
      case 'seq': return e.xs.map((x, k) => gen(x, ind, k === 0 ? known : undefined)).join('');
      case 'alt': {
        const c = fresh();
        let out = `${ind}{\n${ind}  const ${c} = ${at};\n`;
        const empty = e.xs.findIndex((x) => an.nullable(x));
        let first = true;
        // Attempts first, in order: each that can start here is tried, and a failed one hands
        // the character on (see compile()'s buildTryingAlt).
        e.xs.forEach((x) => {
          if (x.t !== 'attempt') return;
          out += `${ind}  ${first ? 'if' : 'else if'} (${testExpr(an.first(x), c, tables)} && t_${attemptFn(x)}()) { /* kept */ }\n`;
          first = false;
        });
        e.xs.forEach((x, k) => {
          if (x.t === 'attempt') return;
          if (k === empty && an.first(x).length === 0) return;
          const fx = an.first(x);
          out += `${ind}  ${first ? 'if' : 'else if'} (${testExpr(fx, c, tables)}) {\n${gen(x, `${ind}    `, { v: c, cs: known ? intersect(known.cs, fx) : fx })}${ind}  }\n`;
          first = false;
        });
        if (first) return `${out}${gen(e.xs[empty], `${ind}  `)}${ind}}\n`;
        out += empty >= 0
          ? `${ind}  else {\n${gen(e.xs[empty], `${ind}    `)}${ind}  }\n`
          : `${ind}  else return fail(${q(expected(e))});\n`;
        return `${out}${ind}}\n`;
      }
      case 'many': {
        if (e.x.t === 'set') {
          const c = fresh();
          const start = fresh();
          // The scan runs on locals and writes `i` back once: the parser's state lives at module
          // scope, and a loop on it loads `s` and `n` and stores `i` on every character (about
          // 9 ns a character on the Markdown corpus, against about 1 ns on locals).
          const j = fresh();
          const end = fresh();
          const str = fresh();
          // A run still going after SCAN_JS characters is finished by a regular expression that
          // finds the first character outside the set: V8 compiles it to native code, about 1.6x a
          // JS loop on long runs (prose, comments), and a short run never pays for the call.
          // Only with no attempt window open (`n` is the whole input): the regex cannot stop at a
          // window's end, so inside one it would read the rest of the run on every attempt and
          // turn a linear grammar quadratic (the checker's repro: 8.7 s at 160k characters).
          const lim = fresh();
          const rx = regexFor(e.x.cs);
          const tail = `${ind}  if (${j} === ${lim} && ${j} < ${end}) { if (${end} !== ${str}.length) { while (${j} < ${end}) { const ${c} = ${str}.charCodeAt(${j}); if (!${testExpr(e.x.cs, c, tables)}) break; ${j}++; } } else { ${rx}.lastIndex = ${j}; ${j} = ${rx}.test(${str}) ? ${rx}.lastIndex - 1 : ${end}; } }\n`;
          return `${ind}{\n${ind}  ${e.min ? `const ${start} = i; ` : ''}let ${j} = i; const ${end} = n; const ${str} = s; const ${lim} = ${j} + ${SCAN_JS} < ${end} ? ${j} + ${SCAN_JS} : ${end};\n${ind}  while (${j} < ${lim}) { const ${c} = ${str}.charCodeAt(${j}); if (!${testExpr(e.x.cs, c, tables)}) break; ${j}++; }\n${tail}${ind}  i = ${j};${e.min ? ` if (i === ${start}) return fail(${q(expected(e.x))});` : ''}\n${ind}}\n`;
        }
        const c = fresh();
        // many1 is a do-while, so its body is written ONCE. Writing it before the loop as well
        // doubled the output per level of nesting: 20 nested many1 were 531 MB of source.
        // The body runs first with `known` (when it proves the first character) and later with
        // the character the loop test read into `c`; both are in FIRST(body).
        const fb = an.first(e.x);
        if (e.min) {
          const pre = known && within(known.cs, fb);
          return `${ind}{\n${ind}  let ${c}${pre ? ` = ${known.v}` : ': number'};\n${ind}  do {\n${gen(e.x, `${ind}    `, pre ? { v: c, cs: fb } : undefined)}${ind}    ${c} = ${AT};\n${ind}  } while (${testExpr(fb, c, tables)});\n${ind}}\n`;
        }
        const body = gen(e.x, `${ind}  `, { v: c, cs: fb }); // before testExpr, so the table numbering stays as shipped
        return `${ind}for (let ${c} = ${at}; ${testExpr(fb, c, tables)}; ${c} = ${AT}) {\n${body}${ind}}\n`;
      }
      case 'opt': {
        const c = fresh();
        const fx = an.first(e.x);
        return `${ind}{ const ${c} = ${at}; if (${testExpr(fx, c, tables)}) {\n${gen(e.x, `${ind}  `, { v: c, cs: known ? intersect(known.cs, fx) : fx })}${ind}} }\n`;
      }
      case 'ref':
        // Only a rule that can reach itself spends the nesting cap, exactly as compile() does.
        if (!recursive.has(e.name)) return `${ind}if (!r_${e.name}()) return false;\n`;
        return `${ind}if (depth >= ${maxDepth}) return fail(${q(`at most ${maxDepth} levels of nesting`)});\n${ind}depth++;\n${ind}if (!r_${e.name}()) return false;\n${ind}depth--;\n`;
      case 'until': {
        const c = fresh();
        const miss = e.orEnd ? `${ind}  i = n;\n` : `${ind}  i = n;\n${ind}  return fail(${q(JSON.stringify(e.s))});\n`;
        return `${ind}{\n${ind}  const ${c} = s.indexOf(${q(e.s)}, i);\n${ind}  if (${c} >= 0) i = ${c} + ${e.s.length};\n${ind}  else {\n${miss}${ind}  }\n${ind}}\n`;
      }
      case 'attempt': {
        const k = attemptFn(e);
        explained.add(k);
        return `${ind}if (!t_${k}()) {\n${ind}  if (!err) err = x_${k}();\n${ind}  return false;\n${ind}}\n`;
      }
      case 'node': {
        const b = fresh();
        let k = kinds.indexOf(e.kind);
        if (k < 0) { k = kinds.length; kinds.push(e.kind); }
        return `${ind}{\n${ind}  const ${b} = top;\n${ind}  if (top + 4 > buf.length) grow();\n${ind}  top += 4;\n${ind}  buf[${b}] = ${k};\n${ind}  buf[${b} + 1] = i;\n${gen(e.x, `${ind}  `, known)}${ind}  buf[${b} + 2] = i;\n${ind}  buf[${b} + 3] = top;\n${ind}}\n`;
      }
    }
  };

  function attemptFn(e: Extract<Expr, { t: 'attempt' }>): number {
    const hit = attempts.get(e);
    if (hit !== undefined) return hit;
    const k = attempts.size;
    attempts.set(e, k);
    const c = fresh();
    const body = gen(e.x, '  ');
    const tryAndBody = `// Try the body on at most ${e.max} characters; keep it only before a \`next\` character or the end.
function t_${k}(): boolean {
  const i0 = i;
  const n0 = n;
  const top0 = top;
  const d0 = depth;
  const e0 = err;
  n = Math.min(n0, i0 + ${e.max});
  const ok = b_${k}();
  n = n0;
  if (ok && err === e0) {
    const ${c} = ${AT};
    if (${c} < 0 || ${testExpr(e.next, c, tables)}) return true;
  }
  i = i0;
  top = top0;
  depth = d0;
  err = e0;
  return false;
}

function b_${k}(): boolean {
${body}  return true;
}
`;
    const explain = `
// Why a bare attempt failed, against the real input: the body once more without the window
// (compile()'s explainAttempt). A bare attempt's failure ends the parse, so this runs once.
function x_${k}(): GenError {
  const i0 = i;
  const top0 = top;
  const d0 = depth;
  const e0 = err;
  const w = Math.min(n, i0 + ${e.max});
  const ok = b_${k}();
  const inner = err as GenError | null;
  const j = i;
  i = i0;
  top = top0;
  depth = d0;
  err = e0;
  if (!ok && inner) return inner.at < w ? inner : { at: w, expected: ${q(`the end within ${e.max} characters`)}, found: w < n ? s[w] : null };
  if (j > w) return { at: w, expected: ${q(`the end within ${e.max} characters`)}, found: w < n ? s[w] : null };
  return { at: j, expected: ${q(`${describe(e.next)} or end of input`)}, found: j < n ? s[j] : null };
}
`;
    attemptFns.push({ k, tryAndBody, explain });
    return k;
  }

  const rules = Object.entries(spec.rules).map(([name, body]) => `function r_${name}(): boolean {\n${gen(body, '  ')}  return true;\n}\n`).join('\n')
    + outlineFns.map((f) => `\n${f}`).join('');
  const tableDecls = [...tables].map(([bits, name]) => (bits.startsWith('H:')
    ? `const ${name} = new Uint16Array([${bits.slice(2)}]);`
    : `const ${name} = new Uint8Array([${bits.split('').join(',')}]);`))
    .concat([...tables.keys()].some((k) => k.startsWith('H:')) ? [IN_RANGES] : [])
    .concat([...regexes].map(([src, name]) => `${/\\u00[01]/.test(src) ? '// biome-ignore lint/suspicious/noControlCharactersInRegex: a generated character class; control characters are input like any other\n' : ''}const ${name} = ${src};`)).join('\n');
  // Parser state lives at MODULE scope, not in a closure per call: a generated parse() that
  // declared its rules inside itself allocated a closure per rule on every span.
  return `${options.banner ?? ''}${tableDecls}

export interface GenError { at: number; expected: string; found: string | null; code?: 'stack' }
export interface GenTree { buf: Int32Array; top: number; kinds: readonly string[] }

const KINDS: readonly string[] = ${JSON.stringify(kinds)};
let s = '';
let n = 0;
let i = 0;
let depth = 0;
let err: GenError | null = null;
let buf = new Int32Array(256);
let top = 0;

function grow(): void {
  const next = new Int32Array(buf.length * 2);
  next.set(buf);
  buf = next;
}

function fail(expected: string): false {
  if (!err) err = { at: i, expected, found: i < n ? s[i] : null };
  return false;
}

${rules}${attemptFns.length ? `\n${attemptFns.map((a) => a.tryAndBody + (explained.has(a.k) ? a.explain : '')).join('\n')}` : ''}
const RULES: Record<string, () => boolean> = { ${Object.keys(spec.rules).map((r) => `${q(r)}: r_${r}`).join(', ')} };

/**
 * Parse \`input\` against rule \`rule\` (default ${q(spec.start)}). Never throws on input. The tree
 * is a flat buffer that the NEXT call overwrites (flat.ts) — read it first.
 */
export function parse(input: string, rule = ${q(spec.start)}): { ok: true; tree: GenTree } | { ok: false; error: GenError } {
  const start = Object.hasOwn(RULES, rule) ? RULES[rule] : undefined;
  if (!start) throw new Error('segno: no rule "' + rule + '"');
  s = input;
  n = s.length;
  i = 0;
  depth = 0;
  err = null;
  top = 0;
  // A tree that outgrew the first buffer is let go here rather than kept for the page's life: one
  // hostile 3M-character flowchart row held 67 MB through every later parse (phase 3b's red team).
  if (buf.length > 65536) buf = new Int32Array(256);
  ${maxDepth > MAX_DEPTH ? `let ok: boolean;
  try {
    ok = start();
  } catch (x) {
    // A grammar deep in frames per level can exhaust the stack before maxDepth: report it as
    // nesting, never throw it (compile() does the same).
    if (!(x instanceof Error && /call stack size|too much recursion/i.test(x.message))) throw x;
    return { ok: false, error: { at: i, expected: ${q(STACK_EXHAUSTED)}, found: i < n ? s[i] : null, code: 'stack' } };
  }` : 'const ok = start();'}
  if (ok && i < n) fail('end of input');
  const e = err as GenError | null;
  if (!ok || e) return { ok: false, error: e ?? { at: i, expected: 'a valid input', found: null } };
  return { ok: true, tree: { buf, top, kinds: KINDS } };
}
`;
}
