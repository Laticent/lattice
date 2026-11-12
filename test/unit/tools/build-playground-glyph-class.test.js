/**
 * Unit: the playground build hands lib/core/relationship.js the glyph CLASS, not the glyph table
 * (tools/build-playground.js `shapeGlyphClassPlugin`). relationship.js asks shape-glyphs.js one
 * question, `shapeGlyphRe()`; the table behind it also holds the lint's advice, about 5KB gzipped
 * that the engine every docs page loads carried for one regex. Pinned here: the engine's bundle
 * no longer reaches the table, the regex it gets is the kernel's own (one table, HARD RULE #29),
 * and every other importer, lint-core above all, still gets the real kernel.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const { ESM_OPTIONS, shapeGlyphClassPlugin } = require(path.join(ROOT, 'tools', 'build-playground.js'));
const { shapeGlyphRe } = require(path.join(ROOT, 'lib', 'core', 'shape-glyphs.js'));

/** Bundle one entry with only the glyph-class plugin; the metafile's inputs and the bundle's text. */
async function bundle(entry) {
	const result = await esbuild.build({
		entryPoints: [path.join(ROOT, entry)],
		bundle: true,
		platform: 'node',
		format: 'cjs',
		write: false,
		metafile: true,
		logLevel: 'silent',
		plugins: [shapeGlyphClassPlugin],
	});
	return { inputs: Object.keys(result.metafile.inputs), text: result.outputFiles[0].text };
}

test('relationship.js gets the class, computed from the kernel, and never the table', async () => {
	const { inputs, text } = await bundle('lib/core/relationship.js');
	assert.ok(inputs.includes('shape-glyph-class:class') && inputs.includes('shape-glyph-class:source'), inputs.join('\n'));
	assert.ok(!inputs.includes('lib/core/shape-glyphs.js'), 'the table reached the bundle');
	assert.ok(text.includes('new RegExp(source, "gu")') || text.includes("new RegExp(source, 'gu')"), 'the wrapper builds the regex from the data module');
	// The data the wrapper reads is the kernel's own class, so the two can never drift; it arrives as JSON, never as code.
	const loads = [];
	shapeGlyphClassPlugin.setup({ onResolve() {}, onLoad: (opts, fn) => loads.push([opts.filter, fn]) });
	const [, source] = loads.find(([filter]) => filter.test('source'));
	const out = source();
	assert.equal(out.loader, 'json');
	assert.equal(JSON.parse(out.contents).source, shapeGlyphRe().source);
});

test('lint-core still gets the whole kernel, advice and all', async () => {
	const { inputs } = await bundle('lib/authoring/lint-core.js');
	assert.ok(inputs.includes('lib/core/shape-glyphs.js'));
});

test('the shipped ESM build carries the plugin, so the engine entry does not reach the table', async () => {
	assert.ok(ESM_OPTIONS.plugins.includes(shapeGlyphClassPlugin));
	const result = await esbuild.build({ ...ESM_OPTIONS, outdir: path.join(ROOT, '.scratch', 'esm-glyph-class'), write: false, logLevel: 'silent' });
	const outputs = result.metafile.outputs;
	const engineKey = Object.keys(outputs).find((k) => path.basename(k) === 'engine.js');
	assert.ok(engineKey, Object.keys(outputs).join('\n'));
	const seen = new Set();
	const walk = (k) => {
		if (seen.has(k) || !outputs[k]) return; // an external import has no output of its own
		seen.add(k);
		for (const i of outputs[k].imports || []) if (i.kind === 'import-statement') walk(i.path);
	};
	walk(engineKey);
	const engineInputs = new Set([...seen].flatMap((k) => Object.keys(outputs[k].inputs)));
	assert.ok(!engineInputs.has('lib/core/shape-glyphs.js'), 'the engine\'s static closure reaches the glyph table');
	assert.ok(engineInputs.has('shape-glyph-class:source'));
});
