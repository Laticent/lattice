// The /segno grammar box is READ, not run: every preset must build exactly the grammar that
// evaluating it as JavaScript built, and nothing outside the little language may execute.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alt, any, charRange, chars, compile, generate, lit, many, many1, node, noneOf, opt, ref, seq } from './segno';
import { GrammarSourceError, readGrammarSource } from './segno-playground-grammar';

const DSL = { alt, any, charRange, chars, lit, many, many1, node, noneOf, opt, ref, seq };
const page = readFileSync(resolve(__dirname, '../pages/segno.astro'), 'utf8');
// The presets are template literals in the page's script; `\${` never appears in them.
const presets = [...page.matchAll(/^\t+code: `([\s\S]*?)`,$/gm)].map((m) => m[1]);
// The OLD path, kept only here as the oracle: what the page did before it stopped running code.
const evaluate = (code: string) => new Function(...Object.keys(DSL), `"use strict";\n${code}`)(...Object.values(DSL));

describe('readGrammarSource', () => {
  it('finds every preset on the page', () => {
    expect(presets.length).toBe(5);
  });

  it.each(presets.map((code, i) => [i, code]))('preset %i builds the same grammar as evaluating it did', (_i, code) => {
    const read = readGrammarSource(code as string, DSL);
    expect(JSON.stringify(read)).toBe(JSON.stringify(evaluate(code as string)));
    let viaRead = '';
    let viaEval = '';
    try { viaRead = generate(read as Parameters<typeof generate>[0]); } catch (e) { viaRead = String(e); }
    try { viaEval = generate(evaluate(code as string)); } catch (e) { viaEval = String(e); }
    expect(viaRead).toBe(viaEval);
  });

  it('runs nothing: a loop, a global and an unknown call are read errors with a line', () => {
    const bad: Array<[string, RegExp]> = [
      ['for (;;) {}', /line 1, column 1: expected `const` or `return`/],
      ['const x = globalThis;\nreturn { start: "s", rules: {} };', /line 1, column 11: `globalThis` is not defined/],
      ['const x = fetch("https://example.com");\nreturn {};', /`fetch` is not a grammar helper/],
      ['return { start: "s", rules: { s: constructor("a") } };', /`constructor` is not a grammar helper/],
      ['return { start: "s", rules: { s: seq("a" } };', /expected `,` or `\)` in the call to seq/],
      ["return { s: 'a };", /this string never closes/],
      ['const a = "x";\nconst a = "y";\nreturn { rules: {} };', /line 2, column 7: `a` is already defined/],
      ['return { start: "s", rules: {} }; alert(1)', /nothing may follow the `return`/],
      ['`template`', /is not part of a grammar/],
    ];
    for (const [src, msg] of bad) {
      expect(() => readGrammarSource(src, DSL), src).toThrow(GrammarSourceError);
      expect(() => readGrammarSource(src, DSL), src).toThrow(msg);
    }
  });

  it('a helper call goes to the real helper, and only own helpers count', () => {
    const spec = readGrammarSource("const d = chars('01', 'a bit');\nreturn { start: 's', rules: { s: many1(d) } };", DSL);
    expect(compile(spec as Parameters<typeof compile>[0]).parse('0110').ok).toBe(true);
    expect(() => readGrammarSource('return { rules: { s: toString() } };', DSL)).toThrow(/not a grammar helper/);
  });

  it('caps nesting, so a deep paste is an error and not a stack overflow', () => {
    const deep = `return { start: 's', rules: { s: ${'opt('.repeat(500)}'a'${')'.repeat(500)} } };`;
    expect(() => readGrammarSource(deep, DSL)).toThrow(/nests deeper than 64/);
  });

  it('reads a long hostile paste in linear time', () => {
    const src = `const a = 'x';\n${'// note\n'.repeat(50_000)}return { start: 's', rules: { s: seq(${"'a', ".repeat(20_000)}'b') } };`;
    const t0 = performance.now();
    readGrammarSource(src, DSL);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
