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

/** A PowerPoint made elsewhere: one slide of text and no Lattice deck inside, so the Library keeps it as reference text. */
async function foreignPptx(): Promise<Buffer> {
	const zip = new JSZip();
	zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
	zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>');
	zip.file('ppt/presentation.xml', '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
	zip.file('ppt/slides/slide1.xml', '<p:sld><p:txBody><a:p><a:r><a:t>Opening agenda</a:t></a:r></a:p></p:txBody></p:sld>');
	return zip.generateAsync({ type: 'nodebuffer' });
}

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

	// It lands on Decks, with the action to open it (followups.d/3356-p1).
	const open = page.getByRole('button', { name: 'Open Halcyon.lattice as a deck' });
	await expect(open).toBeVisible({ timeout: 30_000 });
	await expect(page.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: 'Decks', exact: true })).toHaveAttribute('aria-selected', 'true');

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

test('a .lattice imported through the Library lands on Decks and opens as a deck @gecko', async ({ page }, testInfo) => {
	await importsADeck(page, testInfo);
});

test('a .lattice imported through the Library lands on Decks and opens as a deck, at an iPhone\'s size and user agent @webkit-phone', async ({ page }, testInfo) => {
	// This project reports an iPhone, the case the old sniff already answered with no `accept`: so this arm checks the
	// Library flow in WebKit, not the picker fix (the `@gecko` arm is the one the old code fails).
	expect(await page.evaluate(() => navigator.userAgent)).toContain('iPhone');
	await importsADeck(page, testInfo);
});

/**
 * The import's toast stands ABOVE the phone Library's search, not on it. The toaster sits at the bottom center and so
 * does the phone panel's dock (PanelDock), so "Added 1 reference file." covered the field (toast y 774-828, search
 * 801-823 at 390px) right after the import this PR asks phone readers to make. While a dock is open, one CSS rule
 * lifts a phone toast 4.5rem (styles/tailwind.css, "THE TOAST CLEARS THE DOCK").
 */
test('at a phone\'s width, the import toast stands above the Library\'s search field @mobile @webkit-phone', async ({ page }) => {
	const bytes = await latticeBytes();
	await gotoStudio(page);
	await openLibrary(page);
	const chooser = page.waitForEvent('filechooser');
	await page.getByRole('button', { name: 'Import files', exact: true }).click();
	await (await chooser).setFiles({ name: 'Halcyon.lattice', mimeType: 'application/octet-stream', buffer: bytes });
	const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Added 1 reference file.' });
	await expect(toast).toBeVisible({ timeout: 30_000 });
	const search = page.getByRole('textbox', { name: 'Search library' });
	await expect(search).toBeVisible();
	const searchTop = (await search.boundingBox())?.y ?? 0;
	expect(searchTop).toBeGreaterThan(0);
	// Polled, not slept: the toast slides up into place, and its settled bottom edge is what has to clear the field.
	await expect.poll(async () => {
		const box = await toast.boundingBox();
		return box ? Math.round(box.y + box.height) : Number.POSITIVE_INFINITY;
	}, { timeout: 10_000 }).toBeLessThanOrEqual(Math.floor(searchTop));
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
	await page.getByRole('tablist', { name: 'Library sections' }).getByRole('tab', { name: 'Decks', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Open Halcyon.md as a deck' })).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Open Halcyon.lattice as a deck' }).click();
	await expect.poll(() => activeSource(page), { timeout: 30_000 }).toBe(DECK);
});

/**
 * The deck a Library keeps survives a workspace backup: the real sheet's backup, restored on an empty device (a fresh
 * context, its own empty IndexedDB), brings the deck back on Files, and "Open as deck" opens it as itself, speaker note
 * and all. The deck's file rides in the backup's own binary lane (`refdoc-decks/`), never as base64 in `refdocs.json`.
 */
/** Where the backup controls are opened from: Workspace settings (Data), or the Library's own Backup and restore dialog
 *  (design §7, slice 4). Both mount BackupRestore.tsx, so both routes must pack and restore the same workspace. */
async function openBackup(page: Page, via: 'workspace' | 'library') {
	if (via === 'library') {
		// A docked Library stays open through Escape, and its toolbar button would collapse it: open it only if it is shut.
		if (!(await page.getByRole('tablist', { name: 'Library sections' }).isVisible())) await openLibrary(page);
		await page.getByRole('button', { name: 'Backup and restore', exact: true }).click();
		await expect(page.getByRole('dialog', { name: 'Backup and restore' })).toBeVisible();
		return;
	}
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	await expect(page.getByRole('dialog', { name: /Workspace/ })).toBeVisible();
	await openSection(page, 'Data');
}

async function backsUpAndRestoresADeck(page: Page, browser: import('@playwright/test').Browser, via: 'workspace' | 'library' = 'workspace') {
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

	// Back up through the real controls, and look inside: the deck's file is its own entry, the text lane stays text.
	await openBackup(page, via);
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
		await openBackup(fresh, via);
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

test('the Library\'s Backup and restore dialog backs up and restores the same workspace as Workspace settings @gecko', async ({ page, browser }) => {
	await backsUpAndRestoresADeck(page, browser, 'library');
});

test('the Library\'s Backup and restore dialog, at an iPhone\'s size and user agent @webkit-phone', async ({ page, browser }) => {
	await backsUpAndRestoresADeck(page, browser, 'library');
});

/**
 * DECKS IS ITS OWN SECTION (followups.d/3356-p1). A `.lattice` and a Markdown deck, imported through the one Import
 * button, both list under Decks and open as decks; neither shows under Files. A Markdown file with no slides is notes:
 * it stays under Files and never under Decks (the owner's call on #3356). The Import button still takes any file.
 */
async function decksSection(page: Page, testInfo: TestInfo) {
	const bytes = await latticeBytes();
	await gotoStudio(page);
	await openLibrary(page);
	const tabs = page.getByRole('tablist', { name: 'Library sections' });
	// One standing listener keeps Playwright's picker interception on for the page's whole life. Without it, Firefox can
	// open a real picker on the third import that a headless browser never answers (measured: 1 in 10 on `gecko`, on the
	// third import). The same race and fix as library-single-import.spec.ts `importFiles`.
	page.on('filechooser', () => {});
	const importFiles = async (files: { name: string; mimeType: string; buffer: Buffer }[]) => {
		const chooser = page.waitForEvent('filechooser');
		await page.getByRole('button', { name: 'Import files', exact: true }).click();
		await (await chooser).setFiles(files);
	};

	// An empty Decks section says how to keep one.
	await tabs.getByRole('tab', { name: 'Decks', exact: true }).click();
	await expect(page.getByText('No decks kept yet')).toBeVisible();

	// A PowerPoint not made in Lattice is kept as reference text, not a deck: the import guesses Decks from the
	// extension, then lands on Files, where the file is, never on an empty Decks (checker finding on #3588).
	await importFiles([{ name: 'talk.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: await foreignPptx() }]);
	await expect(tabs.getByRole('tab', { name: 'Files', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 30_000 });
	// The card itself (its Delete control names it; the import toast names the file too).
	await expect(page.getByRole('button', { name: 'Delete talk.pptx', exact: true })).toBeVisible();
	await expect(page.getByText('No decks kept yet')).toHaveCount(0);
	// Its toast explains what was kept and stays up to be read; on a phone toasts stand at the top (ui/sonner.tsx), over
	// the header's Import button. Wait for it to leave before the next import. Sonner pauses a toast while the pointer
	// is over it, and the emulated tap leaves the pointer where Import was, under the toast: move it off, as a finger lifts.
	await page.mouse.move(1, (page.viewportSize()?.height ?? 600) - 1);
	await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 30_000 });

	await importFiles([{ name: 'Halcyon.lattice', mimeType: 'application/octet-stream', buffer: bytes }]);
	await expect(page.getByRole('button', { name: 'Open Halcyon.lattice as a deck' })).toBeVisible({ timeout: 30_000 });
	// A Markdown deck lands on Files until it is read, then on Decks once it is known to have slides.
	await importFiles([{ name: 'Halcyon.md', mimeType: 'text/markdown', buffer: Buffer.from(DECK) }]);
	await expect(page.getByRole('button', { name: 'Open Halcyon.md as a deck' })).toBeVisible({ timeout: 30_000 });
	await expect(tabs.getByRole('tab', { name: 'Decks', exact: true })).toHaveAttribute('aria-selected', 'true');
	await importFiles([{ name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n\nNo slides here.\n') }]);
	await expect(tabs.getByRole('tab', { name: 'Files', exact: true })).toHaveAttribute('aria-selected', 'true');
	await expect(page.getByText('notes.md')).toBeVisible({ timeout: 30_000 });
	// Files holds the notes and no deck.
	await expect(page.getByRole('button', { name: /^Open Halcyon\.(md|lattice) as a deck$/ })).toHaveCount(0);

	// Decks holds both decks and not the notes.
	await tabs.getByRole('tab', { name: 'Decks', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Open Halcyon.lattice as a deck' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Open Halcyon.md as a deck' })).toBeVisible();
	await expect(page.getByText('notes.md')).toHaveCount(0);
	await page.screenshot({ path: testInfo.outputPath('library-decks-section.png') });

	// The Markdown deck opens as itself.
	await page.getByRole('button', { name: 'Open Halcyon.md as a deck' }).click();
	await expect.poll(() => activeSource(page), { timeout: 30_000 }).toBe(DECK);
}

test('Decks lists a .lattice and a Markdown deck, and Files keeps only the notes @smoke @gecko', async ({ page }, testInfo) => {
	await decksSection(page, testInfo);
});

test('Decks lists a .lattice and a Markdown deck, at an iPhone\'s size and user agent @webkit-phone', async ({ page }, testInfo) => {
	await decksSection(page, testInfo);
});
