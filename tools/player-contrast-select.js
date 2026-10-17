#!/usr/bin/env node
/**
 * player-contrast-select — which component galleries does the player-contrast sweep need to open?
 *
 * `tools/check-player-contrast.js` exports each deck to a player and scores it from rendered
 * pixels, about 24 seconds a deck. Opening every gallery every night repeats work whose input
 * has not moved, so the nightly asks THIS tool for the galleries a change could have touched
 * since the last green night, and runs the whole set only on the weekly full sweep.
 *
 *   node tools/player-contrast-select.js --since <sha>   # galleries a diff <sha>..HEAD could move
 *   node tools/player-contrast-select.js --full          # every component gallery
 *   node tools/player-contrast-select.js --examples [N]  # the weekly sample of examples/ (default 40)
 *
 * Prints one gallery path per line on stdout (nothing at all when nothing render-affecting
 * changed) and the reason on stderr.
 *
 * THE RULE IS CONSERVATIVE BY CONSTRUCTION. A changed path is classified by the first match of:
 *   1. a known non-render path (docs, tests, notes, CI config, examples) → selects nothing;
 *   2. a file under a gallery's own directory → that gallery;
 *   3. a theme (`themes/<name>/`) → the galleries whose `theme:` is that theme or its dark/light
 *      partner (the player toggles between the pair, so both are scored);
 *   4. ANYTHING ELSE → every gallery.
 * An unclassified path costs a full sweep; it can never cost a missed regression. That
 * asymmetry is why rule 4 is the default and rule 1 is an explicit list.
 *
 * WHAT THIS CAN MISS, stated because the weekly full sweep exists for it: a component whose CSS
 * leaks into a slide in ANOTHER component's gallery (a gallery that embeds a `cards` grid is not
 * re-opened when `cards` changes). Galleries are meant to be isolated per component (HARD RULE
 * #8); the weekly sweep is the backstop if one is not.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

const { NON_RENDER, classifyPath } = require('../lib/conformance/changed-paths');

/** A gallery, as the selector sees it: file, owning directory, theme pair key. */
function readGalleries(root = ROOT) {
	const out = [];
	const base = path.join(root, 'lib', 'components');
	for (const bucket of fs.readdirSync(base, { withFileTypes: true })) {
		if (!bucket.isDirectory() || bucket.name.startsWith('_')) continue;
		for (const comp of fs.readdirSync(path.join(base, bucket.name), { withFileTypes: true })) {
			if (!comp.isDirectory() || comp.name.startsWith('_')) continue;
			const file = path.join(base, bucket.name, comp.name, `${comp.name}.gallery.md`);
			if (!fs.existsSync(file)) continue;
			const head = fs.readFileSync(file, 'utf8').split(/\r\n?|\n/).slice(0, 12).join('\n');
			const theme = /^theme:\s*['"]?([\w-]+)/m.exec(head)?.[1] || 'indaco';
			out.push({ file: path.relative(root, file).split(path.sep).join('/'), dir: `lib/components/${bucket.name}/${comp.name}/`, theme });
		}
	}
	return out.sort((a, b) => a.file.localeCompare(b.file));
}

/** `indaco-dark` and `indaco` are one pair: the player toggles between them. */
const pair = (theme) => theme.replace(/-dark$/, '');

/**
 * @param {string[]} changed repo-relative paths from `git diff --name-only`
 * @param {{file: string, dir: string, theme: string}[]} galleries
 * @param {{full?: boolean}} [opts]
 * @returns {{files: string[], reason: string}}
 */
function selectGalleries(changed, galleries, { full = false } = {}) {
	const all = galleries.map((g) => g.file);
	if (full) return { files: all, reason: `full sweep: all ${all.length} galleries` };
	const picked = new Set();
	for (const raw of changed) {
		const p = raw.split(path.sep).join('/');
		const c = classifyPath(p);
		if (c.kind === 'non-render') continue;
		if (c.kind === 'component') {
			const own = galleries.filter((g) => p.startsWith(g.dir));
			if (own.length) {
				for (const g of own) picked.add(g.file);
				continue;
			}
		}
		if (c.kind === 'theme') {
			for (const g of galleries) if (pair(g.theme) === pair(c.name)) picked.add(g.file);
			continue;
		}
		return { files: all, reason: `${p} can change every gallery: all ${all.length}` };
	}
	const files = all.filter((f) => picked.has(f));
	return { files, reason: files.length ? `${files.length} of ${all.length} galleries changed` : 'nothing render-affecting changed' };
}

/**
 * A deterministic sample of `examples/*.md` for the weekly composed-deck sweep (owner ruling
 * 2026-10-17: sampled, not all 280; the galleries cover every component on indaco, so this covers
 * what they cannot: other themes and composed finish and register mixes). Three strata, in order:
 * (1) every deck on a theme other than indaco, (2) every deck that sets `finish:` or `mode:`,
 * (3) the rest, taken at an even stride until `n` is reached. No randomness, so the baseline's keys
 * stay put from week to week; a new example joins the sample only through a stratum or the stride.
 * @param {string} [root]
 * @param {number} [n] target size; strata 1 and 2 are always kept whole
 * @returns {string[]} repo-relative paths, sorted
 */
function sampleExamples(root = ROOT, n = 40) {
	const dir = path.join(root, 'examples');
	const decks = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
	const head = (f) => fs.readFileSync(path.join(dir, f), 'utf8').split(/\r\n?|\n/).slice(0, 25).join('\n');
	const chosen = new Set();
	const rest = [];
	for (const f of decks) {
		const h = head(f);
		const theme = /^theme:\s*['"]?([\w-]+)/m.exec(h)?.[1] || 'indaco';
		if (theme !== 'indaco' || /^(?:finish|mode):/m.test(h)) chosen.add(f);
		else rest.push(f);
	}
	const need = Math.max(0, n - chosen.size);
	for (let i = 0; i < need && rest.length; i++) chosen.add(rest[Math.floor(((i + 0.5) * rest.length) / need)]);
	return [...chosen].sort().map((f) => `examples/${f}`);
}

function main() {
	const argv = process.argv.slice(2);
	const galleries = readGalleries();
	let result;
	if (argv.includes('--examples')) {
		const n = Number(argv[argv.indexOf('--examples') + 1]) || 40;
		const files = sampleExamples(ROOT, n);
		console.error(`player-contrast-select: ${files.length} sampled examples`);
		process.stdout.write(`${files.join('\n')}\n`);
		return;
	}
	if (argv.includes('--full')) result = selectGalleries([], galleries, { full: true });
	else {
		const since = argv[argv.indexOf('--since') + 1];
		if (!argv.includes('--since') || !since) {
			console.error('usage: node tools/player-contrast-select.js (--since <sha> | --full)');
			process.exit(2);
		}
		const changed = execFileSync('git', ['diff', '--name-only', `${since}..HEAD`], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
		result = selectGalleries(changed, galleries);
	}
	console.error(`player-contrast-select: ${result.reason}`);
	if (result.files.length) process.stdout.write(`${result.files.join('\n')}\n`);
}

module.exports = { selectGalleries, readGalleries, sampleExamples, NON_RENDER };

if (require.main === module) main();
