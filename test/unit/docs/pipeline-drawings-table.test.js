/**
 * The small-drawings table in `engineering/pipeline.md` § 4a4 names a test for each cell, and every
 * one of those tests exists.
 *
 * The table says what each export format does with a check, an emoji, an icon, an avatar, a spark
 * and a masked mark. A cell is only as true as the test it names, so a renamed or deleted test must
 * fail here rather than leave the table pointing at nothing. FALSIFIABLE: rename any test the table
 * names and this fails with its name.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const DOC = fs.readFileSync(path.join(ROOT, 'engineering', 'pipeline.md'), 'utf8');

/** The § 4a4 section, from its heading to the next `## `. */
function section() {
	const start = DOC.indexOf('## 4a4.');
	assert.ok(start >= 0, 'pipeline.md has no § 4a4');
	const end = DOC.indexOf('\n## ', start + 1);
	return DOC.slice(start, end < 0 ? undefined : end);
}

/** Every test file under `test/`, by basename. */
function testFiles(dir = path.join(ROOT, 'test'), out = new Set()) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		if (e.isDirectory()) testFiles(path.join(dir, e.name), out);
		else if (e.name.endsWith('.test.js')) out.add(e.name);
	}
	return out;
}

test('every row of the table names at least one test', () => {
	const rows = section().split('\n').filter((l) => l.startsWith('| ') && !/^\|\s*(Drawing|---)/.test(l));
	assert.equal(rows.length, 6, 'the table has six drawings');
	for (const row of rows) assert.match(row, /`[\w-]+\.test\.js`/, `no test named in: ${row.slice(0, 60)}`);
});

test('every test the section names exists', () => {
	const have = testFiles();
	const named = [...new Set([...section().matchAll(/`([\w-]+\.test\.js)`/g)].map((m) => m[1]))];
	assert.ok(named.length >= 5);
	const missing = named.filter((n) => !have.has(n));
	assert.deepEqual(missing, [], `named in pipeline.md § 4a4 but not in test/: ${missing.join(', ')}`);
});
