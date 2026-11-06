import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// One unreachable image used to cost the whole export. The capture fetches every
// embedded image itself; a failed fetch left the clone with an empty `src`, whose
// `onerror` rejected — so a deck whose `logo:` is a path relative to the deck FILE
// (correct for the CLI, unresolvable on the web) produced no PDF at all. That is the
// failure a real author hit on a real phone.
//
// The deck is the deliverable, so the export now degrades: the picture is left out,
// the file lands, and the toast NAMES what is missing. This drives the real Studio
// and asserts both halves — the pages exist, and the author was told.
test.describe.configure({ timeout: 240_000 });

const BROKEN = '/this-image-does-not-exist-4f2a.png';
const DECK = [
	`<!-- _class: big-number -->\n\n\`Intact\`\n\n- 1\n  - This slide has nothing to fetch.`,
	`<!-- _class: content -->\n\n# The slide with a broken path\n\n![A logo that cannot be fetched](${BROKEN})\n\nThe copy around it still renders.`,
].join('\n\n---\n\n');

test('a deck with an unreachable image still exports, and the toast says what is missing', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(2);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();

	// It exported at all — which is the whole fix.
	const file = await download;
	const path = await file.path();
	expect(path).toBeTruthy();
	const doc = await PDFDocument.load(new Uint8Array(readFileSync(path as string)), { updateMetadata: false });
	expect(doc.getPageCount()).toBe(2);

	// And the author was told, in the toast — which persists, unlike the progress line.
	const toast = page.locator('[data-sonner-toast]');
	await expect(toast).toContainText(/PDF ready — but/i);
	await expect(toast).toContainText(/could not load every image/i);
	// Named, not merely counted. Before this, the only thing the export could say about
	// a failing image was "unexpected error".
	await expect(toast).toContainText(BROKEN);
	// And it does NOT blame deck-relative resolution for a path that is not relative.
	// This fixture is rooted, and the hint used to be appended unconditionally — to this
	// very toast — sending the author to look in a place the problem cannot be.
	await expect(toast).not.toContainText(/relative to the deck file/i);
});

// A web background the deck has not allowed is not a missing picture: the capture draws the hatch for it on
// purpose. The missing-picture probe used to ask for it anyway (`new Image().src`), so the frame's policy refused
// it and the toast named it as lost (followups.d/3022-p2-export-probe). The renderer rewrites a web address the
// author writes in the deck before the probe reads it; the THEME's CSS reaches the capture frame as written,
// guarded by the frame's policy alone. So this serves the real theme sheet with one rule added that names a web
// picture, which is the shape a theme with a web background takes, and drives the real PDF export.
const WEB_BG = 'https://tracker.example/pixel-9c1e.png';

// Registered twice: untagged it runs in Chromium (`desktop`), and the `desktop` project leaves out a WebKit-tagged
// title, so the tagged copy is what runs it in real WebKit (iPad landscape) and Gecko.
for (const tags of ['', ' @webkit-tablet @gecko']) test(`the export never names a web background the deck has not allowed as missing${tags}`, async ({ page }) => {
	const asked: string[] = [];
	await page.context().route('https://tracker.example/**', (route) => {
		asked.push(route.request().url());
		return route.fulfill({ status: 404 });
	});
	await page.context().route(/\/playground\/v\/[^/]+\/themes\/[^/]+\.css$/, async (route) => {
		const res = await route.fetch();
		const css = await res.text();
		return route.fulfill({ response: res, body: `${css}\nsection.web-bg-probe { background-image: url(${WEB_BG}) !important; }\n` });
	});
	await gotoStudio(page);
	await setEditorContent(page, [
		`<!-- _class: content web-bg-probe -->\n\n# A web background\n\nThe deck has not allowed this site.`,
		`<!-- _class: content -->\n\n# The slide with a broken path\n\n![A logo that cannot be fetched](${BROKEN})\n\nThe copy around it still renders.`,
	].join('\n\n---\n\n'));
	await expect(railButtons(page)).toHaveCount(2);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const file = await download;
	expect(await file.path()).toBeTruthy();

	// The toast settles on "PDF ready — but …" for the broken path. Firefox names that path less often than Chromium
	// does (it can say "at least one"), so the settle anchor is the sentence, and what is held is the web address.
	const toast = page.locator('[data-sonner-toast]');
	await expect(toast).toContainText(/PDF ready — but/i);
	await expect(toast).not.toContainText('tracker.example');
	expect(asked).toEqual([]);
});

// The properties the capture's web sweep does not read (`WEB_URL_PROPS`, deck-export.js), each naming its own web address
// from the THEME, the one channel that reaches the capture frame as written, plus an SVG `<feImage>` written in the deck
// (the renderer keeps it; it deletes a `<use href>` naming another site, so there is none here). In a frame with no policy
// (the spine note's "The export's web sweep, measured"), Chromium requests eight of these, WebKit five and Firefox two, at
// the frame's load and again whenever its style is read, so no sweep can stop them. The capture frame's policy does, so
// this holds the policy in the real export, for each property in the engines that request it. A frame built without the
// policy fails here. And a web picture the deck has not allowed is no missing picture: the toast must not say one is.
const T = 'https://tracker.example';
const WEB_PROPS_THEME = [
	`section.web-props h1 { -webkit-box-reflect: below 0 url(${T}/box-reflect.png); }`,
	`section.web-props p:first-of-type { mask-border-source: url(${T}/mask-border.png); mask-border-slice: 1 fill; }`,
	`section.web-props p:last-of-type { -webkit-mask-box-image: url(${T}/mask-box-image.png) 1 fill; }`,
	`section.web-props svg { clip-path: url(${T}/clip-path.svg#c); }`,
	`section.web-props svg rect { fill: url(${T}/fill.svg#p); stroke: url(${T}/stroke.svg#p); }`,
	`section.web-props svg path { marker-start: url(${T}/marker.svg#m); mask: url(${T}/mask.svg#k); }`,
].join('\n');
const WEB_PROPS_SLIDE = [
	'<!-- _class: content web-props -->',
	'# Every property that can fetch a picture',
	'The first paragraph carries a mask border.',
	`<svg width="200" height="80" viewBox="0 0 200 80"><filter id="wp-fe"><feImage href="${T}/feimage.png"/></filter><rect width="90" height="60" filter="url(#wp-fe)"/><path d="M110 10L190 70" stroke="currentColor"/></svg>`,
	'The last paragraph carries a WebKit mask box image.',
].join('\n\n');

for (const tags of ['', ' @webkit-tablet @gecko']) test(`the export requests no web picture through a property the sweep does not read${tags}`, async ({ page }) => {
	const asked: string[] = [];
	await page.context().route(`${T}/**`, (route) => {
		asked.push(route.request().url());
		return route.fulfill({ status: 404 });
	});
	await page.context().route(/\/playground\/v\/[^/]+\/themes\/[^/]+\.css$/, async (route) => {
		const res = await route.fetch();
		return route.fulfill({ response: res, body: `${await res.text()}\n${WEB_PROPS_THEME}\n` });
	});
	await gotoStudio(page);
	await setEditorContent(page, WEB_PROPS_SLIDE);
	await expect(railButtons(page)).toHaveCount(1);

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	const file = await download;
	const doc = await PDFDocument.load(new Uint8Array(readFileSync((await file.path()) as string)), { updateMetadata: false });
	expect(doc.getPageCount()).toBe(1);
	const toast = page.locator('[data-sonner-toast]');
	await expect(toast).toContainText(/PDF ready/i);
	await expect(toast).not.toContainText(/could not load every image/i);
	expect(asked).toEqual([]);
});
