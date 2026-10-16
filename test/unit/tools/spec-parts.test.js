
// Every spec/*.md declares its schema, reference implementation and shared tests, and every path
// it names exists (spec audit §2, §6 step 5). checkSpecParts runs inside build:check; these drive
// its pure half against fixtures, because a gate proves something only when you watch it fail.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkSpecParts, specPartProblems } = require('../../../tools/check-ownership.js');

const block = (body) => `# A spec\n\n<!-- spec-parts\n${body}\n-->\n\nText.\n`;
const exists = (p) => !p.startsWith('rotted/');

test('the shipped specs all declare their parts, and every path resolves', () => {
  const errors = [];
  checkSpecParts(errors);
  assert.deepEqual(errors, []);
});

test('a spec with every part, and a schema stated in the text, passes', () => {
  assert.deepEqual(specPartProblems('spec/x.md', block('schema: none: stated in §3\nreference: lib/x.js\ntests: spec/conformance/x/'), exists), []);
});

test('a spec with no block fails', () => {
  assert.match(specPartProblems('spec/x.md', '# A spec\n\nText.\n', exists)[0], /no <!-- spec-parts --> block/);
});

test('a missing part fails, by name', () => {
  assert.deepEqual(specPartProblems('spec/x.md', block('schema: a.json\nreference: lib/x.js'), exists), ['spec/x.md: the spec-parts block names no tests']);
});

test('a rotted path fails, by path', () => {
  assert.deepEqual(specPartProblems('spec/x.md', block('schema: a.json\nreference: lib/x.js rotted/y.js\ntests: t/'), exists), ['spec/x.md: its reference path rotted/y.js does not exist']);
});

test('only the schema may be "none"; a reference or tests may not', () => {
  assert.deepEqual(specPartProblems('spec/x.md', block('schema: a.json\nreference: none: later\ntests: t/'), (p) => p !== 'none:' && p !== 'later'), [
    'spec/x.md: its reference path none: does not exist',
    'spec/x.md: its reference path later does not exist',
  ]);
});
