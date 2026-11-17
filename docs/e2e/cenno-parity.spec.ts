import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

// @laticent/cenno in real engines (docs/src/lib/cenno). The unit tests run in jsdom, which lays
// nothing out; this file holds the claims that need a real layout engine:
//   - placement agrees with Floating UI (its offset + flip + shift) on seeded cases;
//   - a real card lands where `place` says, sits in the top layer above any z-index, and stays
//     on screen inside a fullscreen element;
//   - a card mounted under a TRANSFORMED ancestor (the fallback path) is corrected to the right spot;
//   - an anchor inside a scaled, offset iframe is measured where the reader sees it;
//   - an anchor scrolled out of its clipping container hides the card, and scrolling back shows it;
//   - under a real visual-viewport pinch (Chromium's page scale factor), the card keeps its size on
//     screen and stays on the visible part of the page.
// @crosswidth runs it in Chromium at desktop and phone width, @gecko in Firefox, @webkit-tablet in WebKit. Both libraries are
// bundled from source at test time (never committed — HARD RULE #2), so they cannot go stale.
// The seeded cases print their seed; CENNO_SEED replays one.

// What the page holds once `load` has injected the two bundles, and what a test parks on it.
type Cenno = typeof import('../src/lib/cenno/index.ts');
declare global {
	interface Window {
		Cenno: Cenno;
		FU: Pick<typeof import('@floating-ui/dom'), 'computePosition' | 'flip' | 'shift' | 'offset'>;
		card: import('../src/lib/cenno/index.ts').CennoCard;
	}
}

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = Number(process.env.CENNO_SEED || 20261116);
const CASES = 2000;

let cennoJs = '';
let floatingJs = '';

test.beforeAll(async () => {
	const esbuild = await import('esbuild');
	const iife = async (contents: string) =>
		(
			await esbuild.build({
				stdin: { contents, resolveDir: DOCS, loader: 'ts' },
				bundle: true,
				format: 'iife',
				write: false,
				logLevel: 'error',
				conditions: ['@laticent/source'],
			})
		).outputFiles[0].text;
	cennoJs = await iife(`import * as C from './src/lib/cenno/index.ts'; window.Cenno = C;`);
	floatingJs = await iife(`import { computePosition, flip, shift, offset } from '@floating-ui/dom'; window.FU = { computePosition, flip, shift, offset };`);
});

async function load(page: Page, body = ''): Promise<void> {
	await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0}</style></head><body>${body}</body></html>`);
	await page.addScriptTag({ content: cennoJs });
	await page.addScriptTag({ content: floatingJs });
}

test(`placement matches Floating UI on ${CASES} seeded cases (seed ${SEED}) @crosswidth @gecko @webkit-tablet`, async ({ page }) => {
	await load(page, '<div id="probe" style="position:fixed;left:0;top:0"></div>');
	const result = await page.evaluate(
		async ({ seed, n }) => {
			let s = seed >>> 0;
			const rnd = () => {
				s = (s + 0x6d2b79f5) >>> 0;
				let t = s;
				t = Math.imul(t ^ (t >>> 15), t | 1);
				t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};
			const W = innerWidth;
			const H = innerHeight;
			const sides = ['top', 'right', 'bottom', 'left'] as const;
			const aligns = ['start', 'center', 'end'] as const;
			const probe = document.getElementById('probe') as HTMLElement;
			const { computePosition, flip, shift, offset } = window.FU;
			const { place } = window.Cenno;
			const diffs: unknown[] = [];
			for (let i = 0; i < n; i++) {
				const point = rnd() < 0.5;
				const w = point ? 0 : 8 + rnd() * 160;
				const h = point ? 0 : 8 + rnd() * 80;
				const a = { x: rnd() * (W - w), y: rnd() * (H - h), width: w, height: h };
				const card = { width: 120 + Math.round(rnd() * 240), height: 60 + Math.round(rnd() * 200) };
				const side = sides[Math.floor(rnd() * 4)];
				const align = aligns[Math.floor(rnd() * 3)];
				const gap = Math.round(rnd() * 16);
				probe.style.width = `${card.width}px`;
				probe.style.height = `${card.height}px`;
				const ref = { getBoundingClientRect: () => ({ ...a, top: a.y, left: a.x, right: a.x + a.width, bottom: a.y + a.height }) };
				const f = await computePosition(ref, probe, {
					strategy: 'fixed',
					placement: align === 'center' ? side : `${side}-${align}`,
					middleware: [offset(gap), flip({ padding: 8, crossAxis: false, flipAlignment: false, fallbackStrategy: 'bestFit' }), shift({ padding: 8 })],
				});
				const c = place(a, card, { x: 0, y: 0, width: W, height: H }, { side, align, gap, pad: 8 });
				if (f.placement.split('-')[0] !== c.side || Math.abs(f.x - c.x) > 0.5 || Math.abs(f.y - c.y) > 0.5) diffs.push({ i, a, card, side, align, gap, f, c });
			}
			return { n: diffs.length, first: diffs.slice(0, 3) };
		},
		{ seed: SEED, n: CASES },
	);
	expect(result.first, `seed ${SEED}`).toEqual([]);
	expect(result.n).toBe(0);
});

test('a real card lands where place says and sits in the top layer above any z-index @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await load(
		page,
		`<button id="a" style="position:absolute;left:24px;top:200px;width:80px;height:30px">anchor</button>
		 <div style="position:fixed;inset:0;z-index:2147483647;pointer-events:none;background:transparent"></div>`,
	);
	const r = await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		const card = createCenno().open(document.getElementById('a') as HTMLElement, { title: 'Revenue', value: '$4.2M', body: 'Up 12% on Q2.' }, { gap: 10, align: 'start' });
		const el = card.element as HTMLElement;
		const box = el.getBoundingClientRect();
		const a = (document.getElementById('a') as HTMLElement).getBoundingClientRect();
		const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
		return {
			topLayer: typeof el.showPopover === 'function' ? el.matches(':popover-open') : 'no popover api',
			hitInCard: !!hit && el.contains(hit),
			cardTop: box.top,
			wantTop: a.bottom + 10,
			startDelta: box.left - a.left,
		};
	});
	expect(r.topLayer).toBe(true);
	expect(r.hitInCard).toBe(true);
	expect(Math.abs(r.cardTop - r.wantTop)).toBeLessThan(0.6);
	expect(Math.abs(r.startDelta)).toBeLessThan(0.6);
});

test('an open card stays visible when its stage goes fullscreen @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await load(page, `<section id="stage" style="width:600px;height:400px;background:Canvas"><button id="a" style="margin:100px">anchor</button></section><button id="go">go</button>`);
	await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		window.card = createCenno().open(document.getElementById('a') as HTMLElement, 'detail', { gap: 8 });
		document.getElementById('go')?.addEventListener('click', () => (document.getElementById('stage') as HTMLElement).requestFullscreen());
	});
	await page.click('#go');
	await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null)).toBe('stage');
	await expect
		.poll(() =>
			page.evaluate(() => {
				const el = window.card.element as HTMLElement;
				const b = el.getBoundingClientRect();
				const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
				return { inStage: !!document.fullscreenElement?.contains(el), hit: !!hit && el.contains(hit) };
			}),
		)
		.toEqual({ inStage: true, hit: true });
});

test('under a transformed host, the fallback path corrects to the right spot @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await load(page, `<div id="host" style="transform:translate(37px,-21px) scale(1);position:absolute;left:50px;top:80px"></div><button id="a" style="position:absolute;left:40px;top:300px">anchor</button>`);
	const r = await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		const card = createCenno({ host: document.getElementById('host') as HTMLElement }).open(document.getElementById('a') as HTMLElement, 'detail', { gap: 6, align: 'start' });
		const b = (card.element as HTMLElement).getBoundingClientRect();
		const a = (document.getElementById('a') as HTMLElement).getBoundingClientRect();
		return { dx: b.left - a.left, dy: b.top - (a.bottom + 6), popover: (card.element as HTMLElement).hasAttribute('popover') };
	});
	expect(r.popover).toBe(false);
	expect(Math.abs(r.dx)).toBeLessThan(0.6);
	expect(Math.abs(r.dy)).toBeLessThan(0.6);
});

test('under a SCALED host, the fallback path corrects position and keeps screen size @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await load(page, `<div id="host" style="transform:translate(37px,-21px) scale(.5);transform-origin:0 0;position:absolute;left:50px;top:80px"></div><button id="a" style="position:absolute;left:40px;top:300px">anchor</button>`);
	const r = await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		const plain = createCenno().open(document.getElementById('a') as HTMLElement, 'detail text', { gap: 6, align: 'start' });
		const want = (plain.element as HTMLElement).getBoundingClientRect();
		plain.close();
		const card = createCenno({ host: document.getElementById('host') as HTMLElement }).open(document.getElementById('a') as HTMLElement, 'detail text', { gap: 6, align: 'start' });
		const b = (card.element as HTMLElement).getBoundingClientRect();
		const a = (document.getElementById('a') as HTMLElement).getBoundingClientRect();
		return { dx: b.left - a.left, dy: b.top - (a.bottom + 6), dw: b.width - want.width, popover: (card.element as HTMLElement).hasAttribute('popover') };
	});
	expect(r.popover).toBe(false);
	expect(Math.abs(r.dx)).toBeLessThan(0.6);
	expect(Math.abs(r.dy)).toBeLessThan(0.6);
	expect(Math.abs(r.dw), 'same size on screen as a card in the top layer').toBeLessThan(0.6);
});

test('an anchor inside a scaled, offset iframe is measured where the reader sees it @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await load(page, `<iframe id="f" style="position:absolute;left:120px;top:60px;width:800px;height:500px;border:4px solid;transform:scale(.5);transform-origin:0 0" srcdoc="<body style='margin:0'><div id=m style='position:absolute;left:300px;top:200px;width:100px;height:40px;background:red'></div></body>"></iframe>`);
	await expect.poll(() => page.evaluate(() => !!(document.getElementById('f') as HTMLIFrameElement).contentDocument?.getElementById('m'))).toBe(true);
	const r = await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		const mark = (document.getElementById('f') as HTMLIFrameElement).contentDocument?.getElementById('m') as HTMLElement;
		const card = createCenno().open(mark, 'detail', { gap: 0, align: 'start' });
		const b = (card.element as HTMLElement).getBoundingClientRect();
		return { left: b.left, top: b.top };
	});
	// left 120 + border 4 * .5 + 300 * .5 = 272; top 60 + 2 + (200 + 40) * .5 = 182.
	expect(r.left).toBeCloseTo(272, 0);
	expect(r.top).toBeCloseTo(182, 0);
});

test('an anchor scrolled out of its clipping box hides the card until it comes back @crosswidth @gecko @webkit-tablet', async ({ page }) => {
	await load(page, `<div id="box" style="width:300px;height:200px;overflow:auto"><div style="height:1200px;padding-top:50px"><button id="a">anchor</button></div></div>`);
	await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		window.card = createCenno().open(document.getElementById('a') as HTMLElement, 'detail');
	});
	expect(await page.evaluate(() => window.card.hidden)).toBe(false);
	await page.evaluate(() => {
		(document.getElementById('box') as HTMLElement).scrollTop = 600;
	});
	await expect.poll(() => page.evaluate(() => window.card.element.hasAttribute('data-cenno-hidden'))).toBe(true);
	await page.evaluate(() => {
		(document.getElementById('box') as HTMLElement).scrollTop = 0;
	});
	await expect.poll(() => page.evaluate(() => window.card.element.hasAttribute('data-cenno-hidden'))).toBe(false);
});

// UNTAGGED on purpose, so only the Chromium projects run it: a visual-viewport pinch can be set
// only through Chromium's DevTools protocol (Emulation.setPageScaleFactor). It ignores
// touch-action, so it proves the placement math under pinch, not that a finger can pinch a given
// surface (engineering/decisions/2026-11-16-cenno-popover-library.md §7a). The anchor sits near
// the top-left so it stays inside the pinched view at every project's width.
test('under a real pinch, the card keeps its size on screen and stays in view', async ({ page }) => {
	await load(page, `<button id="a" style="position:absolute;left:24px;top:24px;width:60px;height:24px">anchor</button>`);
	const unzoomed = await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		const card = createCenno().open(document.getElementById('a') as HTMLElement, 'A detail card with a few words', { gap: 8 });
		const w = (card.element as HTMLElement).getBoundingClientRect().width;
		card.close();
		return w;
	});
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
	await expect.poll(() => page.evaluate(() => window.visualViewport?.scale)).toBe(2);
	const r = await page.evaluate(() => {
		const { createCenno } = window.Cenno;
		const card = createCenno().open(document.getElementById('a') as HTMLElement, 'A detail card with a few words', { gap: 8 });
		const b = (card.element as HTMLElement).getBoundingClientRect();
		// Read through `visualViewport` by name: the offset-geometry gate (HARD RULE #32) skips the visual viewport's
		// own offsets, which are what this test needs, and recognizes them by that name.
		const vv = window.visualViewport!;
		return { w: b.width, left: b.left, top: b.top, right: b.right, bottom: b.bottom, vx: window.visualViewport!.offsetLeft, vy: window.visualViewport!.offsetTop, vw: vv.width, vh: vv.height, scale: vv.scale };
	});
	// Layout pixels shrink by the pinch scale, so steady screen size means half the layout width.
	expect(r.w * r.scale).toBeCloseTo(unzoomed, 0);
	expect(r.left).toBeGreaterThanOrEqual(r.vx - 0.5);
	expect(r.top).toBeGreaterThanOrEqual(r.vy - 0.5);
	expect(r.right).toBeLessThanOrEqual(r.vx + r.vw + 0.5);
	expect(r.bottom).toBeLessThanOrEqual(r.vy + r.vh + 0.5);
});
