const test = require('node:test');
const assert = require('node:assert/strict');
const { texturePatternDefs } = require('../../../lib/core/accessibility-textures.js');

// Regression guard for the all-black-pie-on-Safari saga: the defs MUST paint with
// LITERAL hex and zero resolution dependency — no `var(--token)` (unresolved on
// older WebKit and/or out of reach from the page-level defs after the :root→
// :where(section) relocation) and no `<style>`/CSS rules. Either of those rendered
// the pie black on real iPhones. Literal hex in presentation attributes paints on
// every SVG renderer. See engineering/decisions/2026-06-16-cvd-redundant-encoding.md.
test('texturePatternDefs uses literal hex only — no var(), no <style>', () => {
  const defs = texturePatternDefs();
  assert.doesNotMatch(defs, /var\(/, 'must not reference any CSS custom property');
  assert.doesNotMatch(defs, /<style/, 'must not depend on a <style> block');
  // Slot fills are concrete hex on the rect.
  assert.match(defs, /<pattern id="latt-a11y-chart-tex-1"[^>]*>\s*<rect width="8" height="8" fill="#2e2e2e"/);
  assert.match(defs, /<pattern id="latt-a11y-tex-1"[^>]*>\s*<rect width="8" height="8" fill="#e8e8e8"/);
});

test('texturePatternDefs emits both pattern families (12 categorical + 8 chart)', () => {
  const defs = texturePatternDefs();
  assert.equal((defs.match(/id="latt-a11y-tex-\d+"/g) || []).length, 12);
  assert.equal((defs.match(/id="latt-a11y-chart-tex-\d+"/g) || []).length, 8);
});
