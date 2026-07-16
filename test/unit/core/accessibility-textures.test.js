const test = require('node:test');
const assert = require('node:assert/strict');
const { texturePatternDefs } = require('../../../lib/core/accessibility-textures.js');

// The a11y LITERAL sets (latt-a11y-tex-*, latt-a11y-chart-tex-*) are the regression
// guard for the all-black-pie-on-Safari saga: they MUST paint with LITERAL hex and
// zero resolution dependency — no `var(--token)` (unresolved on older WebKit and/or
// out of reach from the page-level defs after the :root→:where(section) relocation)
// and no `<style>`/CSS rules. Either rendered the pie black on real iPhones. The
// onyx scheme-aware set (below) deliberately opts OUT of that rule to gain light/dark
// flipping — hence it is SEPARATE, and CVD themes keep using the literal sets.
// See engineering/decisions/2026-06-16-cvd-redundant-encoding.md.
test('a11y literal sets paint with literal hex — no var(), no <style> (iOS regression guard)', () => {
  const defs = texturePatternDefs();
  // The a11y patterns precede the onyx scheme-aware <style>; verify that portion is literal.
  const a11y = defs.slice(0, defs.indexOf('<style>'));
  assert.doesNotMatch(a11y, /var\(/, 'a11y sets must not reference any CSS custom property');
  assert.doesNotMatch(a11y, /<style/, 'a11y sets must not depend on a <style> block');
  assert.match(a11y, /<pattern id="latt-a11y-chart-tex-1"[^>]*>\s*<rect width="8" height="8" fill="#2e2e2e"/);
  assert.match(a11y, /<pattern id="latt-a11y-tex-1"[^>]*>\s*<rect width="8" height="8" fill="#e8e8e8"/);
});

// The onyx set flips rect fill + overlay ink with the deck color-scheme via
// light-dark() in a <style> (verified flipping in Chromium; iOS UNVERIFIED — the
// literal sets remain the CVD path). It uses light-dark(), NOT var(), so it carries
// no custom-property-resolution dependency.
test('onyx scheme-aware set flips fill + ink via light-dark() in a <style>', () => {
  const defs = texturePatternDefs();
  assert.equal((defs.match(/id="latt-onyx-tex-\d+"/g) || []).length, 12);
  // slot 1 rect flips light #e8e8e8 ↔ dark #2e2e2e (mirrors onyx's --cat-1-fill ramp).
  assert.match(defs, /\.latt-onyx-tex-r1\{fill:light-dark\(#e8e8e8,#2e2e2e\)\}/);
  // slot 1 ink flips a subtle mid-grey #8a8a8a (on the light chip, so black text stays
  // dominant) ↔ light #f5f5f5 (on the dark chip).
  assert.match(defs, /\.latt-onyx-tex-i1\{[^}]*light-dark\(#8a8a8a,#f5f5f5\)/);
  assert.doesNotMatch(defs, /var\(/, 'the whole defs block must avoid var() (light-dark is a function, not a token)');
});

// Graceful degradation: on a renderer WITHOUT light-dark(), the CSS class is dropped
// and the LITERAL light-mode fallback in the presentation attribute paints — a light
// chip, NEVER SVG's default black. This is what keeps the scheme-aware sets from
// re-triggering the all-black-pie regression on old WebKit.
test('scheme-aware patterns carry a literal light-mode fallback presentation attribute', () => {
  const defs = texturePatternDefs();
  // onyx slot-1 rect: class for the flip AND fill="#e8e8e8" fallback attribute.
  assert.match(defs, /<rect class="latt-onyx-tex-r1" fill="#e8e8e8" width="8" height="8"\/>/);
  // concrete slot-1 rect: fallback to its near-white light chip.
  assert.match(defs, /<rect class="latt-concrete-tex-r1" fill="#DFDDDD" width="8" height="8"\/>/);
});

// concrete gets a SEPARATE scheme-aware set with BESPOKE raw-concrete motifs and its
// own ramp (near-white chips ⟷ muted-tint dark chips).
test('concrete scheme-aware set flips its own ramp with bespoke motifs', () => {
  const defs = texturePatternDefs();
  assert.equal((defs.match(/id="latt-concrete-tex-\d+"/g) || []).length, 12);
  // slot 1 rect flips concrete's #DFDDDD (light) ↔ #6A4E4E (dark), mirroring its ramp.
  assert.match(defs, /\.latt-concrete-tex-r1\{fill:light-dark\(#DFDDDD,#6A4E4E\)\}/);
  // slot 1 motif is board-form plank lines (two horizontals) — bespoke, NOT the onyx/a11y diagonal.
  assert.match(defs, /<pattern id="latt-concrete-tex-1"[^>]*>[\s\S]*?<path d="M0 2\.5 H8 M0 5\.5 H8"\/>/);
});

test('texturePatternDefs emits all pattern families (12 a11y cat + 8 a11y chart + 12 onyx + 12 concrete)', () => {
  const defs = texturePatternDefs();
  assert.equal((defs.match(/id="latt-a11y-tex-\d+"/g) || []).length, 12);
  assert.equal((defs.match(/id="latt-a11y-chart-tex-\d+"/g) || []).length, 8);
  assert.equal((defs.match(/id="latt-onyx-tex-\d+"/g) || []).length, 12);
  assert.equal((defs.match(/id="latt-concrete-tex-\d+"/g) || []).length, 12);
});
