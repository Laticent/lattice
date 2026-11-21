import fs from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import type { Page, TestInfo } from '@playwright/test';
import JSZip from 'jszip';
import { CHROME, expect, gotoStudio, isPhone, openChatAtWidth, openSection, test } from './studio-fixture';

// A deck imported through the Library (2026-11-20). On a real iPhone, "Import deck…" showed every
// `.lattice` grayed out in Files: iOS grays out what an `accept` list does not name and has no type
// for `.lattice`, and the device sniff that dropped the list only on iOS did not hold on the
// owner's phone. So neither picker names an `accept` on any device, and the Library takes a deck
// instead of turning it down: it lands on Files as reference text (slide words and speaker notes)
// and its card opens it through the same reader "Import deck…" uses.
//
// Which arm tells the old code from the new: the `@gecko` title (desktop Chromium and Firefox). There
// the old code named an `accept` list, so the "no accept" checks fail on it. The `@webkit-phone` arm
// CANNOT tell them apart for the pickers: under an iPhone user agent the old sniff already dropped the
// list, so both builds show no `accept` there. It is here for the Library flow (import, Files, Open as
// deck) in WebKit at a phone's size. Neither arm reaches the iOS Files sheet, which is the phone's own:
// whether a `.lattice` is pickable on an iPhone is UNVERIFIED until it is tried on a device.

test.describe.configure({ timeout: 180_000 });

// The speaker note is an `@note{…}` (engineering/decisions/2026-11-20-four-notes.md): a plain comment is the author's own
// and never a note, so it would not reach the reference text.
const DECK = [
	'# Halcyon quarterly',
	'## Retention held\n\n- 94% of accounts renewed.\n\n<!-- @note{Open with the retention number.} -->',
].join('\n\n---\n\n');

/** A `.lattice` from the kernel both writers use (lib/core/reopenable.js), as a recipient would get it. */
async function latticeBytes(): Promise<Buffer> {
	const root = resolve(import.meta.dirname, '..', '..');
	const req = createRequire(join(root, 'package.json'));
	const bytes: Uint8Array = await req('./lib/core/reopenable.js').buildLatticeZip(req('jszip'), { source: DECK, title: 'Halcyon quarterly', comments: [], now: 0, packages: [], date: new Date(0) });
	return Buffer.from(bytes);
}

async function openLibrary(page: Page) {
	if (!isPhone(page)) {
		await page.getByRole('button', { name: CHROME.library }).click();
		return;
	}
	await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
	await page.getByRole('button', { name: /^Library/ }).click();
}

/** The active deck's stored source (studio-store writes every value as JSON). Saving is debounced, so callers poll. */
function activeSource(page: Page): Promise<string> {
	return page.evaluate(() => {
		try {
			const active = JSON.parse(localStorage.getItem('lattice-studio-active') || '{}');
			return JSON.parse(localStorage.getItem(`lattice-studio-src-${active.deckId}`) || '""');
		} catch {
			return '';
		}
	});
}

/** What the Library stored for a reference doc: its text, and whether it kept a deck file (a Blob or, where an engine
 *  refuses one, an ArrayBuffer). */
function storedRef(page: Page, name: string): Promise<{ text: string; deckBytes: number } | null> {
	return page.evaluate(async (want) => {
		const db: IDBDatabase = await new Promise((res, rej) => {
			const r = indexedDB.open('lattice-workbench');
			r.onsuccess = () => res(r.result);
			r.onerror = () => rej(r.error);
		});
		const rows: Record<string, unknown>[] = await new Promise((res) => {
			const r = db.transaction('assets').objectStore('assets').getAll();
			r.onsuccess = () => res(r.result as Record<string, unknown>[]);
		});
		db.close();
		const row = rows.find((x) => x.kind === 'refdoc' && x.name === want);
		if (!row) return null;
		const deckBytes = row.deck ? (row.deck as Blob).size : row.deckData ? (row.deckData as ArrayBuffer).byteLength : 0;
		return { text: String(row.text ?? ''), deckBytes };
	}, name);
}

async function importsADeck(page: Page, testInfo: TestInfo) {
	const bytes = await latticeBytes();
	await gotoStudio(page);
	// Both pickers name no `accept`, on this engine and this user agent: a list is what grays a `.lattice` out on iOS.
	await expect(page.getByTestId('deck-import-input')).toHaveCount(1);
	await expect(page.getByTestId('deck-import-input')).not.toHaveAttribute('accept', /.*/);
	await openLibrary(page);
	const input = page.getByTestId('library-import-input');
	await expect(input).toBeAttached();
	await expect(input).not.toHaveAttribute('accept', /.*/);

	// The real file chooser, through the Library's own button.
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Import files', exact: true }).click();
	await (await chooser).setFiles({ name: 'Halcyon.lattice', mimeType: 'application/octet-stream', buffer: bytes });

	// It lands on Files as a deck, with the action to open it.
	const open = page.getByRole('button', { name: 'Open Halcyon.lattice as a deck' });
	await expect(open).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: 'Files', exact: true })).toHaveAttribute('aria-selected', 'true');

	await page.screenshot({ path: testInfo.outputPath('library-deck-card.png') });

	// Its reference text is the slide words and the speaker note; the file is kept, byte for byte in size.
	await expect.poll(() => storedRef(page, 'Halcyon.lattice')).toEqual({
		text: 'Deck: Halcyon quarterly\n\nSlide 1\n# Halcyon quarterly\n\nSlide 2\n## Retention held\n\n- 94% of accounts renewed.\nSpeaker notes: Open with the retention number.',
		deckBytes: bytes.length,
	});

	// "Open as deck" runs the deck importer: the deck opens as itself, speaker note and all.
	await open.click();
	await expect.poll(() => activeSource(page), { timeout: 30_000 }).toBe(DECK);
}

test('a .lattice imported through the Library lands on Files and opens as a deck @gecko', async ({ page }, testInfo) => {
	await importsADeck(page, testInfo);
});

test('a .lattice imported through the Library lands on Files and opens as a deck, at an iPhone\'s size and user agent @webkit-phone', async ({ page }, testInfo) => {
	// This project reports an iPhone, the case the old sniff already answered with no `accept`: so this arm checks the
	// Library flow in WebKit, not the picker fix (the `@gecko` arm is the one the old code fails).
	expect(await page.evaluate(() => navigator.userAgent)).toContain('iPhone');
	await importsADeck(page, testInfo);
});

/**
 * A deck ATTACHED TO THE CHAT is read and kept exactly as the Library keeps one: the chat's paperclip saves through the
 * same reader (reference-doc-ui.tsx `addOne` → library-deck-ref.ts `readLibraryReference`), so the reference text is
 * the slide words and the `@note`, the file is kept, and the Library's "Open as deck" opens it as itself. Two files
 * through the paperclip's own input: a Markdown deck, which its picker offers, and a `.lattice`, which a desktop
 * picker offers under "All files" (the paperclip's `accept` names no `.lattice`).
 */
test('a deck attached to the chat is kept like a Library import, and opens as a deck @gecko', async ({ page }) => {
	const bytes = await latticeBytes();
	await gotoStudio(page);
	await openChatAtWidth(page, 1440);
	const device = page.getByLabel('Attach from this device');
	await device.setInputFiles([
		{ name: 'Halcyon.md', mimeType: 'text/markdown', buffer: Buffer.from(DECK) },
		{ name: 'Halcyon.lattice', mimeType: 'application/octet-stream', buffer: bytes },
	]);
	const text = 'Deck: Halcyon quarterly\n\nSlide 1\n# Halcyon quarterly\n\nSlide 2\n## Retention held\n\n- 94% of accounts renewed.\nSpeaker notes: Open with the retention number.';
	await expect.poll(() => storedRef(page, 'Halcyon.lattice'), { timeout: 30_000 }).toEqual({ text, deckBytes: bytes.length });
	// A Markdown deck whose stored text is the file byte for byte keeps no second copy (`sourceExact`): "Open as deck"
	// rebuilds it from that text, so it stores no deck bytes, and its card still offers the action (below).
	// Its text is the file itself, plain reference as before this PR, `@note` included.
	await expect.poll(() => storedRef(page, 'Halcyon.md'), { timeout: 30_000 }).toEqual({ text: DECK, deckBytes: 0 });

	// Both wait in the Library with the action to open them; the .lattice opens as itself.
	await page.keyboard.press('Escape');
	await openLibrary(page);
	await page.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: 'Files', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Open Halcyon.md as a deck' })).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Open Halcyon.lattice as a deck' }).click();
	await expect.poll(() => activeSource(page), { timeout: 30_000 }).toBe(DECK);
});

/**
 * The deck a Library keeps survives a workspace backup: the real sheet's backup, restored on an empty device (a fresh
 * context, its own empty IndexedDB), brings the deck back on Files, and "Open as deck" opens it as itself, speaker note
 * and all. The deck's file rides in the backup's own binary lane (`refdoc-decks/`), never as base64 in `refdocs.json`.
 */
async function backsUpAndRestoresADeck(page: Page, browser: import('@playwright/test').Browser) {
	const bytes = await latticeBytes();
	await gotoStudio(page);
	await openLibrary(page);
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Import files', exact: true }).click();
	await (await chooser).setFiles({ name: 'Halcyon.lattice', mimeType: 'application/octet-stream', buffer: bytes });
	await expect(page.getByRole('button', { name: 'Open Halcyon.lattice as a deck' })).toBeVisible({ timeout: 30_000 });
	await expect.poll(() => storedRef(page, 'Halcyon.lattice').then((r) => r?.deckBytes ?? 0)).toBe(bytes.length);
	// Close the Library, and on a phone the Menu it was opened from, before the Workspace sheet.
	for (let i = 0; i < 3 && (await page.getByRole('dialog').count()) > 0; i++) await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// Back up through the real sheet, and look inside: the deck's file is its own entry, the text lane stays text.
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'Data');
	const pending = page.waitForEvent('download', { timeout: 120_000 });
	await page.getByRole('button', { name: 'Download backup' }).click();
	const backupPath = (await (await pending).path()) as string;
	const zip = await JSZip.loadAsync(fs.readFileSync(backupPath));
	const deckEntries = Object.keys(zip.files).filter((n) => n.startsWith('refdoc-decks/') && !zip.files[n].dir);
	expect(deckEntries, 'the deck file rides in its own lane').toHaveLength(1);
	expect((await (zip.file(deckEntries[0]) as JSZip.JSZipObject).async('uint8array')).length).toBe(bytes.length);

	// An empty device.
	const ctx = await browser.newContext({ viewport: page.viewportSize() ?? undefined, acceptDownloads: true, userAgent: await page.evaluate(() => navigator.userAgent) });
	try {
		const fresh = await ctx.newPage();
		await gotoStudio(fresh);
		await fresh.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
		await expect(fresh.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
		await openSection(fresh, 'Data');
		await fresh.getByLabel('Restore a workspace backup').setInputFiles(backupPath);
		await expect(fresh.locator('[data-sonner-toast]').filter({ hasText: 'Workspace restored' }).first()).toBeVisible({ timeout: 60_000 });
		await fresh.waitForLoadState('load');
		await expect.poll(() => storedRef(fresh, 'Halcyon.lattice'), { timeout: 30_000 }).toMatchObject({ deckBytes: bytes.length });

		await openLibrary(fresh);
		const open = fresh.getByRole('button', { name: 'Open Halcyon.lattice as a deck' });
		await expect(open).toBeVisible({ timeout: 30_000 });
		await open.click();
		await expect.poll(() => activeSource(fresh), { timeout: 30_000 }).toBe(DECK);
	} finally {
		await ctx.close();
	}
}

test('a deck kept in the Library survives a workspace backup and opens as itself on an empty device @gecko', async ({ page, browser }) => {
	await backsUpAndRestoresADeck(page, browser);
});

test('a deck kept in the Library survives a workspace backup, at an iPhone\'s size and user agent @webkit-phone', async ({ page, browser }) => {
	await backsUpAndRestoresADeck(page, browser);
});
