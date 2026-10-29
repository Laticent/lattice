import { CHROME, expect, gotoStudio, persistedSource, test, typeDeck } from './studio-fixture';

// The photo verdict (lib/core/photo-contrast.mjs, photo-verdict.ts): text on a photo that does not reach 4.5:1 in the
// live preview is flagged, in the Coach AND in the editor, with one message and one fix button that both views share.
// On a thin card lint flags, the fix is the card ink (it clears lint's warning too); elsewhere a pin comes first. The
// verdict is measured from the painted page, so this drives the real Studio preview. Nothing changes until a click.

// `card-clear` drops the card's backing, so the theme's own (dark, in light mode) ink sits on a dark photo.
// A heading alone, so the pin's verdict is the heading's: the theme's muted body ink is a second text the pin must also clear.
const DARK_PHOTO_DECK = '---\ntitle: Photos\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## A quiet harbor.\n\n![bg](sample:photo-wide.svg)\n';
// With a paragraph the muted body ink on this photo stays under 4.5:1 even pinned dark, so no pin is offered: the card ink is.
const BODY_DECK = '---\ntitle: Photos\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## A quiet harbor.\n\nThe words sit right on the photo.\n\n![bg](sample:photo-wide.svg)\n';
// The mirror case: a bright photo under light ink (a dark deck), where the fix is to pin the slide light.
const BRIGHT_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAABsCAIAAACzYCrFAAAA1klEQVR42u3SMQ0AAAgEsfcvEwEMKMADYWxSBZfLdMFZJMBAGAgDYSAwEAbCQBgIDISBMBAGAgNhIAyEgcBAGAgDYSAMBAbCQBgIA4GBMBAGwkBgIAyEgTAQGAgDYSAMhIHAQBgIA2EgMBAGwkAYCAyEgTAQBgIDYSAMhIHAQBgIA2EgDAQGwkAYCAOBgTAQBsJAYCAMhIEwEBgIA2EgDISBwEAYCANhIDAQBsJAGAgMhIEwEAYCA2EgDISBMBAYCANhIAwEBsJAGAgDgYEwEAbCQGAgPi0bG28SdoIc2AAAAABJRU5ErkJggg==';
const BRIGHT_PHOTO_DECK = `---\ntitle: Photos\n---\n\n<!-- _class: image spotlight card-clear -->\n\n## A quiet harbor.\n\n![bg](${BRIGHT_PHOTO})\n`;
// A solid card carries the theme's own contrast, whatever the photo is.
const SOLID_CARD_DECK = '---\ntitle: Photos\n---\n\n<!-- _class: image spotlight -->\n\n## A quiet harbor.\n\nThe words sit on a card.\n\n![bg](sample:photo-wide.svg)\n';

async function openCoach(page: import('@playwright/test').Page): Promise<void> {
	const coach = page.getByRole('button', { name: CHROME.coach }).filter({ visible: true });
	if (await coach.count()) await coach.first().click();
	else {
		await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).first().click();
		await page.getByRole('menuitem', { name: /^Coach/ }).first().click();
	}
	await expect(page.getByText('Deck read').filter({ visible: true }).first()).toBeVisible();
}

// An absence needs a signal that the read FINISHED, not a moment when nothing is shown: typing a deck clears the editor first, and
// that empty deck briefly shows no finding. So wait for the source to hold the new deck, then for the read of that slide to settle.
async function readSettled(page: import('@playwright/test').Page, marker: string): Promise<void> {
	await expect.poll(() => persistedSource(page)).toContain(marker);
	await expect(page.locator('[data-photo-read="done"]')).toBeAttached({ timeout: 20_000 });
}

const WIDTHS = [1440, 820, 390];
// Light mode: dark ink on a dark photo, fixed by the light card ink. Dark mode: light ink on a bright photo, fixed by the
// dark one. Both cards are thin with no ink, so lint flags them and the fix is the ink, never a pin (a pin would leave
// lint's `thin-card-no-ink` standing).
const CASES = [
	{ mode: 'light', deck: DARK_PHOTO_DECK, ink: 'light' },
	{ mode: 'dark', deck: BRIGHT_PHOTO_DECK, ink: 'dark' },
] as const;
for (const { mode, deck, ink } of CASES) {
	for (const width of WIDTHS) {
		// WebKit reads computed colors and the photo canvas its own way (HARD RULE #23): the light-mode case also runs there,
		// the wide one in the tablet project and the narrow one in the phone project, each keeping its desktop run (@crosswidth).
		const engines = mode === 'light' && width === 1440 ? ' @webkit-tablet @crosswidth' : mode === 'light' && width === 390 ? ' @webkit-phone @crosswidth' : '';
		test(`a thin card on a ${ink === 'light' ? 'dark' : 'bright'} photo is flagged, and the ${ink} card ink fixes it (${mode}, ${width}px)${engines}`, async ({ page }, info) => {
			await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
			await page.addInitScript((m) => localStorage.setItem('lattice-docs-mode', m), mode);
			await gotoStudio(page);
			await typeDeck(page, deck);
			await openCoach(page);

			// Light mode: dark ink on a dark photo. Dark mode: the Studio chrome is dark, the DECK is still light.
			const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
			await expect(warning).toBeVisible({ timeout: 20_000 });
			await expect(warning).toContainText(`Setting the card ink ${ink}`);
			await expect(page.getByRole('button', { name: /Pin this slide/ })).toHaveCount(0);
			await warning.scrollIntoViewIfNeeded();
			await page.screenshot({ path: info.outputPath(`flagged-${mode}-${width}.png`) });

			// Reading it changed nothing.
			expect(await persistedSource(page)).not.toMatch(/_class: [^\n]*\bink-/);

			await page.getByRole('button', { name: `Set card ink ${ink}` }).filter({ visible: true }).first().click();
			await expect.poll(() => persistedSource(page)).toMatch(new RegExp(`_class: image spotlight card-clear ink-${ink}`));
			await expect(page.getByText(/The text on this photo reads at/).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 });
			await page.screenshot({ path: info.outputPath(`fixed-${mode}-${width}.png`) });
		});
	}
}

test('a solid card raises no photo warning, and a warning clears when the card goes solid', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, DARK_PHOTO_DECK);
	await openCoach(page);
	// First prove the read is running on this deck, so the absence below means something.
	const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true });
	await expect(warning.first()).toBeVisible({ timeout: 20_000 });
	await typeDeck(page, SOLID_CARD_DECK);
	await readSettled(page, 'image spotlight -->');
	await expect(warning).toHaveCount(0);
});

// No pin clears this slide, so the finding offers the card ink that does (the dark photo wants light ink) and no pin.
for (const width of [1440, 390]) {
	const engines = width === 1440 ? ' @webkit-tablet @crosswidth' : ' @webkit-phone @crosswidth';
	test(`a pin that would not clear the floor is not offered; the card ink that does is, and fixes it (${width}px)${engines}`, async ({ page }, info) => {
		await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
		await gotoStudio(page);
		await typeDeck(page, BODY_DECK);
		await openCoach(page);
		const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
		await expect(warning).toContainText('Setting the card ink light', { timeout: 20_000 });
		await expect(page.getByRole('button', { name: /Pin this slide/ })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Set card ink dark' })).toHaveCount(0);
		await warning.scrollIntoViewIfNeeded();
		await page.screenshot({ path: info.outputPath(`ink-offered-${width}.png`) });

		await page.getByRole('button', { name: 'Set card ink light' }).filter({ visible: true }).first().click();
		await expect.poll(() => persistedSource(page)).toMatch(/_class: image spotlight card-clear ink-light/);
		await expect(page.getByText(/The text on this photo reads at/).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 });
		await page.screenshot({ path: info.outputPath(`ink-set-${width}.png`) });
	});
}

// The editor's own tooltip on the same slide (`thin-card-no-ink`) is not auto-fixable in lint, so the Studio reads the
// photo from the preview and offers the ONE ink that reads (the dark sample photo wants light ink). Only when the slide is
// not the one on screen, so the photo cannot be read, does it offer both.
for (const width of [1440, 390]) {
	const engines = width === 1440 ? ' @webkit-tablet @crosswidth' : ' @webkit-phone @crosswidth';
	test(`the thin-card tooltip offers the one ink that reads, and the button writes it (${width}px)${engines}`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await gotoStudio(page);
		await typeDeck(page, DARK_PHOTO_DECK);
		if (width < 700) await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await page.locator('.cm-lintRange-warning').first().hover();
		await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' })).toBeVisible({ timeout: 20_000 });
		await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink dark' })).toHaveCount(0);
		await page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' }).click();
		await expect.poll(() => persistedSource(page)).toMatch(/_class: image spotlight card-clear ink-light/);
		await expect(page.locator('.cm-lintRange-warning')).toHaveCount(0, { timeout: 20_000 });
	});
}

test('a thin card on a slide that is not on screen still gets the one ink, read from the photo itself', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	const second = DARK_PHOTO_DECK.replace('A quiet harbor.', 'A second harbor.');
	await typeDeck(page, `${DARK_PHOTO_DECK}\n---\n\n${second.split('---\n\n').pop()}`);
	// The caret is on slide 2 after typing, so the preview shows slide 2. Slide 1's tooltip cannot use the preview; it reads
	// the photo file instead, and must still offer one ink, never both.
	await page.locator('.cm-lintRange-warning').first().hover();
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' })).toBeVisible({ timeout: 20_000 });
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink dark' })).toHaveCount(0);
});

// A statement's backing is a scrim gradient, judged at its strongest: white ink on the default scrim reads over a bright
// photo, so it is not flagged (reading it as "no backing" would report about 1:1).
test('a statement slide over a bright photo is not flagged', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	// A spotlight slide first, so the read is proven to run on this deck before the absence means anything.
	await typeDeck(page, DARK_PHOTO_DECK);
	await openCoach(page);
	const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true });
	await expect(warning.first()).toBeVisible({ timeout: 20_000 });
	await typeDeck(page, BRIGHT_PHOTO_DECK.replace('image spotlight card-clear', 'image statement'));
	await readSettled(page, 'image statement');
	await expect(warning).toHaveCount(0);
});

// A statement's list row takes the card ink like its paragraph, so the Coach reads it against the same scrim. A row left on
// the theme's ink is dark in a light deck and would be flagged here, against the default dark scrim.
test('a statement list row takes the card ink and is not flagged @webkit-tablet @crosswidth', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, DARK_PHOTO_DECK);
	await openCoach(page);
	const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true });
	await expect(warning.first()).toBeVisible({ timeout: 20_000 });
	await typeDeck(page, BRIGHT_PHOTO_DECK.replace('image spotlight card-clear', 'image statement').replace('## A quiet harbor.\n', '## A quiet harbor.\n\n- The margins hold\n- The plan ships\n'));
	await readSettled(page, 'image statement');
	await expect(warning).toHaveCount(0);
});

// With `card-clear` the scrim paints nothing, so the statement's fixed white ink sits straight on the bright photo. No slide
// pin changes that ink, so the finding offers the dark card ink, which flips the ink and the scrim together.
for (const width of [1440, 390]) {
	const engines = width === 1440 ? ' @webkit-tablet @crosswidth' : ' @webkit-phone @crosswidth';
	test(`a statement with its scrim cleared over a bright photo is flagged, and the dark ink fixes it (${width}px)${engines}`, async ({ page }, info) => {
		await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
		await gotoStudio(page);
		await typeDeck(page, BRIGHT_PHOTO_DECK.replace('image spotlight card-clear', 'image statement card-clear'));
		await openCoach(page);
		const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
		await expect(warning).toContainText('Setting the card ink dark', { timeout: 20_000 });
		// No scrim is painted, so the ratio is exact, not a ceiling.
		await expect(warning).not.toContainText('reads at most');
		await expect(page.getByRole('button', { name: /Pin this slide/ })).toHaveCount(0);
		await warning.scrollIntoViewIfNeeded();
		await page.screenshot({ path: info.outputPath(`statement-flagged-${width}.png`) });

		await page.getByRole('button', { name: 'Set card ink dark' }).filter({ visible: true }).first().click();
		await expect.poll(() => persistedSource(page)).toMatch(/_class: image statement card-clear ink-dark/);
		await expect(page.getByText(/The text on this photo reads at/).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 });
		await page.screenshot({ path: info.outputPath(`statement-fixed-${width}.png`) });
	});
}

// A thin scrim (`card-o10`) still paints, so the ratio is judged against the scrim at its strongest: a ceiling, and the
// message says "at most". White on this bright photo fails even there, so the slide is flagged.
test('a statement under a thin scrim is flagged with an "at most" ratio', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, BRIGHT_PHOTO_DECK.replace('image spotlight card-clear', 'image statement card-o10'));
	await openCoach(page);
	const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
	await expect(warning).toContainText('reads at most', { timeout: 20_000 });
	await expect(warning).toContainText('Setting the card ink dark');
});

// The verdict depends on more than the slide's own text: a deck-level register changes what the preview paints, and the
// finding must follow it. Here only the front matter changes; the slide's chunk is byte-identical.
test('a deck-level image-card register change clears the finding without touching the slide', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, DARK_PHOTO_DECK);
	await openCoach(page);
	const warning = page.getByText(/The text on this photo reads at/).filter({ visible: true });
	await expect(warning.first()).toBeVisible({ timeout: 20_000 });
	// An in-place edit, not typeDeck: that clears the editor first, and the empty deck would re-trigger the read by itself.
	await page.locator('.cm-content').click();
	await page.keyboard.press('ControlOrMeta+Home');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('End');
	await page.keyboard.insertText('\nimage-card: light');
	await readSettled(page, 'image-card: light');
	await expect(warning).toHaveCount(0);
});

// The preview follows the caret even where it is parked (the phone's Source tab): crossing to a slide draws it once, and the
// editor re-lints after, so the tooltip for the slide the caret is on reads ITS photo and offers the single ink.
const THREE = ['---\ntitle: Photos\n---\n', ...[1, 2, 3].map((n) => `\n<!-- _class: image spotlight card-clear -->\n\n## Slide ${n}\n\n![bg](sample:photo-wide.svg)\n`)].join('\n---\n').replace('---\n\n---\n', '---\n\n');
for (const width of [1440, 390]) {
	const engines = width === 1440 ? ' @webkit-tablet @crosswidth' : ' @webkit-phone @crosswidth';
	test(`moving the caret to another slide gives that slide's tooltip the single ink (${width}px)${engines}`, async ({ page }) => {
		await page.setViewportSize({ width, height: 844 });
		await gotoStudio(page);
		await typeDeck(page, THREE);
		if (width < 700) await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		// The caret is on slide 3 after typing; move it to slide 1 (title block is 3 lines, then a blank, then slide 1's class line).
		await page.locator('.cm-content').click();
		await page.keyboard.press('ControlOrMeta+Home');
		for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
		const light = page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' });
		// The click above leaves the mouse resting on the editor, and at phone width that can be over a lint underline, whose
		// tooltip then opens on its own. Hovering the target later REPLACES that tooltip, which the count below would read as
		// the jank it guards. Park the mouse away and start from no tooltip at all (traced 2026-10-28: the only removal in a
		// failing run was that earlier tooltip, 2 ms after the hover's own mousemove).
		await page.mouse.move(1, 1);
		await expect(page.locator('.cm-tooltip-lint')).toHaveCount(0, { timeout: 5000 });
		// The jank this guards: the tooltip opened with BOTH inks, was closed by a re-lint, and reopened with one. The buttons are
		// now filled in place, so record every mutation from before the hover: "Set card ink dark" must never appear, and the open
		// tooltip must never be taken out of the page.
		await page.evaluate(() => {
			const w = window as unknown as { __jank: { dark: boolean; removed: number } };
			w.__jank = { dark: false, removed: 0 };
			new MutationObserver((muts) => {
				for (const m of muts) {
					for (const n of Array.from(m.removedNodes)) if (n instanceof Element && (n.matches('.cm-tooltip-lint') || n.querySelector('.cm-tooltip-lint'))) w.__jank.removed++;
				}
				if (Array.from(document.querySelectorAll('.cm-diagnosticAction')).some((b) => b.textContent?.includes('ink dark'))) w.__jank.dark = true;
			}).observe(document.body, { childList: true, subtree: true, characterData: true });
		});
		await page.locator('.cm-lintRange-warning').first().hover();
		await expect(light).toBeVisible({ timeout: 20_000 });
		const jank = await page.evaluate(() => (window as unknown as { __jank: { dark: boolean; removed: number } }).__jank);
		expect(jank.dark, 'the tooltip offered both inks before the one that reads').toBe(false);
		// Held in every project and at every width. It used to be waived for Chromium at 390 as a "synthetic mousemove on a
		// preview redraw"; the trace showed the removal was an earlier tooltip opened by the click above, which the mouse park
		// now rules out (followups.d/2932-p3-mobile-caret-tooltip-jank-flake.md, closed).
		expect(jank.removed, 'the open tooltip was taken out of the page').toBe(0);
	});
}

// A phone draws the parked preview and loads the photo far slower than a desktop. Hold the photo back for longer than the old
// 3 s window: the tooltip must say it is reading, then offer the one ink, and never fall back to both on the way.
test('a slow photo read shows "Checking the photo…" and still lands on the single ink @webkit-phone @crosswidth', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	// Slow EVERY photo read the Studio page makes, from the first script on: each image `onload` fires 3.5 s late. The
	// measured verdict for the slide on screen (which the tooltip shows at once when it has it) is then not ready when the
	// tooltip opens, so this exercises the slow path. (A network delay would not do: the preview already loaded this photo,
	// so the read is a memory-cache hit.)
	await page.addInitScript(() => {
		Object.defineProperty(HTMLImageElement.prototype, 'onload', {
			configurable: true,
			set(fn: (e: Event) => void) {
				this.addEventListener('load', (e: Event) => setTimeout(() => fn.call(this, e), 3500));
			},
		});
	});
	await gotoStudio(page);
	await typeDeck(page, DARK_PHOTO_DECK);
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await page.evaluate(() => {
		const w = window as unknown as { __jank: { dark: boolean } };
		w.__jank = { dark: false };
		new MutationObserver(() => {
			if (Array.from(document.querySelectorAll('.cm-diagnosticAction')).some((b) => b.textContent?.includes('ink dark'))) w.__jank.dark = true;
		}).observe(document.body, { childList: true, subtree: true, characterData: true });
	});
	await page.locator('.cm-lintRange-warning').first().hover();
	await expect(page.getByText('Checking the photo…')).toBeVisible({ timeout: 5000 });
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' })).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText('Checking the photo…')).toHaveCount(0);
	expect(await page.evaluate(() => (window as unknown as { __jank: unknown }).__jank)).toEqual({ dark: false });
});

// Jank, measured: the tooltip must open at its final size and place. Before the fix it opened without buttons, grew 44 px
// when the ink arrived, then CodeMirror moved it up 44 px to fit. Trace its box every frame from the moment it appears until
// the button has arrived, and require one box.
test('the ink tooltip opens at its final size and never moves @webkit-phone @crosswidth', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await gotoStudio(page);
	await typeDeck(page, `${DARK_PHOTO_DECK}\n---\n\n${DARK_PHOTO_DECK.replace('A quiet harbor.', 'A second harbor.').split('---\n\n').pop()}`);
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await page.evaluate(() => {
		const w = window as unknown as { __boxes: string[] };
		w.__boxes = [];
		const tick = () => {
			const tip = document.querySelector('.cm-tooltip-lint');
			// CodeMirror parks a new tooltip at top -10000px until its first measure; nobody can see that frame, so skip it.
			const r = tip?.getBoundingClientRect();
			if (r && r.top > -1000) {
				const box = `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`;
				if (w.__boxes.at(-1) !== box) w.__boxes.push(box);
			}
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	// The second slide's warning: the caret is not there yet, so the tooltip has to wait for the preview to draw it.
	await page.locator('.cm-lintRange-warning').nth(1).hover();
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' })).toBeVisible({ timeout: 20_000 });
	await expect.poll(() => page.evaluate(() => (window as unknown as { __boxes: string[] }).__boxes.length), { timeout: 2000 }).toBeGreaterThan(0);
	// A frame or two for any late re-position to land in the trace.
	await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
	expect(await page.evaluate(() => (window as unknown as { __boxes: string[] }).__boxes)).toHaveLength(1);
});

// The answer is kept in the browser, so a reload does not ask again: the second open shows the fix on its first frame, with
// no "Checking the photo…" pill at all.
test('a photo read once is remembered across a reload', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, DARK_PHOTO_DECK);
	await page.locator('.cm-lintRange-warning').first().hover();
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' })).toBeVisible({ timeout: 20_000 });
	await page.reload();
	await expect(page.locator('.cm-lintRange-warning').first()).toBeVisible({ timeout: 30_000 });
	await page.evaluate(() => {
		const w = window as unknown as { __checking: boolean };
		w.__checking = false;
		new MutationObserver(() => {
			if (document.body.textContent?.includes('Checking the photo')) w.__checking = true;
		}).observe(document.body, { childList: true, subtree: true, characterData: true });
	});
	await page.mouse.move(700, 600);
	await page.locator('.cm-lintRange-warning').first().hover();
	await expect(page.locator('.cm-diagnosticAction', { hasText: 'Set card ink light' })).toBeVisible({ timeout: 20_000 });
	expect(await page.evaluate(() => (window as unknown as { __checking: boolean }).__checking), 'the second open asked again').toBe(false);
});

// Best effort, said plainly. A mid-gray photo under a clear card, where neither ink reaches 4.5:1, and a photo the Studio
// cannot load: each gets ONE fix, a solid card (which always reads), with a note saying why, never two ink buttons.
const GRAY_PHOTO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAABsCAIAAACzYCrFAAAA0ElEQVR42u3SQREAAAzCMGzjHhHbM5HQawoHkQADYSAMhIHAQBgIA2EgMBAGwkAYCAyEgTAQBgIDYSAMhIEwEBgIA2EgDAQGwkAYCAOBgTAQBsJAYCAMhIEwEAYCA2EgDISBwEAYCANhIDAQBsJAGAgMhIEwEAYCA2EgDISBMBAYCANhIAwEBsJAGAgDgYEwEAbCQGAgDISBMBAGAgNhIAyEgcBAGAgDYSAwEAbCQBgIDISBMBAGwkBgIAyEgTAQGAgDYSAMBAbCQBgIA4GB+DTs7uGvuhFSqwAAAABJRU5ErkJggg==';
for (const [name, ref, note] of [
	['no ink reads on the photo', GRAY_PHOTO, 'No ink reads on this photo.'],
	['the photo cannot be read', 'img/not-here.jpg', 'Could not read this photo.'],
] as const) {
	test(`when ${name}, the tooltip offers a solid card and says why`, async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await typeDeck(page, DARK_PHOTO_DECK.replace('sample:photo-wide.svg', ref));
		await page.locator('.cm-lintRange-warning').first().hover();
		const solid = page.locator('.cm-diagnosticAction', { hasText: 'Use a solid card' });
		await expect(solid).toBeVisible({ timeout: 20_000 });
		await expect(page.getByText(note)).toBeVisible();
		await expect(page.locator('.cm-diagnosticAction', { hasText: /Set card ink/ })).toHaveCount(0);
		await solid.click();
		await expect.poll(() => persistedSource(page)).toMatch(/_class: image spotlight card-solid/);
	});
}

// ONE VERDICT, TWO VIEWS. The Coach's finding and the editor's tooltip for the same slide come from one read
// (photo-verdict.ts), so they say the same words and offer the same button.
for (const width of [1440, 390]) {
	const engines = width === 1440 ? ' @webkit-tablet @crosswidth' : ' @webkit-phone @crosswidth';
	test(`the Coach and the editor show one message and one fix for the same slide (${width}px)${engines}`, async ({ page }) => {
		await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
		await gotoStudio(page);
		await typeDeck(page, BODY_DECK);
		await openCoach(page);
		const finding = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
		await expect(finding).toBeVisible({ timeout: 20_000 });
		const said = (await finding.textContent())?.trim() ?? '';
		const coachButton = (await page.getByRole('button', { name: /^(Set card ink|Pin this slide|Use a solid card)/ }).filter({ visible: true }).first().textContent())?.trim();
		// The Coach shows the measured finding, not lint's thin-card warning beside it: one finding per slide.
		await expect(page.getByText('THIN-CARD-NO-INK', { exact: false }).filter({ visible: true })).toHaveCount(0);

		// A phone shows the Coach as a sheet over the editor: close it, then open the source.
		if (width < 700) {
			await page.keyboard.press('Escape');
			await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		}
		await page.locator('.cm-lintRange-warning').first().hover();
		const tip = page.locator('.cm-tooltip-lint');
		await expect(tip).toContainText(said, { timeout: 20_000 });
		await expect(tip.locator('.cm-diagnosticAction')).toHaveText([coachButton ?? '']);
	});
}

// A statement over a bright photo with its scrim cleared: lint flags nothing (a statement names no card ink), so the
// editor shows the MEASURED verdict as its own underline, with the Coach's words and button, and its button fixes it.
test('a statement the Coach flags is underlined in the editor too, and the editor button fixes it', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await typeDeck(page, BRIGHT_PHOTO_DECK.replace('image spotlight card-clear', 'image statement card-clear'));
	await openCoach(page);
	const finding = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
	await expect(finding).toContainText('Setting the card ink dark', { timeout: 20_000 });
	const said = (await finding.textContent())?.trim() ?? '';

	const underline = page.locator('.cm-line', { hasText: '![bg]' }).locator('.cm-lintRange-warning');
	await expect(underline).toHaveCount(1, { timeout: 20_000 });
	await underline.hover();
	const tip = page.locator('.cm-tooltip-lint');
	await expect(tip).toContainText(said);
	await tip.locator('.cm-diagnosticAction', { hasText: 'Set card ink dark' }).click();
	await expect.poll(() => persistedSource(page)).toMatch(/_class: image statement card-clear ink-dark/);
	await expect(page.getByText(/The text on this photo reads at/).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 });
	await expect(page.locator('.cm-line', { hasText: '![bg]' }).locator('.cm-lintRange-warning')).toHaveCount(0, { timeout: 20_000 });
});

// The fix lands on the slide you are looking at, and the preview STAYS there. A one-slide edit used to rewrite the whole
// deck and drop its final newline; the focus hub then mapped the caret to the end and the preview jumped to the last slide.
test('a Coach fix on the first slide keeps the preview on that slide', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	const second = '\n---\n\n## Next steps\n\nA plain slide after the photo.\n';
	await typeDeck(page, `${BODY_DECK}${second}`);
	await openCoach(page);
	const label = page.locator('text=/Slide \\d+ \\/ 2/').filter({ visible: true }).first();
	// The caret ends on slide 2 after typing; go back to the photo slide with the preview's own control.
	await expect(label).toContainText('Slide 2 / 2');
	await page.getByRole('button', { name: 'Previous slide' }).filter({ visible: true }).first().click();
	await expect(label).toContainText('Slide 1 / 2');
	await page.getByRole('button', { name: 'Set card ink light' }).filter({ visible: true }).first().click({ timeout: 20_000 });
	await expect.poll(() => persistedSource(page)).toMatch(/_class: image spotlight card-clear ink-light/);
	await expect(page.getByText(/The text on this photo reads at/).filter({ visible: true })).toHaveCount(0, { timeout: 20_000 });
	await expect(label).toContainText('Slide 1 / 2');
});

// A tooltip opened BEFORE the slide on screen is measured must not go on disagreeing with the Coach while it stays open: when
// the measured verdict lands, it takes the Coach's words and button in place. Every photo read is slowed from the first
// script, so the tooltip opens first.
test('a tooltip opened before the measurement takes the Coach words when it lands', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.addInitScript(() => {
		Object.defineProperty(HTMLImageElement.prototype, 'onload', {
			configurable: true,
			set(fn: (e: Event) => void) {
				this.addEventListener('load', (e: Event) => setTimeout(() => fn.call(this, e), 2500));
			},
		});
	});
	await gotoStudio(page);
	await typeDeck(page, BODY_DECK);
	await page.locator('.cm-lintRange-warning').first().hover();
	const tip = page.locator('.cm-tooltip-lint');
	// Opened before the measurement: lint's own words. The pointer stays put from here, so this is the SAME tooltip.
	await expect(tip).toContainText('A spotlight card at 0%', { timeout: 20_000 });
	await page.evaluate(() => {
		(window as unknown as { __tip: Element | null }).__tip = document.querySelector('.cm-tooltip-lint');
	});
	await expect(tip).toContainText(/The text on this photo reads at/, { timeout: 20_000 });
	expect(await page.evaluate(() => (window as unknown as { __tip: Element | null }).__tip === document.querySelector('.cm-tooltip-lint')), 'the tooltip was replaced, not upgraded in place').toBe(true);
	// The measured sentence the tooltip took: "The text on this photo reads at N:1 (needs 4.5:1)."
	const upgraded = ((await tip.textContent()) ?? '').match(/The text on this photo reads at [\d.]+:1 \(needs 4\.5:1\)\./)?.[0] ?? '';
	expect(upgraded, 'the tooltip names the measured ratio').not.toBe('');
	await expect(tip.locator('.cm-diagnosticAction')).toHaveText(['Set card ink light']);
	// And those are the Coach's words.
	await openCoach(page);
	const finding = page.getByText(/The text on this photo reads at/).filter({ visible: true }).first();
	await expect(finding).toBeVisible({ timeout: 20_000 });
	expect((await finding.textContent())?.trim()).toContain(upgraded);
});
