/**
 * The meta migration kernel (lib/authoring/meta-migrate.mjs): directive comments become `<!-- @meta{…} -->` records, a bare
 * `<!-- {…} -->` record is respelled `@meta`, and a slide's adjacent records merge into one per scope, every line kept
 * in place (engineering/decisions/2026-10-17-meta-record.md §9 step 5, §15). The byte-identity of what renders is
 * test/integration/invariants/meta-record-identity.test.js; this pins the TEXT each pass writes.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

const load = async () => {
  const m = await import('../../../lib/authoring/meta-migrate.mjs');
  const { META_KIT: kit } = await import('../../../lib/cli/migrate-meta.mjs');
  return {
    migrateMetaSource: (src, opts = {}) => m.migrateMetaSource(src, { ...opts, kit }),
    migrateMetaDeck: (src, opts = {}) => m.migrateMetaDeck(src, { ...opts, kit }),
    mergeAdjacentRecords: m.mergeAdjacentRecords,
    raw: m,
  };
};
const FM = '---\ntheme: indaco\n---\n\n';
const COMPONENTS = new Set(['cards', 'kpi']);

test('a directive comment becomes a `@meta` record on the same line', async () => {
  const { migrateMetaSource } = await load();
  const r = migrateMetaSource(`${FM}<!-- _class: cards dark -->\n\n# A\n`, { components: COMPONENTS });
  assert.equal(r.source, `${FM}<!-- @meta{layout=cards, class=dark} -->\n\n# A\n`);
  assert.equal(r.converted, 1);
  assert.equal(r.respelled, 0);
});

test('a bare record is respelled `@meta`, its text untouched; code and inline code are left as written', async () => {
  const { migrateMetaSource } = await load();
  const src = `${FM}<!-- {layout=kpi, footer="Q3, review"} -->\n\n# A\n\nWrite \`<!-- {x} -->\`.\n\n\`\`\`md\n<!-- {y} -->\n\`\`\`\n`;
  const r = migrateMetaSource(src);
  assert.equal(r.source, src.replace('<!-- {layout=kpi', '<!-- @meta{layout=kpi'));
  assert.equal(r.respelled, 1);
  assert.equal(r.converted, 0);
  // A brace on the line after the opener is a plain comment, not a record: nothing to respell.
  const note = `${FM}<!--\n{pause} then the number\n-->\n`;
  assert.equal(migrateMetaSource(note).source, note);
  // Already `@meta`: nothing changes.
  const done = `${FM}<!-- @meta{layout=kpi} -->\n`;
  assert.equal(migrateMetaSource(done).respelled, 0);
});

test('a value that runs onto a second line is kept as written, and named', async () => {
  const { migrateMetaSource } = await load();
  const src = `${FM}<!--\nclass: invert\npaginate: true\n-->\n\n# A\n`;
  const r = migrateMetaSource(src);
  assert.equal(r.source, src);
  assert.deepEqual(r.kept.map((k) => k.why), ['its value runs onto a second line; write one comment per directive']);
});

test('a bare record is respelled only where it is a comment block: never in indented code, prose or second on a line', async () => {
  const { migrateMetaSource } = await load();
  const src = `${FM}## A\n\n    <!-- {class=dark} -->\n\ntext <!-- {class=dark} --> more\n\n<!-- @note{x} --> <!-- {class=dark} -->\n`;
  assert.equal(migrateMetaSource(src).source, src);
  // A no-break space is not the blank between `<!--` and the brace (lint reads `[ \t]`).
  const nbsp = `${FM}<!--\u00a0{class=dark} -->\n`;
  assert.equal(migrateMetaSource(nbsp).source, nbsp);
});

test('mergeAdjacentRecords merges a slide\'s consecutive records into one `@meta` record, keeping the line count', async () => {
  const { mergeAdjacentRecords } = await load();
  const r = mergeAdjacentRecords(`${FM}<!-- @meta{layout=cards} -->\n<!-- {footer=Q3} -->\n\n# A\n`);
  assert.equal(r.source, `${FM}<!-- @meta{layout=cards, footer=Q3} -->\n\n\n# A\n`);
  assert.equal(r.merged, 1);
  // A run breaks at a different scope and at a field already in the run.
  assert.equal(mergeAdjacentRecords(`<!-- @meta{layout=cards} -->\n<!-- @meta{footer=Q3, carry} -->\n`).merged, 0);
  assert.equal(mergeAdjacentRecords(`<!-- @meta{footer=Q3} -->\n<!-- @meta{footer=Q4} -->\n`).merged, 0);
});

test('migrateMetaDeck: both passes, a BOM and CRLF kept, and a deck with nothing to migrate comes back byte for byte', async () => {
  const { migrateMetaDeck } = await load();
  const src = `﻿${FM}<!-- _class: kpi -->\n<!-- _footer: Q3 -->\n\n# A\n`.replace(/\n/g, '\r\n');
  const r = migrateMetaDeck(src, { components: COMPONENTS });
  assert.equal(r.text, `﻿${FM}<!-- @meta{layout=kpi, footer=Q3} -->\n\n\n# A\n`.replace(/\n/g, '\r\n'));
  assert.deepEqual([r.converted, r.merged], [2, 1]);
  const clean = `${FM}<!-- @meta{layout=kpi} -->\r\n# A\n`;
  assert.equal(migrateMetaDeck(clean).text, clean);
});

test('the kernel refuses to run without its kit (it imports no parser of its own)', async () => {
  const { raw } = await load();
  assert.throws(() => raw.migrateMetaSource('<!-- _class: kpi -->\n'), /kit/);
});

test('`lattice migrate meta` writes the kernel\'s text', async () => {
  const { migrateDeckText } = await import('../../../lib/cli/migrate-meta.mjs');
  const { migrateMetaDeck } = await load();
  const src = `${FM}<!-- _class: cards -->\n<!-- {footer=Q3} -->\n\n# A\n`;
  assert.equal(migrateDeckText(src, COMPONENTS).text, migrateMetaDeck(src, { components: COMPONENTS }).text);
  assert.equal(migrateDeckText(src, COMPONENTS).text, `${FM}<!-- @meta{layout=cards, footer=Q3} -->\n\n\n# A\n`);
});
