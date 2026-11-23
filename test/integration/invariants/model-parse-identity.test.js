/**
 * THE BYTE-IDENTITY PROOF of the token adapter (Segno deck pipeline P4, engineering/decisions/2026-10-22-segno-deck-
 * pipeline.md §P4 landed): every committed deck and fixture renders the same output, byte for byte, through the real
 * engine when markdown-it's block and inline parsers are replaced by the deck model (`parseFromModel`,
 * lib/core/model-tokens.mjs). Every other step is the engine's own: its core rules, its plugins, markdown-it's renderer.
 *
 * This is the bar P7 switches the render path on. Nothing renders from the model yet; the swap here exists only in this
 * test, by replacing `MarkdownIt.prototype.parse` and `parseInline` for the second engine. The unit tier holds the
 * tokens themselves, field for field (test/unit/core/model-tokens.test.js).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const MarkdownIt = require('markdown-it');
const { createEngine } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECKS = execSync(
  "git ls-files 'examples/*.md' '*.gallery.md' 'test/integration/baseline-decks/*.md' 'lib/**/*.fixtures.md' 'exemplars/*.md' 'test/fixtures/*.md'",
  { cwd: ROOT, encoding: 'utf8' },
)
  .split('\n')
  .filter(Boolean);

const renderAll = (engine) =>
  DECKS.map((rel) => {
    try {
      return JSON.stringify(engine.render(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
    } catch (e) {
      return `THROW ${e.message}`;
    }
  });

test('every committed deck and fixture renders byte-identical output with the parse read from the deck model', async () => {
  assert.ok(DECKS.length > 500, `expected the corpus, found ${DECKS.length} files`);
  const { parseFromModel } = await import('../../../lib/core/model-tokens.mjs');
  const want = renderAll(createEngine());
  const { parse, parseInline } = MarkdownIt.prototype;
  let swapped = 0;
  MarkdownIt.prototype.parse = function parse(src, env) {
    swapped++;
    return parseFromModel(this, src, env || {});
  };
  MarkdownIt.prototype.parseInline = function parseInline(src, env) {
    swapped++;
    return parseFromModel(this, src, env || {}, true);
  };
  let got;
  try {
    got = renderAll(createEngine());
  } finally {
    MarkdownIt.prototype.parse = parse;
    MarkdownIt.prototype.parseInline = parseInline;
  }
  const drifted = [];
  DECKS.forEach((rel, i) => {
    if (got[i] === want[i]) return;
    let k = 0;
    while (got[i][k] === want[i][k]) k++;
    drifted.push(`${rel} @${k}: markdown-it …${want[i].slice(k, k + 80)} | model …${got[i].slice(k, k + 80)}`);
  });
  assert.deepEqual(drifted, []);
  // Every deck went through the swapped parse, and the engine's inline renders (chrome, titles) did too.
  assert.ok(swapped > DECKS.length, `model parses: ${swapped}`);
});
