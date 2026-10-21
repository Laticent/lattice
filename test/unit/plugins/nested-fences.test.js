// lib/plugins/mermaid/shared/nested-fences.js — the Mermaid fences the CLI's line walker leaves alone
// (a quote, a list item four spaces in), found by asking the engine's own parser (followups.d/2739-p7).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchNestedMermaidFences, reprefix } = require('../../../lib/plugins/mermaid/shared/nested-fences');
const { matchMermaidFences } = require('../../../lib/core/mermaid-fences');

const nested = (md) => matchNestedMermaidFences(md).map((f) => ({ prefix: f.prefix, body: f.body }));

test('a fence in a blockquote is found, with its quote prefix', () => {
	assert.deepEqual(nested('# T\n\n> ```mermaid\n> flowchart LR\n>   A --> B\n> ```\n'), [{ prefix: '> ', body: 'flowchart LR\n  A --> B\n' }]);
});

test('a fence four spaces in under a two-digit list item is found', () => {
	assert.deepEqual(nested('10. Tenth\n\n    ```mermaid\n    flowchart LR\n      A --> B\n    ```\n'), [{ prefix: '    ', body: 'flowchart LR\n  A --> B\n' }]);
});

test('a tilde fence in a quote is found', () => {
	assert.equal(nested('> ~~~mermaid\n> flowchart LR\n>   A --> B\n> ~~~\n').length, 1);
});

test('what the engine reads as code is never a fence: an indented block, a sample inside another fence', () => {
	assert.deepEqual(nested('Text:\n\n    ```mermaid\n    flowchart LR\n    ```\n'), []);
	assert.deepEqual(nested('````markdown\n> ```mermaid\n> flowchart LR\n> ```\n````\n'), []);
});

test('an unclosed nested fence yields nothing', () => {
	assert.deepEqual(nested('> ```mermaid\n> flowchart LR\n'), []);
});

test('a top-level fence is the flat walker\'s, never reported twice', () => {
	const md = '```mermaid\nflowchart LR\n  A --> B\n```\n\n> ```mermaid\n> flowchart LR\n> ```\n';
	assert.equal(matchMermaidFences(md).length, 1);
	assert.equal(matchNestedMermaidFences(md).length, 1);
});

test('a fence that is not Mermaid is not reported', () => {
	assert.deepEqual(nested('> ```js\n> let a = 1;\n> ```\n'), []);
});

test('offsets bound the whole fence, opener line start to closer line end', () => {
	const md = 'intro\n\n> ```mermaid\n> flowchart LR\n> ```\nafter\n';
	const [f] = matchNestedMermaidFences(md);
	assert.equal(md.slice(f.start, f.end), '> ```mermaid\n> flowchart LR\n> ```');
});

test('reprefix keeps every line in the container, turns a list marker into spaces, and drops blank lines', () => {
	assert.equal(reprefix('<div>\n<svg/>\n\n</div>', '> '), '> <div>\n> <svg/>\n> </div>');
	assert.equal(reprefix('<div>\n<svg/>', '10. '), '10. <div>\n    <svg/>');
	assert.equal(reprefix('<div>\n<svg/>', '    '), '    <div>\n    <svg/>');
});

test('a fence between two `$$` lines is math to the engine, so it is skipped', () => {
	assert.deepEqual(nested('> $$\n> ```mermaid\n> graph\n> ```\n> $$\n'), []);
});

test('the narrator reads a nested fence too (firstMermaidFenceBody)', () => {
	const { firstMermaidFenceBody } = require('../../../lib/core/mermaid-fences');
	assert.match(firstMermaidFenceBody('> ```mermaid\n> flowchart LR\n>   A --> B\n> ```\n'), /^flowchart LR\n {2}A --> B/);
	assert.match(firstMermaidFenceBody('10. Tenth\n\n    ```mermaid\n    flowchart LR\n      A --> B\n    ```\n'), /^flowchart LR/);
	assert.equal(firstMermaidFenceBody('no fence here'), null);
});

test('a fence indented two spaces under a bullet is reported with its indent, so its figure stays in the item (followups.d/2739-p11)', () => {
	const md = '- First point:\n\n  ```mermaid\n  flowchart LR\n    A --> B\n  ```\n\n- Second point.\n';
	assert.equal(matchMermaidFences(md).length, 1, 'the flat walker opens it too, at 0-3 spaces');
	assert.deepEqual(nested(md), [{ prefix: '  ', body: 'flowchart LR\n  A --> B\n' }]);
});

test('a line straight under a baked figure gets a blank line first, so it is not swallowed into the HTML block (followups.d/2739-p12)', () => {
	const { blankLineAfter } = require('../../../lib/plugins/mermaid/shared/nested-fences');
	assert.equal(blankLineAfter('', 'Caption **bold**'), '\n', 'flat: a plain blank line');
	assert.equal(blankLineAfter('> ', '> Caption **bold**'), '\n>', 'quoted: a quoted blank line, so the quote stays one quote');
	assert.equal(blankLineAfter('  ', '  Caption'), '\n', 'a bullet\'s continuation');
	assert.equal(blankLineAfter('10. ', '    Caption'), '\n', 'a two-digit item\'s continuation');
	assert.equal(blankLineAfter('> - ', '>   Caption'), '\n>', 'a list inside a quote');
	// A line the HTML block would not take is left alone: an HTML block takes no lazy continuation.
	assert.equal(blankLineAfter('', ''), '', 'already blank');
	assert.equal(blankLineAfter('', undefined), '', 'end of file');
	assert.equal(blankLineAfter('  ', '- Second point.'), '', 'a new list item');
	assert.equal(blankLineAfter('> ', 'Outside the quote'), '', 'a line with no `>`');
	assert.equal(blankLineAfter('> ', '>'), '', 'a quoted blank line');
	assert.equal(blankLineAfter('    ', '- next'), '', 'a new item after a fence indented four spaces');
	// The P6 checker's two misses: an over-indented fence is not the item's indent, and a quote needs no indent.
	assert.equal(blankLineAfter('   ', '  caption *x*'), '\n', 'a fence indented past its item\'s text');
	assert.equal(blankLineAfter('>  ', '> Caption **b**'), '\n>', 'a fence indented inside a quote');
	assert.equal(blankLineAfter('', '- item'), '\n', 'a flat fence: the HTML block takes even a list marker');
});
