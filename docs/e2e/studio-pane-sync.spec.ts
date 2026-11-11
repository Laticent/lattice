import type { Page } from '@playwright/test';
import { expect, isPhone, test, waitForStudioPaint } from './studio-fixture';

// THE SLIDE (AND THE CARET'S LINE) SURVIVE A PANE SWITCH AND A RELOAD (engineering/decisions/2026-11-10-compose-first.md §4).
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

/** Which editor holds keyboard focus: 'compose', 'source', or ''. */
const focused = (page: Page) =>
	page.evaluate(() => {
		const a = document.activeElement;
		return a?.closest('#studio-pane-editor .ProseMirror') ? 'compose' : a?.closest('.cm-editor') ? 'source' : '';
	});
/** The text of the block (Compose) or line (Source) under the drawn caret, '' when none is drawn. The caret is an overlay
 *  (it never sits inside the editable text), so this reads what is on screen beneath it. */
const drawnCaretIn = (page: Page) =>
	page.evaluate(() => {
		const g = [...document.querySelectorAll<HTMLElement>('#studio-pane-editor .lx-ghost-caret, #studio-pane-editor .lx-ghost-caret-cm')].find((e) => getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0);
		if (!g) return '';
		const r = g.getBoundingClientRect();
		const under = document.elementFromPoint(r.left + 4, r.top + r.height / 2);
		return (under?.closest('.cm-line, p, li, h1, h2, h3') as HTMLElement | null)?.textContent?.trim() ?? '';
	});
/** The text AFTER the caret: in Source the rest of its line (CodeMirror's own state), in Compose the rest of its node. */
const afterCaret = (page: Page) =>
	page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: CodeMirror keeps its view on the content element (filo-undo.spec.ts).
		const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
		if (v && document.activeElement?.closest('.cm-editor')) {
			const head = v.state.selection.main.head;
			const line = v.state.doc.lineAt(head);
			return line.text.slice(head - line.from);
		}
		const sel = getSelection();
		return sel?.anchorNode ? (sel.anchorNode.textContent ?? '').slice(sel.anchorOffset) : '';
	});
/** Put Compose's caret `fromEnd` characters before the end of `el`'s last text: a DOM selection, which ProseMirror
 *  reads, because on a phone `End` goes to the end of the WRAPPED visual line, not of the paragraph. */
async function caretBeforeEnd(page: Page, el: import('@playwright/test').Locator, fromEnd: number): Promise<void> {
	await el.evaluate((node, n) => {
		const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
		let last: Text | null = null;
		for (let t = walker.nextNode(); t; t = walker.nextNode()) if ((t as Text).data.trim()) last = t as Text;
		if (!last) return;
		const r = document.createRange();
		r.setStart(last, Math.max(0, last.data.length - n));
		r.collapse(true);
		const sel = getSelection();
		sel?.removeAllRanges();
		sel?.addRange(r);
	}, fromEnd);
}
/** The text of the block holding the live caret in a focused editor. */
const liveCaretIn = (page: Page) =>
	page.evaluate(() => (getSelection()?.anchorNode?.parentElement?.closest('.cm-line, p, li, h1, h2, h3') as HTMLElement | null)?.textContent?.trim() ?? '');

// SMART FOCUS (owner's pick, 2026-11-11): on a phone a switch straight between Compose and Source takes the keyboard with the
// caret where it was; arriving from the preview draws the caret instead of raising the keyboard.
test('@mobile @webkit-phone a phone keeps the slide and the caret line from Compose through Source and back', async ({ page }) => {
	test.skip(!isPhone(page), 'the phone swaps one pane at a time; a wider box shows editor and preview together');
	await openFresh(page);
	const line = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(4).locator('p').last();
	const text = ((await line.textContent()) ?? '').trim();
	const head = text.slice(0, 24);
	await line.scrollIntoViewIfNeeded();
	await line.click();
	// The caret mid-line, six characters from the end: the column must cross, not only the line (owner, iPhone).
	await caretBeforeEnd(page, line, 6);
	const tail = text.slice(-6);
	await expect.poll(() => afterCaret(page)).toBe(tail);
	await expect.poll(() => counter(page)).toBe('5 / 7');

	await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
	await expect.poll(() => counter(page)).toBe('5 / 7');

	// From the preview: no keyboard, a drawn caret on the paragraph's line.
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
	await expect
		.poll(() =>
			page.evaluate(() => {
				// biome-ignore lint/suspicious/noExplicitAny: CodeMirror keeps its view on the content element (filo-undo.spec.ts).
				const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
				return v ? v.state.doc.lineAt(v.state.selection.main.head).text : '';
			}),
		)
		.toContain(head);
	expect(await focused(page)).toBe('');
	await expect.poll(() => drawnCaretIn(page)).toContain(head);
	expect(await counter(page)).toBe('5 / 7');

	// Straight from Source to Compose: the keyboard comes up with the caret in the paragraph.
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
	await expect.poll(() => focused(page)).toBe('compose');
	await expect.poll(() => liveCaretIn(page)).toBe(text);
	await expect.poll(() => afterCaret(page)).toBe(tail);
	await expect.poll(() => composeSlide(page)).toBe(5);

	// And back to Source the same way.
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await expect.poll(() => focused(page)).toBe('source');
	await expect.poll(() => liveCaretIn(page)).toContain(head);
	await expect.poll(() => afterCaret(page)).toBe(tail);

	// Via the preview: Compose shows the drawn caret, no keyboard.
	await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
	await expect.poll(() => counter(page)).toBe('5 / 7');
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await expect.poll(() => composeSlide(page)).toBe(5);
	await expect.poll(() => drawnCaretIn(page)).toBe(text);
	expect(await focused(page)).toBe('');
});

test('@crosswidth @gecko @webkit-tablet @webkit-phone a reload comes back on the slide and the caret line you left', async ({ page }) => {
	await openFresh(page);
	const heading = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(2).locator('h1, h2').first();
	const text = ((await heading.textContent()) ?? '').trim();
	await heading.scrollIntoViewIfNeeded();
	await heading.click();
	await caretBeforeEnd(page, heading, 4);
	const tail = text.slice(-4);
	await expect.poll(() => afterCaret(page)).toBe(tail);
	await expect.poll(() => counter(page)).toBe('3 / 7');

	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	// The reset came with Compose's first transaction after it mounted, once the object kernels landed: wait for the page to
	// finish loading what it fetches, then for Compose to be on the restored slide, and only then read the counter.
	await page.waitForLoadState('networkidle');
	if (isPhone(page)) {
		expect(await counter(page)).toBe('3 / 7');
		// A phone cannot raise the keyboard without a tap: Compose shows the drawn caret on the line.
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
		await expect.poll(() => composeSlide(page)).toBe(3);
		await expect.poll(() => drawnCaretIn(page)).toBe(text);
		await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
		await expect.poll(() => counter(page)).toBe('3 / 7');
		return;
	}
	await expect.poll(() => composeSlide(page)).toBe(3);
	expect(await counter(page)).toBe('3 / 7');
	// A pointer that hovers is a real keyboard to hand: Compose has focus again, caret on the line.
	const fine = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
	if (fine) {
		await expect.poll(() => focused(page)).toBe('compose');
		await expect.poll(() => liveCaretIn(page)).toBe(text);
		await expect.poll(() => afterCaret(page)).toBe(tail);
	} else {
		await expect.poll(() => drawnCaretIn(page)).toBe(text);
	}
});

// THE TRIO'S CASES (2026-11-11): slide 1 behind front matter, a move inside a slide after a navigation, and a Source caret
// on a line Compose does not show. Desktop: a fine pointer takes the keyboard on a switch.
const SYNC_DECK =
	'---\ntheme: indaco\n---\n\n# First\n\nOpening words here.\n\n---\n\n# Second\n\n- Revenue grew twelve percent\n- Costs fell\n\nA closing line.\n\n<!--\nRevenue grew twelve percent\n-->\n';

async function openSeeded(page: Page): Promise<void> {
	await page.addInitScript((deck) => localStorage.setItem('lattice-studio-src-welcome', JSON.stringify(deck)), SYNC_DECK);
	await openFresh(page);
}
const fine = (page: Page) => page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
/** The Markdown line holding Source's caret. */
const sourceLine = (page: Page) =>
	page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: CodeMirror keeps its view on the content element (filo-undo.spec.ts).
		const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
		return v ? v.state.doc.lineAt(v.state.selection.main.head).text : '';
	});

test('@crosswidth @gecko @webkit-tablet on slide 1, behind front matter, Source takes the caret on its line, not in the fence', async ({ page }) => {
	test.skip(isPhone(page), 'the phone switch has its own test above');
	await openSeeded(page);
	test.skip(!(await fine(page)), 'a switch takes the keyboard only with a fine pointer');
	const para = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(0).locator('p').last();
	await para.click();
	await caretBeforeEnd(page, para, 5);
	await expect.poll(() => afterCaret(page)).toBe('here.');
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await expect.poll(() => focused(page)).toBe('source');
	await expect.poll(() => sourceLine(page)).toBe('Opening words here.');
	await expect.poll(() => afterCaret(page)).toBe('here.');
});

test('@crosswidth @gecko @webkit-tablet a move inside the slide after a rail pick is the line Source lands on', async ({ page }) => {
	test.skip(isPhone(page), 'the phone switch has its own test above');
	await openSeeded(page);
	test.skip(!(await fine(page)), 'a switch takes the keyboard only with a fine pointer');
	await page.locator('nav[aria-label="Slide navigator"] button[data-unit]').nth(1).click();
	await expect.poll(() => composeSlide(page)).toBe(2);
	const closing = page.locator('#studio-pane-editor .ProseMirror > .cs-slide').nth(1).locator('p', { hasText: 'A closing line.' });
	await closing.click();
	await caretBeforeEnd(page, closing, 5);
	await expect.poll(() => afterCaret(page)).toBe('line.');
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await expect.poll(() => sourceLine(page)).toBe('A closing line.');
	await expect.poll(() => afterCaret(page)).toBe('line.');
});

test('@crosswidth @gecko @webkit-tablet a Source caret on a speaker note does not land on the bullet with the same words', async ({ page }) => {
	test.skip(isPhone(page), 'the phone switch has its own test above');
	await openSeeded(page);
	test.skip(!(await fine(page)), 'a switch takes the keyboard only with a fine pointer');
	await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
	await page.evaluate(() => {
		// biome-ignore lint/suspicious/noExplicitAny: CodeMirror keeps its view on the content element (filo-undo.spec.ts).
		const v = (document.querySelector('.cm-content') as any)?.cmTile?.root?.view;
		const text = v.state.doc.toString();
		const at = text.lastIndexOf('Revenue grew twelve percent') + 8;
		v.focus();
		v.dispatch({ selection: { anchor: at } });
	});
	await expect.poll(() => sourceLine(page)).toBe('Revenue grew twelve percent');
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
	await expect.poll(() => composeSlide(page)).toBe(2);
	// The note is not a block Compose shows: the caret falls back to the slide's start, never into the bullet.
	expect(await liveCaretIn(page)).not.toBe('Revenue grew twelve percent');
});
