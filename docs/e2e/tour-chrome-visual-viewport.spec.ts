import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import * as esbuild from 'esbuild';

// THE SHIPPED `tour-chrome.ts` ARITHMETIC, RUN AGAINST A REAL ENGINE'S VISUAL VIEWPORT.
//
// Why this file exists, stated plainly, because it is the gap it was written to close. Every other
// arm for `visibleBottom()` lives in jsdom and measures against a `window.visualViewport` WE wrote.
// The first version of that stub was physically impossible — it shrank `height` as `offsetTop` grew,
// holding their sum invariant, which no engine does — and it took a review to catch. A claim about
// how a browser reports its visual viewport cannot rest on our own model of a browser (HARD RULE
// #23), so this runs the real module, in real Chromium, against geometry Chromium produced.
//
// A SOFTWARE KEYBOARD IS STILL NOT REACHABLE HERE, and nothing below claims otherwise. But a
// keyboard is not the only thing that shrinks the visual viewport while leaving the layout viewport
// alone — PINCH-ZOOM does exactly that, `Emulation.setPageScaleFactor` drives it, and
// `visibleBottom()` cannot tell the two apart: it reads `height` and `offsetTop` and never asks why
// they disagree with `innerHeight`. So this establishes the MECHANISM on a real engine. What it does
// not establish is that iOS's keyboard produces this geometry, or that this is the reported symptom
// — both stay UNVERIFIED in
// `engineering/decisions/2026-09-14-the-keyboard-is-the-other-occluder.md`.
//
// The module is bundled rather than re-implemented. Re-typing the formula into the page would test
// the formula against itself, which is the failure this file exists to avoid.
//
// WHAT THESE ARMS DO AND DO NOT PIN, measured by driving mutants against them:
//   `visibleBottom()` -> `innerHeight`            both arms FAIL  (the core claim, pinned here)
//   the caption x-test gating the full-width band the second FAILS (the composition defect)
//   dropping the `offsetTop` term                 both PASS       (NOT pinned here)
// The last one is a real limit, not an oversight. `visualViewport.offsetTop` is 0 throughout this
// file because headless Chromium will not produce a non-zero one: a page-scale factor shrinks the
// visual viewport but does not slide it inside the layout viewport, and `Input.synthesizeScrollGesture`
// scrolls the page as a whole (tried, `offsetTop` stayed 0). That term is therefore pinned only in
// `tour-chrome.test.ts`, where its DIRECTION is the thing the arm asserts — it makes the reveal clear
// LESS, not more, which is the opposite of what an earlier docblock claimed.

const SRC = fileURLToPath(new URL('../src/components/studio/tour-chrome.ts', import.meta.url));

async function bundled(): Promise<string> {
	const out = await esbuild.build({
		stdin: { contents: readFileSync(SRC, 'utf8'), loader: 'ts', resolveDir: fileURLToPath(new URL('../src/components/studio/', import.meta.url)) },
		bundle: true,
		format: 'iife',
		globalName: 'TC',
		write: false,
	});
	return out.outputFiles[0].text;
}

/** Install a scroller whose box really is measured by the engine, not stubbed. */
const PAGE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="margin:0"><div id="pane" style="position:fixed;left:0;right:0;bottom:0;height:600px"></div>
<div style="height:4000px"></div></body>`;

test.describe('tour-chrome against a real visual viewport @vv', () => {
	test('visibleBottom follows the engine, and the overlap clears the higher obstruction', async ({ page, context }) => {
		const code = await bundled();
		await page.setViewportSize({ width: 800, height: 900 });
		await page.setContent(PAGE);
		await page.addScriptTag({ content: code });

		// A 230px caption band, full width — the phone `scrim` shape.
		await page.evaluate(() => {
			const d = document.documentElement.style;
			d.setProperty('--vt-chrome-bottom', '230px');
			d.setProperty('--vt-chrome-left', '0px');
			d.setProperty('--vt-chrome-right', '0px');
		});

		type Probe = { innerH: number; vvH: number; off: number; visible: number; overlap: number };
		const probe = (): Promise<Probe> =>
			page.evaluate(() => {
				// biome-ignore lint/suspicious/noExplicitAny: the bundled module is attached as a global.
				const tc = (window as any).TC;
				const el = document.getElementById('pane') as HTMLElement;
				return {
					innerH: window.innerHeight,
					vvH: Math.round(window.visualViewport!.height),
					off: Math.round(window.visualViewport!.offsetTop),
					visible: Math.round(tc.visibleBottom()),
					overlap: Math.round(tc.tourChromeOverlap(el)),
				};
			});

		// ── page scale 1: the two viewports agree, so this is the pre-change behavior exactly ──
		const flat = await probe();
		expect(flat.vvH, 'the engine reported no visual viewport at all').toBeGreaterThan(0);
		expect(flat.visible).toBe(flat.innerH);
		// The pane's bottom is the window's, so the caption's 230px band covers 230px of it.
		expect(flat.overlap).toBe(230);

		// ── page scale 2: the VISUAL viewport halves while the LAYOUT one does not ──
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
		const zoomed = await probe();

		// The engine really moved — otherwise everything below is the flat case under another name.
		expect(zoomed.innerH, 'the LAYOUT viewport changed, so this is not the divergence being tested').toBe(flat.innerH);
		expect(zoomed.vvH, 'the VISUAL viewport did not shrink, so the override did nothing').toBeLessThan(flat.vvH - 100);

		// THE CLAIM, on engine numbers: the lowest visible line is the visual viewport's bottom.
		expect(zoomed.visible).toBe(Math.min(zoomed.innerH, zoomed.off + zoomed.vvH));
		expect(zoomed.visible).toBeLessThan(zoomed.innerH);

		// AND the overlap clears THAT rather than the caption, because the keyboard-shaped
		// obstruction now reaches higher. This is the number a mutant reading `innerHeight`
		// cannot produce: it would still say 230.
		const paneBottom = zoomed.innerH; // the pane is `position: fixed; bottom: 0`
		expect(zoomed.overlap).toBe(paneBottom - zoomed.visible);
		expect(zoomed.overlap, 'the overlap did not grow past the caption band, so visibleBottom was ignored').toBeGreaterThan(230);
	});

	test('a pane BESIDE a narrow caption still clears the full-width obstruction', async ({ page, context }) => {
		// The composition defect a checker found, on a real engine: the caption's horizontal test
		// must not gate the full-width obstruction, because nothing is ever beside that one.
		const code = await bundled();
		await page.setViewportSize({ width: 800, height: 900 });
		await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="margin:0"><div id="pane" style="position:fixed;left:0;width:200px;bottom:0;height:600px"></div>
<div style="height:4000px"></div></body>`);
		await page.addScriptTag({ content: code });
		// A centered 380px pill on an 800px window: clear strips of 210px each, band [210, 590].
		await page.evaluate(() => {
			const d = document.documentElement.style;
			d.setProperty('--vt-chrome-bottom', '230px');
			d.setProperty('--vt-chrome-left', '210px');
			d.setProperty('--vt-chrome-right', '210px');
		});
		// biome-ignore lint/suspicious/noExplicitAny: the bundled module is attached as a global.
		const read = () => page.evaluate(() => Math.round((window as any).TC.tourChromeOverlap(document.getElementById('pane'))));

		// x 0..200 is entirely left of the band, and nothing else obstructs — so nothing is reserved.
		expect(await read()).toBe(0);

		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
		// Now the full-width obstruction covers it, and the caption's x-test must not suppress that.
		expect(await read(), 'the horizontal test swallowed the full-width obstruction').toBeGreaterThan(200);
	});
});
