import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspector, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// The four deck registers the 2026-09-24 gap audit gave Inspector controls
// (engineering/decisions/2026-08-18-settings-panel-coverage-and-ux.md §2.2a), plus the
// editor autocomplete for their values. Each control is asserted on the persisted
// source — the key the engine reads — not on the control's own label. `persistedSource`
// returns the JSON-encoded record, so a line reads as `\nkey: value\n` there, escaped.

const DECK = '---\ntitle: Gap\n---\n\n# Gap\n\n## One\n\nBody.\n';

test.beforeEach(async ({ page }) => {
	// Seeding needs the editor and the Deck-scope button, which exist only at desktop width.
	// The @crosswidth tests narrow the viewport themselves, after this.
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await openInspector(page);
});

test('Look ▸ Frame and fit: Align and Fit write align: and fit:', async ({ page }) => {
	// The rows sit under a heading in Advanced now, not inside a "More look settings" drawer.

	await page.getByRole('combobox', { name: 'Choose vertical alignment' }).click();
	await page.getByRole('option', { name: /Spread/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nalign: spread\\n');
	// The second axis joins the first word on the same line. The Studio's writer quotes a
	// value with a space in it (`quoteIfNeeded`), and the engine reads `"spread right"` and
	// `spread right` the same.
	await page.getByRole('combobox', { name: 'Choose horizontal alignment' }).click();
	await page.getByRole('option', { name: /Right/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nalign: \\"spread right\\"\\n');
	// Auto is "each layout decides" — it drops that axis's word, and both Autos remove the key.
	await page.getByRole('combobox', { name: 'Choose vertical alignment' }).click();
	await page.getByRole('option', { name: "Auto — Layout's own" }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nalign: right\\n');
	await page.getByRole('combobox', { name: 'Choose horizontal alignment' }).click();
	await page.getByRole('option', { name: "Auto — Layout's own" }).click();
	await expect.poll(() => persistedSource(page)).not.toContain('align:');

	await page.getByRole('combobox', { name: 'Choose how slides fit' }).click();
	await page.getByRole('option', { name: /Split by count and trim/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nfit: trim\\n');
	// Measure and split is the default — choosing it REMOVES the key.
	await page.getByRole('combobox', { name: 'Choose how slides fit' }).click();
	await page.getByRole('option', { name: 'Auto — Measure and split' }).click();
	await expect.poll(() => persistedSource(page)).not.toContain('fit:');
});

test('General: AI writes in writes ai-lang:', async ({ page }) => {
	await openSection(page, 'General');
	await page.getByRole('combobox', { name: 'Choose AI output language' }).click();
	await page.getByRole('option', { name: /United Kingdom/ }).click();
	await expect.poll(() => persistedSource(page)).toContain('\\nai-lang: en-GB\\n');
});

test('Motion: the exported-player switch appears with motion on and writes player-motion: off', async ({ page }) => {
	await openSection(page, 'Motion');
	const player = page.getByRole('switch', { name: 'Motion in the exported player' });
	await expect(player).toHaveCount(0); // meaningless while motion is off
	await page.getByRole('switch', { name: 'Chart motion' }).click();
	await expect(player).toHaveAttribute('aria-checked', 'true');
	await player.click();
	await expect.poll(() => persistedSource(page)).toContain('\\nplayer-motion: off\\n');
});

test('the editor completes fit: values from the engine vocabulary', async ({ page }) => {
	// Typed, not inserted: completion activates on typing (`activateOnTyping`).
	await setEditorContent(page, '---\ntitle: Gap\n---\n');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('ArrowUp');
	await page.keyboard.press('End');
	await page.keyboard.type('\nfit: t');
	const menu = page.locator('.cm-tooltip-autocomplete');
	await expect(menu).toBeVisible();
	await expect(menu.getByRole('option', { name: 'trim' })).toBeVisible();
});

// A value with a trailing YAML comment. The engine strips the comment (`frontMatterName`);
// the Studio's plain reader keeps it (#2087), so these rows read through
// `getFrontMatterName`. Without that, both rows below showed the OPPOSITE of what the
// engine renders.
test('a commented value reads the way the engine reads it', async ({ page }) => {
	await setEditorContent(page, '---\ntitle: Gap\nmotion: on\nguards: strict  # board pack\nplayer-motion: off # x\n---\n\n# Gap\n');
	// The OLD spelling, still honored: `guards: strict` reads as the Fit field's trim level.
	await expect(page.getByRole('combobox', { name: 'Choose how slides fit' })).toContainText('Split by count and trim');
	await openSection(page, 'Motion');
	await expect(page.getByRole('switch', { name: 'Motion in the exported player' })).toHaveAttribute('aria-checked', 'false');
});

// The same four controls through the tablet and mobile ROUTES into deck settings, which
// have no Deck-scope button (see `CHROME.deckSettingsAt`). The deck is seeded at desktop
// width, where the editor is on screen, and the viewport then narrows.
async function openDeckSettingsAt(page: Page, width: number): Promise<void> {
	await expect(page.getByRole('button', { name: CHROME.deckScope })).toHaveCount(0);
	if (width > 500) {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
		await page.locator('[role=menuitem],[role=menuitemradio],button,[role=button]').filter({ hasText: CHROME.deckSettingsAt.tabletItem }).first().click();
	} else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
	}
}

for (const [label, width, height] of [
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`@crosswidth the four controls write their keys at ${label} (${width}px)`, async ({ page }) => {
		await page.keyboard.press('Escape'); // close the desktop Inspector the beforeEach opened
		await page.setViewportSize({ width, height });
		await openDeckSettingsAt(page, width);
		// Both breakpoint halves of the Inspector are in the DOM; act on the visible one.
		const vis = <T extends ReturnType<Page['locator']>>(l: T) => l.filter({ visible: true }).first();
		// Each write raises a 6-second Undo toast at the bottom of the screen (notify.ts
		// ACTION_DURATION). At 390px it sits on Fit, the last row of its tab, which cannot
		// scroll any higher, so a reader waits for the toast to go before tapping. Wait only
		// when the toast actually covers the control; a covered last row is a recorded
		// follow-up (followups.d/settings-last-row-under-undo-toast.md).
		const toast = page.locator('[data-sonner-toast]');
		const tap = async (l: ReturnType<Page['locator']>) => {
			const el = vis(l);
			await el.scrollIntoViewIfNeeded();
			const box = await el.boundingBox();
			const covered = await toast.evaluateAll((ts, b) => b !== null && ts.some((t) => {
				const r = t.getBoundingClientRect();
				return r.top < b.y + b.height && r.bottom > b.y && r.left < b.x + b.width && r.right > b.x;
			}), box);
			if (covered) {
				// Sonner holds a toast while the pointer rests on it, and the last tap left the
				// pointer there; a finger lifts, so move the mouse off to let the dwell run.
				await page.mouse.move(0, 0);
				await expect(toast).toHaveCount(0, { timeout: 10_000 });
			}
			await el.click();
		};

		await tap(page.getByRole('combobox', { name: 'Choose vertical alignment' }));
		await page.getByRole('option', { name: /Spread/ }).click();
		await expect.poll(() => persistedSource(page)).toContain('\\nalign: spread\\n');
		await tap(page.getByRole('combobox', { name: 'Choose how slides fit' }));
		await page.getByRole('option', { name: /Split by count and trim/ }).click();
		await expect.poll(() => persistedSource(page)).toContain('\\nfit: trim\\n');

		await openSection(page, 'General');
		await tap(page.getByRole('combobox', { name: 'Choose AI output language' }));
		await page.getByRole('option', { name: /United Kingdom/ }).click();
		await expect.poll(() => persistedSource(page)).toContain('\\nai-lang: en-GB\\n');

		await openSection(page, 'Motion');
		await tap(page.getByRole('switch', { name: 'Chart motion' }));
		await tap(page.getByRole('switch', { name: 'Motion in the exported player' }));
		await expect.poll(() => persistedSource(page)).toContain('\\nplayer-motion: off\\n');
	});
}
