// THE LAYOUT BUTTON — Compose names each slide's layout on its bar and changes it from a menu
// (engineering/decisions/2026-11-15-compose-layout-button.md). Driven on the real Studio: the button
// on every slide, a look applied live, a layout that keeps the text, one that asks before replacing
// it, one Undo for the whole visit, and nothing on the page moving when a slide is focused.
import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'---', 'marp: true', 'theme: indaco', '---', '',
	'<!-- _class: big-number -->', '', '`The whole idea`', '', '- 0', '  - boxes to drag: you write Markdown, the engine designs the slide.', '',
	'---', '',
	'<!-- _class: cards-grid three -->', '', '## Three ways in.', '', '- Write', '  - Plain Markdown in any editor.', '- Compose', '  - Point and click in the Studio.', '- Ask', '  - Describe the slide to the assistant.', '',
	'---', '',
	'<!-- _class: stats -->', '', '## By the numbers.', '', '1. 80', '   - components', '2. 12', '   - themes', '',
].join('\n');

/** The persisted deck source, JSON-decoded (see compose-fenced-code.spec.ts). */
async function deckSource(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

async function openDeck(page: Page): Promise<void> {
	await gotoStudio(page);
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await expect(page.locator('.cs-slide')).toHaveCount(3);
}

/** The quiet button on slide `i` (shown while that slide is not the active one). */
const ghost = (page: Page, i: number) => page.locator('.cs-slide').nth(i).locator('.cs-sb-ghost');
/** The pill's button on the active slide. */
const pillButton = (page: Page) => page.locator('.cs-slide-active .cs-sb-pill .cs-sb-layout');
const menu = (page: Page) => page.getByRole('dialog', { name: /^Layout of slide \d+$/ });

test('@crosswidth @webkit-phone @gecko every slide names its layout, and the quiet copy opens the menu on its own slide', async ({ page }) => {
	await openDeck(page);
	// Compose opens on the last slide: its pill names it, and the other two carry the quiet copy.
	await expect(pillButton(page).locator('.cs-lb-name')).toHaveText('stats');
	await expect(ghost(page, 0).locator('.cs-lb-name')).toHaveText('big-number');
	await expect(ghost(page, 1).locator('.cs-lb-name')).toHaveText('cards-grid');
	await ghost(page, 0).click();
	await expect(menu(page)).toBeVisible();
	await expect(menu(page)).toHaveAccessibleName('Layout of slide 1');
	await expect(page.locator('.cs-slide').nth(0)).toHaveClass(/cs-slide-active/);
	// The layout in effect is the selected row, and the manifest's alternatives follow with their reasons.
	await expect(menu(page).getByRole('option', { name: /^big-number/, selected: true })).toBeVisible();
	await expect(menu(page).getByRole('option', { name: /^stats.*row of 2-3 metrics/i })).toBeVisible();
	await expect(pillButton(page)).toHaveAttribute('aria-expanded', 'true');
});

test('@crosswidth @webkit-phone @gecko a look applies at once, the menu stays open, and Done keeps it with one Undo', async ({ page }) => {
	await openDeck(page);
	await ghost(page, 1).click();
	const look = menu(page).getByRole('button', { name: 'four', exact: true });
	await look.click();
	await expect(look).toHaveAttribute('aria-pressed', 'true');
	await expect.poll(() => deckSource(page)).toContain('<!-- _class: cards-grid four -->');
	// `numbered` is written as an ordered list, not a class: the menu does not offer it as a look.
	await expect(menu(page).getByRole('button', { name: 'numbered', exact: true })).toHaveCount(0);
	await menu(page).getByRole('button', { name: 'Done' }).click();
	await expect(menu(page)).toBeHidden();
	await expect(pillButton(page)).toBeFocused();
	await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => deckSource(page)).toContain('<!-- _class: cards-grid three -->');
});

test('@crosswidth @webkit-phone @gecko a layout that reads the text keeps it; one that cannot asks before replacing it', async ({ page }) => {
	await openDeck(page);
	await pillButton(page).click();
	await menu(page).getByRole('option', { name: /^big-number/ }).click();
	await expect.poll(() => deckSource(page)).toContain('<!-- _class: big-number -->\n\n## By the numbers.');
	expect(await deckSource(page)).toContain('   - components');
	// The family stays the one the slide started with, so `stats` is still on offer to go back to.
	await menu(page).getByRole('option', { name: /^stats/ }).click();
	await expect.poll(() => deckSource(page)).toContain('<!-- _class: stats -->\n\n## By the numbers.');
	const fresh = menu(page).getByRole('listbox', { name: 'Starts from an example' });
	if (await fresh.count()) {
		const first = fresh.getByRole('option').first();
		const name = ((await first.locator('.font-mono').textContent()) || '').trim();
		await first.click();
		await menu(page).getByRole('button', { name: 'Keep my text' }).click();
		expect(await deckSource(page)).toContain('   - components');
		await first.click();
		await menu(page).getByRole('button', { name: 'Replace text' }).click();
		await expect.poll(() => deckSource(page)).toContain(`<!-- _class: ${name}`);
		expect(await deckSource(page)).toContain('## By the numbers.');
		expect(await deckSource(page)).not.toContain('   - components');
	}
	await page.keyboard.press('Escape');
	await expect(menu(page)).toBeHidden();
	// One Undo takes back the whole visit, however many picks it held.
	await page.locator('[data-sonner-toast]').getByRole('button', { name: 'Undo' }).click();
	await expect.poll(() => deckSource(page)).toContain('<!-- _class: stats -->\n\n## By the numbers.\n\n1. 80\n   - components');
});

test('@crosswidth @webkit-phone @gecko focusing a slide or opening its menu moves nothing on the page', async ({ page }) => {
	await openDeck(page);
	// The page may scroll to bring the chosen slide into view; what must not change is the LAYOUT: where each slide's text
	// sits relative to the first slide's. Every slide is measured, not just the two ends: a bar that grew on one slide and
	// shrank on another would cancel out between the ends (the first draft of this test did exactly that, and stayed green
	// with the quiet button turned into a row of its own).
	const tops = page.locator('.cs-slide .cs-slide-content > :first-child');
	const layout = async () => {
		const ys = await tops.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
		return ys.map((y) => y - ys[0]);
	};
	const close = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < 0.1);
	const before = await layout();
	// To a tenth of a pixel: Gecko reports the same box as 474.90000915 and 474.89997864 across a re-layout.
	await ghost(page, 1).click();
	await expect(menu(page)).toBeVisible();
	expect(close(await layout(), before), `slide offsets ${JSON.stringify(await layout())} vs ${JSON.stringify(before)}`).toBe(true);
	await page.keyboard.press('Escape');
	await expect(menu(page)).toBeHidden();
	expect(close(await layout(), before), `slide offsets ${JSON.stringify(await layout())} vs ${JSON.stringify(before)}`).toBe(true);
});

test('@crosswidth @webkit-phone @gecko the menu keeps its preview frames between opens', async ({ page }) => {
	// WebKit never frees a preview frame's document once the frame is destroyed (preview-pool.tsx), so a menu of live
	// previews that rebuilt its frames on every open would strand memory on an iPhone each time. Counted, not timed: every
	// frame the page ever creates, after the first open and after three more on other slides.
	await page.addInitScript(() => {
		const w = window as unknown as { __framesMade: number };
		w.__framesMade = 0;
		new MutationObserver((records) => {
			for (const r of records)
				for (const n of r.addedNodes) {
					if (n instanceof HTMLIFrameElement) w.__framesMade++;
					else if (n instanceof Element) w.__framesMade += n.querySelectorAll('iframe').length;
				}
		}).observe(document, { childList: true, subtree: true });
	});
	await openDeck(page);
	const made = () => page.evaluate(() => (window as unknown as { __framesMade: number }).__framesMade);
	const visit = async (i: number) => {
		await ghost(page, i).click();
		await expect(menu(page)).toBeVisible();
		// The pool has given the previews their frames (LayoutMenu's `data-pool-held`, from PreviewPool's own report), so any
		// frame this open was going to make has been made.
		await expect(menu(page).locator('[data-pool-held]')).not.toHaveAttribute('data-pool-held', '0');
		await page.keyboard.press('Escape');
		await expect(menu(page)).toBeHidden();
	};
	const before = await made();
	await visit(0);
	const afterFirst = await made();
	expect(afterFirst, 'the first open makes the pool its frames').toBeGreaterThan(before);
	await visit(1);
	await visit(0);
	await visit(1);
	expect(await made(), 'frames made by three more opens (the pool re-points the frames it has)').toBe(afterFirst);
});
