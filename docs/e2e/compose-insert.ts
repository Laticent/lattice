import type { Locator, Page } from '@playwright/test';
import { gotoStudio, persistedSource, setEditorContent } from './studio-fixture';

/**
 * The Insert menu in the active slide's bar (docs/src/components/studio/InsertControls.tsx).
 *
 * One door holds every thing an author can put on a slide: Table, Code, Diagram, Equation, Plot, Image, Pill,
 * Spark, Avatar, Icon. The specs that used to press four separate buttons ("Insert pill", "Insert table", ...)
 * open the menu and pick the item by name here, so the way in lives in one place.
 */
export type InsertItem = 'Table' | 'Code' | 'Diagram' | 'Equation' | 'Plot' | 'Image' | 'Pill' | 'Spark' | 'Avatar' | 'Icon';

/** The menu's trigger on the active slide, or on `slide` when a spec names one. */
export const insertTrigger = (page: Page, slide?: Locator): Locator => (slide ?? page.locator('.cs-slide-active')).getByRole('button', { name: 'Insert', exact: true });

/** One item of the open menu. The accessible name starts with its label: the hint (or the reason it is unavailable) follows. */
export const insertEntry = (page: Page, item: InsertItem): Locator => page.getByRole('menuitem', { name: new RegExp(`^${item}\\b`) });

/** Open the menu and wait for its items. */
export async function openInsertMenu(page: Page, opts: { slide?: Locator; tap?: boolean } = {}): Promise<void> {
	const trigger = insertTrigger(page, opts.slide);
	if (opts.tap) await trigger.tap();
	else await trigger.click();
	await insertEntry(page, 'Table').waitFor();
}

/** Close the menu with Escape and wait until it is gone, so the next open is a fresh one. */
export async function closeInsertMenu(page: Page): Promise<void> {
	await page.keyboard.press('Escape');
	await insertEntry(page, 'Table').waitFor({ state: 'hidden' });
}

/** Open the menu and choose one item. */
export async function insertVia(page: Page, item: InsertItem, opts: { slide?: Locator; tap?: boolean } = {}): Promise<void> {
	await openInsertMenu(page, opts);
	const entry = insertEntry(page, item);
	if (opts.tap) await entry.tap();
	else await entry.click();
}

/** The saved deck text. The store keeps it JSON-encoded, so decode it before comparing bytes. */
export async function savedDeck(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

const COMPOSE = 'Compose — rich editor';

/** Open the studio, put `source` in as the deck and switch to Compose. */
export async function openDeckInCompose(page: Page, source: string): Promise<void> {
	await gotoStudio(page);
	// A phone opens on Preview, with the source behind its own button; a wider Studio shows it already.
	if (!(await page.getByLabel('Deck source').isVisible())) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	}
	await setEditorContent(page, source);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-slide').first().waitFor();
}

/**
 * Put a photo in the Library, through its real upload input, and wait until its card shows.
 * `name` is the file name; the Library names the photo from it (`Harbor.png` becomes `harbor`).
 */
export async function addLibraryPhoto(page: Page, fileName: string, color: string): Promise<void> {
	await page.evaluate(
		async ({ fileName, color }) => {
			const c = document.createElement('canvas');
			c.width = 800;
			c.height = 600;
			const g = c.getContext('2d') as CanvasRenderingContext2D;
			g.fillStyle = color;
			g.fillRect(0, 0, 800, 600);
			g.fillStyle = '#fff';
			g.font = '80px sans-serif';
			g.fillText(fileName, 40, 320);
			const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b as Blob), 'image/png'));
			const dt = new DataTransfer();
			dt.items.add(new File([blob], fileName, { type: 'image/png' }));
			const input = document.querySelector('input[type="file"][accept*="image"]') as HTMLInputElement;
			input.files = dt.files;
			input.dispatchEvent(new Event('change', { bubbles: true }));
			// The format dialog asks how to store them; the probes take its default.
			for (let i = 0; i < 200; i++) {
				const b = [...document.querySelectorAll('[role="dialog"] button')].find((x) => x.textContent?.trim().startsWith('Add photo')) as HTMLButtonElement | undefined;
				if (b) {
					b.click();
					break;
				}
				await new Promise((r) => setTimeout(r, 50));
			}
		},
		{ fileName, color },
	);
}
