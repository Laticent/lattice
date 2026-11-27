#!/usr/bin/env node
// Turn a repo deck into a copy-and-go kit deck, so tools/vscode-preview-probe.mjs shows it the way an author's kit deck
// shows: the palette becomes one the kit ships (`--theme`, default cuoio), the deck's own <script>/<link> lines (repo
// paths such as ../dist/lattice-runtime.js) go, and the kit's stylesheet link and three scripts close the deck, as in
// dist/marp-kit/Sample-Deck.md. `--size` overrides the deck's `size:` (e.g. portrait, to see a split run on Marp).
//
//   node tools/vscode-harness/kit-deck.mjs <in.md> <out.md> [--theme cuoio] [--size portrait]
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
const body = md
	.slice(fm[0].length)
	.replace(/^<script\b[^>]*>\s*<\/script>\s*$/gm, '')
	.replace(/^<link\b[^>]*stylesheet[^>]*>\s*$/gm, '');
md = `${head}${body.trimEnd()}\n\n<link rel="stylesheet" href="lattice-vscode-min.css">\n<script src="mermaid-v11-min.js"></script>\n<script src="lattice-dagre-min.js"></script>\n<script src="lattice-runtime-min.js"></script>\n`;
fs.writeFileSync(out, md);
