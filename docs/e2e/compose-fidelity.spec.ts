import { expect, type Page, test } from '@playwright/test';
import { isPhone, persistedSource, waitForStudioPaint } from './studio-fixture';

// COMPOSE WRITES BACK WHAT THE AUTHOR WROTE, on the real save path (engineering/decisions/2026-11-10-compose-first.md §6).
// deck-fidelity.test.ts proves it on every example deck at unit level; this drives the Studio as a visitor does (no stored
// mode, so Compose), types one character, and reads the bytes the Studio saved. Each line below is spelled the way the
// serializer does NOT write it: `_em_`, `*` bullets, `1)` numbers, a padded table with a `:--:` row, a tight `\n---\n`
// separator, a `_class` under an eyebrow line, and the deck's trailing newline.
const DECK = [
	'---',
	'theme: indaco',
	'---',
	'',
	'`Q3 review`',
	'<!-- _class: content -->',
	'',
	'# The quarter',
	'',
	'An _em_ word and __strong__ text, about ~8% of it.',
	'',
	'* first point',
	'* second point',
	'',
	'---',
	'# Numbers',
	'',
	'1) one',
	'2) two',
	'',
	'| Item | Value |',
	'|:--:|--:|',
	'| a    | 1     |',
	'',
].join('\n');

async function openSeeded(page: Page): Promise<void> {
	await page.addInitScript((deck) => localStorage.setItem('lattice-studio-src-welcome', JSON.stringify(deck)), DECK);
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	if (isPhone(page)) await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
}

/** Click into `el`, then put the caret at the end of its last text: a DOM selection, which ProseMirror reads (`End`
 *  stops at the end of a WRAPPED visual line, not of the block). */
async function caretAtEnd(el: import('@playwright/test').Locator): Promise<void> {
	await el.click();
	await el.evaluate((node) => {
		const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
		let last: Text | null = null;
		for (let t = walker.nextNode(); t; t = walker.nextNode()) if ((t as Text).data.length) last = t as Text;
		if (!last) return;
		const r = document.createRange();
		r.setStart(last, last.data.length);
		r.collapse(true);
		getSelection()?.removeAllRanges();
		getSelection()?.addRange(r);
	});
}

/** The deck the Studio saved, once it differs from the seed. */
const saved = (page: Page) => persistedSource(page).then((v) => (v ? (JSON.parse(v) as string) : ''));

test('@crosswidth @gecko @webkit-tablet @webkit-phone typing one character in Compose changes one line of the saved deck, in the author’s spelling', async ({ page }) => {
	await openSeeded(page);
	const para = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(0).locator('p', { hasText: 'about' });
	await caretAtEnd(para);
	await page.keyboard.type('!');
	await expect.poll(() => saved(page)).toBe(DECK.replace('about ~8% of it.', 'about ~8% of it.!'));
});

test('@crosswidth @gecko @webkit-tablet an edit in a list keeps its markers, and an edit in a table keeps its other rows', async ({ page }) => {
	await openSeeded(page);
	const item = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(0).locator('li', { hasText: 'second point' });
	await caretAtEnd(item);
	await page.keyboard.type('s');
	await expect.poll(() => saved(page)).toBe(DECK.replace('* second point', '* second points'));
	const cell = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(1).locator('td', { hasText: 'a' }).first();
	await caretAtEnd(cell);
	await page.keyboard.type('b');
	await expect.poll(() => saved(page)).toBe(DECK.replace('* second point', '* second points').replace('| a    | 1     |', '| ab | 1 |'));
});
