import { CHROME, expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

// ── The Reading view shows a slide's placed photo, and only the image plugin's own (HARD RULE #22) ──
//
// An `image` slide draws its photo as a CSS background panel, so the article re-hosts it as an <img>
// (`withPanelPicture`, lib/transformers/prose-projection.mjs). The re-host trusts only a panel carrying
// the image plugin's `data-lattice-media` marker, which author HTML cannot forge. This drives the real
// surface a human reads: the record's photo arrives, and an author's hidden raw `.lattice-bg` decoy put
// in front of it (the red team's attack on #3126) does not. The photo is a record: a lone `![…](…)` beside a raw panel stays in
// the text, because the engine reads the raw panel as the slide's photo already (inversion F1), so only a record draws a
// marked panel next to the decoy. The decoy's address is a `data:` picture, so
// neither the web-image blocker nor `safePosterUrl` refuses it: only the marker check keeps it out.
// `@gecko` runs on desktop Chromium and on Firefox; `@webkit-tablet` runs on WebKit only, so the body is registered twice
// (read-article-beacons.spec.ts does the same).

const DECOY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DECK = [
	'<!-- _class: image -->',
	'',
	'## The lake at dawn',
	'',
	'The lead paragraph.',
	'',
	`<div class="lattice-bg" hidden style="display:none;background-image:url('${DECOY}')" aria-label="Forged caption"></div>`,
	'',
	'`@image{sample:photo-wide.jpg, title="The lake"}`',
	'',
	'After the photo.',
].join('\n');

const readingViewShowsOnlyThePlacedPhoto = async ({ page }: { page: import('@playwright/test').Page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(livePreview(page).locator('section.image .lattice-bg[data-lattice-media="image"]')).toHaveCount(1, { timeout: 60_000 });
	await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
	await page.getByRole('button', { name: CHROME.readArticle }).click();
	const article = page.locator('article.st-read-article');
	await expect(article).toBeVisible({ timeout: 60_000 });

	const photo = article.locator('img[alt="The lake"]');
	await expect(photo).toHaveCount(1, { timeout: 30_000 });
	await expect(photo).toHaveAttribute('src', /photo-wide/);
	// The photo really draws: a decoded picture with a real box, after the lead and before the next paragraph.
	await expect.poll(() => photo.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
	const text = await article.innerText();
	expect(text.indexOf('The lead paragraph.')).toBeLessThan(text.indexOf('After the photo.'));

	await expect(article.locator('img')).toHaveCount(1);
	await expect(article.locator('img[src^="data:"]')).toHaveCount(0);
	await expect(article).not.toContainText('Forged caption');
	expect(await article.innerHTML()).not.toContain('Forged caption');
};

test('the Reading view shows the placed photo and never an author\'s decoy panel @gecko', readingViewShowsOnlyThePlacedPhoto);
test('the Reading view shows the placed photo and never an author\'s decoy panel (WebKit) @webkit-tablet', readingViewShowsOnlyThePlacedPhoto);
