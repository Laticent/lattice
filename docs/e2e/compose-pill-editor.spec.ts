import type { Page } from '@playwright/test';
import { insertVia } from './compose-insert';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

/** The saved deck text. The store keeps it JSON-encoded, so decode it before comparing bytes. */
async function savedDeck(page: Page): Promise<string> {
	const raw = await persistedSource(page);
	try {
		const v = JSON.parse(raw);
		return typeof v === 'string' ? v : raw;
	} catch {
		return raw;
	}
}

/**
 * COMPOSE — the pill editor.
 *
 * Compose draws every pill the engine draws, as the slide draws it, as ONE inline object (owner,
 * 2026-10-13): a tap selects it and opens one shared editor for its label, shape, color and size, and
 * each pick rewrites ONLY the word the author changed
 * (engineering/decisions/2026-10-13-compose-inline-notation-editors.md). The two things that
 * would hurt an author silently are an edit that rewrites bytes it was not asked to touch and a
 * door that inserts something other than a pill, so those two carry `@smoke` and run on the PR
 * gate. The rest (undo, "Edit as text", the locked slide, the literal deck) run nightly.
 *
 * The oracle for "only that word" is the PERSISTED SOURCE, not the screen: the whole deck, byte
 * for byte, with one substitution. Most of this file is `desktop` only. The one `@parity` test
 * (a touch tap opens the editor and a pick rewrites one word) also runs on the three `*-touch`
 * projects at 1440, 820 and 390px, with a real touch tap. That is touch EMULATION in Chromium, not a
 * device, so it claims the touch event path and the layout at those widths, not a phone's keyboard,
 * its sheet animation or iOS.
 */

const COMPOSE = 'Compose — rich editor';

const DECK = [
	'<!-- _class: content -->',
	'',
	'## Status board',
	'',
	'Shipped `{SHIPPED, c2}` and `{BETA, c4, tag}` and `{3, circle}`.',
	'',
	'Cost `{"Cost, excl. tax", chip}` today.',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Plain slide',
	'',
	'Nothing here yet.',
	'',
	'---',
	'',
	'<!-- _class: content -->',
	'',
	'## Locked slide',
	'',
	'This has ~~strike~~ and `{LOCKED, c6}`.',
].join('\n');

async function openDeckInCompose(page: Page, source = DECK): Promise<void> {
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

const editor = (page: Page) => page.locator('[data-slot="popover-content"]');
const composeText = (page: Page) => page.locator('.cs-host .ProseMirror').innerText();
const drawnPills = (page: Page) => page.locator('.cs-npill .lat-pill');
const chip = (page: Page, name: RegExp | string) => page.getByRole('button', { name: typeof name === 'string' ? `Edit pill ${name}` : name });
const bar = (page: Page) => page.locator('.cs-slide-active');

test.describe('compose pill editor', () => {
	test('@smoke Compose shows the pill, not its grammar', async ({ page }) => {
		await openDeckInCompose(page);
		// Four pills on the editable slide, each drawn by the engine's own markup, and none of their text.
		await expect(drawnPills(page)).toHaveCount(4);
		await expect.poll(() => composeText(page)).not.toMatch(/\{SHIPPED|\{BETA|\{3, circle\}/);
		await expect(drawnPills(page).first()).toHaveAttribute('data-c', 'c2');
		// The pill carries the deck's own look, not an unstyled span: a capsule has a radius and a fill.
		const style = await drawnPills(page).first().evaluate((el) => {
			const c = getComputedStyle(el);
			return { radius: c.borderTopLeftRadius, bg: c.backgroundColor };
		});
		expect(style.radius).not.toBe('0px');
		expect(style.bg).not.toBe('rgba(0, 0, 0, 0)');
		// The slide Compose cannot round-trip keeps its text: nothing there is drawn, and nothing opens.
		await expect.poll(() => composeText(page)).toMatch(/\{LOCKED, c6\}/i);
		await expect(chip(page, 'LOCKED')).toHaveCount(0);
	});

	test('@smoke a tap opens the editor, and a pick rewrites only the word that was picked', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await expect(editor(page)).toBeVisible();

		await editor(page).getByRole('radio', { name: 'Color 5' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('`{SHIPPED, c2}`', '`{SHIPPED, c5}`'));
		// And the pill on screen is the one the slide will draw: color 5.
		await expect(drawnPills(page).first()).toHaveAttribute('data-c', 'c5');

		// Adding a word, then taking one away: the other pills and the quoted label are untouched.
		await editor(page).getByRole('radio', { name: 'Shape: Diamond' }).click();
		await editor(page).getByRole('radio', { name: 'Size: Large' }).click();
		await editor(page).getByRole('radio', { name: 'Color: theme default' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('`{SHIPPED, c2}`', '`{SHIPPED, diamond, lg}`'));
	});

	// The same oracle as the tap test above, run under BOTH pointer states (`@parity` runs on the
	// `*-touch` projects as well as `desktop`). On a touch project the pill is opened with a real
	// touch tap, not a mouse click: the click path is the one thing `desktop` already covers, and the
	// editor that opens, and the pick that rewrites one word, are what a phone author depends on.
	test('@parity a touch tap on a pill opens the editor, and a pick rewrites only the word that was picked', async ({ page }) => {
		await openDeckInCompose(page);
		const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
		const target = chip(page, 'SHIPPED');
		if (touch) await target.tap();
		else await target.click();
		// A popover on desktop and tablet, a bottom sheet (a dialog) on a phone.
		const panel = page.locator('[data-slot="popover-content"], [role="dialog"]').last();
		await expect(panel).toBeVisible();

		const pick = panel.getByRole('radio', { name: 'Color 5' });
		if (touch) await pick.tap();
		else await pick.click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('`{SHIPPED, c2}`', '`{SHIPPED, c5}`'));
		await expect(drawnPills(page).first()).toHaveAttribute('data-c', 'c5');
	});

	test('@smoke the order and spelling of the words the author wrote are kept', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'BETA').click();
		await editor(page).getByRole('radio', { name: 'Color 9' }).click();
		// `c4, tag` stays in that order, and only `c4` becomes `c9`.
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('`{BETA, c4, tag}`', '`{BETA, c9, tag}`'));
	});

	test('@smoke opening a deck does not rewrite it, and the insert door puts a pill at the caret and opens its editor', async ({ page }) => {
		await openDeckInCompose(page);
		// Nothing was written by drawing the pills: the saved deck is the deck that was opened.
		await expect.poll(() => savedDeck(page)).toBe(DECK);
		await page.locator('.cs-slide').nth(1).locator('.cs-slide-content p').first().click();
		await page.keyboard.press('End');
		await insertVia(page, 'Pill');

		await expect(editor(page)).toBeVisible();
		await expect(editor(page).getByRole('textbox', { name: 'Label' })).toHaveValue('Status');
		await editor(page).getByRole('textbox', { name: 'Label' }).fill('On track');
		await expect.poll(() => savedDeck(page)).toContain('Nothing here yet.`{On track}`');
	});

	test('a label that needs quoting is quoted, and a quoted one reads back as typed', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('textbox', { name: 'Label' }).fill('Cost, excluding tax');
		await expect.poll(() => savedDeck(page)).toContain('`{"Cost, excluding tax", c2}`');
	});

	test('Done leaves the pill alone and puts the caret after it, so typing cannot replace it', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('button', { name: 'Done' }).click();
		await expect(editor(page)).toBeHidden();
		await page.keyboard.type('!');
		await expect.poll(() => savedDeck(page)).toContain('`{SHIPPED, c2}`!');
		await expect(drawnPills(page)).toHaveCount(4);
	});

	test('one undo undoes one pick', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('radio', { name: 'Color 7' }).click();
		await expect.poll(() => savedDeck(page)).toContain('`{SHIPPED, c7}`');
		await editor(page).getByRole('button', { name: 'Done' }).click();
		await page.locator('.cs-host .ProseMirror').focus();
		await page.keyboard.press('ControlOrMeta+z');
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('Compose has Undo and Redo buttons, for the devices with no shortcut', async ({ page }) => {
		await openDeckInCompose(page);
		await bar(page).locator('.cs-slide-bar').first().hover();
		const undo = bar(page).getByRole('button', { name: 'Undo' });
		const redo = bar(page).getByRole('button', { name: 'Redo' });
		// The pair steps the deck's ONE history (Filo): the setup typed this deck into the Markdown editor,
		// so Undo is live from the start; nothing has been undone, so Redo is not.
		await expect(redo).toBeDisabled();
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('radio', { name: 'Color 7' }).click();
		await expect.poll(() => savedDeck(page)).toContain('`{SHIPPED, c7}`');
		await editor(page).getByRole('button', { name: 'Done' }).click();
		await expect(undo).toBeEnabled();
		await undo.click();
		await expect.poll(() => savedDeck(page)).toBe(DECK);
		await expect(redo).toBeEnabled();
		await redo.click();
		await expect.poll(() => savedDeck(page)).toContain('`{SHIPPED, c7}`');
	});

	test('Edit as text closes the editor and selects the text between the braces', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('button', { name: 'Edit as text' }).click();
		await expect(editor(page)).toBeHidden();
		await expect.poll(() => page.evaluate(() => window.getSelection()?.toString())).toBe('SHIPPED, c2');
		// The span is text while the caret is in it, and the pill comes back when the caret leaves.
		await expect(drawnPills(page)).toHaveCount(3);
		await page.keyboard.press('ArrowDown');
		await expect(drawnPills(page)).toHaveCount(4);
	});

	test('the keyboard steps over a pill as one thing, Enter opens its editor, and Escape closes it', async ({ page }) => {
		await openDeckInCompose(page);
		await page.locator('.cs-slide').first().locator('.cs-slide-content p').first().click({ position: { x: 3, y: 8 } });
		await page.keyboard.press('Home');
		// "Shipped" and a space are eight steps; the ninth lands on the pill itself.
		for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
		await expect(page.locator('.ProseMirror-selectednode')).toHaveCount(1);
		await page.keyboard.press('Enter');
		await expect(editor(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(editor(page)).toBeHidden();
		await expect(drawnPills(page)).toHaveCount(4);
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('copying a pill to another slide pastes the exact span, drawn', async ({ page, context }) => {
		await context.grantPermissions(['clipboard-read', 'clipboard-write']);
		await openDeckInCompose(page);
		// The pills become objects when the authoring kernels have loaded, a moment after the slide shows. Walking the caret before that
		// lands on text, not on the pill (the spec failed about one run in five without this wait).
		await expect(drawnPills(page)).toHaveCount(4);
		await page.locator('.cs-slide').first().locator('.cs-slide-content p').first().click({ position: { x: 3, y: 8 } });
		await page.keyboard.press('Home');
		for (let i = 0; i < 9; i++) await page.keyboard.press("ArrowRight");
		await expect(page.locator('.ProseMirror-selectednode')).toHaveCount(1);
		await page.keyboard.press('ControlOrMeta+c');
		await page.locator('.cs-slide').nth(1).locator('.cs-slide-content p').first().click();
		await page.keyboard.press('End');
		await page.keyboard.press('ControlOrMeta+v');
		await expect.poll(() => savedDeck(page)).toContain('Nothing here yet.`{SHIPPED, c2}`');
		await expect(drawnPills(page)).toHaveCount(5);
	});

	test('the drawn pill follows the site into dark mode, matching the preview', async ({ page }) => {
		await openDeckInCompose(page);
		const fills = () =>
			page.evaluate(() => {
				const el = document.querySelector('.cs-npill .lat-pill') as HTMLElement;
				const frame = document.querySelector('#studio-preview iframe.live') as HTMLIFrameElement;
				const pv = frame.contentDocument?.querySelector('.lat-pill') as HTMLElement | null;
				return { compose: getComputedStyle(el).backgroundColor, preview: pv && frame.contentWindow ? frame.contentWindow.getComputedStyle(pv).backgroundColor : null };
			});
		const before = await fills();
		expect(before.compose).toBe(before.preview);
		// The real toggle, not an attribute: the pill's tokens are `light-dark()`, which resolve from the page's color scheme.
		await page.getByRole('button', { name: 'Switch to dark mode' }).first().click();
		// The preview frame switches a moment after the page; Compose must catch up with it, not stay light.
		await expect.poll(async () => (await fills()).preview, { timeout: 8000 }).not.toBe(before.preview);
		await expect.poll(async () => {
			const f = await fills();
			return f.compose === f.preview;
		}, { timeout: 8000 }).toBe(true);
	});

	test('a pill inserted right after another is kept apart from it, and both survive a reload', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('button', { name: 'Done' }).click();
		// Done puts the caret directly after the pill: the case that used to write ONE code span.
		await insertVia(page, 'Pill');
		await expect(editor(page)).toBeVisible();
		await expect.poll(() => savedDeck(page)).toContain('`{SHIPPED, c2}` `{Status}`');
		await editor(page).getByRole('button', { name: 'Done' }).click();
		await page.reload();
		await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
		await page.locator('.cs-host .ProseMirror').waitFor();
		await expect(chip(page, 'Status')).toHaveCount(1);
		await expect(chip(page, 'SHIPPED')).toHaveCount(1);
	});

	test('a deck that turned the inline grammar off draws no pills', async ({ page }) => {
		await openDeckInCompose(page, '---\ninline-code: literal\n---\n\n## Literal deck\n\nShipped `{SHIPPED, c2}` here.');
		await expect(page.locator('.cs-npill')).toHaveCount(0);
		await expect.poll(() => composeText(page)).toMatch(/\{SHIPPED, c2\}/i);
	});

	test('@smoke the icon grid adds an icon to a pill, the editor stays open under it, and one undo takes it back', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('button', { name: 'Add an icon' }).click();
		// The grid is up over the editor; focus moving into it must not close the editor.
		await page.getByRole('textbox', { name: 'Search icons' }).fill('api');
		await page.getByRole('button', { name: 'api', exact: true }).first().click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('`{SHIPPED, c2}`', '`{SHIPPED, c2, icon=api}`'));
		await expect(editor(page)).toBeVisible();
		await expect(editor(page).getByRole('button', { name: 'Change icon (api)' })).toBeVisible();
		await editor(page).getByRole('button', { name: 'Remove' }).click();
		await expect.poll(() => savedDeck(page)).toBe(DECK);
	});

	test('a circle with a long label says it is crowded', async ({ page }) => {
		await openDeckInCompose(page);
		await chip(page, 'SHIPPED').click();
		await editor(page).getByRole('radio', { name: 'Shape: Circle' }).click();
		await expect(editor(page).getByRole('status')).toContainText('Shorten the label');
		await editor(page).getByRole('radio', { name: 'Shape: Tag' }).click();
		await expect(editor(page).getByRole('status')).toHaveCount(0);
	});
});

