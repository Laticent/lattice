// Unit tests for the pure halves of scripts/check-key-chunk.mjs. No build, no dist: the docs
// test tier runs before `npm run build`, so these feed the checker in-memory files.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findProblems, keyNames } from './check-key-chunk.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const files = (map) => (f) => map[f];

describe('check-key-chunk', () => {
	it('reads every key slot name from the real key module', () => {
		const names = keyNames(fs.readFileSync(path.join(HERE, '..', 'src', 'lib', 'openrouter-key.js'), 'utf8'));
		expect(names).toContain('lattice-db-or-key');
		expect(names).toContain('lattice-db-or-key-invalid');
		// `lattice-db-provider` moved to lib/model-selection.js with the model spine (a legacy
		// selection key the migration reads, not a key slot); how OpenRouter connected is a slot here.
		expect(names).toContain('lattice-db-or-via');
		expect(names.length).toBeGreaterThanOrEqual(9);
	});

	it('passes when every name lives in one chunk and no HTML', () => {
		const names = ['lattice-db-or-key', 'lattice-db-or-key-invalid'];
		const read = files({ 'a.js': `x('lattice-db-or-key');y("lattice-db-or-key-invalid")`, 'b.js': 'z()', 'i.html': '<p>hi</p>' });
		expect(findProblems(names, ['a.js', 'b.js'], ['i.html'], read).problems).toEqual([]);
	});

	it('fails on a second chunk that names a key slot', () => {
		const names = ['lattice-db-or-key'];
		const read = files({ 'a.js': `'lattice-db-or-key'`, 'b.js': `localStorage.getItem('lattice-db-or-key')` });
		expect(findProblems(names, ['a.js', 'b.js'], [], read).problems.join('\n')).toMatch(/2 JS chunks/);
	});

	it('fails when the slots are split across chunks, each named once', () => {
		const names = ['lattice-db-or-key', 'lattice-db-gemini-key'];
		const read = files({ 'a.js': `'lattice-db-or-key'`, 'b.js': `'lattice-db-gemini-key'` });
		expect(findProblems(names, ['a.js', 'b.js'], [], read).problems.join('\n')).toMatch(/2 different chunks/);
	});

	it('fails on any HTML file that names a key slot, and on a name no chunk carries', () => {
		const names = ['lattice-db-or-key', 'lattice-db-openai-key'];
		const read = files({ 'a.js': `'lattice-db-or-key'`, 'p.html': `<script>localStorage['lattice-db-or-key']</script>` });
		const { problems } = findProblems(names, ['a.js'], ['p.html'], read);
		expect(problems.join('\n')).toMatch(/appears in HTML: p\.html/);
		expect(problems.join('\n')).toMatch(/lattice-db-openai-key appears in 0 JS chunks/);
	});

	it('does not count a longer name as a hit on its prefix', () => {
		const names = ['lattice-db-or-key'];
		const read = files({ 'a.js': `'lattice-db-or-key'`, 'b.js': `'lattice-db-or-key-invalid'` });
		expect(findProblems(names, ['a.js', 'b.js'], [], read).problems).toEqual([]);
	});
});
