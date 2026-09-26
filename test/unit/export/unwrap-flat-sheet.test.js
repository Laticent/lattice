/**
 * lib/export/unwrap-flat-sheet.mjs — the one unwrap every flat host runs: the CLI export,
 * the Studio's Webpage player and Reading view, and `check:render`. A real-render arm lives
 * in test/unit/export/cli-deck-sheet.test.js; these pin the rewrite itself, and that no host
 * keeps a private strip of its own.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const { unwrapFlatSheet } = require('../../../lib/export/unwrap-flat-sheet.mjs');

const ROOT = path.join(__dirname, '..', '..', '..');

test('a slide selector stays a top-level-slide condition, at plain section specificity', () => {
	assert.equal(unwrapFlatSheet('article.lattice > section{width:1280px}'), 'section:where(:not(section *)){width:1280px}');
	assert.equal(unwrapFlatSheet('article.lattice > section.dark .x{a:b}'), 'section:where(:not(section *)).dark .x{a:b}');
	assert.equal(unwrapFlatSheet('article.lattice > section::after{a:b}'), 'section:where(:not(section *))::after{a:b}');
	assert.equal(unwrapFlatSheet('article.lattice > :where(section):not([\\20 root]){--a:1}'), ':where(section:not(section *)):not([\\20 root]){--a:1}');
	// Anything that is not the `section` tag keeps the plain strip.
	assert.equal(unwrapFlatSheet('article.lattice>section.a,article.lattice>.b{a:b}'), 'section:where(:not(section *)).a,.b{a:b}', 'the minified spelling unwraps the same');
	assert.equal(unwrapFlatSheet('article.lattice > .x{a:b}'), '.x{a:b}');
	assert.equal(unwrapFlatSheet('article.lattice >section-ish{a:b}'), 'section-ish{a:b}');
	assert.equal(unwrapFlatSheet('figure.chart-frame .y{a:b}'), 'figure.chart-frame .y{a:b}');
});

test('a <section> nested in a slide is not styled as a slide', () => {
	const css = unwrapFlatSheet('article.lattice > section{width:1280px;overflow:hidden}');
	const dom = new JSDOM(`<style>${css}</style><main><section id="slide" class="dark"><section id="nested"></section></section></main>`);
	const doc = dom.window.document;
	const sel = css.slice(0, css.indexOf('{'));
	assert.ok(doc.getElementById('slide').matches(sel), 'the top-level slide matches');
	assert.ok(!doc.getElementById('nested').matches(sel), 'the nested section does not');
});

test('no flat host keeps a private strip of the wrapper', () => {
	// The three hosts that call it must read the shared function…
	for (const rel of ['docs/src/components/studio/share-export.ts', 'tools/check-viz-render.js', 'lib/export/cli-deck-sheet.js']) {
		assert.match(fs.readFileSync(path.join(ROOT, rel), 'utf8'), /unwrap-flat-sheet\.mjs/, `${rel} does not read the shared unwrap`);
	}
	// …and nothing else in the shipped tree may carry its own copy: a regex over the wrapper
	// (`/article\.lattice\s*>/`) or a string replace of it. A selector QUERY is fine.
	const own = /\/article\\\.lattice\\s|replace(?:All)?\(\s*['"`]article\.lattice/;
	const files = execFileSync('git', ['ls-files', 'lib', 'tools', 'docs/src'], { cwd: ROOT, encoding: 'utf8' })
		.split('\n')
		.filter((f) => /\.(?:c?js|mjs|ts|tsx)$/.test(f) && !/\.test\.|\.generated\.|^lib\/export\/unwrap-flat-sheet\.mjs$/.test(f));
	assert.ok(files.length > 100, `scanned ${files.length} files`);
	const hits = files.filter((f) => own.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
	assert.deepEqual(hits, [], 'these strip the wrapper themselves; call unwrapFlatSheet');
});
