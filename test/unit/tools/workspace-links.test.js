'use strict';
/**
 * tools/lib/workspace-links.js links a second checkout's workspace packages under the names THAT tree declares. The
 * case it exists for is a rename: a base tree from before `@laticent/segno-markdown` became `@laticent/segno-languages`
 * must resolve the old name, whatever this tree calls the package.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { linkOwnWorkspaces } = require('../../../tools/lib/workspace-links.js');

function tree(packages) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-links-'));
	fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'root', workspaces: Object.keys(packages) }));
	for (const [rel, name] of Object.entries(packages)) {
		fs.mkdirSync(path.join(dir, rel), { recursive: true });
		fs.writeFileSync(path.join(dir, rel, 'package.json'), JSON.stringify({ name }));
	}
	return dir;
}

test('links each workspace under the name its own package.json declares, across a rename', () => {
	const before = tree({ 'docs/src/lib/segno-markdown': '@laticent/segno-markdown', 'docs/src/lib/segno': '@laticent/segno' });
	const after = tree({ 'docs/src/lib/segno-markdown': '@laticent/segno-languages', 'docs/src/lib/segno': '@laticent/segno' });
	try {
		assert.deepEqual([...linkOwnWorkspaces(before)].sort(), ['@laticent/segno', '@laticent/segno-markdown']);
		assert.deepEqual([...linkOwnWorkspaces(after)].sort(), ['@laticent/segno', '@laticent/segno-languages']);
		assert.equal(fs.realpathSync(path.join(before, 'node_modules/@laticent/segno-markdown')), fs.realpathSync(path.join(before, 'docs/src/lib/segno-markdown')));
		assert.equal(fs.realpathSync(path.join(after, 'node_modules/@laticent/segno-languages')), fs.realpathSync(path.join(after, 'docs/src/lib/segno-markdown')));
		assert.equal(fs.existsSync(path.join(before, 'node_modules/@laticent/segno-languages')), false, 'a name the tree does not declare is not linked');
	} finally {
		fs.rmSync(before, { recursive: true, force: true });
		fs.rmSync(after, { recursive: true, force: true });
	}
});

test('skips a workspace with no package.json, and links a name once', () => {
	const dir = tree({ 'a/one': '@laticent/one' });
	try {
		const root = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
		root.workspaces.push('a/missing', 'a/one');
		fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(root));
		assert.deepEqual([...linkOwnWorkspaces(dir)], ['@laticent/one']);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});
