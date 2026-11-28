/**
 * THE BYTE-IDENTITY PROOF of the slide-metadata record (engineering/decisions/2026-10-17-meta-record.md §9 steps 2, 5
 * and 6): every shipped deck (`examples/`, the baseline decks, the exemplars) written back in the old directive-comment
 * form and migrated with `lattice migrate meta` renders the same HTML and CSS, byte for byte, as the deck we ship. So an
 * author's old deck, migrated, is the deck the record form promised. Since the cut (slice E) the comment form itself
 * sets nothing, and the second arm holds that too: written back and NOT migrated, the corpus renders differently.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '..', '..', '..');
const decks = [
  ...fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md') && !f.endsWith('.tmp.md')).map((f) => path.join('examples', f)),
  ...fs.readdirSync(path.join(ROOT, 'test/integration/baseline-decks')).filter((f) => f.endsWith('.md') && !f.endsWith('.tmp.md')).map((f) => path.join('test/integration/baseline-decks', f)),
  // The exemplars (the template decks), each in its own folder.
  ...fs.readdirSync(path.join(ROOT, 'exemplars'), { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(ROOT, 'exemplars', d.name)).filter((f) => f.endsWith('.md') && !f.endsWith('.tmp.md')).map((f) => path.join('exemplars', d.name, f))),
];

test('every shipped deck, written in the old comment form and migrated, renders byte-identical HTML and CSS', async () => {
  // Write each deck's records back as directive comments (`recordsToComments`, the form an old deck was written in), run
  // the migration an author runs (`lattice migrate meta`: the typed `layout=` field, adjacent records merged per scope),
  // and render: it must match the shipped deck exactly. A record that holds a reader note has no comment spelling and
  // stays as written.
  const { migrateDeckText } = await import('../../../lib/cli/migrate-meta.mjs');
  const { recordsToComments } = await import('../../../lib/core/meta-door.mjs');
  const components = require('../../../lib/authoring/lint.js').buildVocab().names;
  const engine = createEngine();
  const drifted = [];
  let exercised = 0;
  let cutHolds = 0;
  for (const rel of decks) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const legacy = recordsToComments(src, null, { legacy: true });
    exercised += (src.match(/<!--\s*@meta\{/g) || []).length;
    if (legacy === src) continue;
    const a = engine.render(src);
    const migrated = migrateDeckText(legacy, components).text;
    const b = engine.render(migrated);
    if (a.html !== b.html || a.css !== b.css) drifted.push(rel);
    // THE CUT: the old form, left as written, does not render what the records render.
    const c = engine.render(legacy);
    if (a.html !== c.html || a.css !== c.css) cutHolds++;
  }
  assert.deepEqual(drifted, [], `decks whose migrated old form renders differently: ${drifted.join(', ')}`);
  assert.ok(exercised > 4000, `the corpus still exercises the record (${exercised} records)`);
  assert.ok(cutHolds > 100, `the old comment form still renders like the records on ${decks.length - cutHolds} decks`);
});
