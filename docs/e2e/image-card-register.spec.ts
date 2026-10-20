import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspectorTab, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// The `image-card:` register's two Studio surfaces: the deck Image tab in deck settings, and the
// per-slide Image tab in Slide settings on an image slide. Asserted on the persisted source,
// which is what the engine reads. Modeled on card-tag-register.spec.ts.

const SLIDE = '<!-- _class: image spotlight -->\n\n## A photo.\n\nThe words.\n\n![bg](sample:photo-wide.svg)\n';
const DECK = `---\ntitle: Photos\n---\n\n${SLIDE}`;

test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
});

async function choose(page: Page, label: string, option: string): Promise<void> {
	await page.getByRole('combobox', { name: label }).filter({ visible: true }).first().click();
	await page.getByRole('option', { name: option, exact: true }).click();
}

// The backing is a slider with the four names as chips (a ToggleGroup, so each chip is a radio).
// `Card backing` / `Slide card backing` name the slider; the chips name themselves by level.
function chip(page: Page, name: string) {
	return page.getByRole('radio', { name, exact: true }).filter({ visible: true }).first();
}
// The backing control says when the photo behind the card has been read ahead, which is when a thin
// step becomes ONE edit; a test about that waits on this, never on a timer.
async function inkReady(page: Page): Promise<void> {
	await expect(page.locator('[data-ink-ready="true"]').filter({ visible: true }).first()).toBeVisible();
}
function slider(page: Page, name: string) {
	return page.getByRole('slider', { name }).filter({ visible: true }).first();
}

async function openSlideImageTab(page: Page): Promise<void> {
	// At 390px the bottom bar's Settings opens both scopes behind a Slide | Deck switch.
	const slideButton = page.getByRole('button', { name: CHROME.slideSettings }).filter({ visible: true });
	if (await slideButton.count()) await slideButton.first().click();
	else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
		await page.getByRole('button', { name: 'Slide scope', exact: true }).filter({ visible: true }).first().click();
	}
	await openSection(page, CHROME.slideTab.image);
}

for (const tag of ['', ' @webkit-tablet']) {
	test(`deck settings: the Image tab writes one \`image-card:\` line from its controls${tag}`, async ({ page }) => {
		await openInspectorTab(page, 'image');
		await choose(page, 'Card placement', 'Top right');
		await expect.poll(() => persistedSource(page)).toContain('\\nimage-card: top-right\\n');
		await chip(page, 'Soft, 80%').click();
		await choose(page, 'Card size', 'Small');
		await choose(page, 'Card density', 'Compact');
		// The Studio writer may quote a value with a space; the engine unquotes it.
		await expect.poll(() => persistedSource(page)).toMatch(/\\nimage-card: (\\"top-right soft sm compact\\"|top-right soft sm compact)\\n/);
		// Every axis back to its default removes the key rather than writing an empty value.
		for (const [label, head] of [['Card placement', 'Bottom left (default)'], ['Card size', 'Medium (default)'], ['Card density', 'Regular (default)']]) {
			await choose(page, label, head);
		}
		await chip(page, 'Auto: Solid').click();
		await expect.poll(() => persistedSource(page)).not.toContain('image-card:');
	});

	test(`deck settings: the backing slider writes a level, and a name snaps it${tag}`, async ({ page }) => {
		await openInspectorTab(page, 'image');
		await slider(page, 'Card backing').fill('65');
		// The Studio writer quotes a value it cannot leave bare (`%`); the engine unquotes it.
		await expect.poll(() => persistedSource(page)).toMatch(/\\nimage-card: (\\"65%\\"|65%)\\n/);
		// 80 is the name `soft`, so the slider writes the name, and its chip lights.
		await slider(page, 'Card backing').fill('80');
		await expect.poll(() => persistedSource(page)).toContain('\\nimage-card: soft\\n');
		await expect(chip(page, 'Soft, 80%')).toBeChecked();
		await chip(page, 'Auto: Solid').click();
		await expect.poll(() => persistedSource(page)).not.toContain('image-card:');
	});

	test(`slide settings: the backing slider writes a card-o class, and Auto follows the deck${tag}`, async ({ page }) => {
		await setEditorContent(page, `---\ntitle: Photos\nimage-card: sheer\n---\n\n${SLIDE}`);
		await openSlideImageTab(page);
		await expect(chip(page, 'Auto: Sheer — 55%')).toBeChecked();
		await slider(page, 'Slide card backing').fill('35');
		await expect.poll(() => persistedSource(page)).toContain('card-o35');
		await chip(page, 'Clear, 0%').click();
		await expect.poll(() => persistedSource(page)).toContain('card-clear');
		await expect.poll(() => persistedSource(page)).not.toContain('card-o35');
		await chip(page, 'Auto: Sheer — 55%').click();
		await expect.poll(() => persistedSource(page)).not.toContain('card-clear');
	});

	// The photo is read in the real preview frame: the slide's `.lattice-bg` url, the card's real box, a
	// canvas. `photo-wide.svg` is dark where the default bottom-left card sits, so it wants white words.
	test(`slide settings: thinning a spotlight card picks an ink from the photo${tag}`, async ({ page }) => {
		await openSlideImageTab(page);
		await slider(page, 'Slide card backing').fill('35');
		await expect.poll(() => persistedSource(page), { message: 'the slider wrote no ink from the photo' }).toContain('card-o35');
		await expect.poll(() => persistedSource(page), { message: 'a thin card with no ink should pick one from the photo' }).toMatch(/ink-(light|dark)/);
		await expect.poll(() => persistedSource(page)).toContain('ink-light');
		// The pick is a plain class the author can change: Card ink Auto removes it again.
		await choose(page, 'Slide card ink', 'Auto — Layout\'s own');
		await expect.poll(() => persistedSource(page)).not.toMatch(/ink-(light|dark)/);
	});

	// The opposite photo: a pale one wants near-black words, so the pick is a reading of the photo and
	// not a constant. A data: URI is same-origin to the canvas, like a Library photo's blob: URL. It is a PNG because the engine
	// leaves a base64 `data:image/svg+xml` bg line as text (main does too), so an SVG here never reaches a slide.
	test(`slide settings: a pale photo picks dark ink${tag}`, async ({ page }) => {
		const pale = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAKCAIAAAAy3EnLAAAAFElEQVR4nGP48vEFSYhhVMPQ1AAAAS3AMBzA3vYAAAAASUVORK5CYII=';
		await setEditorContent(page, `---\ntitle: Photos\n---\n\n${SLIDE.replace('![bg](sample:photo-wide.svg)', `![bg](${pale})`)}`);
		await openSlideImageTab(page);
		await inkReady(page);
		await slider(page, 'Slide card backing').fill('35');
		await expect.poll(() => persistedSource(page), { message: 'a pale photo behind a thin card should pick ink-dark' }).toContain('ink-dark');
		expect(await persistedSource(page)).not.toContain('ink-light');
	});

	// The drag path: thin, then thick again. An ink the Studio picked for a thin card is taken back out
	// when the card is no longer thin, because an ink class also swaps the card's fill.
	test(`slide settings: dragging thin then thick again takes the picked ink back out${tag}`, async ({ page }) => {
		await openSlideImageTab(page);
		await inkReady(page);
		await slider(page, 'Slide card backing').fill('35');
		await expect.poll(() => persistedSource(page), { message: 'thin: an ink should be picked' }).toContain('ink-light');
		await slider(page, 'Slide card backing').fill('70');
		await expect.poll(() => persistedSource(page), { message: 'thick again: the picked ink should go' }).toContain('card-o70');
		await expect.poll(() => persistedSource(page)).not.toMatch(/ink-(light|dark)/);
	});

	// "One edit" is the point of reading the photo ahead: the backing and its ink land together, so a single
	// Undo takes both back. (Before the read lands the ink is a second edit, which this test would catch.)
	test(`slide settings: a thin step is one edit, so one Undo removes the backing and the ink together${tag}`, async ({ page }) => {
		await openSlideImageTab(page);
		await inkReady(page);
		await slider(page, 'Slide card backing').fill('35');
		await expect.poll(() => persistedSource(page)).toContain('card-o35');
		await expect.poll(() => persistedSource(page)).toContain('ink-light');
		await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo', exact: true }).click();
		await expect.poll(() => persistedSource(page), { message: 'one Undo should take the backing AND the ink back' }).not.toContain('card-o35');
		expect(await persistedSource(page)).not.toMatch(/ink-(light|dark)/);
	});

	test(`slide settings: an ink the deck line names is left alone${tag}`, async ({ page }) => {
		await setEditorContent(page, `---\ntitle: Photos\nimage-card: dark\n---\n\n${SLIDE}`);
		await openSlideImageTab(page);
		await slider(page, 'Slide card backing').fill('35');
		await expect.poll(() => persistedSource(page)).toContain('card-o35');
		// The photo may still be read, but `slideNeedsInk` gates every ink write and is false with a deck ink
		// named, so the source the backing write produced is final. card-ink-pick.test.ts pins the gate.
		expect(await persistedSource(page)).not.toMatch(/ink-(light|dark)/);
	});

	test(`slide settings: an ink the slide names is left alone${tag}`, async ({ page }) => {
		await setEditorContent(page, `---\ntitle: Photos\n---\n\n${SLIDE.replace('image spotlight', 'image spotlight ink-dark')}`);
		await openSlideImageTab(page);
		await slider(page, 'Slide card backing').fill('35');
		await expect.poll(() => persistedSource(page)).toContain('card-o35');
		// The photo may still be read (the read-ahead always runs), but `slideNeedsInk` gates every ink write
		// and is false here, so the source the backing write produced is final. card-ink-pick.test.ts pins
		// that no path writes an ink past that gate.
		const src = await persistedSource(page);
		expect(src).toContain('ink-dark');
		expect(src).not.toContain('ink-light');
	});

	test(`slide settings: the Image tab writes the card classes, and Auto follows the deck${tag}`, async ({ page }) => {
		await setEditorContent(page, `---\ntitle: Photos\nimage-card: top-right soft\n---\n\n${SLIDE}`);
		await openSlideImageTab(page);
		await expect(page.getByRole('combobox', { name: 'Slide card placement' }).filter({ visible: true }).first()).toContainText('Top right');
		await choose(page, 'Slide card placement', 'Bottom center');
		await expect.poll(() => persistedSource(page)).toContain('image spotlight at-bottom');
		await choose(page, 'Slide card ink', 'Light words');
		await expect.poll(() => persistedSource(page)).toContain('ink-light');
		await choose(page, 'Slide card placement', 'Auto — Top right');
		await expect.poll(() => persistedSource(page)).not.toContain('at-bottom');
	});

	test(`slide settings: no Image tab on a slide that is not an image slide${tag}`, async ({ page }) => {
		await setEditorContent(page, '---\ntitle: Plain\n---\n\n<!-- _class: content -->\n\n## Prose\n\nBody.\n');
		await page.getByRole('button', { name: CHROME.slideSettings }).first().click();
		await expect(page.getByRole('combobox', { name: 'Slide card placement' }).filter({ visible: true })).toHaveCount(0);
		await expect(page.getByRole('tab', { name: 'Image', exact: true })).toHaveCount(0);
	});
}

// The one-line key completes word after word in the real editor, not only in the unit test.
// After `soft` the backing axis is filled, so of the words starting with `s` only `sm` (size) is
// offered: `sheer` and `solid` share the prefix, so only the filled-axis skip can hide them.
test('the editor completes image-card: words after the first, skipping a filled axis', async ({ page }) => {
	await setEditorContent(page, '---\ntitle: Photos\n---\n');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('End');
	await page.keyboard.type('\nimage-card: soft s');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu).toBeVisible();
	// An option's accessible name carries its detail label too, unspaced (`softimage-card`).
	const option = (word: string) => menu.getByRole('option', { name: `${word}image-card`, exact: true });
	await expect(option('sm')).toBeVisible();
	for (const word of ['sheer', 'solid', 'soft']) await expect(option(word)).toHaveCount(0);
});

// Dark mode: the Studio's own mode switch (the key its pre-paint script reads), then a reload.
test('@crosswidth the deck and slide Image tabs in dark mode', async ({ page }, info) => {
	await page.evaluate(() => localStorage.setItem('lattice-docs-mode', 'dark'));
	await page.reload();
	await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
	await setEditorContent(page, `---\ntitle: Photos\nimage-card: top-right sheer light sm\n---\n\n${SLIDE}`);
	await openInspectorTab(page, 'image');
	await expect(chip(page, 'Sheer, 55%')).toBeChecked();
	await page.screenshot({ path: info.outputPath('image-card-deck-dark.png') });
	await openSlideImageTab(page);
	await expect(page.getByRole('combobox', { name: 'Slide card ink' }).filter({ visible: true }).first()).toContainText('Light words');
	await page.screenshot({ path: info.outputPath('image-card-slide-dark.png') });
});

// Screenshot evidence at the three shipped widths (QUALITY BAR). Not a golden diff: the shots
// land in test-results for a human to look at.
async function openDeckSettingsAt(page: Page, width: number): Promise<void> {
	if (width >= 1200) {
		await openInspectorTab(page, 'image');
		return;
	}
	if (width > 500) {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
		await page.locator('[role=menuitem],[role=menuitemradio],button,[role=button]').filter({ hasText: CHROME.deckSettingsAt.tabletItem }).first().click();
	} else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
	}
	await openSection(page, CHROME.deckTab.image);
}

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`@crosswidth the deck Image tab at ${label} (${width}px)`, async ({ page }, info) => {
		await setEditorContent(page, `---\ntitle: Photos\nimage-card: top-right soft sm\n---\n\n${SLIDE}`);
		await page.setViewportSize({ width, height });
		await openDeckSettingsAt(page, width);
		const placement = page.getByRole('combobox', { name: 'Card placement' }).filter({ visible: true }).first();
		await placement.scrollIntoViewIfNeeded();
		await expect(placement).toContainText('Top right');
		await expect(chip(page, 'Soft, 80%')).toBeChecked();
		await expect(page.getByRole('combobox', { name: 'Card size' }).filter({ visible: true }).first()).toContainText('Small');
		await page.screenshot({ path: info.outputPath(`image-card-deck-${label}.png`) });
	});

	test(`@crosswidth the slide Image tab at ${label} (${width}px)`, async ({ page }, info) => {
		await setEditorContent(page, `---\ntitle: Photos\nimage-card: top-right soft\n---\n\n${SLIDE.replace('image spotlight', 'image spotlight card-sm')}`);
		await page.setViewportSize({ width, height });
		await openSlideImageTab(page);
		const size = page.getByRole('combobox', { name: 'Slide card size' }).filter({ visible: true }).first();
		await size.scrollIntoViewIfNeeded();
		await expect(size).toContainText('Small');
		await expect(page.getByRole('combobox', { name: 'Slide card placement' }).filter({ visible: true }).first()).toContainText('Top right');
		await page.screenshot({ path: info.outputPath(`image-card-slide-${label}.png`) });
	});
}
