/**
 * The fast record read (docs/src/lib/segno/schema.ts `fastRead`) must bind exactly what the full bind
 * binds. schema.test.ts holds that on a generated pool of spans; this holds it on the spans the shipped
 * decks actually write, through the real dispatcher: with the check on, every record read runs both paths
 * and throws on any difference. Followup 2669-p3.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Before the library loads: it reads the flag once, when schema.ts is evaluated.
globalThis[Symbol.for('laticent.segno.checkBothPaths')] = true;
const table = require('../../../lib/core/inline-code-directives.js');

test('every inline span in the tracked decks binds the same on both paths', async () => {
  const { inputsFor } = await import('../../../tools/parser-bakeoff/corpus.mjs');
  const { real } = inputsFor('inline');
  assert.ok(real.length > 1000, 'the corpus is there');
  for (const span of real) {
    table.escapedText(span);
    table.dispatches(span, null);
    table.renderHtml?.(span, null);
  }
  const mode = globalThis[Symbol.for('laticent.segno.bindMode')];
  assert.ok(mode, 'the check was on when the library loaded');
  assert.ok(mode.compared >= 30, `compared ${mode.compared} fast reads, expected the decks' pills and points`);
});
