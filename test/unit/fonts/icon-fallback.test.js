/**
 * lib/fonts/icon-fallback.js: under the Emoji font setting `system` an export puts `icon-svg` on every slide, so each
 * icon draws its <svg> (engineering/decisions/2026-11-01-icon-font.md § 3.4); and an export loads the icon font only
 * when some glyph is drawn, the stylesheet's own test.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { drawIconsAsSvg, drawsIconGlyphs } = require('../../../lib/fonts/icon-fallback.js');

const GLYPH = '<span class="lat-icon-glyph" aria-hidden="true"><span data-glyph="&#xE019;"></span></span>';

test('drawIconsAsSvg adds icon-svg to every section once, whatever its attributes', () => {
	const html = [
		`<section class="lead" data-note="a > b">${GLYPH}</section>`,
		'<section id="2"><p>x</p></section>',
		"<section class='icon-svg two'>y</section>",
		'<section data-x="1" class="">z</section>',
	].join('');
	const out = drawIconsAsSvg(html);
	assert.match(out, /<section class="lead icon-svg" data-note="a > b">/);
	assert.match(out, /<section id="2" class="icon-svg">/);
	assert.match(out, /<section class='icon-svg two'>/, 'a slide that already has it is left alone');
	assert.match(out, /<section data-x="1" class="icon-svg">/);
	assert.equal(drawIconsAsSvg(out), out, 'idempotent');
	assert.doesNotMatch(drawIconsAsSvg('<sectionx class="a">'), /icon-svg/, 'only <section> tags');
});

test('drawsIconGlyphs: a glyph box outside every icon-svg section draws, one inside does not', () => {
	assert.equal(drawsIconGlyphs(`<section class="lead">${GLYPH}</section>`), true);
	assert.equal(drawsIconGlyphs(`<section class="icon-svg">${GLYPH}</section>`), false);
	assert.equal(drawsIconGlyphs(`<section class="icon-svg"><section>${GLYPH}</section></section>`), false, 'an icon-svg ancestor wins, as in CSS');
	assert.equal(drawsIconGlyphs(`<section class="icon-svg">a</section><section>${GLYPH.replace('lat-icon-glyph', 'lat-pill-glyph')}</section>`), true);
	assert.equal(drawsIconGlyphs('<section><p>no icons</p></section>'), false);
	assert.equal(drawsIconGlyphs(drawIconsAsSvg(`<section>${GLYPH}</section>`)), false, 'the fallback leaves no glyph drawn');
});
