/**
 * The QR floor, pinned in both places it lives.
 *
 * `--qr-min` (lib/base/base.modifiers.css, one per venue) is the narrowest a scannable code may
 * be, as a share of the slide width, and the cards size their code from it. The conformance
 * harness (tools/check-venue-conformance.js `SCAN_MIN`) fails a render whose code is narrower.
 * They are the same four numbers; if only one moves, the cards would pass a floor the harness
 * does not enforce, or the harness would fail cards the CSS never promised.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { SCAN_MIN } = require('../../../tools/check-venue-conformance');

const css = fs.readFileSync(path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');

test('base.modifiers.css sets --qr-min per venue to the harness SCAN_MIN', () => {
  for (const venue of ['huddle', 'conference', 'hall']) {
    const m = css.match(new RegExp(`section\\.venue-${venue}\\s*\\{[^}]*--qr-min:\\s*([0-9.]+)`));
    assert.ok(m, `venue-${venue} sets --qr-min`);
    assert.equal(Number(m[1]), SCAN_MIN[venue], `${venue} floor`);
  }
});

test('laptop has no venue class; its floor is the cards\' own fallback', () => {
  const cards = ['contact/contact', 'wifi/wifi'].map((f) => fs.readFileSync(path.join(__dirname, `../../../lib/components/connect/${f}.styles.css`), 'utf8')).join('');
  const shared = fs.readFileSync(path.join(__dirname, '../../../lib/components/connect/_qr-card/qr-general.css'), 'utf8');
  assert.match(shared + cards, new RegExp(`var\\(--qr-min,\\s*${SCAN_MIN.laptop}\\)`));
});
