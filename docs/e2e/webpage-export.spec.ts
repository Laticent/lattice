import path from 'node:path';
import { expect, gotoStudio, test } from './studio-fixture';

// The Studio "Webpage (.html)" export must produce a player that actually RUNS in a
// real browser — not just assemble bytes. This drives the full Share → Webpage flow,
// captures the downloaded file, opens it, and asserts the player boots: it styles the
// slides (the deck CSS matches the exported flat structure) and its single CSP-hashed
// script executes (Present mode goes live). Two bugs this guards, both invisible to the
// unit tier and both shipped once because nothing opened the real artifact:
//   1. the browser engine scopes deck CSS to `div.lattice > section` (its preview
//      wrapper) but the export lays sections out flat — so the file carried the full
//      CSS yet none of it applied (raw unstyled Markdown);
//   2. the docs PRODUCTION build minifies player-core, renaming the transport kernel
//      functions, so the `.toString()`-inlined script threw `createTransport is not
//      defined`, stripped `.lp-js`, and fell back to the no-JS floor on every browser.
test('the Studio webpage export produces a player that boots (styled + script runs)', async ({ page, context }, testInfo) => {
	test.setTimeout(120_000);
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: /^Webpage \(\.html\)/ }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
	await page.getByRole('button', { name: /Download webpage|Exporting/ }).click();
	const download = await downloadPromise;
	// Save with a real `.html` name — `download.path()` is an extension-less temp file
	// that `file://` won't parse as HTML (so the inline script never runs), which would
	// mask exactly the boot bug under test.
	const file = path.join(testInfo.outputDir, 'export.html');
	await download.saveAs(file);

	// Open the real artifact and let its inline script run under its own CSP.
	const viewer = await context.newPage();
	const errors: string[] = [];
	viewer.on('pageerror', (e) => errors.push(e.message));
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	await viewer.waitForTimeout(500);

	// The script booted: it stamps `.lp-js` on <html> only when it actually runs, and
	// Present mode marks exactly one slide active. A thrown kernel would strip both.
	const boot = await viewer.evaluate(() => ({
		lpJs: document.documentElement.classList.contains('lp-js'),
		active: document.querySelectorAll('section.lp-active').length,
	}));
	expect(boot.lpJs, 'the player script ran (.lp-js set — not the no-JS floor)').toBe(true);
	expect(boot.active, 'Present shows exactly one active slide').toBe(1);
	expect(errors, 'no uncaught script errors (e.g. a renamed transport kernel)').toEqual([]);

	// The deck CSS applies: the title cover uses the inverse surface token, so its
	// computed background is a real dark color, not the unstyled default (transparent).
	const cover = await viewer.evaluate(() => {
		const s = document.querySelector('section.title, section[data-lattice-slide]');
		return s ? getComputedStyle(s).backgroundColor : '';
	});
	expect(cover, 'the deck CSS applies (styled slide, not raw Markdown)').not.toBe('rgba(0, 0, 0, 0)');
	await viewer.close();
});
