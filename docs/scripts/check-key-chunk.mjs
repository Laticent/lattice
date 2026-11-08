// Key-name containment gate — fails the build if the storage name of a visitor's AI key shows up
// in more than one shipped JS chunk, or in any shipped HTML file (BYOK lifecycle note §3,
// engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md).
//
// Why this exists: every read and write of a stored key goes through ONE module,
// src/lib/openrouter-key.js (BYOK lifecycle note §3), so it can seal the value and be reviewed in
// one place. openrouter-key.test.ts pins that by grepping docs/src, which cannot see a file under
// lib/ the site bundles or an imported test helper. The shipped bundle sees every path at once:
// if a second chunk names a key slot, a second reader exists.
//
// The names are read from openrouter-key.js itself (every 'lattice-db-…' literal in it), so a new
// provider slot is covered without editing this file. That includes a literal in a comment there,
// so a comment naming a retired slot fails the build loudly ("appears in 0 JS chunks").
//
// What it cannot catch: code that walks localStorage without naming a key (a backup loop), or
// that builds a key name from parts at runtime (`lattice-db-${p}-key`). Those are review
// questions, not a grep.
//
// Runs post-`astro build` in the docs `build` script, beside check-studio-shell. Standalone:
// `npm run check:key-chunk` (needs a built dist/).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const KEY_MODULE = path.join(ROOT, 'src', 'lib', 'openrouter-key.js');

/** Every file under `dir` whose name ends in one of `exts`. */
function walk(dir, exts, out = []) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) walk(p, exts, out);
		else if (exts.some((e) => entry.name.endsWith(e))) out.push(p);
	}
	return out;
}

/** The storage names the key module owns, as string literals in its source. */
export function keyNames(source) {
	return [...new Set([...source.matchAll(/'(lattice-db-[a-z0-9-]+)'/g)].map((m) => m[1]))].sort();
}

/**
 * Which files name which key slot. A name is matched as a whole quoted-or-bare token, so
 * `lattice-db-or-key` does not count a hit on `lattice-db-or-key-invalid`.
 * @returns {{ problems: string[], chunkByName: Record<string, string[]> }}
 */
export function findProblems(names, jsFiles, htmlFiles, read = (f) => fs.readFileSync(f, 'utf8')) {
	const res = names.map((n) => [n, new RegExp(`(?<![A-Za-z0-9-])${n.replace(/-/g, '\\-')}(?![A-Za-z0-9-])`)]);
	const chunkByName = Object.fromEntries(names.map((n) => [n, []]));
	const problems = [];
	for (const f of jsFiles) {
		const text = read(f);
		for (const [n, re] of res) if (re.test(text)) chunkByName[n].push(f);
	}
	for (const f of htmlFiles) {
		const text = read(f);
		for (const [n, re] of res) if (re.test(text)) problems.push(`${n} appears in HTML: ${f}`);
	}
	for (const [n, files] of Object.entries(chunkByName)) {
		if (files.length !== 1) problems.push(`${n} appears in ${files.length} JS chunks (want exactly 1): ${files.join(', ') || '(none)'}`);
	}
	const homes = new Set(Object.values(chunkByName).flat());
	if (homes.size > 1) problems.push(`the key slots live in ${homes.size} different chunks (want one): ${[...homes].join(', ')}`);
	return { problems, chunkByName };
}

// realpath + pathToFileURL, so a path with a space or a symlink still runs the gate rather than
// silently skipping it.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
	if (!fs.existsSync(DIST)) {
		console.error('check-key-chunk: no dist/ — run the docs build first.');
		process.exit(1);
	}
	const names = keyNames(fs.readFileSync(KEY_MODULE, 'utf8'));
	if (names.length === 0) {
		console.error(`check-key-chunk: found no 'lattice-db-…' names in ${path.relative(ROOT, KEY_MODULE)}; the gate would check nothing.`);
		process.exit(1);
	}
	const ASTRO = path.join(DIST, '_astro');
	if (!fs.existsSync(ASTRO)) {
		console.error('check-key-chunk: dist/ has no _astro/ chunk folder; the build did not produce a bundle to check.');
		process.exit(1);
	}
	const js = walk(ASTRO, ['.js', '.mjs']);
	const html = walk(DIST, ['.html']);
	const { problems, chunkByName } = findProblems(names, js, html);
	if (problems.length) {
		console.error('check-key-chunk: a visitor\'s key is named outside its one module (BYOK lifecycle note §3):');
		for (const p of problems) console.error(`  - ${p}`);
		console.error('Route every read and write of a stored key through src/lib/openrouter-key.js.');
		process.exit(1);
	}
	const home = path.relative(ROOT, Object.values(chunkByName)[0][0]);
	console.log(`check-key-chunk: ${names.length} key names, all in one chunk (${home}); none in ${html.length} HTML files.`);
}
