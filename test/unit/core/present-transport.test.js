const test = require('node:test');
const assert = require('node:assert/strict');

// The headless slide-transport kernel (lib/core/present-transport.mjs) — the ONE
// source of truth for fit-scaling, index/nav bounds, the keymap, and swipe that the
// three Present surfaces used to fork (P3 of 2026-07-07-html-lattice-player.md).
// This contract test pins the exact behavior each reconciled transport depends on.

let K;
test.before(async () => {
	K = await import('../../../lib/core/present-transport.mjs');
});

test('fitScale is the largest uniform fit after reserving chrome', () => {
	const { fitScale } = K;
	// Square stage, 16:9 slide → width-bound.
	assert.equal(fitScale({ stageW: 1280, stageH: 1280, slideW: 1280, slideH: 720 }), 1);
	// Reserving inset shrinks it symmetrically.
	assert.equal(fitScale({ stageW: 1336, stageH: 824, slideW: 1280, slideH: 720, insetX: 56, insetY: 104 }), 1);
});

test('fitScale reproduces each historical transport EXACTLY', () => {
	const { fitScale, padInset } = K;
	// Export player: Math.min((innerWidth-56)/1280, (innerHeight-(48+56))/720).
	const iw = 1600;
	const ih = 900;
	assert.equal(
		fitScale({ stageW: iw, stageH: ih, slideW: 1280, slideH: 720, insetX: 56, insetY: 48 + 56 }),
		Math.min((iw - 56) / 1280, (ih - 104) / 720),
		'export player fit is byte-identical',
	);
	// buildStageDoc: pad = max(0, min(W,H)*0.012); scale = min((W-pad*2)/sw,(H-pad*2)/sh).
	const W = 1440;
	const H = 810;
	const pad = Math.max(0, Math.min(W, H) * 0.012);
	assert.equal(
		fitScale({ stageW: W, stageH: H, slideW: 1280, slideH: 720, insetX: padInset(W, H, { factor: 0.012 }), insetY: padInset(W, H, { factor: 0.012 }) }),
		Math.min((W - pad * 2) / 1280, (H - pad * 2) / 720),
		'buildStageDoc (docs stage) fit is byte-identical',
	);
	// Practice: pad = max(14, min(W,H)*0.04).
	const padP = Math.max(14, Math.min(W, H) * 0.04);
	assert.equal(
		padInset(W, H, { factor: 0.04, floor: 14 }),
		padP * 2,
		'practice pad (floor 14, factor 0.04) is byte-identical',
	);
});

test('createTransport clamps to [0, count-1] and fires onShow on every landing', () => {
	const { createTransport } = K;
	const seen = [];
	const t = createTransport({ count: 3, onShow: (i) => seen.push(i) });
	assert.equal(t.index, 0);
	assert.equal(t.next(), 1);
	assert.equal(t.next(), 2);
	assert.equal(t.next(), 2, 'clamped at the last slide');
	assert.equal(t.prev(), 1);
	assert.equal(t.first(), 0);
	assert.equal(t.prev(), 0, 'clamped at the first slide');
	assert.equal(t.last(), 2);
	assert.deepEqual(seen, [1, 2, 2, 1, 0, 0, 2], 'onShow fires on every move, including edge no-ops');
});

test('createTransport start is clamped, and count may be dynamic', () => {
	const { createTransport } = K;
	assert.equal(createTransport({ count: 3, start: 9 }).index, 2, 'an out-of-range start clamps');
	let n = 2;
	const t = createTransport({ count: () => n });
	t.last();
	assert.equal(t.index, 1);
	n = 5; // the deck/lens grew
	assert.equal(t.last(), 4, 'last() honors the live count');
});

test('keyAction maps the shared nav keys and nothing else', () => {
	const { keyAction } = K;
	assert.equal(keyAction('ArrowRight'), 'next');
	assert.equal(keyAction(' '), 'next');
	assert.equal(keyAction('PageDown'), 'next');
	assert.equal(keyAction('ArrowLeft'), 'prev');
	assert.equal(keyAction('PageUp'), 'prev');
	assert.equal(keyAction('Home'), 'first');
	assert.equal(keyAction('End'), 'last');
	assert.equal(keyAction('g'), undefined, 'UI keys are the consumer’s concern, not the kernel’s');
	assert.equal(keyAction('Escape'), undefined);
	// Own-property only — an inherited Object.prototype member must not leak through
	// (a consumer would try to call `t['toString']()` and throw).
	assert.equal(keyAction('toString'), undefined, 'prototype keys return undefined, not a function');
	assert.equal(keyAction('constructor'), undefined);
	assert.equal(keyAction('__proto__'), undefined);
});

test('fitScale is unguarded at degenerate sizes (the caller owns the sc<=0 floor)', () => {
	const { fitScale } = K;
	// A viewport narrower than the reserved inset yields a NEGATIVE scale — matching
	// the export player's historical (unguarded) behavior. buildStageDoc adds its own
	// `if(!(sc>0))sc=1` floor; the kernel deliberately does not, so each caller decides.
	const sc = fitScale({ stageW: 40, stageH: 800, slideW: 1280, slideH: 720, insetX: 56, insetY: 104 });
	assert.ok(sc < 0, 'a sub-inset viewport gives a negative factor — no hidden clamp');
});

test('swipeAction turns only on a decisive horizontal gesture', () => {
	const { swipeAction } = K;
	assert.equal(swipeAction({ dx: -60, dy: 5 }), 'next', 'a firm left swipe advances');
	assert.equal(swipeAction({ dx: 60, dy: 5 }), 'prev', 'a firm right swipe goes back');
	assert.equal(swipeAction({ dx: 30, dy: 5 }), null, 'below the 45px threshold → nothing');
	assert.equal(swipeAction({ dx: 60, dy: 55 }), null, 'too diagonal (not 1.3× horizontal) → nothing');
});
