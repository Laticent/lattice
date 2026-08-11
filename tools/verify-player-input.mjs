// Real-surface verification for the exported HTML player's TOUCH input (#1558).
//
// HARD RULE #23: "verified" names a surface and carries an artifact from it. The claim here is
// "pinching a deck someone shared with you no longer turns the slide", which is a claim about
// a real file, opened from disk, driven by real fingers. jsdom has no touch stack and a
// synthesized DOM event is not a gesture — so this exports a REAL deck through the REAL CLI
// player path and drives it with genuine CDP touch points in a touch-enabled context.
//
// Two traps this is shaped around, both of which produced a false PASS while the Studio half
// of this fix (#1555) was being verified:
//
//   1. START MID-DECK. On slide 1 a misfired `prev` clamps, and a clamped no-op is
//      indistinguishable from a gesture correctly ignored. A harness that cannot tell those
//      apart is measuring the clamp.
//   2. PROVE THE GESTURE ARRIVED. "The counter did not move" is also what you see when no
//      touch event reached the page at all. So every pinch is instrumented: the run counts the
//      contacts the stage actually saw and REPLAYS the old measurement over the real
//      coordinates, printing the swipe the guard declined. A pass means "a gesture that would
//      have turned the deck did not", not "nothing happened".
//
// Run: node tools/verify-player-input.mjs            (writes .scratch/out/)
//      DECK=examples/other.md node tools/verify-player-input.mjs

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '../docs/node_modules/@playwright/test/index.mjs'; // the docs workspace owns Playwright

// A REAL committed deck through the REAL CLI, not a synthetic fixture. The narration
// verifier's sign-off learned this the hard way: a hand-written three-declaration fixture
// carries no theme, so its "dark" evidence was byte-for-byte its light evidence while the run
// printed ALL CHECKS PASSED.
//
// The overflow check below started as a guard against a defect this file used to describe as
// out of scope: the player hardcoded 1280×720, so `gallery-jargon.md` (`size: 4K`) rendered
// every slide at 3× and spilled its frame, which made the sign-off images useless. That is
// fixed (#1577) — the canvas is threaded from the host now — and the check stays, because it
// is the thing that would notice a regression without anyone having to look.
const DECK = process.env.DECK || 'examples/finish-backdrops.md';
const out = path.resolve('.scratch/out/player-input');
mkdirSync('.scratch/out', { recursive: true });
console.log(`exporting ${DECK} through the CLI player path…`);
execFileSync(process.execPath, ['lattice-emulator.js', DECK, out, '--player'], { stdio: 'pipe' });
const file = `${out}.html`;

const check = (label, ok, detail = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	if (!ok) process.exitCode = 1;
};

const browser = await chromium.launch();

// The three widths the Studio fix was measured at, all with a touchscreen — the phone is the
// device the defect is actually about, and a touchscreen laptop is the reminder that no device
// class owns an input (#1294).
const VIEWPORTS = [
	{ name: 'phone', width: 390, height: 844 },
	{ name: 'tablet', width: 820, height: 1180 },
	{ name: 'desktop-touch', width: 1440, height: 900 },
];

/** The player's own slide counter — anchored, because deck content can forge the id. */
const counter = (page) => page.evaluate(() => document.querySelector('body > #lp-bar > #lp-count').textContent.trim());

/**
 * Watch what the stage really receives. `pd` counts contacts; `span` replays the OLD
 * measurement — first start point recorded, last end point measured against it — which is
 * exactly the arithmetic the unguarded handler did.
 */
const instrument = (page) =>
	page.evaluate(() => {
		const stage = document.querySelector('body > #lp-app > #lp-stage');
		window.__probe = { pd: 0, starts: [], ends: [] };
		stage.addEventListener('pointerdown', (e) => {
			window.__probe.pd++;
			window.__probe.starts.push([e.clientX, e.clientY]);
		}, true);
		stage.addEventListener('pointerup', (e) => window.__probe.ends.push([e.clientX, e.clientY]), true);
	});
const probe = (page) =>
	page.evaluate(() => {
		const p = window.__probe;
		// The unguarded rule: sx/sy is whatever landed LAST (the second finger overwrote the
		// first), and the FIRST lift is measured against it. Reproduce that, verbatim.
		const s = p.starts[p.starts.length - 1];
		const e = p.ends[0];
		const dx = s && e ? e[0] - s[0] : 0;
		const dy = s && e ? e[1] - s[1] : 0;
		const wouldFire = Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3;
		return { pd: p.pd, dx: Math.round(dx), dy: Math.round(dy), wouldFire, action: dx < 0 ? 'next' : 'prev' };
	});

/** A real two-finger pinch — CDP touch points, the same shape docs/e2e/preview-nav.spec.ts uses. */
async function pinch(cdp, box, outward = true) {
	const cy = box.y + box.height / 2;
	const cx = box.x + box.width / 2;
	const pt = (x) => ({ x, y: cy, radiusX: 12, radiusY: 12, force: 1 });
	const from = outward ? 20 : 100;
	const to = outward ? 100 : 20;
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(cx - from), pt(cx + from)] });
	for (let i = 1; i <= 6; i++) {
		const half = from + ((to - from) * i) / 6;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(cx - half), pt(cx + half)] });
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * A pinch whose SECOND finger lands off the slide, on the player's own chrome.
 *
 * This case exists because its absence hid a live bug. `pinch()` above pins both contacts to
 * the stage's vertical center, so no amount of running it could ever place a finger on the
 * transport bar or the prev/next row — and the first cut of this fix counted only contacts
 * that landed on the stage, so exactly this gesture still turned the deck at every width. The
 * harness tested the gesture that was imagined rather than the geometry that exists.
 *
 * `yB` is an absolute viewport y OUTSIDE the stage box: above it is the bar, below it is the
 * nav row. Together they are 119px — 14% of a phone screen, and the bottom edge is where a
 * hand actually rests.
 */
async function pinchOffStage(cdp, box, yB) {
	const cy = box.y + box.height / 2;
	const cx = box.x + box.width / 2;
	const p = (x, y) => ({ x, y, radiusX: 12, radiusY: 12, force: 1 });
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p(cx - 20, cy), p(cx + 20, yB)] });
	for (let i = 1; i <= 6; i++) {
		const h = 20 + (80 * i) / 6;
		await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p(cx - h, cy), p(cx + h, yB)] });
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A real one-finger swipe — the verb that must still work. */
async function swipeLeft(cdp, box) {
	const y = box.y + box.height / 2;
	const from = box.x + box.width * 0.75;
	const send = (type, x) =>
		cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] });
	await send('touchStart', from);
	for (let i = 1; i <= 5; i++) await send('touchMove', from - (160 * i) / 5);
	await send('touchEnd', from - 160);
}

for (const vp of VIEWPORTS) {
	const ctx = await browser.newContext({ hasTouch: true, viewport: { width: vp.width, height: vp.height } });
	const page = await ctx.newPage();
	const problems = [];
	page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
	await page.goto(`file://${file}`);
	await page.waitForSelector('#lp-stage');

	// MID-DECK. Two arrow presses put us on slide 3, where `prev` and `next` are both real
	// moves and neither can be mistaken for a clamp.
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	const start = await counter(page);
	check(`${vp.name}: parked mid-deck`, start.startsWith('3 '), start);

	const box = await page.locator('body > #lp-app > #lp-stage').boundingBox();
	const cdp = await ctx.newCDPSession(page);

	// ── the defect ────────────────────────────────────────────────────────────
	await instrument(page);
	await pinch(cdp, box);
	const spread = await probe(page);
	check(`${vp.name}: the pinch really reached the stage`, spread.pd >= 2, `${spread.pd} contacts`);
	check(
		`${vp.name}: and it WOULD have read as a swipe unguarded`,
		spread.wouldFire,
		`old measurement dx=${spread.dx} dy=${spread.dy} → ${spread.action}`,
	);
	check(`${vp.name}: pinching OUT does not turn the deck`, (await counter(page)) === start, await counter(page));

	await instrument(page);
	await pinch(cdp, box, false);
	check(`${vp.name}: pinching IN does not turn the deck either`, (await counter(page)) === start, await counter(page));

	// The same gesture with one finger off the slide, above and below. This is the cell whose
	// absence shipped a live bug through both tiers.
	for (const [where, yB] of [
		['the nav row below', Math.min(vp.height - 20, box.y + box.height + 30)],
		['the transport bar above', Math.max(8, box.y - 24)],
	]) {
		// PROVE THE FINGER IS ACTUALLY OFF THE STAGE. Without this the y-clamp could quietly put
		// it back on the slide in some future layout, and the cell would degrade into a duplicate
		// of pinch() while still printing PASS — the same silent-coverage-loss this file exists
		// to prevent.
		const offStage = await page.evaluate((y) => {
			const el = document.elementFromPoint(20, y);
			return !!el && !el.closest('#lp-stage');
		}, yB);
		check(`${vp.name}: the second finger for "${where}" really is off the stage`, offStage, `y=${Math.round(yB)}`);
		await pinchOffStage(cdp, box, yB);
		check(`${vp.name}: a pinch with a finger on ${where} is still a pinch`, (await counter(page)) === start, await counter(page));
	}

	// A TRACKPAD PINCH. No touch, no second pointer — it reaches the page as ctrl+wheel, so the
	// finger-counting guard cannot see it and only the wheel handler can decline it. This is the
	// arm that was still live after the guard shipped, on every laptop, because the harness ran
	// three widths of touch and never sent the one gesture a 1440px device actually makes.
	const wheelPinch = (dy) =>
		cdp.send('Input.dispatchMouseEvent', {
			type: 'mouseWheel', x: box.x + box.width / 2, y: box.y + box.height / 2, deltaX: 0, deltaY: dy, modifiers: 2,
		});
	await wheelPinch(-40);
	await page.waitForTimeout(400);
	check(`${vp.name}: a trackpad pinch (ctrl+wheel) does not turn the deck`, (await counter(page)) === start, await counter(page));
	await wheelPinch(40);
	await page.waitForTimeout(400);
	check(`${vp.name}: nor the other way`, (await counter(page)) === start, await counter(page));

	// …and a PLAIN wheel must still navigate. #1294 makes the wheel one of three verbs every
	// slide surface owes; declining the trackpad arm must not cost the mouse one.
	await cdp.send('Input.dispatchMouseEvent', {
		type: 'mouseWheel', x: box.x + box.width / 2, y: box.y + box.height / 2, deltaX: 0, deltaY: 40, modifiers: 0,
	});
	await page.waitForTimeout(400);
	const afterWheel = await counter(page);
	check(`${vp.name}: a PLAIN wheel still turns the deck`, afterWheel !== start, `${start} → ${afterWheel}`);
	await page.keyboard.press('ArrowLeft');

	// THE DISCLOSED COST, MEASURED rather than described. A second contact resting anywhere
	// declines the swipe until it lifts. That is deliberate, but it is a behavior a reader can
	// hit one-handed, so the number belongs in the run rather than only in prose.
	const restY = box.y + box.height * 0.8;
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + 30, y: restY, radiusX: 12, radiusY: 12, force: 1 }] });
	const thumbFrom = box.x + box.width * 0.75;
	for (const [t, x] of [['touchStart', thumbFrom], ['touchMove', thumbFrom - 80], ['touchMove', thumbFrom - 160], ['touchEnd', thumbFrom - 160]]) {
		await cdp.send('Input.dispatchTouchEvent', {
			type: t,
			touchPoints: [{ x: box.x + 30, y: restY, radiusX: 12, radiusY: 12, force: 1 }].concat(
				t === 'touchEnd' ? [] : [{ x, y: box.y + box.height / 2, radiusX: 12, radiusY: 12, force: 1 }],
			),
		});
	}
	await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
	await page.waitForTimeout(300);
	const withThumb = await counter(page);
	check(
		`${vp.name}: DISCLOSED COST — a swipe with a resting thumb is declined`,
		withThumb === start,
		`${start} → ${withThumb}; this is the documented trade, not a pass/fail of the fix`,
	);

	// ── the verb that must survive ────────────────────────────────────────────
	await swipeLeft(cdp, box);
	const afterSwipe = await counter(page);
	check(`${vp.name}: a one-finger swipe still turns the deck`, afterSwipe !== start, `${start} → ${afterSwipe}`);

	// ── the guard must not latch ──────────────────────────────────────────────
	// The whole risk of "refuse to measure" is that it never starts measuring again.
	await pinch(cdp, box);
	await swipeLeft(cdp, box);
	const afterBoth = await counter(page);
	check(`${vp.name}: a swipe right after a pinch still works`, afterBoth !== afterSwipe, `${afterSwipe} → ${afterBoth}`);

	check(`${vp.name}: no page error`, problems.length === 0, problems.join(' | ') || 'clean');
	await ctx.close();
}

// ── SIGN-OFF ARTIFACTS ───────────────────────────────────────────────────────
//
// CLAUDE.md's export gate is a HUMAN gate: a change to the bytes of an exported artifact needs
// a representative deck rendered in both modes and looked at. The two modes are ASSERTED to
// differ before either is offered as evidence — an identical pair is not evidence, it is a
// screenshot taken twice.
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const shot = await ctx.newPage();
await shot.goto(`file://${file}`);
await shot.waitForSelector('#lp-stage');
await shot.evaluate(() => document.fonts.ready);
await shot.keyboard.press('ArrowRight');
await shot.keyboard.press('ArrowRight');
await shot.waitForTimeout(400);

// EVIDENCE THAT IS ALREADY BROKEN IS NOT EVIDENCE. A slide whose content spills out of its
// own 1280×720 box photographs as a wall of clipped type, and a human asked to sign off on
// the bytes should never have to work out whether that is the change or the deck. It is what
// a `size:`-declaring deck does to this player today, and asserting it here is cheaper than
// remembering.
const overflow = await shot.evaluate(() => {
	const s = document.querySelector('.lp-frame.lp-active section[data-lattice-slide]');
	return { scroll: s.scrollHeight, box: s.clientHeight };
});
check(
	'the sign-off slide actually fits its frame (a spilled slide is not evidence)',
	overflow.scroll <= overflow.box + 2,
	`content ${overflow.scroll}px in a ${overflow.box}px slide`,
);

const ground = {};
for (const mode of ['light', 'dark']) {
	await shot.evaluate((m) => {
		document.documentElement.setAttribute('data-lp-scheme', m);
		document.documentElement.style.setProperty('color-scheme', m);
	}, mode);
	await shot.waitForTimeout(250);
	ground[mode] = await shot.evaluate(() => getComputedStyle(document.body).backgroundColor);
	await shot.screenshot({ path: `.scratch/out/player-input-${mode}.png` });
}
check('the sign-off artifacts are genuinely two different modes', ground.light !== ground.dark, `light ${ground.light} vs dark ${ground.dark}`);
console.log(`wrote ${file} and .scratch/out/player-input-{light,dark}.png`);

// ── NON-DEFAULT canvases, on real artifacts (#1577) ─────────────────────────
//
// The class of deck that used to export unreadable: laid out by the engine for its declared
// canvas, then crushed into the player's hardcoded HD box. Asserting the geometry is not
// enough — the failure was visible as content spilling its own frame — so that is what is
// measured, plus the scaled frame landing inside the stage.
//
// FOUR ASPECT CLASSES, not one. The first cut of this checked only the 4K deck, which is
// landscape and merely larger; every genuinely different shape (tall, portrait, extra-tall)
// went unexercised, and those are the ones the no-JS ladder change actually bites. The
// no-JS floor is checked with JAVASCRIPT DISABLED, because that ladder is the only part of
// this fix the scripted path never touches — it had no real-surface coverage of any kind.
const CANVASES = [
	['4K', 'examples/gallery-jargon.md', '3840px x 2160px'],
	['story', 'examples/adaptive-sizing.md', '1080px x 1920px'],
	['portrait', 'examples/social-portrait.md', '1080px x 1350px'],
	['mobile', 'examples/social-mobile.md', '1080px x 2340px'],
];
for (const [label, deck, expected] of CANVASES) {
	const szOut = path.resolve(`.scratch/out/player-size-${label}`);
	execFileSync(process.execPath, ['lattice-emulator.js', deck, szOut, '--player'], { stdio: 'pipe' });

	const szCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	const sz = await szCtx.newPage();
	await sz.goto(`file://${szOut}.html`);
	await sz.waitForSelector('#lp-stage');
	await sz.evaluate(() => document.fonts.ready);
	await sz.keyboard.press('ArrowRight');
	await sz.waitForTimeout(500);
	const m = await sz.evaluate(() => {
		const s = document.querySelector('.lp-frame.lp-active section[data-lattice-slide]');
		const frame = s.closest('.lp-frame').getBoundingClientRect();
		const stage = document.querySelector('body > #lp-app > #lp-stage').getBoundingClientRect();
		return {
			box: `${getComputedStyle(s).width} x ${getComputedStyle(s).height}`,
			scroll: s.scrollHeight,
			clientH: s.clientHeight,
			fits: frame.width <= stage.width + 1 && frame.height <= stage.height + 1,
			frame: `${Math.round(frame.width)}x${Math.round(frame.height)}`,
		};
	});
	check(`${label}: the deck keeps its OWN canvas in the player`, m.box === expected, m.box);
	check(`${label}: its content does not spill that canvas`, m.scroll <= m.clientH + 2, `${m.scroll}px in ${m.clientH}px`);
	check(`${label}: and the scaled frame fits the stage`, m.fits, m.frame);
	await szCtx.close();

	// The no-JS floor, at a PHONE width — where a ladder tuned to 1280 puts an oversized frame
	// through the side of the viewport on a narrow canvas.
	const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
	const nj = await noJs.newPage();
	await nj.goto(`file://${szOut}.html`);
	await nj.waitForTimeout(300);
	const n = await nj.evaluate(() => {
		const fr = document.querySelector('.lp-frame').getBoundingClientRect();
		return { w: Math.round(fr.width), doc: document.documentElement.clientWidth };
	});
	check(`${label}: the no-JS floor stays inside the viewport`, n.w <= n.doc + 1, `frame ${n.w}px vs viewport ${n.doc}px`);
	await noJs.close();
}

await browser.close();
console.log(process.exitCode ? '\nFAILED' : '\nALL CHECKS PASSED');
