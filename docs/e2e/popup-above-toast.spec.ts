import { expect, type Page, test } from '@playwright/test';
import { motionSettled } from './barriers';
import { CHROME, gotoStudio, openChatAtWidth, openDeckSettingsAt, openSection, persistedSource, setEditorContent, waitForStudioPaint } from './studio-fixture';

// AN OPEN MENU, LIST OR POPOVER SITS ABOVE TOASTS (components/ui/sonner.tsx, "LAYERING"). The reader is acting on
// the open popup; a toast is ambient and is back the moment the popup closes. Each primitive is pinned with a
// STAND-IN toast: a fixed element at Sonner's own z-index laid over the open popup. A real toast would tie the test to
// how long that toast lives (an Undo lasts 6s, lib/notify.ts), which a loaded runner can outlast.
//
// Measured at 390px with the real one: after a logo setting change, "Logo style · Undo" sat at y 770–828 over the
// color list's last visible rows, and a tap there went to the toast, closed the list and chose nothing. The chat's
// Attach popover reaches y 787, into the same band.

const SONNER_Z = '999999999';
const DECK = '---\nmarp: true\ntheme: indaco\nlogo: lattice\n---\n\n# Layers\n\nBody\n';

/** Lay a toast-like element over the middle of `popup`, and return what a tap at that point would hit. */
async function topmostOverToast(page: Page, popup: string): Promise<'popup' | 'toast' | 'other'> {
	return page.evaluate(
		([sel, z]) => {
			const p = document.querySelector<HTMLElement>(sel);
			if (!p) return 'other';
			const r = p.getBoundingClientRect();
			const x = r.left + r.width / 2;
			const y = r.top + r.height / 2;
			const toaster = document.createElement('ol');
			toaster.setAttribute('data-sonner-toaster', '');
			toaster.setAttribute('data-stand-in', '');
			Object.assign(toaster.style, { position: 'fixed', left: '0', right: '0', top: `${y - 30}px`, height: '60px', zIndex: z, pointerEvents: 'auto', margin: '0', padding: '0' });
			const toast = document.createElement('li');
			toast.setAttribute('data-sonner-toast', '');
			Object.assign(toast.style, { height: '60px', listStyle: 'none', background: '#000' });
			toaster.append(toast);
			document.body.append(toaster);
			const hit = document.elementFromPoint(x, y);
			toaster.remove();
			if (hit?.closest('[data-stand-in]')) return 'toast';
			return hit && p.contains(hit) ? 'popup' : 'other';
		},
		[popup, SONNER_Z] as const,
	);
}

// Authored at desktop width, where the editor pane is mounted, then resized to the phone width under test.
test.beforeEach(async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await waitForStudioPaint(page);
	await setEditorContent(page, DECK);
	await page.setViewportSize({ width: 390, height: 844 });
});

/** Lay a toast-like element, at Sonner's z-index, across the band `y ± 30`. Returns a function that removes it. */
async function standInToast(page: Page, y: number): Promise<() => Promise<void>> {
	await page.evaluate(
		([top, z]) => {
			const toaster = document.createElement('ol');
			toaster.setAttribute('data-stand-in', '');
			Object.assign(toaster.style, { position: 'fixed', left: '0', right: '0', top: `${top}px`, height: '60px', zIndex: z, pointerEvents: 'auto', margin: '0', padding: '0', background: '#000' });
			document.body.append(toaster);
		},
		[y - 30, SONNER_Z] as const,
	);
	return () => page.evaluate(() => document.querySelector('[data-stand-in]')?.remove());
}

test('@mobile @parity a tap on a picker row under a toast chooses that row', async ({ page }, info) => {
	await openDeckSettingsAt(page, 390);
	await openSection(page, CHROME.deckTab.chrome);
	await page.getByRole('combobox', { name: 'Choose logo color' }).click();
	const list = '[data-slot="select-content"]';
	await expect(page.locator(list)).toBeVisible();
	await motionSettled(page, list);
	const row = page.getByRole('option', { name: 'Accent', exact: true });
	const box = await row.boundingBox();
	if (!box) throw new Error('no Accent row');
	const x = box.x + box.width / 2;
	const y = box.y + box.height / 2;
	const remove = await standInToast(page, y);
	// The point is under the toast and on the row: the hit test proves the overlap before the tap relies on it.
	expect(await page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('[role="option"]')?.textContent?.trim(), [x, y] as const)).toBe('Accent');
	if (info.project.use.hasTouch) await page.touchscreen.tap(x, y);
	else await page.mouse.click(x, y);
	await remove();
	await expect(page.locator(list)).toBeHidden();
	await expect.poll(async () => JSON.parse(await persistedSource(page)) as string).toContain('logo-finish: accent');
});

test('@mobile an open dropdown menu sits above a toast', async ({ page }) => {
	await page.getByRole('button', { name: 'Slide actions' }).first().click();
	const menu = '[data-slot="dropdown-menu-content"]';
	await expect(page.locator(menu)).toBeVisible();
	await motionSettled(page, menu);
	expect(await topmostOverToast(page, menu)).toBe('popup');
});

test('@mobile an open popover sits above a toast', async ({ page }) => {
	await openChatAtWidth(page, 390);
	await page.getByRole('button', { name: 'Attach from your Library' }).click();
	const pop = '[data-slot="popover-content"]';
	await expect(page.locator(pop)).toBeVisible();
	await motionSettled(page, pop);
	expect(await topmostOverToast(page, pop)).toBe('popup');
});
