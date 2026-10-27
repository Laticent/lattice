/**
 * `checkPaginationOwners` — Fluid's one-paginator census
 * (engineering/decisions/2026-10-27-fluid-layout-library.md §7, §8). A module that stamps a split
 * page's role or run is a paginator; each one is sanctioned by name, count and reason, so a new one
 * cannot appear while the plan deletes the old ones. Written before the gate.
 */
/* biome-ignore-all lint/suspicious/noTemplateCurlyInString: the probes ARE source text that spells a template stamp */
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkPaginationOwners, SANCTIONED_PAGINATORS } = require('../../../tools/check-ownership.js');

// A temp tree, never the real one: tests run concurrently, and a probe in lib/ would be seen by
// check-ownership.test.js scanning the same tree.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-paginators-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let n = 0;
function tree(files) {
  const root = path.join(TMP, String(n++));
  for (const [rel, src] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), src);
  }
  return root;
}
const run = (root, sanctions) => {
  const errors = [];
  checkPaginationOwners(errors, sanctions, root);
  return errors;
};

test('the real tree passes', () => {
  const errors = [];
  checkPaginationOwners(errors);
  assert.deepEqual(errors, []);
});

test('every sanctioned paginator states why', () => {
  for (const s of SANCTIONED_PAGINATORS) assert.ok(s.why && s.why.length > 20, s.file);
});

// Every spelling of a write the independent check planted; the first cut caught three of them.
const WRITES = [
  'const t = `<section data-split-role="${role}">`;',
  "const t = '<section data-split-role=\"' + role + '\">';",
  "s.replace(/^<section/, '<section data-split-run=\"' + id);",
  'const t = `<section data-split-role="cover">`;',
  "const t = '<section data-split-role=\"body\">';",
  "el.setAttribute('data-split-run', id);",
  "token.attrSet('data-split-role', r);",
  'el.dataset.splitRole = "body";',
  "el.dataset['splitRun'] = id;",
  'Object.assign(el.dataset, { splitRole: r });',
];

test('an unlisted writer fails, in every spelling', () => {
  for (const src of WRITES) {
    const errors = run(tree({ 'lib/core/second-splitter.js': src }), []);
    assert.equal(errors.length, 1, src);
    assert.match(errors[0], /lib\/core\/second-splitter\.js .*new paginator/);
  }
});

test('a writer in docs/src (including .astro) or lattice.js is found too', () => {
  const src = 'x.dataset.splitRun = r;';
  assert.equal(run(tree({ 'docs/src/lib/pager.ts': src }), []).length, 1);
  assert.equal(run(tree({ 'docs/src/pages/pager.astro': `---\n${src}\n---\n` }), []).length, 1);
  assert.equal(run(tree({ 'lattice.js': src }), []).length, 1);
});

test('readers are not writes', () => {
  const src = [
    'if (/\\sdata-split-role="body"/.test(tag)) {}',
    "sec.hasAttribute('data-split-role');",
    'if (el.dataset.splitRole === "cover") {}',
    "document.querySelector('[data-split-role=\"cover\"]');",
    "const closing = /\\sdata-split-role=\"closing\"/;",
  ].join('\n');
  assert.deepEqual(run(tree({ 'lib/core/reader.js': src }), []), []);
});

test('tests, generated files and comments are not scanned', () => {
  const w = 'const t = `<section data-split-role="${r}">`;';
  const root = tree({
    'lib/core/a.test.js': w,
    'lib/core/b.generated.js': w,
    'lib/core/c.js': `// ${w}`,
  });
  assert.deepEqual(run(root, []), []);
});

test('a sanctioned writer passes, a moved count fails, and a stale entry fails', () => {
  const root = tree({ 'lib/core/env.js': 'a = `data-split-role="${r}"`; b = `data-split-role="${s}"`;' });
  const ok = [{ file: 'lib/core/env.js', count: 2, why: 'the envelope, for this test only' }];
  assert.deepEqual(run(root, ok), []);
  assert.match(run(root, [{ ...ok[0], count: 1 }])[0], /records 1/);
  const stale = run(root, [...ok, { file: 'lib/core/gone.js', count: 1, why: 'a path a phase deleted' }]);
  assert.equal(stale.length, 1);
  assert.match(stale[0], /gone\.js.*stale entry/);
});

test('a duplicate entry and a missing why both fail', () => {
  const root = tree({ 'lib/core/env.js': 'a = `data-split-role="${r}"`;' });
  const e = { file: 'lib/core/env.js', count: 1, why: 'the envelope, for this test only' };
  assert.ok(run(root, [e, e]).some((m) => /twice/.test(m)));
  assert.ok(run(root, [{ ...e, why: '' }]).some((m) => /no `why`/.test(m)));
});
