// The /segno grammar box is READ, not run: every preset must build exactly the grammar that
// evaluating it as JavaScript built, and nothing outside the little language may execute.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { alt, any, charRange, chars, compile, GrammarError, generate, lit, many, many1, node, noneOf, opt, ref, seq } from './segno';
import { clipProblems, clipText, GrammarSourceError, MAX_EXPANDED, MAX_PROBLEMS, MAX_REPLY_TEXT, readGrammarSource } from './segno-playground-grammar';

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

  it('refuses a grammar that doubles itself through reused names, before compile ever sees it', () => {
    // The checker's case: under 1 KB of text, 2^28 pieces; compiling it on the page froze the tab.
    const lines = ["const c0 = seq('a', 'b');"];
    for (let n = 1; n <= 28; n++) lines.push(`const c${n} = seq(c${n - 1}, c${n - 1});`);
    const src = `${lines.join('\n')}\nreturn { start: 's', rules: { s: c28 } };`;
    expect(src.length).toBeLessThan(1024);
    const t0 = performance.now();
    expect(() => readGrammarSource(src, DSL)).toThrow(/expands to more than 10,000 pieces/);
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('anything under the size cap compiles and generates quickly', () => {
    // A doubling chain that fits: c10 is 2,047 pieces, and with the definitions counted too the
    // whole grammar is about 6k of the 10k cap.
    const lines = ["const c0 = 'a';"];
    for (let n = 1; n <= 10; n++) lines.push(`const c${n} = seq(c${n - 1}, c${n - 1});`);
    const spec = readGrammarSource(`${lines.join('\n')}\nreturn { start: 's', rules: { s: c10 } };`, DSL);
    const t0 = performance.now();
    compile(spec as Parameters<typeof compile>[0]);
    generate(spec as Parameters<typeof generate>[0]);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(MAX_EXPANDED).toBe(10_000);
  });

  it('charges a string by its length, so a long literal reused everywhere cannot generate megabytes', () => {
    // The checker's case: a 20,000-character literal used 2,500 times was ~5,000 pieces when a
    // string cost one, and generate() wrote 100 MB that the page then put in the DOM.
    const big = `const s = lit('${'x'.repeat(20_000)}');\nreturn { start: 'r', rules: { r: seq(${'s, '.repeat(2_500)}s) } };`;
    expect(() => readGrammarSource(big, DSL)).toThrow(/expands to more than 10,000 pieces/);
    // A long rule NAME is charged too: every message about the rule repeats it.
    const longKey = `return { start: 'r', rules: { r: lit('a'), '${'n'.repeat(700_000)}': lit('b') } };`;
    expect(() => readGrammarSource(longKey, DSL)).toThrow(/expands to more than 10,000 pieces/);
  });

  it('caps what goes back to the page, whatever the reader counted', () => {
    // The reader bounds the grammar, not what Segno writes about it. A cheap helper reused to the
    // cap still generates megabytes (the checker's: chars() of 63 characters, 4,900 times)...
    const set = Array.from({ length: 63 }, (_, i) => String.fromCharCode(0x21 + i)).join('').replace(/['\\]/g, '');
    const spec = readGrammarSource(`const s = chars('${set}');\nreturn { start: 'r', rules: { r: seq(${'s, '.repeat(4_800)}s) } };`, DSL);
    const generated = generate(spec as Parameters<typeof generate>[0]);
    expect(generated.length).toBeGreaterThan(MAX_REPLY_TEXT);
    const sent = clipText(generated);
    expect(sent.length).toBeLessThan(MAX_REPLY_TEXT + 100);
    expect(sent).toMatch(/cut here: [\d,]+ more characters not shown$/);
    // ...and a refused grammar lists one problem per overlapping pair: 60 alternatives, 1,770.
    const refused = `return { start: 'r', rules: { r: ref('k'), k: alt(${"seq('a', 'b'), ".repeat(59)}seq('a', 'b')) } };`;
    let problems: readonly string[] = [];
    try { compile(readGrammarSource(refused, DSL) as Parameters<typeof compile>[0]); } catch (e) { if (e instanceof GrammarError) problems = e.problems; }
    expect(problems.length).toBeGreaterThan(MAX_PROBLEMS);
    const shown = clipProblems(problems);
    expect(shown).toHaveLength(MAX_PROBLEMS + 1);
    expect(shown.at(-1)).toBe(`… and ${(problems.length - MAX_PROBLEMS).toLocaleString('en-US')} more`);
    expect(clipProblems(['x'.repeat(5_000)])[0].length).toBeLessThan(500);
  });

  it('a shorthand key with no const says it is not defined; a huge number is refused', () => {
    expect(() => readGrammarSource('return { start, rules: {} };', DSL)).toThrow(/`start` is not defined — write `start: …`/);
    expect(() => readGrammarSource("return { start: 's', rules: { s: lit(99999999999999999999) } };", DSL)).toThrow(/longer than 9 digits/);
  });

  it('reads a long hostile paste in linear time', () => {
    const src = `const a = 'x';\n${'// note\n'.repeat(50_000)}return { start: 's', rules: { s: seq(${"'a', ".repeat(5_000)}'b') } };`;
    const t0 = performance.now();
    readGrammarSource(src, DSL);
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
