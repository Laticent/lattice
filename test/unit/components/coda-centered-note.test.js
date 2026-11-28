/**
 * A centered composition centers its coda note and source line.
 *
 * `big-number`, `quote` and `stats` center their content on the slide. Since 2026-11-20 the
 * engine docks a trailing note or `*Source: …*` line into the slide's coda
 * (`.cell-coda > .below-note`, lib/core/coda.js), which is outside the stage rule that used to
 * center it. Without a component rule the note sat flush left under a centered number or
 * quotation (found by the owner's big-number check on PR 3362). Each of the three owns a rule
 * that centers it again; this test keeps that rule in place.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..', '..', '..');
const css = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('coda note on a centered composition', () => {
  const cases = [
    ['big-number', 'lib/components/statement/big-number/big-number.styles.css', /section\.big-number > \.cell-coda > \.below-note\s*\{\s*text-align:\s*center;/],
    ['quote', 'lib/components/statement/quote/quote.styles.css', /section\.quote > \.cell-coda > \.below-note\s*\{\s*text-align:\s*center;/],
    ['stats', 'lib/components/evidence/stats/stats.styles.css', /section\.stats:where\(:not\(\.math\)\) > \.cell-coda > \.below-note\s*\{\s*text-align:\s*var\(--headline-align, center\);/],
  ];
  for (const [name, file, rule] of cases) {
    test(`${name} centers the note and source line it docks in the coda`, () => {
      assert.match(css(file), rule);
    });
  }
});
