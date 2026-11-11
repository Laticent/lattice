import type { Page } from '@playwright/test';
import { expect, isPhone, setEditorContent, test, waitForStudioPaint } from './studio-fixture';

// COMPOSE'S SLIDE TOOLBAR HOLDS STILL (engineering/decisions/2026-11-10-compose-first.md §4).
//
// The owner recorded it on an iPhone: the Format group lists only the styles the block under the caret offers, so
// the centered pill grew and shrank, and jumped sideways, on every caret move. The pill now reserves the styles the
// SLIDE offers (ComposeView `reserveFormatWidth`), and on a narrow pane it is a two-row grid as wide as its wider
// row. A first fix held still by stretching the narrow pill between the end caps, which left wide empty margins;
// the second test pins that it hugs its contents instead.

async function openCompose(page: Page): Promise<void> {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	// A phone opens on the preview: the Compose cell brings the pane up (a first visit writes in Compose).
	if (isPhone(page)) await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
}

/** Put the caret in `selector` (inside the editor) and return the active slide's pill box, once it has settled. */
async function pillAt(page: Page, selector: string): Promise<{ x: number; width: number }> {
	const el = page.locator(`#studio-pane-editor .ProseMirror ${selector}`).first();
	await el.scrollIntoViewIfNeeded();
	await el.click();
	const pill = page.locator('#studio-pane-editor .cs-slide-active .cs-sb-pill').first();
	await expect(pill).toBeVisible();
	// The signal: two reads a frame apart agree, so the box is not mid-change.
	let last = '';
	await expect
		.poll(async () => {
			const b = await pill.boundingBox();
			const now = b ? `${Math.round(b.x)},${Math.round(b.width)}` : '';
			const settled = now !== '' && now === last;
			last = now;
			return settled;
		})
		.toBe(true);
	const box = await pill.boundingBox();
	return { x: Math.round(box?.x ?? Number.NaN), width: Math.round(box?.width ?? Number.NaN) };
}

// The welcome deck: slide 1 is a title (heading, eyebrow, paragraph); slide 3 has an eyebrow, a heading and a list.
const WITHIN = [
	['slide 1', ['> *:nth-child(1) h1', '> *:nth-child(1) p:not(:has(code))', '> *:nth-child(1) h1']],
	['slide 3', ['> *:nth-child(3) h2', '> *:nth-child(3) p code', '> *:nth-child(3) li', '> *:nth-child(3) h2']],
] as const;

test('@crosswidth @webkit-phone the slide toolbar keeps its place and width while the caret moves within a slide', async ({ page }) => {
	await openCompose(page);
	for (const [slide, spots] of WITHIN) {
		const boxes = [];
		for (const spot of spots) boxes.push(await pillAt(page, spot));
		const first = boxes[0];
		for (const [i, b] of boxes.entries()) expect(b, `${slide}: the toolbar moved at caret stop ${i + 1} (${spots[i]})`).toEqual(first);
	}
});

test('@mobile @webkit-phone on a phone the two-row toolbar hugs its buttons rather than spanning the bar', async ({ page }) => {
	await openCompose(page);
	await pillAt(page, '> *:nth-child(3) h2');
	const geometry = await page.locator('#studio-pane-editor .cs-slide-active .cs-slide-bar').first().evaluate((bar) => {
		const pill = bar.querySelector('.cs-sb-pill')?.getBoundingClientRect();
		const collapse = bar.querySelector('.cs-sc-cap')?.getBoundingClientRect();
		const del = bar.querySelector('.cs-sc-delete')?.getBoundingClientRect();
		return pill && collapse && del ? { gapLeft: pill.left - collapse.right, gapRight: del.left - pill.right, rows: Math.round(pill.height) } : null;
	});
	expect(geometry, 'the slide bar, its pill and its end caps are on the page').not.toBeNull();
	// The stretched first fix left about 6 px each side; a toolbar that fits its buttons leaves real room.
	expect(geometry?.gapLeft ?? 0).toBeGreaterThan(24);
	expect(geometry?.gapRight ?? 0).toBeGreaterThan(24);
});

/** Replace the deck through Source, then open Compose on it. */
async function composeDeck(page: Page, deck: string, last: string): Promise<void> {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	// The fixture's helper, because WebKit's select-all is Meta+a: a plain ControlOrMeta+a appended the deck there.
	await setEditorContent(page, deck);
	await expect(page.getByLabel('Deck source')).toContainText(last);
	await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toContainText(last);
}

/** The top of `selector`'s first match once it has held still for two reads. */
async function settledTop(page: Page, selector: string): Promise<number> {
	const el = page.locator(selector).first();
	let last = Number.NaN;
	await expect
		.poll(async () => {
			const now = Math.round((await el.boundingBox())?.y ?? Number.NaN);
			const settled = now === last;
			last = now;
			return settled;
		})
		.toBe(true);
	return last;
}

// A slide whose blocks offer no style (lists, a table) holds row two of a narrow toolbar empty. The checker found
// row two collapsing there, so the first tap on a slide and every move into the table pushed the content down.
const PLAIN = ['<!-- _class: content -->', '', '- alpha item', '- beta item', '', '| A | B |', '|---|---|', '| one | two |', '', '- gamma item', ''].join('\n');

test('@crosswidth @webkit-phone the page holds still on a slide\'s first tap and as the caret enters a table', async ({ page }) => {
	await composeDeck(page, PLAIN, 'gamma item');
	const cell = '#studio-pane-editor .ProseMirror td';
	const item = '#studio-pane-editor .ProseMirror li';
	await page.locator('#studio-pane-editor .ProseMirror').evaluate((pm) => (pm as HTMLElement).blur());
	const before = await settledTop(page, cell);
	await page.locator(item).first().click();
	await expect(page.locator('#studio-pane-editor .cs-slide-active')).toHaveCount(1);
	expect(await settledTop(page, cell), 'activating the slide moved its content').toBe(before);
	await page.locator(cell).first().click();
	await expect(page.locator('#studio-pane-editor .cs-slide-active .cs-tblc-slot')).toHaveCount(1);
	expect(await settledTop(page, cell), 'entering the table moved the content').toBe(before);
	await page.locator(item).nth(2).click();
	await expect(page.locator('#studio-pane-editor .cs-slide-active .cs-tblc-slot')).toHaveCount(0);
	expect(await settledTop(page, cell), 'leaving the table moved the content').toBe(before);
});

// A slide that ends in a block with no text (a comment) must not reserve the NEXT slide's styles: the probe used to
// step past the comment into slide two's eyebrow line and hold its chips' width as an empty gap.
const TRAILING = ['- alpha item', '- beta item', '', '<!-- a note -->', '', '---', '', '`EYEBROW`', '', '## Next slide', '', 'A paragraph.', ''].join('\n');

test('@crosswidth @webkit-phone a slide ending in a comment reserves no style from the next slide', async ({ page }) => {
	await composeDeck(page, TRAILING, 'A paragraph.');
	await page.locator('#studio-pane-editor .ProseMirror li').first().click();
	const format = page.locator('#studio-pane-editor .cs-slide-active .cs-sb-format').first();
	await expect(format).toBeAttached();
	await expect.poll(() => format.evaluate((f) => (f as HTMLElement).style.getPropertyValue('--cs-fmt-min'))).toBe('0px');
	await expect(format).not.toHaveAttribute('data-reserved', '');
});
