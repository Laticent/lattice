/**
 * tools/build-codemap.js — the code map (dist/engineering/codemap.md, never committed). Each
 * --check rule is shown to FAIL on the shape it exists to catch, on fixtures; the live tree is
 * held by build:check through the step's `validates` tag.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const fs = require('node:fs');
const path = require('node:path');

const { collect, problems, render, foldersInScope, scopeOf, summarize, cell, SCOPES: LIVE_SCOPES } = require('../../../tools/build-codemap.js');
const { PARTS } = require('../../../tools/structure.js');

const ROOT = path.resolve(__dirname, '../../..');

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

test('a code part whose path matches no tracked file fails', () => {
  const gone = [...parts, { part: 'lib/gone', layer: 1, match: 'lib/gone/', about: 'Was here.' }, { part: 'x', layer: 0, match: () => false, where: 'nope.js', about: 'A file.' }];
  const found = problems(collect({ parts: gone, folders }), files, { scopes: SCOPES, folders });
  assert.deepEqual(found.map((p) => p.split(' names ')[0]), ['part lib/gone', 'part x']);
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
  // A period inside a word is not a sentence end.
  assert.equal(summarize('Renders charts with Chart.js and v1.2 manifests on any slide. More.'), 'Renders charts with Chart.js and v1.2 manifests on any slide.');
  // An abbreviation's period is not a sentence end.
  assert.equal(summarize('Renders every bar for the deck, e.g. stacked bars. Also legends.'), 'Renders every bar for the deck, e.g. stacked bars.');
  assert.equal(summarize('Compares one thing to another, i.e. a vs. b in a table. Second.'), 'Compares one thing to another, i.e. a vs. b in a table.');
  assert.equal(summarize(undefined), '');
});

test('a table cell renders exactly the text it was given, in one cell', () => {
  // Rendered, not string-compared: a GFM table splits on pipes before inline parsing, and a code
  // span shows backslashes literally, so the only honest check is the rendered cell.
  const md = require('markdown-it')();
  const shown = (text) => {
    const tds = md.render(`| h | v |\n|---|---|\n| p | ${cell(text)} |\n`).match(/<td>[\s\S]*?<\/td>/g) || [];
    return { cells: tds.length, text: (tds[1] || '').replace(/<\/?code>/g, '`').replace(/<\/?td>/g, '') };
  };
  for (const text of [
    'a | b',
    'a \\| b', // one backslash, then a pipe
    'a \\\\| b', // two backslashes, then a pipe
    'a\\*b', // a backslash before punctuation, in prose
    'code `c|d` here', // a pipe in a code span
    'plain \\ and `k|` mix',
  ]) {
    assert.deepEqual(shown(text), { cells: 2, text }, JSON.stringify(text));
  }
});

test('a purpose line with a backslash inside a code span fails: the map cannot show it as written', () => {
  const bad = { ...folders, 'lib/shared/': 'Matches `a\\b` paths.' };
  const found = problems(collect({ parts, folders: bad }), files, { scopes: SCOPES, folders: bad });
  assert.equal(found.length, 1);
  assert.match(found[0], /lib\/shared\/ has a backslash inside a code span/);
  // A backslash in prose is fine: the cell escapes it.
  const prose = { ...folders, 'lib/shared/': 'Splits on \\ in paths.' };
  assert.deepEqual(problems(collect({ parts, folders: prose }), files, { scopes: SCOPES, folders: prose }), []);
});

test('a part that matches by function with no `where` fails, and the write path does not crash', () => {
  const bad = [...parts, { part: 'lib/fn', layer: 1, match: (f) => /^lib\/fn\/.*/.test(f), about: 'New.' }];
  const rows = collect({ parts: bad, folders });
  const found = problems(rows, [...files, 'lib/fn/a.js'], { scopes: SCOPES, folders });
  assert.ok(found.some((p) => /part lib\/fn matches by function and has no `where`/.test(p)), found.join('\n'));
  // Without git (files null) the write path still renders, and never prints a function as a path.
  const md = render(rows, null);
  assert.ok(!md.includes('=>'), 'a function source leaked into the map');
});

test('one part with several paths in a section renders as one row', () => {
  const multi = [{ part: 'site/pages', layer: 16, match: () => false, where: ['lib/a/', 'lib/b/'], about: 'Pages.' }];
  const md = render(collect({ parts: multi, folders: {} }), ['lib/a/x', 'lib/b/y', 'lib/b/z']);
  assert.equal(md.split('\n').filter((l) => l.includes('Pages.')).length, 1);
  assert.ok(md.includes('| `lib/a/`, `lib/b/` | 16 | 3 | Pages. |'), md);
});

test('a folder inside a code part shows that part\'s layer; one outside every part stays blank', () => {
  const rows = collect({ parts, folders: { ...folders, 'lib/core/deep/': 'Inside lib/core.' } });
  const layer = (where) => rows.find((r) => r.where === where).layer;
  assert.equal(layer('lib/core/deep/'), 1);
  assert.equal(layer('lib/shared/'), undefined);
});

test('row order does not depend on the locale', () => {
  const rows = collect({ parts: [], folders: { 'lib/aa/': 'A.', 'lib/typography/': 'T.', 'lib/z/': 'Z.', 'lib/B/': 'B.' } });
  const order = render(rows, null).split('\n').filter((l) => l.startsWith('| `')).map((l) => l.split('`')[1]);
  assert.deepEqual(order, ['lib/B/', 'lib/aa/', 'lib/typography/', 'lib/z/']);
});

// The live map's REACH. Every fixture above uses its own scopes and no plugin or library, so these
// pin what the real gate covers: dropping a scope or a manifest branch must go red here.
test('the live gate covers the eight scopes it documents', () => {
  assert.deepEqual(LIVE_SCOPES.map((s) => s.dir), ['', 'lib/', 'docs/', 'docs/src/', 'docs/src/lib/', 'test/', 'tools/', '.claude/']);
});

test('the live map has a row for every plugin manifest and every workspace library', () => {
  const rows = collect();
  const pluginDir = path.join(ROOT, 'lib', 'plugins');
  const plugins = fs.readdirSync(pluginDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(pluginDir, d.name, `${d.name}.manifest.json`)))
    .map((d) => `lib/plugins/${d.name}/`);
  assert.ok(plugins.length > 0);
  assert.deepEqual(rows.filter((r) => r.kind === 'plugin').map((r) => r.where).sort(), plugins.sort());
  const libraries = PARTS.filter((p) => p.library).map((p) => p.match);
  assert.ok(libraries.length > 0);
  assert.deepEqual(rows.filter((r) => r.kind === 'library').map((r) => r.where).sort(), libraries.sort());
});

test('the live tree passes --check', () => {
  assert.equal(require('../../../tools/build-codemap.js').main(['--check']), 0);
});
