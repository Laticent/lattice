/**
 * Unit tests for premise's section-level restructure
 * (lib/core/premise.js applyPremiseClaim / applyToRenderedHtml).
 *
 * The row-level markup (<code>/<strong>/<span class="premise-desc">/<em>)
 * is produced earlier, at markdown-parse time, by the premiseRows plugin
 * (see test/unit/parsing/markdown-it-plugins.test.js). This kernel's only
 * job is grouping the <h2> + lede paragraph into one .premise-claim wrapper
 * so the CSS can flex-position it opposite the <ul>.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { applyPremiseClaim, applyToRenderedHtml } = require('../../../lib/core/premise');

describe('applyPremiseClaim', () => {
  test('wraps the h2 + immediately-following lede paragraph in .premise-claim', () => {
    const html = '<h2>The claim.</h2><p>A lede.</p><ul><li>a</li></ul>';
    const out = applyPremiseClaim(html);
    assert.equal(out, '<div class="premise-claim"><h2>The claim.</h2><p>A lede.</p></div><ul><li>a</li></ul>');
  });

  test('is idempotent — a second pass is a no-op', () => {
    const html = '<h2>The claim.</h2><p>A lede.</p><ul><li>a</li></ul>';
    const once = applyPremiseClaim(html);
    assert.equal(applyPremiseClaim(once), once);
  });

  test('no h2 at all: passes through unchanged', () => {
    const html = '<p>Just a paragraph.</p><ul><li>a</li></ul>';
    assert.equal(applyPremiseClaim(html), html);
  });

  test('h2 with no following paragraph: passes through unchanged (no lede to pair it with)', () => {
    const html = '<h2>The claim.</h2><ul><li>a</li></ul>';
    assert.equal(applyPremiseClaim(html), html);
  });

  test('only the paragraph immediately after h2 is claimed — a later paragraph stays put', () => {
    const html = '<h2>The claim.</h2><p>A lede.</p><ul><li>a</li></ul><p>A trailing note, not the lede.</p>';
    const out = applyPremiseClaim(html);
    assert.equal(
      out,
      '<div class="premise-claim"><h2>The claim.</h2><p>A lede.</p></div><ul><li>a</li></ul><p>A trailing note, not the lede.</p>',
    );
  });
});

describe('applyToRenderedHtml', () => {
  test('rewrites a premise section, leaves other sections untouched', () => {
    const html = [
      '<section class="premise"><h2>Claim</h2><p>Lede.</p><ul><li>a</li></ul></section>',
      '<section class="quote"><h2>Not premise</h2><p>Untouched.</p></section>',
    ].join('');
    const out = applyToRenderedHtml(html);
    assert.match(out, /<section class="premise"><div class="premise-claim">/);
    assert.match(out, /<section class="quote"><h2>Not premise<\/h2><p>Untouched\.<\/p><\/section>/);
  });
});
