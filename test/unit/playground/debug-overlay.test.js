/**
 * Unit: debug-overlay.js — the layout DEBUG overlay for the live preview.
 *
 * Covers the pure levers (config resolution + chip text), the CSS contract
 * (outline-only so it can't reflow a slide; scoped under .lattice; the overlay is
 * pointer-events:none), the WCAG-AA contrast of the layout-mode hues, and the
 * apply/teardown lifecycle against jsdom. jsdom has no layout engine, so pixel
 * positions/sizes are verified in the visual review, not here.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

async function load() {
	return import('../../../docs/src/playground/debug-overlay.js');
}

// A fake iframe element: its contentDocument/Window are the SLIDE jsdom, its
// ownerDocument is a separate PARENT jsdom (where the input capture surface mounts —
// input lives OUTSIDE the iframe, in the parent page). getBoundingClientRect +
// offsetWidth/Height give the capture-surface math a 1:1 (unscaled) box so tapped
// coordinates map straight through to the slide. `pretendToBeVisual` gives rAF etc.
function frameWith(bodyHtml) {
	const slide = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, { pretendToBeVisual: true });
	const parent = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
	return {
		contentDocument: slide.window.document,
		contentWindow: slide.window,
		ownerDocument: parent.window.document,
		offsetWidth: 1280,
		offsetHeight: 720,
		getBoundingClientRect: () => ({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720 }),
	};
}

describe('resolveConfig', () => {
	const DFLT = { facets: ['identity', 'layout', 'size'], reveal: 'hover' };
	const FULL = ['identity', 'layout', 'size', 'class', 'box'];

	test('off is the default: only `off` (and absent) → null', async () => {
		const { resolveConfig } = await load();
		assert.equal(resolveConfig(null, null), null); // no attribute
		assert.equal(resolveConfig('off', null), null);
	});

	test('on-hover is the enable default; empty (bare _debug) also → on-hover', async () => {
		const { resolveConfig } = await load();
		assert.deepEqual(resolveConfig('on-hover', null), DFLT);
		assert.deepEqual(resolveConfig('', null), DFLT); // bare _debug
		// No aliases: the removed bare `on`, a dropped synonym (`hover`), a former off
		// value (`false`), or any typo all safely fall back to on-hover (and lint).
		assert.deepEqual(resolveConfig('on', null), DFLT);
		assert.deepEqual(resolveConfig('hover', null), DFLT);
		assert.deepEqual(resolveConfig('false', null), DFLT);
	});

	test('on-always pins the labels; `verbose` adds class + box (canonical only)', async () => {
		const { resolveConfig } = await load();
		assert.equal(resolveConfig('on-always', null).reveal, 'always');
		assert.deepEqual(resolveConfig('on-hover verbose', null), { facets: FULL, reveal: 'hover' });
		assert.deepEqual(resolveConfig('on-always verbose', null), { facets: FULL, reveal: 'always' });
		// Dropped aliases no longer carry meaning: `always`/`full` fall back to on-hover.
		assert.equal(resolveConfig('always', null).reveal, 'hover');
		assert.deepEqual(resolveConfig('on-hover full', null), DFLT);
	});

	test('session override: force off mutes; force on lights a plain deck (keeps the deck mode)', async () => {
		const { resolveConfig } = await load();
		assert.equal(resolveConfig('on-hover', 'off'), null);
		assert.equal(resolveConfig('on-always', 'off'), null);
		assert.deepEqual(resolveConfig(null, 'on'), DFLT);
		assert.equal(resolveConfig('on-always', 'on').reveal, 'always'); // deck's mode kept under force-on
	});
});

describe('facetLabel', () => {
	const info = { identity: 'verdict-grid', mode: 'grid', gap: 16, w: 720, h: 360, className: 'verdict-grid tier', padding: '24' };

	test('default profile → identity · layout(+gap) · size', async () => {
		const { facetLabel } = await load();
		assert.equal(facetLabel(info, ['identity', 'layout', 'size']), 'verdict-grid · grid gap:16 · 720×360');
	});

	test('layout drops the gap suffix when there is none; class/box are opt-in', async () => {
		const { facetLabel } = await load();
		assert.equal(facetLabel({ ...info, gap: 0 }, ['layout']), 'grid');
		assert.equal(facetLabel(info, ['class']), '.verdict-grid.tier');
		assert.equal(facetLabel(info, ['box']), 'pad:24 gap:16');
	});
});

describe('debugCss', () => {
	test('is outline-only (never border) and inset, so it cannot reflow a slide', async () => {
		const { debugCss } = await load();
		const css = debugCss();
		assert.match(css, /outline:1px solid/);
		assert.doesNotMatch(css, /border\s*:/); // border-left on the CHIP is fine — see below
		assert.match(css, /outline-offset:-1px/);
	});

	test('outline rules scope under .lattice; the overlay is non-interactive', async () => {
		const { debugCss, LAYOUT_COLORS } = await load();
		const css = debugCss();
		for (const line of css.split('\n')) {
			if (!line.includes('outline:1px')) continue;
			assert.ok(line.includes('.lattice '), `unscoped outline rule: ${line}`);
		}
		assert.match(css, /pointer-events:none/);
		for (const hue of Object.values(LAYOUT_COLORS)) assert.ok(css.includes(hue), `missing hue ${hue}`);
	});
});

describe('LAYOUT_COLORS — WCAG-AA over both preview backgrounds', () => {
	// Relative luminance + contrast ratio (WCAG 2.x).
	const lin = (c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	const lum = (hex) => {
		const n = Number.parseInt(hex.slice(1), 16);
		return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
	};
	const ratio = (a, b) => {
		const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
		return (hi + 0.05) / (lo + 0.05);
	};

	test('every layout hue clears 3:1 (non-text UI) on #0c0c0c and #e7e7ea', async () => {
		const { LAYOUT_COLORS } = await load();
		for (const [mode, hue] of Object.entries(LAYOUT_COLORS)) {
			assert.ok(ratio(hue, '#0c0c0c') >= 3, `${mode} ${hue} vs dark = ${ratio(hue, '#0c0c0c').toFixed(2)}`);
			assert.ok(ratio(hue, '#e7e7ea') >= 3, `${mode} ${hue} vs light = ${ratio(hue, '#e7e7ea').toFixed(2)}`);
		}
	});
});

describe('applyDebug — lifecycle', () => {
	const deck = (attr) =>
		`<div class="lattice"><section${attr ? ` data-debug="${attr}"` : ''}><h1>A</h1></section></div>`;

	test('no-ops safely with no document', async () => {
		const { applyDebug } = await load();
		assert.doesNotThrow(() => applyDebug(null));
		assert.doesNotThrow(() => applyDebug({ contentDocument: null }));
	});

	test('a deck with no data-debug injects nothing', async () => {
		const { applyDebug, DEBUG_STYLE_ID, DEBUG_OVERLAY_ID } = await load();
		const frame = frameWith(deck(null));
		applyDebug(frame, { force: null });
		const doc = frame.contentDocument;
		assert.equal(doc.getElementById(DEBUG_STYLE_ID), null);
		assert.equal(doc.getElementById(DEBUG_OVERLAY_ID), null);
	});

	test('debug: on injects the style + overlay and labels the slide; teardown is clean', async () => {
		const { applyDebug, DEBUG_STYLE_ID, DEBUG_OVERLAY_ID } = await load();
		const frame = frameWith(deck('on'));
		const doc = frame.contentDocument;

		applyDebug(frame, { force: null });
		assert.ok(doc.getElementById(DEBUG_STYLE_ID), 'style injected');
		const overlay = doc.getElementById(DEBUG_OVERLAY_ID);
		assert.ok(overlay, 'overlay injected');
		const chips = overlay.querySelectorAll('.dbg-chip');
		assert.ok(chips.length >= 1, 'section labeled');
		assert.match(chips[0].textContent, /slide 1/); // identity facet
		assert.equal(doc.querySelector('section').getAttribute('data-dbg-layout'), 'flow');

		// A redraw does not stack duplicates.
		applyDebug(frame, { force: null });
		assert.equal(doc.querySelectorAll(`#${DEBUG_OVERLAY_ID}`).length, 1);

		// force:'off' overrides the deck and leaves the DOM pristine.
		applyDebug(frame, { force: 'off' });
		assert.equal(doc.getElementById(DEBUG_OVERLAY_ID), null);
		assert.equal(doc.getElementById(DEBUG_STYLE_ID), null);
		assert.equal(doc.querySelector('section').getAttribute('data-dbg-layout'), null, 'stamp removed');
	});

	test('force:on lights a deck that never asked for debug', async () => {
		const { applyDebug, DEBUG_OVERLAY_ID } = await load();
		const frame = frameWith(deck(null));
		applyDebug(frame, { force: 'on' });
		assert.ok(frame.contentDocument.getElementById(DEBUG_OVERLAY_ID), 'overlay injected by override');
	});

	test('hover mode mounts a PARENT capture surface + input handlers; always does not; teardown clears', async () => {
		const { applyDebug, DEBUG_CAPTURE_ID } = await load();
		// hover (the default) → input rides a capture surface in the PARENT document
		// (not inside the iframe, which iOS won't hand a touch into); teardown removes it.
		const f1 = frameWith(deck('on'));
		const d1 = f1.contentDocument;
		applyDebug(f1, { force: null });
		assert.ok(f1.ownerDocument.getElementById(DEBUG_CAPTURE_ID), 'capture surface mounted in the parent doc');
		assert.ok(d1.__dbgListeners, 'hover mode wires the input handlers');
		assert.equal(typeof d1.__dbgListeners.onTouchStart, 'function');
		assert.equal(typeof d1.__dbgListeners.onTouchEnd, 'function');
		applyDebug(f1, { force: 'off' });
		assert.equal(d1.__dbgListeners, null, 'teardown clears the handlers');
		assert.equal(f1.ownerDocument.getElementById(DEBUG_CAPTURE_ID), null, 'teardown removes the capture surface');

		// `on-always` mode pins the chips and leaves the deck interactive — no capture surface.
		const f2 = frameWith(deck('on-always'));
		applyDebug(f2, { force: null });
		assert.equal(f2.contentDocument.__dbgListeners, null, 'always mode does not capture input');
		assert.equal(f2.ownerDocument.getElementById(DEBUG_CAPTURE_ID), null, 'always mode mounts no capture surface');
	});

	test('touch: PRESS-AND-HOLD reveals the box beneath, LIFT hides it; a SWIPE drops the peek', async () => {
		const { applyDebug } = await load();
		const frame = frameWith(deck('on'));
		const doc = frame.contentDocument;
		applyDebug(frame, { force: null });
		const section = doc.querySelector('section');
		doc.elementsFromPoint = () => [section]; // jsdom has no hit-testing
		const L = doc.__dbgListeners;
		const touch = (x, y) => ({ touches: [{ clientX: x, clientY: y }] });
		// Press and hold → the box under the finger peeks; it PERSISTS while pressed.
		L.onTouchStart(touch(5, 5));
		assert.equal(doc.__dbgHot, section, 'press reveals the box beneath the finger');
		L.onTouchMove(touch(6, 7)); // tiny jitter under threshold — still held
		assert.equal(doc.__dbgHot, section, 'the peek persists while pressed');
		L.onTouchEnd({});
		assert.equal(doc.__dbgHot, null, 'lifting the finger hides the peek');
		// Swipe: press → move past threshold ⇒ drop the peek and let the pan scroll.
		L.onTouchStart(touch(5, 5));
		assert.equal(doc.__dbgHot, section, 'press reveals before the move is classified');
		L.onTouchMove(touch(5, 80));
		assert.equal(doc.__dbgHot, null, 'a swipe drops the peek (it scrolls instead)');
		L.onTouchEnd({});
		assert.equal(doc.__dbgHot, null, 'still nothing after the swipe ends');
	});
});
