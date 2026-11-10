/**
 * Unit: the gift-card transform never prints the gift link as text (a fake link; no real key).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyToRenderedHtml, renderCard } = require('../../../lib/components/connect/gift-card/gift-card.transform.js');

const LINK = 'https://example.test/gift#v1.FAKE_link_never_issued';
const noSvg = (html) => html.replace(/<svg[\s\S]*<\/svg>/, '');

test('a tight list: the link is in the QR only, the PIN and caption print', () => {
	const out = applyToRenderedHtml(`<section class="gift-card"><p><code>A deck on us</code></p><h2>Hi</h2><ul><li><code>${LINK}</code> <code>link</code></li><li>482 913 <code>pin</code></li><li>Scan <code>caption</code></li></ul></section>`);
	assert.match(out, /class="qr-card gift-card-card"/);
	assert.match(out, /<svg/);
	assert.ok(!noSvg(out).includes('FAKE_link'), 'the link never appears as text');
	assert.match(out, /gift-pin-value">482 913</);
	assert.match(out, /qr-eyebrow">A deck on us</);
});

test('a loose list (each field its own paragraph) does not read the link as the eyebrow', () => {
	const out = applyToRenderedHtml(`<section class="gift-card"><h2>Hi</h2><ul><li><p><code>${LINK}</code> <code>link</code></p></li><li><p>Scan <code>caption</code></p></li></ul></section>`);
	assert.ok(!noSvg(out).includes('FAKE_link'));
	assert.ok(!out.includes('qr-eyebrow'));
});

test('idempotent, and a slide with no link is left exactly as written', () => {
	const once = applyToRenderedHtml(`<section class="gift-card"><h2>Hi</h2><ul><li><code>${LINK}</code> <code>link</code></li></ul></section>`);
	assert.equal(applyToRenderedHtml(once), once);
	const inner = '<h2>Hi</h2><ul><li>Scan <code>caption</code></li></ul>';
	assert.equal(renderCard(inner), inner);
});
