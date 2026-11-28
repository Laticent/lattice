/**
 * lib/core/meta-comment.mjs — the one spelling a writer emits, `<!-- @meta{…} -->` (record note §15), and the typed
 * `layout=` it writes for a class. The byte-identity half: a class written here renders the same `<section>` as the old
 * `<!-- _class: … -->` comment did, for a layout-first class, a modifier-first class and a local component.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classFields, metaClass, metaComment, metaRecord } = require('../../../lib/core/meta-comment.mjs');
const { createEngine } = require('../../../lib/engine');

test('a class is typed the way `lattice migrate meta` types it', () => {
  assert.equal(metaClass('cards-grid'), '<!-- @meta{layout=cards-grid} -->');
  assert.equal(metaClass('cards-grid dark compact'), '<!-- @meta{layout=cards-grid, class=dark compact} -->');
  // A modifier first, a repeated word or a name the catalog does not hold stays `class=`, so the word order is kept.
  assert.equal(metaClass('dark cards-grid'), '<!-- @meta{class=dark cards-grid} -->');
  assert.equal(metaClass('kpi kpi'), '<!-- @meta{class=kpi kpi} -->');
  assert.equal(metaClass('my-local-card'), '<!-- @meta{class=my-local-card} -->');
  assert.deepEqual(classFields(''), []);
});

test('fields, flags, carry, quoting and the comment end', () => {
  assert.equal(metaComment({ class: 'stats', footer: 'Q3, review', build: true, backgroundColor: '#fff' }), '<!-- @meta{layout=stats, footer="Q3, review", build, background-color=#fff} -->');
  assert.equal(metaComment({ footer: 'x' }, { carry: true }), '<!-- @meta{footer=x, carry} -->');
  assert.equal(metaComment({ footer: 'a\n  b' }), '<!-- @meta{footer=a b} -->');
  // A value never ends the comment: `-->` folds to `->`, as the structured edit folds it, and the record still reads.
  assert.equal(metaComment({ footer: 'a --> b' }), '<!-- @meta{footer="a -> b"} -->');
  assert.match(createEngine().render(`${metaComment({ footer: 'a --> b --!> c' })}\n\n# A`).html, /data-footer="a -(?:&gt;|>) b -!(?:&gt;|>) c"/);
  assert.equal(metaComment({ footer: '', build: false, header: null }), '');
  assert.equal(metaRecord([['pane', 'bar']]), '{pane=bar}');
});

test('the record renders what `lattice migrate meta` makes of the old comment', () => {
  const { migrateMetaSource } = require('../../../lib/authoring/meta-migrate.mjs');
  const { META_MIGRATE_KIT } = require('../../../lib/core/meta-scan.mjs');
  const engine = createEngine();
  const deck = (c) => `---\ntheme: indaco\n---\n\n${c}\n\n## T\n\n- a\n  - b\n`;
  for (const cls of ['cards-grid', 'cards-grid dark compact', 'dark cards-grid', 'stats', 'title silent', 'my-local-card']) {
    // Since the cut the old comment sets nothing; the migration is the path, so the record must render what it writes.
    const a = engine.render(migrateMetaSource(deck(`<!-- _class: ${cls} -->`), { kit: META_MIGRATE_KIT }).source);
    const b = engine.render(deck(metaClass(cls)));
    assert.equal(b.html, a.html, cls);
    assert.equal(b.css, a.css, cls);
  }
});
