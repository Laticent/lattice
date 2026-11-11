/**
 * THE BYTE-IDENTITY PROOF of the slide-metadata record (engineering/decisions/2026-10-17-meta-record.md §9 step 2): every
 * directive comment in the shipped decks (`examples/`, the baseline decks) rewritten as a record
 * (lib/core/meta-migrate.mjs) renders the same HTML and CSS, byte for byte. A record is a different spelling of the same
 * slide, and this is the test that says so for every key the corpus uses; step 5's codemod stands on it.
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
];

test('every shipped deck, its directive comments rewritten as records, renders byte-identical HTML and CSS', async () => {
  const { migrateMetaSource } = await import('../../../lib/core/meta-migrate.mjs');
  const engine = createEngine();
  const drifted = [];
  let converted = 0;
  for (const rel of decks) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
    const m = migrateMetaSource(src);
    converted += m.converted;
    if (!m.converted) continue;
    const a = engine.render(src);
    const b = engine.render(m.source);
    if (a.html !== b.html || a.css !== b.css) drifted.push(rel);
  }
  assert.deepEqual(drifted, [], `decks whose record form renders differently: ${drifted.join(', ')}`);
  assert.ok(converted > 4000, `the corpus still exercises the record (${converted} comments converted)`);
});
