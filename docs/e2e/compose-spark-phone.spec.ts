import type { Page } from '@playwright/test';
import { insertVia } from './compose-insert';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

/**
 * COMPOSE — the spark editor at phone width (390px, touch). The editor is a bottom sheet here, the slide bar
 * wraps to two rows, and both must hold with the Insert door. This is Chromium with touch
 * EMULATION, not a device: it says nothing about iOS Safari or a real keyboard.
 */
// The fixture loads a deck through the desktop editor, so the page starts wide and is narrowed once Compose is open.
test.use({ hasTouch: true });

const COMPOSE = 'Compose — rich editor';
const DECK = ['<!-- _class: content -->', '', '## KPIs', '', 'Revenue `~{12 14 13 17 21, bar, c3}` and `{SHIPPED, c2}`.', '', '---', '', '<!-- _class: content -->', '', '## Plain', '', 'Nothing here yet.'].join('\n');

async function savedDeck(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

for (const mode of ['light', 'dark'] as const) {
	test(`the sheet and the two-row bar hold at 390px, ${mode}`, async ({ page }, info) => {
		await gotoStudio(page);
		await setEditorContent(page, DECK);
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
		await page.locator('.cs-host .ProseMirror').waitFor();
		await page.locator('.cs-slide').first().waitFor();
		if (mode === 'dark') await page.getByRole('button', { name: 'Switch to dark mode' }).first().click();
		await page.setViewportSize({ width: 390, height: 844 });
		// On a phone each pane is a tab; the resize lands on Preview.
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().tap();
		await page.locator('.cs-slide').first().waitFor();

		// The slide bar: nothing wider than the viewport, no page scroll, and the insert doors all reachable.
		const active = page.locator('.cs-slide-active');
		await active.locator('.cs-slide-content p').first().click({ position: { x: 3, y: 8 } });
		const bar = active.locator('.cs-sb-pill').first();
		const box = await bar.boundingBox();
		expect(box).not.toBeNull();
		expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
		// One Insert door holds every insert (table, code, image, pill, spark, avatar, icon...), and it fits the bar.
		await expect(active.getByRole('button', { name: 'Insert', exact: true })).toBeVisible();
		const door = await active.getByRole('button', { name: 'Insert', exact: true }).boundingBox();
		expect((door?.x ?? 0) + (door?.width ?? 0)).toBeLessThanOrEqual(390);

		// Tap a spark: the editor is a sheet, and a pick writes one word.
		await page.getByRole('button', { name: 'Edit spark, bar' }).tap();
		const sheet = page.getByRole('dialog');
		await expect(sheet).toBeVisible();
		await page.screenshot({ path: info.outputPath(`sheet-${mode}.png`) });
		await info.attach(`sheet-${mode}.png`, { path: info.outputPath(`sheet-${mode}.png`), contentType: 'image/png' });
		await sheet.getByRole('radio', { name: 'Size: Large' }).tap();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('~{12 14 13 17 21, bar, c3}', '~{12 14 13 17 21, bar, c3, lg}'));
		await sheet.getByRole('button', { name: 'Done' }).tap();
		await expect(sheet).toHaveCount(0);
	});
}

test('the active slide\'s bar stays fully on screen while a long slide scrolls under it, at 390px', async ({ page }) => {
	const lines = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long slide that scrolls.`).join('\n\n');
	const long = ['<!-- _class: content -->', '', '## Long slide', '', lines, '', '---', '', '<!-- _class: content -->', '', '## Next', '', 'Short.'].join('\n');
	await gotoStudio(page);
	await setEditorContent(page, long);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
	await page.setViewportSize({ width: 390, height: 844 });
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().tap();
	const active = page.locator('.cs-slide-active');
	await page.locator('.cs-slide').first().locator('.cs-slide-content p').nth(20).click({ position: { x: 3, y: 8 } });
	await expect(active).toHaveCount(1);
	const pill = active.locator('.cs-sb-pill').first();
	const fullyOnScreen = async () =>
		page.evaluate(() => {
			const host = document.querySelector('.cs-host') as HTMLElement;
			const pill = document.querySelector('.cs-slide-active .cs-sb-pill') as HTMLElement;
			const h = host.getBoundingClientRect();
			const p = pill.getBoundingClientRect();
			return { top: p.top - h.top, bottom: h.bottom - p.bottom, scrolled: host.scrollTop };
		});
	// Scroll the pane so the slide's own top is well above the viewport, as the keyboard's caret scroll does.
	await page.evaluate(() => {
		const host = document.querySelector('.cs-host') as HTMLElement;
		host.scrollTop = host.scrollTop + 600;
	});
	await expect(pill).toBeVisible();
	const m = await fullyOnScreen();
	expect(m.scrolled).toBeGreaterThan(300);
	expect(m.top, 'the pill is below the pane\'s top edge').toBeGreaterThanOrEqual(0);
	expect(m.bottom, 'and above its bottom edge').toBeGreaterThanOrEqual(0);
	// Its buttons are tappable where they are.
	await insertVia(page, 'Spark', { tap: true });
	await expect(page.locator('[data-slot="popover-content"], [role="dialog"]').first()).toBeVisible();
});
