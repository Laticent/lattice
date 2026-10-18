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
