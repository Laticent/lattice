/**
 * THE BYTE-IDENTITY PROOF of the slide-metadata record (engineering/decisions/2026-10-17-meta-record.md §9 steps 2 and
 * 5): every shipped deck (`examples/`, the baseline decks) renders the same HTML and CSS, byte for byte, in record form
 * and in directive-comment form. A record is a different spelling of the same slide, and this is the test that says so
 * for every key the corpus uses; the codemod (`lattice migrate meta`) and the cut stand on it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEngine } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '..', '..', '..');
const decks = [
  ...fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md')).map((f) => path.join('examples', f)),
  ...fs.readdirSync(path.join(ROOT, 'test/integration/baseline-decks')).filter((f) => f.endsWith('.md')).map((f) => path.join('test/integration/baseline-decks', f)),
  // The exemplars (the template decks), each in its own folder.
  ...fs.readdirSync(path.join(ROOT, 'exemplars'), { withFileTypes: true }).filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(ROOT, 'exemplars', d.name)).filter((f) => f.endsWith('.md')).map((f) => path.join('exemplars', d.name, f))),
];

test('every shipped deck renders byte-identical HTML and CSS in record form and in directive-comment form', async () => {
  // BOTH DIRECTIONS, so the proof survives the sweep (step 5) that rewrote the corpus as records:
  //   · a deck still written in directive comments is migrated the way `lattice migrate meta` migrates it (the typed
  //     `layout=` field, a slide's adjacent records merged into one per scope) and must render the same;
  //   · a deck written in records is written back as directive comments (`recordsToComments`, the engine's form) and
  //     must render the same. A record that holds a reader note has no comment spelling and stays as written.
  const { migrateDeckText } = await import('../../../lib/cli/migrate-meta.mjs');
  const { recordsToComments } = await import('../../../lib/core/meta-door.mjs');
  const components = require('../../../lib/authoring/lint.js').buildVocab().names;
  const engine = createEngine();
  const drifted = [];
  let exercised = 0;
  for (const rel of decks) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const migrated = migrateDeckText(src, components);
    const legacy = recordsToComments(src, null, { legacy: true });
    exercised += migrated.converted + (src.match(/<!--\s*(?:\{|@meta\{)/g) || []).length;
    if (migrated.text === src && legacy === src) continue;
    const a = engine.render(src);
    for (const [form, other] of [['record', migrated.text], ['comment', legacy]]) {
      if (other === src) continue;
      const b = engine.render(other);
      if (a.html !== b.html || a.css !== b.css) drifted.push(`${rel} (${form} form)`);
    }
  }
  assert.deepEqual(drifted, [], `decks whose other form renders differently: ${drifted.join(', ')}`);
  assert.ok(exercised > 4000, `the corpus still exercises the record (${exercised} comments and records)`);
});
