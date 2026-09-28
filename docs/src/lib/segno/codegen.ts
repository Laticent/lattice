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
import { analyze, type Expr, GrammarError, type GrammarSpec, MAX_DEPTH } from './grammar.js';

/** A JS boolean expression testing the code unit in `v` against `cs`. `v` may be NaN (end of input). */
function testExpr(cs: CharSet, v: string, tables: Map<string, string>): string {
  if (equal(cs, ANY)) return `(${v} >= 0)`; // NaN at the end fails
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
    parts.push(`(${v} < 128 && ${name}[${v}] === 1)`);
  }
  parts.push(...high);
  return parts.length ? `(${parts.join(' || ')})` : 'false';
}

/** Generate an ES module exporting `parse(input, rule?)` with the same contract as `compile().parse`. */
export function generate(spec: GrammarSpec, options: { banner?: string } = {}): string {
  const an = analyze(spec); // throws GrammarError exactly as compile() does
  // Rule names become identifiers (`r_<name>`), so they must be identifiers.
  const badNames = Object.keys(spec.rules).filter((r) => !/^[A-Za-z_$][\w$]*$/.test(r));
  if (badNames.length) throw new GrammarError(badNames.map((r) => `rule "${r}" cannot be generated: a rule name must be an identifier`));
  const tables = new Map<string, string>();
  const kinds: string[] = [];
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
        if (e.s.length === 1) return `${ind}if (s.charCodeAt(i) !== ${e.s.charCodeAt(0)}) return fail(${q(expected(e))});\n${ind}i++;\n`;
        return `${ind}if (!s.startsWith(${q(e.s)}, i)) return fail(${q(expected(e))});\n${ind}i += ${e.s.length};\n`;
      case 'set': {
        const c = fresh();
        return `${ind}{ const ${c} = s.charCodeAt(i); if (!${testExpr(e.cs, c, tables)}) return fail(${q(expected(e))}); i++; }\n`;
      }
      case 'seq': return e.xs.map((x) => gen(x, ind)).join('');
      case 'alt': {
        const c = fresh();
        let out = `${ind}{\n${ind}  const ${c} = s.charCodeAt(i);\n`;
        const empty = e.xs.findIndex((x) => an.nullable(x));
        let first = true;
        e.xs.forEach((x, k) => {
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
          return `${ind}{ ${e.min ? `const ${start} = i; ` : ''}let ${c} = s.charCodeAt(i); while (${testExpr(e.x.cs, c, tables)}) { i++; ${c} = s.charCodeAt(i); }${e.min ? ` if (i === ${start}) return fail(${q(expected(e.x))});` : ''} }\n`;
        }
        const c = fresh();
        const body = gen(e.x, `${ind}  `);
        return `${e.min ? gen(e.x, ind) : ''}${ind}for (let ${c} = s.charCodeAt(i); ${testExpr(an.first(e.x), c, tables)}; ${c} = s.charCodeAt(i)) {\n${body}${ind}}\n`;
      }
      case 'opt': {
        const c = fresh();
        return `${ind}{ const ${c} = s.charCodeAt(i); if (${testExpr(an.first(e.x), c, tables)}) {\n${gen(e.x, `${ind}  `)}${ind}} }\n`;
      }
      case 'ref':
        return `${ind}if (depth >= ${MAX_DEPTH}) return fail(${q(`at most ${MAX_DEPTH} levels of nesting`)});\n${ind}depth++;\n${ind}if (!r_${e.name}()) return false;\n${ind}depth--;\n`;
      case 'node': {
        const b = fresh();
        let k = kinds.indexOf(e.kind);
        if (k < 0) { k = kinds.length; kinds.push(e.kind); }
        return `${ind}{\n${ind}  const ${b} = top;\n${ind}  if (top + 4 > buf.length) grow();\n${ind}  top += 4;\n${ind}  buf[${b}] = ${k};\n${ind}  buf[${b} + 1] = i;\n${gen(e.x, `${ind}  `)}${ind}  buf[${b} + 2] = i;\n${ind}  buf[${b} + 3] = top;\n${ind}}\n`;
      }
    }
  };

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

${rules}
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
  const ok = start();
  if (ok && i < n) fail('end of input');
  const e = err as GenError | null;
  if (!ok || e) return { ok: false, error: e ?? { at: i, expected: 'a valid input', found: null } };
  return { ok: true, tree: { buf, top, kinds: KINDS } };
}
`;
}
