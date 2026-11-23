/**
 * The CSS tokenizer (lib/core/css-tokens.js) loads on one path: CommonJS.
 *
 * About ten CommonJS readers require() it and six ES modules import it. When it was an ES module, Node 24 refused a
 * require() of it while an import() of one of those six was still loading it: `import('prose-projection.mjs')` and
 * then `require('lib/engine')` threw ERR_REQUIRE_ESM_RACE_CONDITION (the merge queue's node 24 leg ejected #3294 on
 * it). A CommonJS module loads synchronously on both paths, so neither can race the other.
 *
 * Two arms:
 *   1. every ES module under lib/ that imports the tokenizer is import()ed in a fresh Node, and the engine is
 *      require()d while that import is still in flight. Neither may throw. This arm can only go red on a Node that
 *      enforces the race (24 and up): the merge queue runs one.
 *   2. the tokenizer stays CommonJS: no `export` statement, a `module.exports`. This arm goes red on any Node.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '../../..');
const TOKENS = path.join(ROOT, 'lib/core/css-tokens.js');
const ENGINE = path.join(ROOT, 'lib/engine/index.js');

/** Every ES module under lib/ whose source imports the tokenizer, found by reading the tree (so a new one is held too). */
function tokenizerImporters() {
	const found = [];
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'node_modules') walk(full);
			} else if (entry.name.endsWith('.mjs') && /\bfrom\s+['"][^'"]*\/css-tokens\.js['"]/.test(fs.readFileSync(full, 'utf8'))) {
				found.push(full);
			}
		}
	};
	walk(path.join(ROOT, 'lib'));
	return found.sort();
}

test('the tokenizer has ES module importers to hold (the scan finds them)', () => {
	const names = tokenizerImporters().map((f) => path.relative(ROOT, f));
	assert.ok(names.includes('lib/transformers/prose-projection.mjs'), names.join(', '));
	assert.ok(names.length >= 6, `${names.length}: ${names.join(', ')}`);
});

for (const file of tokenizerImporters()) {
	const rel = path.relative(ROOT, file);
	test(`import('${rel}') in flight, then require('lib/engine'): neither throws`, () => {
		// A fresh process, so nothing is cached: the import() starts loading the module graph, and the require() runs
		// synchronously before that load can finish.
		const script = [
			`const pending = import(${JSON.stringify(pathToFileURL(file).href)});`,
			'let required = null;',
			`try { require(${JSON.stringify(ENGINE)}); } catch (e) { required = e.code || String(e.message); }`,
			'pending.then(',
			"  () => { if (required) { console.error('require threw ' + required); process.exit(1); } },",
			"  (e) => { console.error('import threw ' + (e.code || e.message)); process.exit(1); },",
			');',
		].join('\n');
		const run = spawnSync(process.execPath, ['-e', script], { cwd: ROOT, encoding: 'utf8' });
		assert.equal(run.status, 0, `node ${process.version}: ${run.stderr.trim()}`);
	});
}

test('the tokenizer stays CommonJS: no export statement, one module.exports', () => {
	const src = fs.readFileSync(TOKENS, 'utf8');
	assert.doesNotMatch(src, /^export\s/m, 'an export statement makes it an ES module again, which Node 24 races');
	assert.match(src, /^module\.exports = \{/m);
	assert.equal(fs.existsSync(path.join(ROOT, 'lib/core/css-tokens.mjs')), false, 'one file, one load path');
});
