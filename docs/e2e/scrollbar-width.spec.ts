import fs from 'node:fs';
import path from 'node:path';
import { expect, firefox, type Page, test } from '@playwright/test';

/**
 * Inner panes get THIN scrollbars, not the OS default (docs/src/styles/native-widgets.css `* { scrollbar-width:
 * thin }`; `scrollbar-width` is not inherited, so a `:root` rule once thinned only the page's own bar). The owner
 * saw the thick default on Windows, in Firefox most. The `docs-scrollbars-windows` platform suite runs this spec
 * on a real Windows runner and uploads the widths it writes to platform-suite-artifacts/.
 *
 * The measure: the Compose pane's bar width against a control pane on the same page with `scrollbar-width: auto`
 * (inline, so it outranks the `*` rule). Classic scrollbars are forced on: headless Chromium hides them, and
 * Windows 11 Firefox draws overlay bars (no width) by default.
 *
 * Firefox runs HEADED, launched here rather than through the `gecko` project. Playwright's headless Firefox
 * reports `scrollbar-width: none` for every element, an inline `auto` included (measured 2026-11-21), so a
 * headless run cannot see the property at all. Headed needs a display: Windows always has one; on Linux run under
 * `xvfb-run`.
 */
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

type Widths = { pane: number; paneComputed: string; control: number; controlComputed: string };

async function measure(page: Page): Promise<Widths> {
	await page.goto(new URL('/studio/', test.info().project.use.baseURL).href, { waitUntil: 'domcontentloaded' });
	const host = page.locator('.cs-host');
	await expect(host.locator('.ProseMirror')).toBeVisible();
	await expect.poll(() => host.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
	return page.evaluate(() => {
		const bar = (el: HTMLElement) => {
			const cs = getComputedStyle(el);
			return el.offsetWidth - el.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0);
		};
		const pane = document.querySelector('.cs-host') as HTMLElement;
		const control = document.createElement('div');
		control.style.cssText = 'position:fixed;left:0;top:0;width:120px;height:80px;overflow-y:scroll;scrollbar-width:auto;visibility:hidden';
		control.innerHTML = '<div style="height:400px"></div>';
		document.body.appendChild(control);
		const out = { pane: bar(pane), paneComputed: getComputedStyle(pane).scrollbarWidth, control: bar(control), controlComputed: getComputedStyle(control).scrollbarWidth };
		control.remove();
		return out;
	});
}

async function record(browser: string, m: Widths) {
	const rec = { browser, platform: process.platform, ...m };
	await test.info().attach(`scrollbar-width-${browser}.json`, { body: JSON.stringify(rec, null, 2), contentType: 'application/json' });
	const dir = path.resolve(process.cwd(), '..', 'platform-suite-artifacts');
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, `scrollbar-width-${browser}-${process.platform}.json`), `${JSON.stringify(rec, null, 2)}\n`);
}

function expectThinner(m: Widths) {
	expect(m.controlComputed, 'the control pane must report its own `auto`; `none` means the engine is hiding every bar').toBe('auto');
	expect(m.paneComputed).toBe('thin');
	// An engine that draws classic bars (control > 0) must draw the pane's thinner. One that still draws overlay bars
	// (control 0) proves only the computed value; the artifact records which happened.
	if (m.control > 0) {
		expect(m.pane).toBeGreaterThan(0);
		expect(m.pane).toBeLessThan(m.control);
	} else test.info().annotations.push({ type: 'overlay-bars', description: `${process.platform}: overlay bars, widths not comparable` });
}

test('inner panes draw a thinner scrollbar than the OS default (Chromium)', async ({ page }) => {
	const m = await measure(page);
	await record('chromium', m);
	expectThinner(m);
});

test('inner panes draw a thinner scrollbar than the OS default (Firefox, headed)', async () => {
	test.skip(process.platform === 'linux' && !process.env.DISPLAY, 'Firefox must run headed to report scrollbar widths; on Linux run under xvfb-run');
	const browser = await firefox.launch({
		headless: false,
		firefoxUserPrefs: { 'widget.windows.overlay-scrollbars.enabled': false, 'widget.gtk.overlay-scrollbars.enabled': false, 'ui.useOverlayScrollbars': 0 },
	});
	try {
		const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		const m = await measure(page);
		await record('firefox', m);
		expectThinner(m);
	} finally {
		await browser.close();
	}
});
