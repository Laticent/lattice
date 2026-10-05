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

import { ANY, type CharSet, describe, equal } from './charset.js';
import { analyze, depthOf, type Expr, GrammarError, type GrammarSpec, MAX_DEPTH, STACK_EXHAUSTED } from './grammar.js';

/**
 * The next code unit, or -1 at the end of input. NOT `s.charCodeAt(i)` alone: past the end that
 * is NaN, and one NaN in a character variable makes V8 re-type every such variable as a double —
 * each comparison and table lookup then takes the slow path. Measured on the notation: pills
 * parsed at 134 ns fresh and at 371 ns once the parser had seen a few bracket lists, whose
 * loops read past the end. With -1 the variables stay small integers.
 */
const AT = '(i < n ? s.charCodeAt(i) : -1)';

/** A JS boolean expression testing the code unit in `v` against `cs`. `v` is -1 at the end of input. */
function testExpr(cs: CharSet, v: string, tables: Map<string, string>): string {
  if (equal(cs, ANY)) return `(${v} >= 0)`; // -1 at the end fails
  const parts: string[] = [];
  const ascii: number[] = [];
  const high: string[] = [];
  for (let k = 0; k < cs.length; k += 2) {
    const lo = cs[k];
    const hi = cs[k + 1];
    for (let c = lo; c <= Math.min(hi, 127); c++) ascii.push(c);
    if (hi > 127) {
      const a = Math.max(lo, 128);
      high.push(a === hi ? `${v} === ${a}` : `(${v} >= ${a} && ${v} <= ${hi})`);
    }
  }
  if (ascii.length === 1) parts.push(`${v} === ${ascii[0]}`);
  else if (ascii.length === 2) parts.push(`${v} === ${ascii[0]} || ${v} === ${ascii[1]}`);
  else if (ascii.length) {
    // A 128-entry table for the ASCII half: one indexed load, however many characters.
    const bits = Array.from({ length: 128 }, (_, c) => (ascii.includes(c) ? 1 : 0)).join('');
    let name = tables.get(bits);
    if (!name) { name = `T${tables.size}`; tables.set(bits, name); }
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
  const recursive = an.recursiveRules();
  const kinds: string[] = [];
  // Attempts become functions of their own (`t_K` tries and rewinds, `b_K` is the body), written
  // after the rules. A grammar without one is generated exactly as before.
  const attempts = new Map<Expr, number>();
  const attemptFns: string[] = [];
  const hasAttempt = Object.values(spec.rules).some(function has(e: Expr): boolean {
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

  const gen = (e: Expr, ind: string): string => {
    switch (e.t) {
      case 'lit':
        if (e.s.length === 1) return `${ind}if (${AT} !== ${e.s.charCodeAt(0)}) return fail(${q(expected(e))});\n${ind}i++;\n`;
        // Inside an attempt the input ends at the window, so a literal must fit before `n`.
        return `${ind}if (${hasAttempt ? `i + ${e.s.length} > n || ` : ''}!s.startsWith(${q(e.s)}, i)) return fail(${q(expected(e))});\n${ind}i += ${e.s.length};\n`;
      case 'set': {
        const c = fresh();
        return `${ind}{ const ${c} = ${AT}; if (!${testExpr(e.cs, c, tables)}) return fail(${q(expected(e))}); i++; }\n`;
      }
      case 'seq': return e.xs.map((x) => gen(x, ind)).join('');
      case 'alt': {
        const c = fresh();
        let out = `${ind}{\n${ind}  const ${c} = ${AT};\n`;
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
          out += `${ind}  ${first ? 'if' : 'else if'} (${testExpr(an.first(x), c, tables)}) {\n${gen(x, `${ind}    `)}${ind}  }\n`;
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
          return `${ind}{ ${e.min ? `const ${start} = i; ` : ''}let ${c} = ${AT}; while (${testExpr(e.x.cs, c, tables)}) { i++; ${c} = ${AT}; }${e.min ? ` if (i === ${start}) return fail(${q(expected(e.x))});` : ''} }\n`;
        }
        const c = fresh();
        // many1 is a do-while, so its body is written ONCE. Writing it before the loop as well
        // doubled the output per level of nesting: 20 nested many1 were 531 MB of source.
        if (e.min) return `${ind}{\n${ind}  let ${c}: number;\n${ind}  do {\n${gen(e.x, `${ind}    `)}${ind}    ${c} = ${AT};\n${ind}  } while (${testExpr(an.first(e.x), c, tables)});\n${ind}}\n`;
        const body = gen(e.x, `${ind}  `); // before testExpr, so the table numbering stays as shipped
        return `${ind}for (let ${c} = ${AT}; ${testExpr(an.first(e.x), c, tables)}; ${c} = ${AT}) {\n${body}${ind}}\n`;
      }
      case 'opt': {
        const c = fresh();
        return `${ind}{ const ${c} = ${AT}; if (${testExpr(an.first(e.x), c, tables)}) {\n${gen(e.x, `${ind}  `)}${ind}} }\n`;
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
      case 'attempt': return `${ind}if (!t_${attemptFn(e)}()) return fail(${q(an.expectedAt(e.x))});\n`;
      case 'node': {
        const b = fresh();
        let k = kinds.indexOf(e.kind);
        if (k < 0) { k = kinds.length; kinds.push(e.kind); }
        return `${ind}{\n${ind}  const ${b} = top;\n${ind}  if (top + 4 > buf.length) grow();\n${ind}  top += 4;\n${ind}  buf[${b}] = ${k};\n${ind}  buf[${b} + 1] = i;\n${gen(e.x, `${ind}  `)}${ind}  buf[${b} + 2] = i;\n${ind}  buf[${b} + 3] = top;\n${ind}}\n`;
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
    attemptFns.push(`// Try the body on at most ${e.max} characters; keep it only before a \`next\` character or the end.
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
`);
    return k;
  }

  const rules = Object.entries(spec.rules).map(([name, body]) => `function r_${name}(): boolean {\n${gen(body, '  ')}  return true;\n}\n`).join('\n');
  const tableDecls = [...tables].map(([bits, name]) => `const ${name} = new Uint8Array([${bits.split('').join(',')}]);`).join('\n');
  // Parser state lives at MODULE scope, not in a closure per call: a generated parse() that
  // declared its rules inside itself allocated a closure per rule on every span.
  return `${options.banner ?? ''}${tableDecls}

export interface GenError { at: number; expected: string; found: string | null }
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

${rules}${attemptFns.length ? `\n${attemptFns.join('\n')}` : ''}
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
  ${maxDepth > MAX_DEPTH ? `let ok: boolean;
  try {
    ok = start();
  } catch (x) {
    // A grammar deep in frames per level can exhaust the stack before maxDepth: report it as
    // nesting, never throw it (compile() does the same).
    if (!(x instanceof Error && /call stack size|too much recursion/i.test(x.message))) throw x;
    return { ok: false, error: { at: i, expected: ${q(STACK_EXHAUSTED)}, found: i < n ? s[i] : null } };
  }` : 'const ok = start();'}
  if (ok && i < n) fail('end of input');
  const e = err as GenError | null;
  if (!ok || e) return { ok: false, error: e ?? { at: i, expected: 'a valid input', found: null } };
  return { ok: true, tree: { buf, top, kinds: KINDS } };
}
`;
}
