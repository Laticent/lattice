import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

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
	// The boot stamp IS the condition this used to sleep 500ms for — `.lp-js` lands on
	// <html> only when the inline kernel actually ran. Waiting for it directly means a
	// slow file:// boot no longer races the assertion below, and a fast one no longer
	// pays half a second (#1526).
	await expect(viewer.locator('html')).toHaveClass(/\blp-js\b/);

	// The script booted: it stamps `.lp-js` on <html> only when it actually runs, and
	// Present mode marks exactly one slide FRAME active (the wrapper each slide is
	// packed in — see player-core.mjs's .lp-frame). A thrown kernel would strip both.
	const boot = await viewer.evaluate(() => ({
		lpJs: document.documentElement.classList.contains('lp-js'),
		active: document.querySelectorAll('.lp-frame.lp-active').length,
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

// #1577 — the deck's declared canvas has to survive the STUDIO export, not just the CLI's.
//
// The player hardcoded 1280×720, so a deck declaring any other `size:` exported laid out for
// its real canvas and then crushed into an HD box — unreadable, and invisible, because the PDF
// beside it was correct. The fix threads the canvas from each host, and the Studio half is the
// one with the wider blast radius: it is what a person clicking "Share" actually uses.
//
// This exists because that half was the fix's only ungated line. Deleting `width`/`height` from
// share-export.ts regresses the defect in full while `docs npm test`, `typecheck`, and the cell
// above all stay green — the cell above asserts the player BOOTS, never what size it thinks the
// slides are.
test('the Studio webpage export carries a deck declared canvas (#1577)', async ({ page, context }, testInfo) => {
	test.setTimeout(120_000);
	await gotoStudio(page);
	// `size: story` is 1080×1920 — different from HD on both axes, so a fallback to 1280×720
	// cannot coincidentally match either one.
	await setEditorContent(
		page,
		['---', 'theme: indaco', 'size: story', '---', '', '# A nine by sixteen deck', '', '---', '', '## Second slide', '', 'Body copy.', ''].join('\n'),
	);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: /^Webpage \(\.html\)/ }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 90_000 });
	await page.getByRole('button', { name: /Download webpage|Exporting/ }).click();
	const file = path.join(testInfo.outputDir, 'story-export.html');
	await (await downloadPromise).saveAs(file);

	const viewer = await context.newPage();
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	// Wait for the SIGNAL, not a guessed interval: the player marks exactly one frame active
	// once its script has run, which is also the element this test measures.
	await viewer.waitForSelector('.lp-frame.lp-active section[data-lattice-slide]', { state: 'attached' });
	const box = await viewer.evaluate(() => {
		const s = document.querySelector('.lp-frame.lp-active section[data-lattice-slide]');
		return s ? `${getComputedStyle(s).width} x ${getComputedStyle(s).height}` : '';
	});
	expect(box, 'the exported slide keeps the deck canvas, not the player default').toBe('1080px x 1920px');
	await viewer.close();
});

// The PRIVACY contract, on the real artifact. "Strip speaker notes" promises the note
// text appears nowhere in the shared file — not the DOM, and not the re-import source
// the envelope carries.
//
// This exists because that promise was broken twice and nothing noticed. Baking the deck
// through the capture frame put every slide through `sanitizeSlideHtml`, which deletes
// comment nodes — and notes ARE comments — so the scrub derived an EMPTY set and returned
// the source untouched. Then the first repair still leaked on the deck below, because it
// re-derived slide boundaries with a splitter that truncates a slide holding a nested
// `<section>` while leaving the slide COUNT correct, so a count-parity check passed it.
//
// Both times every gate stayed green: `npm test`, lint, typecheck and the cells above all
// pass with the fix reverted, because none of them opens the envelope. Two properties make
// this cell able to fail where they could not:
//   · it reads the envelope through `parseEnvelope` — the manifest is BASE64, so a plain
//     substring search of the file finds nothing and reports a leak as clean;
//   · it asserts the diagram BAKED, so a silent fallback to the un-baked static render
//     (which carries its comments and therefore strips correctly) cannot pass by accident.
test('the Studio webpage export honors Strip speaker notes, including on a slide with nested markup', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	const SECRET = 'CONFIDENTIALBOARDFIGURE42';
	await gotoStudio(page);
	// Slide 1 carries the nested `<section>` that defeated the first repair; slide 2 carries
	// a diagram, so the bake has something to prove it ran on.
	const F = String.fromCharCode(96, 96, 96);
	await setEditorContent(
		page,
		[
			'---', 'theme: indaco', '---', '',
			'# Cover', '',
			'<section class="inner"><p>nested</p></section>', '',
			'Tail copy.', '',
			// MULTI-PARAGRAPH on purpose. One comment, two paragraphs: the strip matcher
			// compares a comment's whole trimmed body, so any repair that re-derives the
			// note bodies by splitting the joined note on the blank line produces fragments
			// that match nothing — and this whole comment, secret included, ships in the
			// envelope. A single-line note cannot catch that.
			'<!--', 'Board only, do not share.', '', SECRET, '-->',
			'<!-- describe: A cover slide. -->', '',
			'---', '', '<!-- _class: diagram -->', '', '## Diagram', '',
			`${F}mermaid`, 'flowchart LR', '  A["Bake me"] --> B["Or fail loudly"]', F, '',
			'<!-- An ordinary note. -->', '',
		].join('\n'),
	);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('dialog').getByRole('button', { name: /^Webpage \(\.html\)/ }).click();
	await page.getByRole('switch', { name: 'Strip speaker notes' }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
	await page.getByRole('button', { name: /Download webpage|Exporting/ }).click();
	const file = path.join(testInfo.outputDir, 'stripped-export.html');
	await (await downloadPromise).saveAs(file);

	const html = await readFile(file, 'utf8');

	// The bake ran — without this, a fallback to the static render would strip correctly
	// and this cell would pass while the defect it guards was fully present.
	expect(html, 'the diagram baked (so a static-render fallback cannot mask the result)').toContain('>Bake me<');

	// The DOM carries no speaker text…
	expect(html, 'no notes sheet content survives the strip').not.toContain('class="lattice-notes"');
	// …and neither does the re-import source. `parseEnvelope` is the only way to see this:
	// the manifest is base64, so `html.includes(SECRET)` is false either way.
	const { parseEnvelope } = (await import('../../lib/core/lattice-doc.js')) as { parseEnvelope: (h: string) => { source?: string } };
	const envelopeSource = parseEnvelope(html).source || '';
	expect(envelopeSource, 'the envelope carries the deck source').toContain('# Cover');
	expect(envelopeSource, 'the note on the nested-markup slide is scrubbed from the envelope').not.toContain(SECRET);
	expect(envelopeSource, 'the ordinary slide is scrubbed too').not.toContain('An ordinary note.');
	// The scrub removes notes, not the deck: a directive must survive it intact.
	expect(envelopeSource, 'the scrub does not eat directives').toContain('_class: diagram');
	// The accessible description is a text alternative, not private speaker copy — it stays.
	expect(html, 'the a11y description survives a notes strip').toContain('class="lattice-description"');
});
