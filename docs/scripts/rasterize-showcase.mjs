// Rasterize the landing page's showcase images from committed gallery PDFs.
//
// The set is MANIFEST-DRIVEN: any component whose manifest carries
// `"showcase": { "featured": true }` (or `{ "hero": true }`) is included.
// Add that flag to a new component's manifest and re-run this script to pull
// it into the landing highlight reel — no edit here required.
//
// Source PDFs are the committed per-component galleries at
// lib/components/<bucket>/<name>/<name>.gallery.{light,dark}.pdf. They are
// vector PDFs and not web-servable, so we rasterize the chosen page with
// `pdftoppm` (poppler) then crop/compress with sharp to WebP, named
// public/showcase/<name>.<mode>.webp.
//
// Outputs are COMMITTED, so the GitHub Pages build never needs poppler — it
// just serves the static images. Regenerate locally (poppler required) only
// when the flagged set or its galleries change:
//
//   node docs/scripts/rasterize-showcase.mjs            # (re)write the WebPs
//   node docs/scripts/rasterize-showcase.mjs --check    # gate: every output exists
//
// --check verifies presence (a component was flagged but its image was never
// generated) AND source freshness: scripts/showcase-sources.json records the
// sha256 of each gallery PDF at generation time, so an engine/theme/sample
// change that rebuilds a gallery PDF fails the gate until the WebPs are
// regenerated (issue #794 — the set silently drifted for a week and shipped a
// stale, defective render). Outputs are still not byte-compared — WebP
// encoding is not guaranteed stable across libvips versions; the SOURCE
// hashes are environment-independent. The chain above this gate: the gallery
// PDFs themselves are kept current with the engine by the staged-PDFs
// pre-commit gate and the integration tier — this check trusts them and only
// proves the WebPs were cut from the committed PDFs.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const componentsDir = join(repoRoot, 'lib', 'components');
const outDir = join(here, '..', 'public', 'showcase');

const require = createRequire(import.meta.url);
const { loadAll, manifestBucket } = require(join(componentsDir, 'index.js'));

const MODES = ['light', 'dark'];
const TARGET_WIDTH = 1600; // ~2x the on-page display width
const RENDER_DPI = 200; // render high, downscale for crisp edges

// Every component opted into the landing showcase (strip tiles + the hero).
function showcaseComponents() {
	return loadAll()
		.filter((m) => m.showcase && (m.showcase.featured || m.showcase.hero))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function srcPdf(m, mode) {
	return join(componentsDir, manifestBucket(m), m.name, `${m.name}.gallery.${mode}.pdf`);
}
const outFile = (name, mode) => join(outDir, `${name}.${mode}.webp`);
const SOURCES = join(here, 'showcase-sources.json');
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function check() {
	const stale = [];
	const sources = existsSync(SOURCES) ? JSON.parse(readFileSync(SOURCES, 'utf8')) : null;
	if (!sources) stale.push(`${SOURCES.replace(`${repoRoot}/`, '')} missing`);
	const expected = new Set();
	for (const m of showcaseComponents()) {
		const page = m.showcase?.page || 2;
		for (const mode of MODES) {
			const key = `${m.name}.${mode}`;
			expected.add(key);
			if (!existsSync(outFile(m.name, mode))) {
				stale.push(`${outFile(m.name, mode).replace(`${repoRoot}/`, '')} missing`);
				continue;
			}
			if (!sources) continue;
			const rec = sources[key];
			const pdf = srcPdf(m, mode);
			if (!rec) stale.push(`${key}: no source record`);
			else if (rec.page !== page) stale.push(`${key}: showcase page changed (${rec.page} → ${page})`);
			else if (!existsSync(pdf)) stale.push(`${key}: gallery PDF missing`);
			else if (sha256(pdf) !== rec.srcSha256)
				stale.push(`${key}: gallery PDF changed since the WebP was generated (drifted render)`);
		}
	}
	if (sources) for (const key of Object.keys(sources)) if (!expected.has(key)) stale.push(`${key}: orphan source record (component un-flagged? remove its WebP too)`);
	if (existsSync(outDir))
		for (const f of readdirSync(outDir))
			if (f.endsWith('.webp') && !expected.has(f.replace(/\.webp$/, '')))
				stale.push(`public/showcase/${f}: zombie asset — no flagged component produces it; delete it`);
	if (stale.length) {
		for (const f of stale) process.stderr.write(`stale: ${f} — run \`node docs/scripts/rasterize-showcase.mjs\`.\n`);
		process.exit(1);
	}
	process.stdout.write('showcase images up to date.\n');
}

async function build() {
	mkdirSync(outDir, { recursive: true });
	const tmp = join(here, '..', '.showcase-tmp');
	mkdirSync(tmp, { recursive: true });

	const sources = {};
	let wrote = 0;
	for (const m of showcaseComponents()) {
		const page = m.showcase?.page || 2;
		for (const mode of MODES) {
			const pdf = srcPdf(m, mode);
			if (!existsSync(pdf)) {
				process.stderr.write(`missing source gallery: ${pdf}\n  → run \`npm run build:galleries\` first.\n`);
				process.exit(1);
			}
			const prefix = join(tmp, `${m.name}.${mode}`);
			execFileSync('pdftoppm', ['-png', '-r', String(RENDER_DPI), '-f', String(page), '-l', String(page), '-singlefile', pdf, prefix]);
			await sharp(`${prefix}.png`)
				.resize({ width: TARGET_WIDTH, withoutEnlargement: true })
				.webp({ quality: 82 })
				.toFile(outFile(m.name, mode));
			sources[`${m.name}.${mode}`] = { src: pdf.replace(`${repoRoot}/`, ''), page, srcSha256: sha256(pdf) };
			wrote++;
		}
		process.stdout.write(`  ${m.name} ← ${manifestBucket(m)}/${m.name} p${page}\n`);
	}
	rmSync(tmp, { recursive: true, force: true });
	writeFileSync(SOURCES, `${JSON.stringify(sources, null, '\t')}\n`);
	process.stdout.write(`rasterize-showcase: wrote ${wrote} WebP into public/showcase/ + showcase-sources.json.\n`);
}

if (process.argv.includes('--check')) check();
else await build();
