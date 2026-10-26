// Q: what does staging tokens on Segno's tape and walking them in a second pass cost, next to tokenizing?

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageGrammars } from '../languages-grammars.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url)); // the repo root
const require = createRequire(path.join(ROOT, 'package.json'));
const esbuild = require('esbuild');
const LIB = path.join(ROOT, 'docs/src/lib/segno');
const built = await esbuild.build({ stdin: { contents: "export * from './index.ts';", resolveDir: LIB, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', tsconfigRaw: '{}', logLevel: 'silent' });
const S = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString('base64')}`);
const G = languageGrammars(S);
const LANG = process.argv[2] || 'md';
const js = esbuild.transformSync(S.generate(G[LANG]), { loader: 'ts', format: 'esm' }).code;
const P = (await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)).parse;
const GLOB = { md: "'examples/*.md' '*.gallery.md' 'test/integration/baseline-decks/*.md'", css: "'*.css'", html: "'*.html'" }[LANG];
const files = execSync(`git ls-files ${GLOB}`, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
const docs = files.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'));
const MB = docs.reduce((n, s) => n + s.length, 0) / 1e6;
let sink = 0;
// pass 2a: walk every node, read its kind and span (the minimum any consumer does)
const walk = (tree) => { const b = tree.buf; let h = 0; for (let i = 0; i < tree.top; i += 4) h = (h + b[i] * 31 + (b[i + 2] - b[i + 1])) | 0; return h; };
// pass 2b: a realistic consumer: per node, look at the first char of its span and branch (what a block driver does)
const consume = (tree, s) => { const b = tree.buf; let h = 0; for (let i = 0; i < tree.top; i += 4) { const k = b[i]; const c = s.charCodeAt(b[i + 1]); switch (k & 7) { case 0: h += c; break; case 1: h ^= c; break; case 2: h -= k; break; default: h = (h * 3 + c) | 0; } } return h; };
const best = (fn) => { for (let w = 0; w < 3; w++) fn(); let b = Infinity; for (let r = 0; r < 11; r++) { const t = process.hrtime.bigint(); fn(); b = Math.min(b, Number(process.hrtime.bigint() - t) / 1e9); } return b; };
let nodes = 0; for (const s of docs) nodes += P(s).tree.top / 4;
const tTok = best(() => { for (const s of docs) sink ^= P(s).tree.top; });
const tWalk = best(() => { for (const s of docs) { const r = P(s); sink ^= walk(r.tree); } });
const tCons = best(() => { for (const s of docs) { const r = P(s); sink ^= consume(r.tree, s); } });
const per = (t) => `${(MB / t).toFixed(0).padStart(4)} MB/s  ${(t * 1e3).toFixed(2).padStart(7)} ms`;
console.log(`[${LANG}] ${docs.length} files, ${MB.toFixed(2)} MB, ${nodes} tape nodes (${(nodes / (MB * 1e3)).toFixed(1)} per KB)`);
console.log(`tokenize only                         ${per(tTok)}`);
console.log(`tokenize + walk the tape              ${per(tWalk)}   (+${(100 * (tWalk - tTok) / tTok).toFixed(1)}%)`);
console.log(`tokenize + a driver-like consumer     ${per(tCons)}   (+${(100 * (tCons - tTok) / tTok).toFixed(1)}%)`);
console.log(`second pass alone: ${(((tCons - tTok) / nodes) * 1e9).toFixed(2)} ns per node`);
if (sink === 42) console.log('');
