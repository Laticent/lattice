// The /segno playground's grammar box, READ rather than run.
//
// The box looks like JavaScript — `const` lines, then `return { start, rules }` — but it is a
// small fixed language, and this module reads it the way a parser reads data: helper calls from
// a closed list, strings, numbers, object literals, and earlier `const` names. Nothing the
// visitor types is ever executed. The page used to hand the box to `new Function`, so a
// `for (;;) {}` froze the tab and a code scanner rightly saw a code-injection sink; here the same
// text is a syntax error with a line number, and there is no sink to scan.
//
// One left-to-right pass over the tokens; nesting is capped so a deep paste cannot overflow
// the stack.

// `never[]` so a helper with typed parameters (`seq(...xs: Part[])`) is still a Helper; the
// reader checks nothing about arguments, and each helper rejects what it cannot take.
export type Helpers = Record<string, (...args: never[]) => unknown>;

export class GrammarSourceError extends Error {}

const MAX_NESTING = 64;
// The grammar's EXPANDED size: a reused name counts in full each time, because the compiler and
// the code generator walk it in full each time. Without this, `const c1 = seq(c0, c0);` repeated
// 28 times is under 1 KB of text and 2^28 pieces, and compiling it froze the tab for seconds.
// The presets are under 100; 10,000 compiles and generates in milliseconds.
// A string costs one piece per STRING_PIECE characters (and at least one), because the generator
// writes a literal out again at every use: counted as one piece, a 20,000-character literal used
// 2,500 times passed the cap and generated 100 MB, which the page then put in the DOM.
export const MAX_EXPANDED = 10_000;
export const STRING_PIECE = 64;
const MAX_DIGITS = 9;

type Token =
  | { kind: 'ident'; value: string; line: number; col: number }
  | { kind: 'string'; value: string; line: number; col: number }
  | { kind: 'number'; value: number; line: number; col: number }
  | { kind: 'punct'; value: string; line: number; col: number }
  | { kind: 'end'; value: ''; line: number; col: number };

const PUNCT = new Set(['(', ')', '{', '}', ',', ':', ';', '=']);
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  const fail = (msg: string, at = i): never => {
    throw new GrammarSourceError(`line ${line}, column ${at - lineStart + 1}: ${msg}`);
  };
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { i++; line++; lineStart = i; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      if (close < 0) fail('this comment never closes');
      for (let j = i; j < close; j++) if (src[j] === '\n') { line++; lineStart = j + 1; }
      i = close + 2;
      continue;
    }
    const col = i - lineStart + 1;
    if (/[A-Za-z_$]/.test(c)) {
      const start = i;
      while (i < src.length && /[\w$]/.test(src[i])) i++;
      out.push({ kind: 'ident', value: src.slice(start, i), line, col });
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      while (i < src.length && /[0-9]/.test(src[i])) i++;
      if (i - start > MAX_DIGITS) fail(`a number longer than ${MAX_DIGITS} digits is not something a grammar helper takes`, start);
      out.push({ kind: 'number', value: Number(src.slice(start, i)), line, col });
      continue;
    }
    if (c === "'" || c === '"') {
      let value = '';
      i++;
      for (;;) {
        if (i >= src.length || src[i] === '\n') fail(`this string never closes — add its closing ${c}`, i);
        const d = src[i];
        if (d === c) { i++; break; }
        if (d === '\\') {
          const e = src[i + 1];
          if (e === undefined || !(e in ESCAPES)) fail(`\`\\${e ?? ''}\` is not an escape this box reads (use \\n, \\t, \\r, \\0, \\\\, \\' or \\")`, i);
          value += ESCAPES[e];
          i += 2;
          continue;
        }
        value += d;
        i++;
      }
      out.push({ kind: 'string', value, line, col });
      continue;
    }
    if (PUNCT.has(c)) { out.push({ kind: 'punct', value: c, line, col }); i++; continue; }
    fail(`\`${c}\` is not part of a grammar — the box holds \`const\` lines and one \`return { start, rules }\``);
  }
  out.push({ kind: 'end', value: '', line, col: i - lineStart + 1 });
  return out;
}

/**
 * Read the grammar box into the spec `compile` takes, building every helper call with the real
 * helper. Throws GrammarSourceError, with a line and column, for text outside the language; a
 * helper that rejects its arguments throws its own error.
 */
export function readGrammarSource(src: string, helpers: Helpers): unknown {
  const toks = tokenize(src);
  let p = 0;
  const names = new Map<string, unknown>();
  const sizes = new Map<string, number>();
  let expanded = 0;
  const grow = (t: Token, by: number) => {
    expanded += by;
    if (expanded > MAX_EXPANDED) {
      fail(t, `this grammar expands to more than ${MAX_EXPANDED.toLocaleString('en-US')} pieces once each name is counted everywhere it is used — reuse a rule with ref() instead of copying it`);
    }
  };
  const at = (t: Token) => `line ${t.line}, column ${t.col}`;
  const show = (t: Token) => (t.kind === 'end' ? 'the end' : t.kind === 'string' ? 'a string' : `\`${t.value}\``);
  const fail = (t: Token, msg: string): never => { throw new GrammarSourceError(`${at(t)}: ${msg}`); };
  const isPunct = (v: string) => toks[p].kind === 'punct' && toks[p].value === v;
  const expect = (v: string, what: string) => {
    if (!isPunct(v)) fail(toks[p], `expected ${what}, found ${show(toks[p])}`);
    p++;
  };

  function value(depth: number): unknown {
    const t = toks[p];
    if (depth > MAX_NESTING) fail(t, `the grammar nests deeper than ${MAX_NESTING} levels`);
    if (t.kind === 'string' || t.kind === 'number') {
      grow(t, t.kind === 'string' ? 1 + Math.floor(t.value.length / STRING_PIECE) : 1);
      p++;
      return t.value;
    }
    if (t.kind === 'punct' && t.value === '{') return object(depth + 1);
    if (t.kind === 'ident') {
      p++;
      if (isPunct('(')) {
        const helper = Object.hasOwn(helpers, t.value) ? helpers[t.value] : undefined;
        if (!helper) return fail(t, `\`${t.value}\` is not a grammar helper — use one of ${Object.keys(helpers).join(', ')}`);
        grow(t, 1);
        p++;
        const args: unknown[] = [];
        while (!isPunct(')')) {
          args.push(value(depth + 1));
          if (!isPunct(',')) break;
          p++;
        }
        expect(')', `\`,\` or \`)\` in the call to ${t.value}`);
        return (helper as (...a: unknown[]) => unknown)(...args);
      }
      if (!names.has(t.value)) fail(t, `\`${t.value}\` is not defined — name it with \`const ${t.value} = …;\` first`);
      grow(t, sizes.get(t.value) ?? 0);
      return names.get(t.value);
    }
    return fail(t, `expected a helper call, a string, a number, a name or \`{\`, found ${show(t)}`);
  }

  function object(depth: number): Record<string, unknown> {
    p++; // `{`
    const obj: Record<string, unknown> = Object.create(null);
    while (!isPunct('}')) {
      const k = toks[p];
      if (k.kind !== 'ident' && k.kind !== 'string') fail(k, `expected a key, found ${show(k)}`);
      const key = String(k.value);
      p++;
      // A key costs what a string does: a rule's name is repeated in every message about the rule.
      if (isPunct(':')) { grow(k, Math.floor(key.length / STRING_PIECE)); p++; obj[key] = value(depth); }
      else if (k.kind === 'ident' && names.has(key)) { grow(k, sizes.get(key) ?? 0); obj[key] = names.get(key); } // `{ start }` shorthand
      else if (k.kind === 'ident' && !isPunct(',') && !isPunct('}')) fail(toks[p], `expected \`:\` after the key \`${key}\``);
      else fail(k, `\`${key}\` is not defined — write \`${key}: …\`, or name it first with \`const ${key} = …;\``);
      if (!isPunct(',')) break;
      p++;
    }
    expect('}', '`,` or `}`');
    return { ...obj };
  }

  for (;;) {
    const t = toks[p];
    if (t.kind === 'ident' && t.value === 'const') {
      p++;
      const name = toks[p];
      if (name.kind !== 'ident') fail(name, `expected a name after \`const\`, found ${show(name)}`);
      if (names.has(String(name.value))) fail(name, `\`${name.value}\` is already defined`);
      p++;
      expect('=', '`=`');
      const before = expanded;
      names.set(String(name.value), value(0));
      sizes.set(String(name.value), expanded - before);
      expect(';', '`;` at the end of the line');
      continue;
    }
    if (t.kind === 'ident' && t.value === 'return') {
      p++;
      const spec = value(0);
      if (isPunct(';')) p++;
      if (toks[p].kind !== 'end') fail(toks[p], 'nothing may follow the `return`');
      if (!spec || typeof spec !== 'object' || !('rules' in spec)) fail(t, 'the grammar must end with `return { start, rules }`');
      return spec;
    }
    if (t.kind === 'end') return fail(t, 'the grammar must end with `return { start, rules }`');
    fail(t, `expected \`const\` or \`return\`, found ${show(t)} — the box holds a grammar, not a program`);
  }
}

// What the worker sends back is capped HERE, whatever the reader counted. The size cap bounds the
// grammar, not what Segno writes about it: a refused grammar of 6 KB listed 44,850 problems (92 MB
// of text, every pair of overlapping alternatives is one), and a cheap helper used 4,900 times
// generated 6.4 MB. Either would have gone into the page's DOM on the main thread.
export const MAX_REPLY_TEXT = 256 * 1024;
export const MAX_PROBLEMS = 50;
const MAX_PROBLEM_TEXT = 400;

export function clipText(text: string, max = MAX_REPLY_TEXT): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… cut here: ${(text.length - max).toLocaleString('en-US')} more characters not shown`;
}

export function clipProblems(problems: readonly string[]): string[] {
  const shown = problems.slice(0, MAX_PROBLEMS).map((p) => clipText(String(p), MAX_PROBLEM_TEXT));
  if (problems.length > MAX_PROBLEMS) shown.push(`… and ${(problems.length - MAX_PROBLEMS).toLocaleString('en-US')} more`);
  return shown;
}
