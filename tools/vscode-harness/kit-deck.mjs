#!/usr/bin/env node
// Re-point a Marp deck at the copy-and-go kit, so tools/vscode-preview-probe.mjs shows it the way an author's kit deck
// shows. The input is the deck an Export-to-Marp bundle wrote (`npm run export:marp`): its `@meta` records are already
// compiled to Marp's `_class` comments, which plain Marp needs (engineering/decisions/2026-10-17-meta-record.md §7).
// Here the palette becomes one the kit ships (`--theme`, default cuoio), the deck's own <script src>/<link> lines go, and
// the kit's stylesheet link and three scripts close the deck, as in dist/marp-kit/Sample-Deck.md. `--size` overrides the
// deck's `size:`.
//
//   node tools/vscode-harness/kit-deck.mjs <bundle-deck.md> <out.md> [--theme cuoio] [--size portrait]
import fs from 'node:fs';

const [src, out, ...rest] = process.argv.slice(2);
if (!src || !out) throw new Error('usage: kit-deck.mjs <in.md> <out.md> [--theme cuoio] [--size portrait]');
const opt = (k) => {
	const i = rest.indexOf(`--${k}`);
	return i >= 0 ? rest[i + 1] : undefined;
};
const theme = opt('theme') || 'cuoio';
const size = opt('size');
// The markdown ingest: strip a BOM and fold CRLF and lone CR before the `^---` anchor reads the front matter.
let md = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const fm = md.match(/^---\n[\s\S]*?\n---\n/);
if (!fm) throw new Error(`${src} has no front matter`);
let head = fm[0].replace(/^theme:.*$/m, `theme: ${theme}`);
if (!/^theme:/m.test(head)) head = head.replace(/\n---\n$/, `\ntheme: ${theme}\n---\n`);
if (size) head = /^size:/m.test(head) ? head.replace(/^size:.*$/m, `size: ${size}`) : head.replace(/\n---\n$/, `\nsize: ${size}\n---\n`);
// The asset lines the bundle writes, word for word (tools/export-marp.js): dropped by exact match, not by an HTML
// pattern, then the kit's own versions close the deck. Anything else stays as written.
const SCRIPTS = ['mermaid-v11-min.js', 'lattice-dagre-min.js', 'lattice-runtime-min.js'].map((s) => `<script src="${s}"></script>`);
const BUNDLE_ASSETS = new Set(['<link rel="stylesheet" href="lattice-vscode.css">', ...SCRIPTS]);
const body = md
	.slice(fm[0].length)
	.split('\n')
	.filter((line) => !BUNDLE_ASSETS.has(line.trim()))
	.join('\n');
md = `${head}${body.trimEnd()}\n\n<link rel="stylesheet" href="lattice-vscode-min.css">\n${SCRIPTS.join('\n')}\n`;
fs.writeFileSync(out, md);
