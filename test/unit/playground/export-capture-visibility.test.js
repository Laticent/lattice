/**
 * Unit: drawing-board-export.js — forceSectionVisibleForCapture, the capture-time
 * gate opener behind the one-click PDF/PPTX/PNG export.
 *
 * Regression guard for the "blank PDF when exporting from the Drawing Board's Edit
 * tab" bug: the filmstrip preview keeps off-screen slides at
 * `content-visibility:auto` and the whole `.lattice` at `visibility:hidden` until
 * the in-iframe FIT agent reveals it (only once the preview has been shown). The
 * export rasterizes the LIVE preview DOM with html-to-image, which copies those
 * computed styles onto its clone — so a slide that was never revealed rasterizes
 * blank. On a phone you export straight from Edit without ever opening Preview, so
 * every page came out blank. This helper forces BOTH gates open for the capture
 * and restores them after; these tests lock that contract (DOM-only → jsdom).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

async function load() {
	return import('../../../docs/src/components/studio/export/deck-export.js');
}

function section(initial = {}) {
	const dom = new JSDOM('<!doctype html><div class="lattice"><section></section></div>');
	const el = dom.window.document.querySelector('section');
	for (const [k, v] of Object.entries(initial)) el.style[k] = v;
	return el;
}

describe('forceSectionVisibleForCapture', () => {
	test('forces BOTH visibility and content-visibility visible for the capture', async () => {
		const { forceSectionVisibleForCapture } = await load();
		// The preview's lazy state: virtualized + inheriting the hidden .lattice gate.
		const el = section({ contentVisibility: 'auto' });
		forceSectionVisibleForCapture(el);
		assert.equal(el.style.visibility, 'visible', 'visibility gate must be forced open');
		assert.equal(el.style.contentVisibility, 'visible', 'content-visibility gate must be forced open');
	});

	test('restore() returns BOTH properties to their prior inline values', async () => {
		const { forceSectionVisibleForCapture } = await load();
		const el = section({ contentVisibility: 'auto' }); // visibility starts unset (inherits .lattice)
		const restore = forceSectionVisibleForCapture(el);
		restore();
		assert.equal(el.style.visibility, '', 'visibility restored to its prior (unset) value');
		assert.equal(el.style.contentVisibility, 'auto', 'content-visibility restored to its prior value');
	});

	test('preserves a pre-existing explicit visibility on restore (no clobber)', async () => {
		const { forceSectionVisibleForCapture } = await load();
		const el = section({ visibility: 'visible', contentVisibility: 'visible' });
		const restore = forceSectionVisibleForCapture(el);
		// Still visible during the capture…
		assert.equal(el.style.visibility, 'visible');
		restore();
		// …and the author's own inline values are handed back untouched.
		assert.equal(el.style.visibility, 'visible');
		assert.equal(el.style.contentVisibility, 'visible');
	});
});
