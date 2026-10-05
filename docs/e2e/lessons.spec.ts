import { CHROME, expect, gotoStudio, railButtons, test } from './studio-fixture';

// Studio lessons (engineering/decisions/2026-10-05-studio-lessons.md). Search is the help: typing
// "pdf" offers the action AND the lesson, and a lesson points at the real control, waits for the
// user, and does the step itself if they wait. The oracles are real cause and effect on the live
// Studio: the sheet the lesson opened, the dialog the user's own click opened.

test.describe.configure({ timeout: 90_000 });

const STAGE = '.vetrina-stage';
const PALETTE = 'Search or run a command…';

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

/** Open search the way each width offers it: ⌘K at desktop, the menu's search row on a phone. */
async function search(page: import('@playwright/test').Page, q: string): Promise<void> {
	if ((page.viewportSize()?.width ?? 1440) < 700) {
		await page.getByRole('button', { name: 'Menu' }).click();
		await page.getByRole('button', { name: 'Search / commands' }).click();
	} else {
		await page.keyboard.press('ControlOrMeta+k');
	}
	await page.getByPlaceholder(PALETTE).fill(q);
}

test('searching "pdf" offers the action and the lesson, and the action opens the PDF step @crosswidth', async ({ page }) => {
	await search(page, 'pdf');
	await expect(page.getByRole('option', { name: 'Export as PDF…', exact: true })).toBeVisible();
	await expect(page.getByRole('option', { name: 'How do I export a PDF?', exact: true })).toBeVisible();
	await page.getByRole('option', { name: 'Export as PDF…', exact: true }).click();
	await expect(page.locator('[data-demo="pdf-download"]')).toBeVisible();
});

test('a lesson does the steps itself when the user waits, and leaves the download to them @crosswidth', async ({ page }) => {
	await search(page, 'pdf');
	await page.getByRole('option', { name: 'How do I export a PDF?', exact: true }).click();
	await expect(page.locator(STAGE)).toBeVisible();
	await expect(page.locator(STAGE)).toContainText('Click Share');
	// Nobody touches anything: after the turn window the lesson opens Share, then picks PDF.
	await expect(page.locator('[data-demo="share-pdf"]')).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('[data-demo="pdf-download"]')).toBeVisible({ timeout: 20_000 });
	await expect(page.locator(STAGE)).toContainText('Download PDF', { timeout: 20_000 });
	// The last step is the user's: the lesson ends without exporting anything.
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 30_000 });
	await expect(page.locator('[data-demo="pdf-download"]')).toBeEnabled();
});

test('a lesson moves on when the user presses the control themselves', async ({ page }) => {
	await search(page, 'present');
	await page.getByRole('option', { name: 'How do I present?', exact: true }).click();
	await expect(page.locator(STAGE)).toContainText('Click Present');
	await page.locator('button[data-demo="present"]').click();
	await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
	await expect(page.locator(STAGE)).toContainText('arrow keys');
});

test('any other input ends the lesson at once', async ({ page }) => {
	await search(page, 'theme');
	await page.getByRole('option', { name: 'How do I change the theme?', exact: true }).click();
	await expect(page.locator(STAGE)).toBeVisible();
	await page.keyboard.press('a');
	await expect(page.locator(STAGE)).toHaveCount(0);
});

test('"Write a slide" with the editor hidden explains how to get it back and changes nothing', async ({ page }) => {
	await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
	const before = await page.evaluate(() => localStorage.length && JSON.stringify(Object.entries(localStorage).filter(([k]) => k.includes('deck'))));
	await search(page, 'write');
	await page.getByRole('option', { name: 'How do I write a slide?', exact: true }).click();
	await expect(page.locator(STAGE)).toContainText('Choose Write');
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 20_000 });
	expect(await page.evaluate(() => localStorage.length && JSON.stringify(Object.entries(localStorage).filter(([k]) => k.includes('deck'))))).toBe(before);
});

// BUILDING AND POLISH (P2 of the lessons work). Each oracle is the real effect the lesson promised,
// reached with nobody touching anything: the slide it added, the mode it flipped, the panel it opened.

test('"Add a chart" opens the gallery, types the search, and adds a bar chart when the user waits @crosswidth', async ({ page }) => {
	const before = await railButtons(page).count();
	await search(page, 'chart');
	await page.getByRole('option', { name: 'How do I add a chart?', exact: true }).click();
	await expect(page.locator('input[aria-label="Search slides"]')).toHaveValue('chart', { timeout: 30_000 });
	await expect(page.locator(STAGE)).toContainText('bars follow', { timeout: 30_000 });
	await expect.poll(() => railButtons(page).count(), { timeout: 10_000 }).toBe(before + 1);
});

test('"Switch light or dark" flips the mode when the user waits', async ({ page }) => {
	const mode = () => page.evaluate(() => document.documentElement.dataset.mode || 'light');
	const was = await mode();
	await search(page, 'dark');
	await page.getByRole('option', { name: 'How do I switch light or dark?', exact: true }).click();
	await expect.poll(mode, { timeout: 30_000 }).not.toBe(was);
	await expect(page.locator(STAGE)).toContainText('switch back', { timeout: 20_000 });
});

test('"Check my deck" opens Coach when the user waits', async ({ page }) => {
	await search(page, 'coach');
	await page.getByRole('option', { name: 'How do I check my deck?', exact: true }).click();
	await expect(page.locator(STAGE)).toContainText('These scores sum up the deck', { timeout: 30_000 });
	await expect(page.getByRole('button', { name: 'Toggle Coach' }).filter({ visible: true }).first()).toHaveAttribute('aria-pressed', 'true');
});

test('"Speaker notes" opens the notes field of the slide when the user waits', async ({ page }) => {
	await search(page, 'notes');
	await page.getByRole('option', { name: 'How do I add speaker notes?', exact: true }).click();
	await expect(page.getByLabel('Speaker note for this slide').filter({ visible: true })).toBeVisible({ timeout: 40_000 });
	await expect(page.locator(STAGE)).toContainText('saves with the deck', { timeout: 20_000 });
});

// REACH (P3 of the lessons work): lessons are found from the whole site, finished ones are
// remembered, and a panel offers its lesson the first time someone opens it.

test('a site search for "pdf" opens the Studio running the PDF lesson @crosswidth', async ({ page }) => {
	await page.goto('/');
	// The header is an island: a click before it hydrates does nothing, so click until the dialog opens.
	const field = page.getByPlaceholder('Search docs, jump to a page, switch theme…');
	await expect(async () => {
		await page.getByRole('button', { name: 'Search (⌘K)' }).filter({ visible: true }).first().click();
		await expect(field).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 20_000 });
	await field.fill('pdf');
	await page.getByRole('option', { name: 'How do I export a PDF?', exact: true }).click();
	await expect(page).toHaveURL(/\/studio\//);
	await expect(page.locator(STAGE)).toContainText('Click Share', { timeout: 30_000 });
	// The param is spent as the lesson starts, so a reload does not replay it.
	expect(new URL(page.url()).searchParams.get('lesson')).toBeNull();
});

test('a finished lesson is remembered: search marks it Done and the toast offers the next one', async ({ page }) => {
	await search(page, 'dark');
	await page.getByRole('option', { name: 'How do I switch light or dark?', exact: true }).click();
	// Running first: the engine loads on start, so "no stage" is also what the page shows before it.
	await expect(page.locator(STAGE)).toBeVisible();
	await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 60_000 });
	await expect(page.getByText(/^Lesson done\. Next: How do I /)).toBeVisible();
	await gotoStudio(page); // a fresh load, waited until the Studio is ready; storage survives it
	await search(page, 'dark');
	await expect(page.locator('[data-lesson="light-dark"]')).toHaveAttribute('data-done', 'true');
	await expect(page.locator('[data-lesson="light-dark"]')).toContainText('Done');
});

test('opening Coach offers its lesson once, and never again', async ({ page }) => {
	const offer = page.getByText('New to Coach? A short lesson shows you around.');
	await search(page, 'coach');
	await page.getByRole('option', { name: 'Coach — check this deck', exact: true }).click();
	await expect(offer).toBeVisible();
	await gotoStudio(page); // a fresh load, waited until the Studio is ready; storage survives it
	await search(page, 'coach');
	await page.getByRole('option', { name: 'Coach — check this deck', exact: true }).click();
	// The offer is raised by the effect of the render that mounts the Coach card, so by the time the
	// card is visible a second offer would already be on screen.
	await expect(page.locator('[data-demo="coach-read"]')).toBeVisible();
	await expect(offer).toHaveCount(0);
});

// THE PHONE, ON SAFARI'S ENGINE, WITH REAL TAPS. The two phone claims in #2529 — a tapped palette
// result runs (it did nothing on `main`: the tap blurred the field, the sheet shrank 54px and the
// row slid out from under the finger), and a lesson completes on a phone — were verified only in
// Chromium with mouse clicks. WebKit is not installed in the sandbox; run this through the nightly
// workflow's `spec` input (engineering/development.md §Studio e2e suite).
test.describe('on an iPhone, by touch @webkit-phone', () => {
	async function tapSearch(page: import('@playwright/test').Page, q: string): Promise<void> {
		await page.getByRole('button', { name: 'Menu' }).tap();
		await page.getByRole('button', { name: 'Search / commands' }).tap();
		await page.getByPlaceholder(PALETTE).fill(q);
	}

	test('tapping a search result runs it', async ({ page }) => {
		await tapSearch(page, 'pdf');
		await page.getByRole('option', { name: 'Export as PDF…', exact: true }).tap();
		await expect(page.locator('[data-demo="pdf-download"]')).toBeVisible();
	});

	test('a lesson started by tap does the steps when the user waits', async ({ page }) => {
		await tapSearch(page, 'pdf');
		await page.getByRole('option', { name: 'How do I export a PDF?', exact: true }).tap();
		await expect(page.locator(STAGE)).toContainText('Click Share');
		await expect(page.locator('[data-demo="share-pdf"]')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('[data-demo="pdf-download"]')).toBeVisible({ timeout: 20_000 });
		await expect(page.locator(STAGE)).toHaveCount(0, { timeout: 30_000 });
	});

	// THE VOICE ON SAFARI'S ENGINE. iOS plays WebAudio only from a context unlocked inside a user
	// gesture, and a lesson builds its narrator inside the tap that picks it (use-studio-lesson.ts
	// §THE VOICE). This records, in the page, every decoded clip that starts playing and the
	// context's state at that moment, so "the lesson spoke" is measured rather than assumed.
	test('a lesson started by tap speaks: its first clip plays on a running AudioContext', async ({ page }) => {
		await page.addInitScript(() => {
			const w = window as unknown as { __played: { sec: number; state: string }[] };
			w.__played = [];
			const start = AudioBufferSourceNode.prototype.start;
			AudioBufferSourceNode.prototype.start = function (...a: Parameters<typeof start>) {
				// Past the 1-sample unlock blip and the keep-alive tone: a real clip is longer than 0.3s.
				if (this.buffer && this.buffer.duration > 0.3) w.__played.push({ sec: this.buffer.duration, state: this.context.state });
				return start.apply(this, a);
			};
		});
		await gotoStudio(page); // again, so the probe is installed before the Studio boots
		await tapSearch(page, 'pdf');
		await page.getByRole('option', { name: 'How do I export a PDF?', exact: true }).tap();
		await expect(page.locator(STAGE)).toContainText('Click Share');
		const played = () => page.evaluate(() => (window as unknown as { __played: { sec: number; state: string }[] }).__played);
		await expect.poll(async () => (await played()).length, { timeout: 15_000 }).toBeGreaterThan(0);
		const [first] = await played();
		// "…under Share. Click Share." is recorded at 3.0s; the clip, not the 1-sample unlock, played.
		expect(first.sec).toBeGreaterThan(2);
		expect(first.state).toBe('running');
	});

	test('a tap on the control the lesson points at is the user’s turn, not a take-over', async ({ page }) => {
		await tapSearch(page, 'present');
		await page.getByRole('option', { name: 'How do I present?', exact: true }).tap();
		await expect(page.locator(STAGE)).toContainText('Click Present');
		await page.locator('button[data-demo="present"]:visible').tap();
		await expect(page.getByRole('dialog', { name: 'Present' })).toBeVisible();
		await expect(page.locator(STAGE)).toContainText('arrow keys');
	});
});
