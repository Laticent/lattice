import type { Page } from '@playwright/test';
import { CHROME, expect, gotoStudio, openInspector, persistedByPrefix, persistedSource, setEditorContent, test, toastText } from './studio-fixture';

// The Deck inspector's front-matter controls, speaker notes, and version history.
// Front-matter writes are asserted both on the immediate outer-DOM signal
// (control label / aria-checked) and, where it matters, on the persisted source.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await openInspector(page);
});

test('@smoke size control writes the size front-matter', async ({ page }) => {
	await page.getByRole('button', { name: /Widescreen 16 . 9/ }).click();
	await page.getByRole('menuitem', { name: /Standard 4 . 3/ }).click();

	await expect(page.getByRole('button', { name: /Standard 4 . 3/ })).toBeVisible();
	await expect.poll(() => persistedSource(page)).toContain('size: standard');
});

// Header / Footer / Page numbers / Section rail live under the Inspector's
// "Chrome" tab (DECK_TABS); the panel opens on "Look". Selecting the tab is part
// of the flow — these two specs were silently red for want of that one click.
// (The tab was called "Marks" until 2026-08-18; the slide Inspector had always
// called the same four controls Chrome, and one vocabulary won.)
async function openChromeTab(page: Page): Promise<void> {
	await page.getByRole('tab', { name: CHROME.deckTab.chrome }).click();
}

test('page-numbers toggle writes paginate front-matter', async ({ page }) => {
	await openChromeTab(page);
	const toggle = page.getByRole('switch', { name: 'Page numbers' });
	await expect(toggle).toHaveAttribute('aria-checked', 'false');
	await toggle.click();
	await expect(toggle).toHaveAttribute('aria-checked', 'true');
	await expect.poll(() => persistedSource(page)).toContain('paginate: true');
});

test('the Header field declares running-header text into front-matter', async ({ page }) => {
	// Header is a text DECLARATION now (you state the copy), not a toggle.
	await openChromeTab(page);
	const header = page.getByRole('textbox', { name: 'Header' });
	await header.click();
	await header.fill('Acme — Q3');
	await header.blur();
	await expect.poll(() => persistedSource(page)).toContain('header:');
});

test('a speaker note is written into the slide source on blur', async ({ page }) => {
	// The speaker note lives in the Inspector's SLIDE scope, under the "Notes" tab.
	// Open Slide settings (which points the panel at slide scope), then the Notes tab.
	await page.getByRole('button', { name: 'Slide settings' }).click();
	await page.getByRole('tab', { name: 'Notes' }).click();
	const note = page.getByRole('textbox', { name: 'Speaker note for this slide' });
	await note.click();
	await note.fill('Open with the headline number.');
	await note.blur();

	await expect.poll(() => persistedSource(page)).toContain('note: Open with the headline number.');
});

test('saving a version records a checkpoint', async ({ page }) => {
	// Version history moved out of the inspector into its own top-bar sheet.
	await page.getByRole('button', { name: 'Version history' }).click();
	await page.getByRole('button', { name: 'Save a version' }).click();
	await expect(toastText(page)).toContainText('Version saved');

	await expect.poll(async () => {
		const snaps = await persistedByPrefix(page, 'snap');
		return snaps ? JSON.parse(snaps).length : 0;
	}).toBeGreaterThan(0);
});

/**
 * THE DECK MOTION TAB — the register AND what it actually produces (HARD RULE #23).
 *
 * The Studio had ZERO coverage of what a deck's motion settings DO: the three controls were
 * asserted, the consequence never was. That is how the old Fabricate scene studio shipped an
 * engine badge naming a package deleted a week earlier — nothing on any tier looked.
 *
 * The deck below is deliberately NOT at the built-in defaults (`motion-style: rise`,
 * `motion-speed: slow`), which is what makes the register assertion meaningful: a deck sitting at
 * build/auto cannot tell a control that reads the deck from one that returns a constant.
 */
const MOTION_DECK = [
	'---',
	'theme: indaco',
	'motion: on',
	'motion-style: rise',
	'motion-speed: slow',
	'---',
	'',
	'<!-- _class: funnel motion-on -->',
	'',
	'## Where deals stall',
	'',
	'- Qualified 1240',
	'- Proposal 620',
	'- Negotiation 310',
	'- Closed won 118',
	'',
	'---',
	'',
	'<!-- _class: piechart -->',
	'',
	'## Revenue mix',
	'',
	'- Direct 42',
	'',
	'---',
	'',
	'<!-- _class: journey -->',
	'',
	'## Customer arc',
	'',
	'- Discover 3',
	'- Trial 4',
].join('\n');

async function openDeckMotion(page: Page) {
	await setEditorContent(page, MOTION_DECK);
	// Wait for the SIGNAL the deck landed, not a guessed interval: the shell persists the source
	// on a debounce, so seeing the deck's own front matter in storage is the deck having arrived.
	await expect.poll(() => persistedSource(page)).toContain('motion-style: rise');
	// `beforeEach` already opened the Inspector — `openInspector` TOGGLES, so calling it again here
	// closes the panel and every later locator misses.
	await page.getByRole('tab', { name: CHROME.deckTab.motion }).click();
}

test('the deck Motion controls read the deck, not the built-in default', async ({ page }) => {
	await openDeckMotion(page);
	// The deck says rise/slow. A control showing Build/Auto here is reading a constant.
	await expect(page.getByRole('combobox', { name: 'Choose motion style' })).toContainText('Rise');
	await expect(page.getByRole('combobox', { name: 'Choose motion speed' })).toContainText('Slow');
});

test('the Motion tab names what the deck will actually animate', async ({ page }) => {
	await openDeckMotion(page);
	// Scoped to the Motion panel's own list — the heading also appears in the editor and preview.
	await expect(page.getByRole('button', { name: /Go to slide 1, Where deals stall/ })).toBeVisible();
	// Three targets: the funnel carries, the one-mark piechart moves but is flagged, and the
	// journey has Play on from the deck default yet emits no motion roles — so it is counted as
	// unreachable rather than inflating "will move". That last distinction is the point.
	await expect(page.getByText(/3 targets · 2 will move · 1 the engine cannot reach/)).toBeVisible();
});

test('the admission test flags motion that carries nothing, and offers the fix', async ({ page }) => {
	await openDeckMotion(page);
	// One mark cannot build — the "sequence" is a single fade, which is the still it already was.
	await expect(page.getByText(/reads as a fade, not a sequence/)).toBeVisible();
	await page.getByRole('button', { name: 'Turn it off' }).click();
	// It writes the Inspector's own token, so the two surfaces cannot drift.
	await expect.poll(() => persistedSource(page)).toContain('motion-off');
});
