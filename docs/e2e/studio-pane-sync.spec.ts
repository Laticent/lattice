import type { Page } from '@playwright/test';
import { expect, isPhone, test, waitForStudioPaint } from './studio-fixture';

// THE SLIDE (AND THE CARET'S LINE) SURVIVE A PANE SWITCH AND A RELOAD (engineering/decisions/2026-11-10-compose-first.md §6).
//
// The owner, on an iPhone, with Compose as the default: Compose on a slide, then Preview (fine), then Source (fine), then
// Compose and Preview were back on slide 1; and a reload lost the slide too. Three causes, all in how Compose meets the
// Fuoco hub: a Compose view built after a round trip started at the top of the deck and reported slide 1; a resync (any
// outside change to the text) did the same; and the shell's Compose caret-text report carried slide 0 until the first
// navigation after its subscription, which the boot navigation (the slide you left on) runs before.

const COMPOSE = 'Compose — rich editor';

/** The `n / m` slide counter the Studio shows, as text. */
const counter = (page: Page) =>
	page.evaluate(() => [...document.querySelectorAll('button, span, div')].map((e) => e.textContent?.trim() ?? '').find((t) => /^\d+\s*\/\s*\d+$/.test(t)) ?? '');

/** Which Compose slide holds the caret, counting from 1 (0 when none). */
const composeSlide = (page: Page) =>
	page.evaluate(() => {
		const all = [...document.querySelectorAll('#studio-pane-editor .ProseMirror > .cs-slide')];
		return all.indexOf(document.querySelector('#studio-pane-editor .cs-slide-active') as Element) + 1;
	});

async function openFresh(page: Page): Promise<void> {
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	if (isPhone(page)) await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
}

test('@mobile @webkit-phone a phone keeps the slide and the caret line from Compose through Source and back', async ({ page }) => {
	test.skip(!isPhone(page), 'the phone swaps one pane at a time; a wider box shows editor and preview together');
	await openFresh(page);
	const line = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(4).locator('p').last();
	const text = ((await line.textContent()) ?? '').trim();
	await line.scrollIntoViewIfNeeded();
	await line.click();
	await expect.poll(() => counter(page)).toBe('5 / 7');

	await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
	await expect.poll(() => counter(page)).toBe('5 / 7');

	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
	// The Markdown editor's own state: the line its caret is on carries the paragraph Compose's caret was in.
	await expect
		.poll(() =>
			page.evaluate(() => {
				// biome-ignore lint/suspicious/noExplicitAny: CodeMirror keeps its view on the content element (filo-undo.spec.ts).
				const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
				return v ? v.state.doc.lineAt(v.state.selection.main.head).text : '';
			}),
		)
		.toContain(text.slice(0, 24));
	expect(await counter(page)).toBe('5 / 7');

	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
	await expect.poll(() => composeSlide(page)).toBe(5);
	await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
	await expect.poll(() => counter(page)).toBe('5 / 7');
});

test('@crosswidth @gecko @webkit-tablet @webkit-phone a reload comes back on the slide you left, and stays there', async ({ page }) => {
	await openFresh(page);
	const heading = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(2).locator('h1, h2').first();
	await heading.scrollIntoViewIfNeeded();
	await heading.click();
	await expect.poll(() => counter(page)).toBe('3 / 7');

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	// The reset came with Compose's first transaction after it mounted, once the object kernels landed: wait for the page to
	// finish loading what it fetches, then for Compose to be on the restored slide, and only then read the counter.
	await page.waitForLoadState('networkidle');
	if (!isPhone(page)) await expect.poll(() => composeSlide(page)).toBe(3);
	expect(await counter(page)).toBe('3 / 7');
	if (isPhone(page)) {
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
		await expect.poll(() => composeSlide(page)).toBe(3);
		await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
		await expect.poll(() => counter(page)).toBe('3 / 7');
	}
});
