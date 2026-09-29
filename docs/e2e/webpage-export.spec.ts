import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, gotoStudio, SHARE_EXPORTS, setEditorContent, test } from './studio-fixture';

/** Open an exported artifact and read its slide sections back out of a real DOM. */
async function exportedSections(page: import('@playwright/test').Page, file: string): Promise<string[]> {
	const viewer = await page.context().newPage();
	await viewer.goto(`file://${file}`);
	const out = await viewer.evaluate(() =>
		[...document.querySelectorAll('section[data-lattice-slide]')].map((s) => s.outerHTML));
	await viewer.close();
	return out;
}

/**
 * Drive the real Share → Webpage (.html) flow and return the path of the file it downloaded.
 *
 * Saved with a real `.html` name on purpose: `download.path()` is an extension-less temp file
 * that `file://` will not parse as HTML, so the inline script never runs — which would mask
 * exactly the kind of bug these cells open the artifact to find.
 */
async function exportWebpage(
	page: import('@playwright/test').Page,
	testInfo: import('@playwright/test').TestInfo,
	deck: string,
	opts: { stripNotes?: boolean; as: string },
): Promise<string> {
	await gotoStudio(page);
	await setEditorContent(page, deck);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	// The ROW and CONFIRM labels come from the fixture's `SHARE_EXPORTS` contract, never from
	// literals here. Four specs open-coding this two-step flow is what #1507 cost a month of
	// timeouts against a working pipeline, and the contract exists so a chrome rename is one
	// edit. The two clicks still happen HERE rather than through `shareExport`, because the
	// strip-notes switch lives between them and the download oracle must be armed before the
	// second — neither of which that helper's shape can express.
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	if (opts.stripNotes) await page.getByRole('switch', { name: 'Strip speaker notes' }).click();
	const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	const file = path.join(testInfo.outputDir, opts.as);
	await (await downloadPromise).saveAs(file);
	return file;
}

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

// ── The two-cut measurement, on the button ───────────────────────────────────
//
// #1985 closed a fingerprint: the scrub removed each note's comment NODE from already-rendered
// HTML and left the whitespace it occupied, so a stripped slide carried one byte more than the
// same slide written without a note — naming WHICH slides had one, computable by the RECIPIENT
// from the shipped file alone, because the envelope carries the deck's own scrubbed source to
// re-render. The repair renders the SCRUBBED SOURCE instead.
//
// But a note comment is an HTML BLOCK, so removing it can move the deck — and the `text / note /
// text` case has TWO right answers, which is why the export measures instead of deciding. Both
// cells below pin one answer on the REAL artifact, because that is the thing every other tier
// could not see: `stripNotesCut` has unit coverage against a fake renderer, and the CLI has
// integration coverage on real exports, but until these the Studio's own button was inferred
// from a shared kernel rather than driven. That inference is exactly what went wrong once
// already — the button shipped with a single cut for one commit while the CLI had two.
test('the Studio webpage export keeps the deck the author wrote — the note was the slide break', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	// `Some text` / note / `---`: the author gets TWO slides, because `---` after an HTML block
	// is a slide break. Delete the comment LINE and `Some text\n---` is a setext H2 — one slide,
	// and a heading the author never wrote. So the `preserve` cut has to win here.
	const DECK = ['---', 'theme: indaco', '---', '', '# Cover', '', '---', '', 'Some text', '<!-- Board only. -->', '---', '', 'Tail.', ''];
	// The same deck as an author who never wrote a note would type it. Committed here rather than
	// derived from the deck above, so this asserts the scrub agrees with a HUMAN's file — deriving
	// it in the test would only assert the scrub agrees with a copy of itself.
	const TWIN = ['---', 'theme: indaco', '---', '', '# Cover', '', '---', '', 'Some text', '', '---', '', 'Tail.', ''];

	const sectionsOf = (file: string) => exportedSections(page, file);

	const stripped = await exportWebpage(page, testInfo, DECK.join('\n'), { stripNotes: true, as: 'noted-stripped.html' });
	const twin = await exportWebpage(page, testInfo, TWIN.join('\n'), { stripNotes: false, as: 'twin.html' });

	const a = await sectionsOf(stripped);
	const b = await sectionsOf(twin);

	// ANCHOR FIRST. Every assertion below is an equality or a negation, and all of them are
	// satisfied by the empty set — measured: with zero sections found, this whole cell passes.
	// Two ways that happens without anyone noticing: `section[data-lattice-slide]` gets renamed
	// so `exportedSections` returns nothing, or `setEditorContent` silently no-ops (the
	// selector-drift class the fixture documents for #780/#1507) and BOTH exports are the
	// default seed deck. So pin what this deck must actually contain before comparing.
	expect(a.length, 'the export produced the three slides this deck declares').toBe(3);
	expect(a.join(''), 'the export is THIS deck, not the Studio’s default seed').toContain('Some text');
	// The deck did not gain or lose a slide, and the `---` did not become a heading.
	expect(a.length, 'the stripped export has the slide count the author wrote').toBe(b.length);
	expect(a.join(''), 'the slide break did not turn into a setext heading').not.toMatch(/<h2[^>]*>Some text/);
	// THE ACCEPTANCE CRITERION. Byte-identical rendered sections: with the fingerprint present,
	// the noted slide differs from its twin by the whitespace the comment left behind.
	expect(a, 'a stripped export is byte-identical to the same deck written without the note').toEqual(b);
});

test('the Studio webpage export keeps a tight list tight — the note was inside a list item', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	// The opposite answer, same neighbors. An indented note inside a list item: leave a BLANK
	// line where it was and the tight list turns LOOSE (`<li>Revenue…` becomes `<li><p>Revenue…`),
	// a visible change to a deck that did nothing unusual. Taking the line reproduces it exactly,
	// so the `drop` cut has to win. A single-cut export gets one of these two cells wrong.
	const DECK = ['---', 'theme: indaco', '---', '', '# Numbers', '', '- Revenue up 12 percent', '  <!-- Board only. -->', '- Costs flat', ''];
	const TWIN = ['---', 'theme: indaco', '---', '', '# Numbers', '', '- Revenue up 12 percent', '- Costs flat', ''];

	const listShape = async (file: string) => {
		const viewer = await page.context().newPage();
		await viewer.goto(`file://${file}`);
		const out = await viewer.evaluate(() => {
			// SCOPED TO THE SLIDES. A bare `li` query also catches the player's own chrome — it
			// returned 4 on a two-item deck — so an unscoped count measures the viewer as much as
			// the deck, and the tightness ratio it feeds would be diluted by furniture that has
			// nothing to do with the scrub.
			const items = [...document.querySelectorAll('section[data-lattice-slide] li')];
			return { items: items.length, wrapped: items.filter((li) => li.querySelector(':scope > p')).length };
		});
		await viewer.close();
		return out;
	};

	const stripped = await exportWebpage(page, testInfo, DECK.join('\n'), { stripNotes: true, as: 'list-stripped.html' });
	const twin = await exportWebpage(page, testInfo, TWIN.join('\n'), { stripNotes: false, as: 'list-twin.html' });

	const a = await listShape(stripped);
	const b = await listShape(twin);
	// ANCHOR, for the reason the cell above gives at length: `0 === 0` passes every comparison
	// here, so a renamed selector or a no-op seed would certify a scrub nobody observed.
	expect(a.items, 'the export produced the two list items this deck declares').toBe(2);
	expect(a.items, 'both items survive').toBe(b.items);
	expect(a.wrapped, 'the list stayed TIGHT — a blank line in the note’s place would wrap each item in <p>').toBe(b.wrapped);
	expect(a.wrapped, 'the authored list is tight to begin with, so this cell can fail').toBe(0);
	// And the fingerprint is gone. Tightness alone passes on a build that scrubs the RENDER
	// instead of the source — it never touches the list — so without this the cell is vacuous
	// against exactly the version this PR replaces. Verified: it fails on that build.
	expect(await exportedSections(page, stripped), 'byte-identical to the same deck written without the note')
		.toEqual(await exportedSections(page, twin));
});

test('the Studio webpage export stands down loudly when NO cut reproduces the deck', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	// The third outcome, and the only one where the promise degrades — so it is the one worth
	// driving on the real button rather than reasoning about. A note at COLUMN 0 between two list
	// items is what splits them into two lists: leave a blank line in its place and they become
	// one loose list, take the line and they become one tight list. Neither is the deck the author
	// wrote, so the export keeps the SLIDES as written and says so.
	//
	// What must still hold is the privacy half. The note text goes from the DOM and from the
	// envelope either way; what is given up is only the concealment of WHICH slide carried one.
	const SECRET = 'BOARDONLYFIGURE99';
	const DECK = ['---', 'theme: indaco', '---', '', '# Numbers', '', '- Revenue up 12 percent', `<!-- ${SECRET} -->`, '- Costs flat', ''];

	const warnings: string[] = [];
	page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
	const file = await exportWebpage(page, testInfo, DECK.join('\n'), { stripNotes: true, as: 'fallback.html' });
	const html = await readFile(file, 'utf8');

	// The privacy promise holds: no note text in the DOM, and none in the re-import source.
	expect(html, 'the note text is gone from the DOM').not.toContain(SECRET);
	const { parseEnvelope } = (await import('../../lib/core/lattice-doc.js')) as { parseEnvelope: (h: string) => { source?: string } };
	const envelope = parseEnvelope(html).source || '';
	// Anchor before negating: `|| ''` makes the absence check vacuous if the envelope ever
	// carries the deck under a different key, and an absence assertion against nothing passes.
	expect(envelope, 'the envelope carries THIS deck').toContain('# Numbers');
	expect(envelope, 'the note text is gone from the envelope').not.toContain(SECRET);

	// The deck was NOT restructured: the author's two separate lists are still two lists.
	const lists = await (async () => {
		const viewer = await page.context().newPage();
		await viewer.goto(`file://${file}`);
		const n = await viewer.evaluate(() => document.querySelectorAll('section[data-lattice-slide] ul').length);
		await viewer.close();
		return n;
	})();
	expect(lists, 'the author’s two lists survive — the export did not merge them').toBe(2);

	// And it said so, naming the cause and the fix. This is the one path where the author has to
	// edit the deck to get the concealment back, so a bare "something changed" is not enough.
	const said = warnings.join(' ');
	expect(said, 'the export warned that no cut reproduced the deck').toMatch(/could not remove a note comment/);
	expect(said, 'the warning names the cause').toMatch(/column 0 BETWEEN two list items/);
	expect(said, 'the warning names the fix').toMatch(/move the note inside an item, or out of the list/);
});

test('the Studio webpage export styles a <section> nested in a slide as a panel, not a slide', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	// The Studio player used to DELETE the `article.lattice > ` prefix, turning "a slide" into "any
	// section": a raw `<section>` an author nests in a slide took the 1280×720 slide box,
	// `overflow:hidden`, and inside a `dark` slide the light tokens, and both slides clipped. It
	// now runs the CLI's own `unwrapFlatSheet` (lib/export/unwrap-flat-sheet.mjs).
	const DECK = ['---', 'theme: indaco', '---', '', '<!-- _class: dark -->', '', '# Dark slide', '', '<section class="note">', 'A nested panel.', '</section>', ''];
	const file = await exportWebpage(page, testInfo, DECK.join('\n'), { as: 'nested-section.html' });
	const viewer = await page.context().newPage();
	await viewer.goto(`file://${file}`);
	const got = await viewer.evaluate(() => {
		const slide = document.querySelector('section[data-lattice-slide]') as HTMLElement;
		const nested = slide.querySelector('section') as HTMLElement;
		const box = (el: HTMLElement) => ({ w: el.getBoundingClientRect().width, overflow: getComputedStyle(el).overflow, bg: getComputedStyle(slide).getPropertyValue('--bg').trim(), nestedBg: getComputedStyle(el).getPropertyValue('--bg').trim() });
		return { slide: box(slide), nested: nested ? box(nested) : null };
	});
	await viewer.close();
	expect(got.nested, 'the nested section survives into the export').not.toBeNull();
	expect(got.slide.overflow, 'the top-level slide is still a slide').toBe('hidden');
	expect(got.nested?.overflow, 'the nested section is not given the slide’s overflow').not.toBe('hidden');
	expect(got.nested?.w, 'the nested section is not given the slide’s 1280px box').toBeLessThan(got.slide.w);
	expect(got.nested?.nestedBg, 'the nested section inherits the dark slide’s tokens').toBe(got.slide.bg);
});

// PICTURES BY URL (followup 2358-p2). The player's policy is `img-src data:`, so a picture it
// shows has to be IN the file. The Studio used to embed nothing, and a `![bg]` panel, an `<img>`
// and a video poster from the site's own origin all came out blank while the preview showed
// them. Now each is fetched from this origin and embedded; a picture it could not fetch, and one
// from another site (never fetched at export time), are named in the completion toast.
test('the Studio webpage export embeds same-origin pictures and reports the rest', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	const DECK = [
		'---',
		'theme: indaco',
		'---',
		'',
		'![bg left](/showcase/roadmap.light.webp)',
		'',
		'# A same-origin background',
		'',
		'---',
		'',
		'## A same-origin image, a missing one and a web one',
		'',
		'![Icon](/icons/icon-192.png) ![Gone](/no-such-picture.png) ![Web](https://example.com/web.jpg)',
		'',
		'---',
		'',
		'<!-- _class: video -->',
		'',
		'## Watch the tour.',
		'',
		'- https://www.youtube.com/watch?v=aqz-KE-bpKQ',
		'- /showcase/kpi.light.webp `poster`',
		'',
	].join('\n');
	const file = await exportWebpage(page, testInfo, DECK, { as: 'url-media.html' });
	await expect(page.getByText(/Webpage ready — but/)).toContainText(/1 image could not be embedded \(\/no-such-picture\.png: the server answered 404\)/);
	await expect(page.getByText(/Webpage ready — but/)).toContainText(/images from example\.com ship as placeholders/);

	const viewer = await page.context().newPage();
	const refused: string[] = [];
	viewer.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) refused.push(m.text()); });
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	const got = await viewer.evaluate(() => {
		const slides = [...document.querySelectorAll('section[data-lattice-slide]')] as HTMLElement[];
		// The Studio's engine draws `![bg left]` on the slide itself (web mode); the CLI's split
		// panel is `.lattice-bg`. Read whichever carries the picture.
		const bg = (slides[0]?.querySelector('.lattice-bg') as HTMLElement | null) ?? slides[0] ?? null;
		const imgs = [...(slides[1]?.querySelectorAll('img') ?? [])] as HTMLImageElement[];
		const poster = slides[2]?.querySelector('a.video-poster') as HTMLElement | null;
		const thumb = document.querySelector('#lp-article .lp-video-thumb') as HTMLElement | null;
		return {
			bg: bg ? getComputedStyle(bg).backgroundImage.slice(0, 30) : null,
			icon: imgs[0] ? { src: imgs[0].src.slice(0, 22), loaded: imgs[0].complete && imgs[0].naturalWidth > 0 } : null,
			poster: poster ? getComputedStyle(poster).backgroundImage.slice(0, 30) : null,
			thumb: thumb ? thumb.style.backgroundImage.slice(0, 30) : null,
			articleImg: (document.querySelector('#lp-article img[alt="Icon"]') as HTMLImageElement | null)?.src.slice(0, 22) ?? null,
			// The failed picture and the web one both draw the placeholder, never a broken-image mark.
			placeholders: imgs.filter((i) => i.hasAttribute('data-lattice-web-src')).map((i) => i.getAttribute('data-lattice-web-src')),
		};
	});
	await viewer.close();
	expect(got.bg, 'the ![bg] panel carries its picture').toMatch(/^url\("data:image\/webp;base64,/);
	expect(got.icon, 'the <img> is embedded and decodes').toEqual({ src: 'data:image/png;base64,', loaded: true });
	expect(got.poster, 'the video poster is embedded').toMatch(/^url\("data:image\/webp;base64,/);
	expect(got.thumb, 'Read · Article keeps the embedded poster').toMatch(/^url\("?data:image\/webp;base64,/);
	expect(got.articleImg, 'Read · Article keeps the embedded image').toBe('data:image/png;base64,');
	expect(got.placeholders, 'the missing picture and the web one ship as the placeholder').toEqual([expect.stringMatching(/\/no-such-picture\.png$/), 'https://example.com/web.jpg']);
	expect(refused.filter((t) => /showcase|icon-192/.test(t)), 'no embedded picture is refused by the policy').toEqual([]);
});

// THE OPT-IN (PR #2495, the owner's call): with "Embed pictures from other sites" on, the author's
// browser fetches the other site's picture at export time and the FILE carries it — the recipient
// still loads nothing on open. The other site is stubbed with a CORS header, which a real host
// must send for a page to read its bytes; one that does not is reported in the toast instead.
test('the Studio webpage export embeds another site’s picture when the author opts in', async ({ page }, testInfo) => {
	test.setTimeout(180_000);
	const png = await readFile(new URL('../public/icons/icon-192.png', import.meta.url));
	await page.route('https://pictures.example/**', (route) =>
		route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: png }),
	);
	const DECK = ['---', 'theme: indaco', '---', '', '## Another site’s picture', '', '![Web](https://pictures.example/icon.png)', ''].join('\n');
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.row }).click();
	const sw = page.getByRole('switch', { name: 'Embed pictures from other sites' });
	await expect(sw, 'off by default').toHaveAttribute('aria-checked', 'false');
	await sw.click();
	const downloadPromise = page.waitForEvent('download', { timeout: 150_000 });
	await dialog.getByRole('button', { name: SHARE_EXPORTS.webpage.confirm }).click();
	const file = path.join(testInfo.outputDir, 'web-opt-in.html');
	await (await downloadPromise).saveAs(file);

	const viewer = await page.context().newPage();
	const requests: string[] = [];
	viewer.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) requests.push(r.url()); });
	await viewer.goto(`file://${file}`, { waitUntil: 'networkidle' });
	const img = await viewer.evaluate(() => {
		const i = document.querySelector('section[data-lattice-slide] img[alt="Web"]') as HTMLImageElement | null;
		return i ? { src: i.src.slice(0, 22), loaded: i.complete && i.naturalWidth > 0 } : null;
	});
	await viewer.close();
	expect(img, 'the other site’s picture is inside the file and decodes').toEqual({ src: 'data:image/png;base64,', loaded: true });
	expect(requests, 'opening the file contacts no site').toEqual([]);
});
