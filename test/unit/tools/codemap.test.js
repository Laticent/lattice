/**
 * tools/build-codemap.js — the code map (dist/engineering/codemap.md, never committed). Each
 * --check rule is shown to FAIL on the shape it exists to catch, on fixtures; the live tree is
 * held by build:check through the step's `validates` tag.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { collect, problems, render, foldersInScope, scopeOf, summarize } = require('../../../tools/build-codemap.js');

const SCOPES = [{ dir: '', title: 'Top' }, { dir: 'lib/', title: 'lib' }];
const parts = [
  { part: 'lib/core', layer: 1, match: 'lib/core/', about: 'Kernels.' },
  { part: 'lattice.js', layer: 7, match: (f) => f === 'lattice.js', where: 'lattice.js', about: 'The command.' },
];
const folders = { 'lib/': 'The engine.', 'lib/shared/': 'Shared CSS.' };
const files = ['lattice.js', 'lib/core/a.js', 'lib/core/b.js', 'lib/shared/x.css'];

test('a complete fixture has no problems and renders every row', () => {
  const rows = collect({ parts, folders });
  assert.deepEqual(problems(rows, files, { scopes: SCOPES, folders }), []);
  const md = render(rows, files);
  for (const p of ['`lib/core/`', '`lattice.js`', '`lib/shared/`']) assert.ok(md.includes(p), p);
  assert.ok(!md.includes('TODO'));
});

test('a code part with no `about` fails, and renders a TODO', () => {
  const rows = collect({ parts: [{ ...parts[0], about: undefined }, parts[1]], folders });
  const found = problems(rows, files, { scopes: SCOPES, folders });
  assert.equal(found.length, 1);
  assert.match(found[0], /part lib\/core .* no `about`/);
  assert.ok(render(rows, files).includes('**TODO**'));
});

test('a folder in scope that nothing describes fails', () => {
  const rows = collect({ parts, folders });
  const found = problems(rows, [...files, 'lib/newthing/y.js'], { scopes: SCOPES, folders });
  assert.equal(found.length, 1);
  assert.match(found[0], /folder lib\/newthing\/ is not on the code map/);
});

test('a FOLDERS entry whose folder is gone fails', () => {
  const stale = { ...folders, 'lib/gone/': 'Was here.' };
  const found = problems(collect({ parts, folders: stale }), files, { scopes: SCOPES, folders: stale });
  assert.equal(found.length, 1);
  assert.match(found[0], /FOLDERS entry lib\/gone\/ names a folder with no tracked files/);
});

test('a folder that is also a code part fails: it has one home', () => {
  const dup = { ...folders, 'lib/core/': 'Twice.' };
  const found = problems(collect({ parts, folders: dup }), files, { scopes: SCOPES, folders: dup });
  assert.equal(found.length, 1);
  assert.match(found[0], /lib\/core\/ is a code part/);
});

test('the scope walk lists immediate child folders only', () => {
  assert.deepEqual(foldersInScope(['lib/core/a.js', 'lib/core/deep/b.js', 'README.md'], SCOPES), ['lib/', 'lib/core/']);
  assert.equal(scopeOf('lib/core/', SCOPES), 'lib/');
  assert.equal(scopeOf('lib/', SCOPES), '');
});

test('summarize: a one-line purpose from a paragraph of self-description', () => {
  // Punctuation inside inline code is not a sentence or clause break.
  assert.equal(summarize('Drawn portraits, written in inline code: `!{Ada Okafor}` draws one. More.', { long: 20 }), 'Drawn portraits, written in inline code.');
  assert.equal(summarize('A picture written as a record: `photo.jpg` here. Second.'), 'A picture written as a record: `photo.jpg` here.');
  // A fragment borrows the next sentence.
  assert.equal(summarize('How a deck is read. Owns the metadata fields.'), 'How a deck is read. Owns the metadata fields.');
  assert.equal(summarize(undefined), '');
});

test('the live tree passes --check', () => {
  assert.equal(require('../../../tools/build-codemap.js').main(['--check']), 0);
});
