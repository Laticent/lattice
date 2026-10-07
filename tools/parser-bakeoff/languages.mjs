/**
 * parser-bakeoff languages arm — can Segno tokenize whole CSS, HTML and Markdown files?
 *
 * The probe behind decision 21 of engineering/decisions/2026-09-28-segno-unified-inline-notation.md.
 * The grammars (languages-grammars.mjs) use greedy() and until(); this arm reads every tracked file
 * of each type with them and reports:
 *   - coverage: how many files the grammar reads to the end;
 *   - agreement: per file, the same count of one structure as the real parser finds (CSS blocks vs
 *     postcss, HTML start tags and comments vs parse5, Markdown headings, fences and code spans vs
 *     markdown-it). YAML front matter is stripped from Markdown first, because CommonMark reads it
 *     as a setext heading;
 *   - speed: MB/s over every file, best of nine rounds, beside the real parsers. NOT a like-for-like
 *     race — the grammars tokenize, the real parsers also build trees and resolve meaning;
 *   - tokenizers: the like-for-like race — MB/s beside the tokenizer layer of each real parser
 *     (postcss's and css-tree's tokenizers, parse5's Tokenizer, markdown-it's block pass alone);
 *   - scaling: twelve hostile shapes aimed at greedy and until, at 5k and 50k repetitions
 *     (about 10x for 10x input is linear).
 * A comparison parser that is not installed is skipped. Runs Segno from source (esbuild), as the
 * segno arm does.
 *
 * Usage:  npm run parser:bakeoff:languages   [--json]
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { languageGrammars } from './languages-grammars.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const require = createRequire(path.join(ROOT, 'package.json'));
const esbuild = require('esbuild');
const LIB = path.join(ROOT, 'docs/src/lib/segno');
const built = await esbuild.build({ stdin: { contents: "export * from './index.ts';", resolveDir: LIB, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent' });
const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const G = languageGrammars(S);
const gen = async (spec) => {
  const js = esbuild.transformSync(S.generate(spec), { loader: 'ts', format: 'esm' }).code;
  return (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).parse;
};
const P = { css: await gen(G.css), html: await gen(G.html), md: await gen(G.md) };
const I = { css: S.compile(G.css), html: S.compile(G.html), md: S.compile(G.md) };
const optional = (name) => { try { return require(name); } catch { return null; } };
const postcss = optional('postcss');
const csstree = optional('css-tree');
const parse5 = optional('parse5');
const MarkdownIt = optional('markdown-it');
const mdit = MarkdownIt && new MarkdownIt('commonmark');
const postcssTokenize = optional('postcss/lib/tokenize');

const files = (glob) => execSync(`git ls-files -z '${glob}'`, { cwd: ROOT }).toString().split('\0').filter(Boolean);
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8'); // tracked files are LF (.gitattributes)
const corpus = {
  css: files('*.css').map((f) => ({ f, s: read(f) })),
  html: files('*.html').map((f) => ({ f, s: read(f) })),
  md: files('*.md').map((f) => ({ f, s: read(f).replace(/^---\n[\s\S]*?\n---\n/, '') })),
};

const count = (tree, kind) => { const k = tree.kinds.indexOf(kind); let n = 0; if (k >= 0) for (let i = 0; i < tree.top; i += 4) if (tree.buf[i] === k) n++; return n; };
const oracle = {
  css: postcss && ((s) => { let n = 0; postcss.parse(s).walk((x) => { if (x.nodes) n++; }); return { block: n }; }),
  html: parse5 && ((s) => {
    let open = 0; let comment = 0;
    const walk = (x) => { if (x.sourceCodeLocation?.startTag) open++; if (x.nodeName === '#comment') comment++; (x.childNodes || []).forEach(walk); if (x.content) walk(x.content); };
    walk(parse5.parse(s, { sourceCodeLocationInfo: true }));
    return { open, comment };
  }),
  md: mdit && ((s) => {
    const t = mdit.parse(s, {});
    return { heading: t.filter((x) => x.type === 'heading_open').length, fence: t.filter((x) => x.type === 'fence').length,
      code: t.reduce((a, x) => a + (x.children || []).filter((c) => c.type === 'code_inline').length, 0) };
  }),
};

const out = { coverage: {}, speed: {}, tokenizers: {}, scaling: {} };
for (const lang of Object.keys(corpus)) {
  let ok = 0; const agree = {}; const fails = [];
  for (const { f, s } of corpus[lang]) {
    const r = P[lang](s);
    if (r.ok !== I[lang].parse(s).ok) throw new Error(`compile() and generate() disagree on ${f}`);
    if (!r.ok) { fails.push(`${f}: at ${r.error.at}, expected ${r.error.expected}`); continue; }
    ok++;
    if (oracle[lang]) for (const [k, want] of Object.entries(oracle[lang](s))) { agree[k] ??= 0; if (count(r.tree, k) === want) agree[k]++; }
  }
  out.coverage[lang] = { files: corpus[lang].length, read: ok, agree, fails: fails.slice(0, 5) };
}

const bestOf = (fn, xs, rounds = 9) => { for (const s of xs) fn(s); let b = Infinity; for (let r = 0; r < rounds; r++) { const t = performance.now(); for (const s of xs) fn(s); b = Math.min(b, performance.now() - t); } return b; };
const arms = {
  css: { 'segno (generated)': P.css, 'segno (compile)': (s) => I.css.parse(s), postcss: postcss && ((s) => postcss.parse(s)), 'css-tree': csstree && ((s) => csstree.parse(s)) },
  html: { 'segno (generated)': P.html, 'segno (compile)': (s) => I.html.parse(s), parse5: parse5 && ((s) => parse5.parse(s)) },
  md: { 'segno (generated)': P.md, 'segno (compile)': (s) => I.md.parse(s), 'markdown-it (parse)': mdit && ((s) => mdit.parse(s, {})) },
};
// The tokenizer layer of each real parser, with no tree built: what the grammars actually do.
// css-tree's tokenizer is timed through its callback form, so it allocates no token objects.
const noop = () => {};
const p5 = parse5?.Tokenizer && { onComment: noop, onDoctype: noop, onStartTag: noop, onEndTag: noop, onEof: noop, onCharacter: noop, onNullCharacter: noop, onWhitespaceCharacter: noop, onParseError: null };
const tokenizerArms = {
  css: { 'segno (generated)': P.css,
    'postcss tokenizer': postcssTokenize && ((s) => { const t = postcssTokenize({ css: s }); while (!t.endOfFile()) t.nextToken(); }),
    'css-tree tokenize': csstree && ((s) => csstree.tokenize(s, noop)) },
  html: { 'segno (generated)': P.html, 'parse5 Tokenizer': p5 && ((s) => new parse5.Tokenizer({ sourceCodeLocationInfo: false }, p5).write(s, true)) },
  md: { 'segno (generated)': P.md, 'markdown-it block pass': mdit && ((s) => { const st = new mdit.block.State(s, mdit, {}, []); mdit.block.tokenize(st, 0, st.lineMax); }) },
};
for (const lang of Object.keys(corpus)) {
  const xs = corpus[lang].map((r) => r.s);
  const MB = xs.reduce((a, s) => a + s.length, 0) / 1e6;
  out.tokenizers[lang] = {};
  for (const [name, fn] of Object.entries(tokenizerArms[lang])) if (fn) out.tokenizers[lang][name] = +(MB / (bestOf(fn, xs) / 1e3)).toFixed(1);
}
for (const lang of Object.keys(corpus)) {
  const xs = corpus[lang].map((r) => r.s);
  const MB = xs.reduce((a, s) => a + s.length, 0) / 1e6;
  out.speed[lang] = { MB: +MB.toFixed(2) };
  for (const [name, fn] of Object.entries(arms[lang])) if (fn) out.speed[lang][name] = +(MB / (bestOf(fn, xs) / 1e3)).toFixed(1);
}

const ladders = {
  css: { 'unclosed comment': (n) => `/*${'*'.repeat(n)}`, 'comment of near-ends': (n) => `/*${'* '.repeat(n)}*/`, 'one endless word': (n) => 'a'.repeat(n), 'slash then star': (n) => `x{y:${'a/ *'.repeat(n)}}` },
  html: { 'script full of </scrip': (n) => `<script>${'</scrip'.repeat(n)}</script>`, 'comment full of --': (n) => `<!--${'--x'.repeat(n)}-->`, 'unclosed script': (n) => `<script>${'a<b '.repeat(n)}`, 'names that start like script': (n) => '<scr></scr>'.repeat(n) },
  md: { 'fence full of backticks': (n) => `\`\`\`\n${'``\n'.repeat(n)}\`\`\``, 'unclosed fence': (n) => `\`\`\`\n${'a\n'.repeat(n)}`, 'unclosed backticks': (n) => '`a '.repeat(n), 'many headings': (n) => '# a\n'.repeat(n) },
};
const once = (fn, s) => { fn(s); let b = Infinity; for (let r = 0; r < 7; r++) { const t = performance.now(); fn(s); b = Math.min(b, performance.now() - t); } return b; };
for (const lang of Object.keys(ladders)) for (const [name, mk] of Object.entries(ladders[lang])) {
  const a = once(P[lang], mk(5000)); const b = once(P[lang], mk(50000));
  out.scaling[`${lang}: ${name}`] = { reads: P[lang](mk(5000)).ok, ms50k: +b.toFixed(2), growth: +(b / Math.max(a, 1e-3)).toFixed(1) };
}

if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log('coverage — files read to the end, and per-file agreement with the real parser');
for (const [l, c] of Object.entries(out.coverage)) console.log(`  ${l.padEnd(5)} ${c.read}/${c.files}   ${Object.entries(c.agree).map(([k, v]) => `${k} ${v}/${c.read}`).join('   ')}${c.fails.length ? `\n        first failures: ${c.fails.join(' | ')}` : ''}`);
console.log('\nspeed — MB/s over every file, best of nine (the real parsers do more: not like for like)');
for (const [l, v] of Object.entries(out.speed)) console.log(`  ${l.padEnd(5)} ${v.MB} MB   ${Object.entries(v).filter(([k]) => k !== 'MB').map(([k, x]) => `${k} ${x}`).join('   ')}`);
console.log('\ntokenizers — MB/s beside each real parser\'s tokenizer layer alone (like for like)');
for (const [l, v] of Object.entries(out.tokenizers)) console.log(`  ${l.padEnd(5)} ${Object.entries(v).map(([k, x]) => `${k} ${x}`).join('   ')}`);
console.log('\nscaling — ms at 50k repetitions, and growth for 10x input (about 10 is linear)');
for (const [k, v] of Object.entries(out.scaling)) console.log(`  ${k.padEnd(36)} ${v.reads ? 'reads' : 'REFUSED'}   ${String(v.ms50k).padStart(7)} ms   x${v.growth}`);
