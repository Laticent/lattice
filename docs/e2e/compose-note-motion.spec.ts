import type { Page } from '@playwright/test';
import { insertVia, openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

// A note edits in its panel, and the Insert menu's Motion item opens the Library on its scenes.
// followups.d/2846-p5; engineering/decisions/2026-10-21-compose-point-and-click.md §7.

const DECK = ['<!-- _class: content -->', '', '## Plan', '', 'First paragraph.', '', '<!-- say: the slide reads as this. -->', '', '<!-- a plain note. -->', '', 'Second paragraph.'].join('\n');

const pill = (page: Page, name: RegExp) => page.locator('.cs-host .cs-comment', { hasText: name });

test.describe('notes and motion in Compose', () => {
	test('@crosswidth @gecko @webkit-tablet a note opens ready to type in, edits with real keys, and keeps the bytes around its words', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /say/).click();
		const field = page.getByRole('textbox', { name: 'say text' });
		await expect(field).toHaveValue('the slide reads as this.');
		// One click and the caret is in the field: no Edit button to find first.
		await expect(field).toBeFocused();
		await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
		// Real keys stay in the field: Enter makes a new line in the note, not a new paragraph in the slide.
		await page.keyboard.press('Escape');
		expect(await savedDeck(page)).toBe(DECK);
		await field.click();
		await expect(field).toBeFocused();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('it reads as that.');
		await page.keyboard.press('ControlOrMeta+Enter');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('say: the slide reads as this.', 'say: it reads as that.'));
		// A note that would end its own comment is refused, with the words kept.
		await expect(field).toBeFocused();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('bad --> <b>');
		await page.keyboard.press('ControlOrMeta+Enter');
		await expect(page.getByRole('alert').filter({ hasText: 'end its comment early' })).toBeVisible();
		await expect(field).toHaveValue('bad --> <b>');
		expect(await savedDeck(page)).toBe(DECK.replace('say: the slide reads as this.', 'say: it reads as that.'));
		// Remove is the one other control.
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(() => savedDeck(page)).not.toContain('say:');
	});

	test('@crosswidth @gecko @webkit-tablet typing in the slide above an open note stays in the slide, and a half-typed note is kept', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /note/).click();
		const field = page.getByRole('textbox', { name: 'note text' });
		await expect(field).toBeFocused();
		// Click into the paragraph above and type: every key lands in the paragraph, none in the note.
		await page.getByText('First paragraph.').click();
		await page.keyboard.press('End');
		await page.keyboard.type('abc');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('First paragraph.', 'First paragraph.abc'));
		await expect(field).not.toBeFocused();
		// Half-type in the note, then click into the paragraph below: the words are saved in the note, and the next key goes to the paragraph.
		await field.click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('half typed words');
		await page.getByText('Second paragraph.').click();
		await page.keyboard.press('End');
		await page.keyboard.type('Z');
		await expect
			.poll(() => savedDeck(page))
			.toBe(DECK.replace('First paragraph.', 'First paragraph.abc').replace('a plain note.', 'half typed words').replace('Second paragraph.', 'Second paragraph.Z'));
	});

	test('@crosswidth @gecko @webkit-tablet Tab from an edited note lands on Remove, and Enter on it removes the note', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /note/).click();
		const field = page.getByRole('textbox', { name: 'note text' });
		await expect(field).toBeFocused();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('tabbed words');
		await page.keyboard.press('Tab');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('a plain note.', 'tabbed words'));
		await expect(page.getByRole('button', { name: 'Remove' })).toBeFocused();
		await page.keyboard.press('Enter');
		await expect.poll(() => savedDeck(page)).not.toContain('tabbed words');
	});

	test('@crosswidth @gecko @webkit-tablet a note whose edit only added a trailing line break keeps a working panel', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /note/).click();
		const field = page.getByRole('textbox', { name: 'note text' });
		await page.keyboard.press('ControlOrMeta+End');
		await page.keyboard.press('Enter');
		await page.getByText('Second paragraph.').click();
		expect(await savedDeck(page)).toBe(DECK);
		await field.click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('changed words');
		await page.getByText('Second paragraph.').click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('a plain note.', 'changed words'));
		await field.click();
		await page.getByRole('button', { name: 'Remove' }).click();
		await expect.poll(() => savedDeck(page)).not.toContain('changed words');
	});

	test('@crosswidth @gecko @webkit-tablet focus left on Remove never comes back: opening another note and typing does not delete it', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /note/).click();
		await expect(page.getByRole('textbox', { name: 'note text' })).toBeFocused();
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Remove' })).toBeFocused();
		await page.getByText('First paragraph.').click();
		await pill(page, /say/).click();
		const say = page.getByRole('textbox', { name: 'say text' });
		await expect(say).toBeFocused();
		await page.keyboard.press('End');
		await page.keyboard.type(' hello there');
		await page.getByText('Second paragraph.').click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('say: the slide reads as this.', 'say: the slide reads as this. hello there'));
	});

	test('@crosswidth @gecko @webkit-tablet typing straight after Ctrl+Enter continues at the caret', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /note/).click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('abc');
		await page.keyboard.press('ControlOrMeta+Enter');
		await page.keyboard.type('def');
		await page.getByText('Second paragraph.').click();
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('a plain note.', 'abcdef'));
	});

	test('@crosswidth @gecko @webkit-tablet Escape returns to the slide at the note, so the next keys go there and not to the top of the deck', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /note/).click();
		await page.keyboard.press('Escape');
		await page.keyboard.type('QQ');
		await expect.poll(() => savedDeck(page)).toBe(DECK.replace('Second paragraph.', 'QQSecond paragraph.'));
	});

	test('@crosswidth @gecko @webkit-tablet an undo pressed on Remove cannot make the field and the deck disagree', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /note/).click();
		await page.keyboard.press('End');
		await page.keyboard.type(' more words');
		await page.keyboard.press('Tab');
		await expect(page.getByRole('button', { name: 'Remove' })).toBeFocused();
		await page.keyboard.press('ControlOrMeta+z');
		await page.getByText('Second paragraph.').click();
		const field = page.getByRole('textbox', { name: 'note text' });
		// Whatever the undo did, an open field and the saved note never disagree.
		await expect
			.poll(async () => {
				const note = (await savedDeck(page)).match(/<!-- (a plain note\.[^>]*?) -->/)?.[1] ?? '';
				return (await field.count()) ? (await field.inputValue()).trim() === note : true;
			})
			.toBe(true);
	});

	test('@crosswidth @gecko @webkit-tablet Escape or Remove beside another note never selects it, so the next keys cannot delete it', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /say/).click();
		await page.keyboard.press('Escape');
		await page.keyboard.type('QQ');
		await expect.poll(() => savedDeck(page)).toContain('QQ');
		const saved = await savedDeck(page);
		expect(saved).toContain('<!-- a plain note. -->');
		expect(saved).toContain('say: the slide reads as this.');
	});

	test('@crosswidth @gecko @webkit-tablet an undo pressed on the pill button cannot make the field and the deck disagree', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await pill(page, /say/).click();
		await page.keyboard.type(' XYZ');
		await page.keyboard.press('Shift+Tab');
		await page.keyboard.press('ControlOrMeta+z');
		const field = page.getByRole('textbox', { name: 'say text' });
		await expect
			.poll(async () => {
				const note = (await savedDeck(page)).match(/<!-- say: ([^>]*?) -->/)?.[1] ?? '';
				return (await field.count()) ? (await field.inputValue()).trim() === note : true;
			})
			.toBe(true);
	});

	test('@crosswidth @gecko @webkit-tablet a note alone in the last slide is not deleted by the key after Escape', async ({ page }) => {
		await openDeckInCompose(page, '## A\n\nPara a.\n\n---\n\n<!-- lonely last. -->');
		await pill(page, /note/).click();
		await page.keyboard.press('Escape');
		await page.keyboard.type('QQ');
		await expect(page.locator('.cs-host .cs-comment')).toHaveCount(1);
		expect(await savedDeck(page)).toContain('<!-- lonely last. -->');
	});

	test('@crosswidth @gecko @webkit-tablet Remove on a quoted note that ends its slide keeps the next keys in that slide', async ({ page }) => {
		await openDeckInCompose(page, '## A\n\nPara a.\n\n> <!-- quoted last. -->\n\n---\n\n## B\n\nPara b.');
		await pill(page, /note/).click();
		await page.getByRole('button', { name: 'Remove' }).click();
		await page.keyboard.type('QQ');
		await expect.poll(() => savedDeck(page)).toContain('QQ');
		expect(await savedDeck(page)).not.toContain('## QQB');
	});

	test('@crosswidth @gecko @webkit-tablet a note at the top of the deck is not deleted by typing after a slide control refocuses the editor', async ({ page }) => {
		await openDeckInCompose(page, '<!-- first note. -->\n\n---\n\n## B\n\nPara b.');
		await page.getByRole('button', { name: /Collapse slide/ }).last().click();
		await page.keyboard.type('x');
		await expect.poll(() => savedDeck(page)).toContain('first note.');
		await expect(page.locator('.cs-host .cs-comment')).toHaveCount(1);
	});

	test('@crosswidth @gecko @webkit-tablet a note on a folded slide opens a panel you can see', async ({ page }) => {
		await openDeckInCompose(page, '<!-- folded note. -->\n\nHidden paragraph.\n\n---\n\n## B\n\nPara b.');
		await page.getByRole('button', { name: /Collapse slide/ }).first().click();
		await pill(page, /note/).click();
		await expect(page.getByRole('textbox', { name: 'note text' })).toBeVisible();
	});

	test('@crosswidth @gecko @webkit-tablet picking a slide in the rail never leaves its leading note selected for the next key to delete', async ({ page }) => {
		await openDeckInCompose(page, '## A\n\nPara a.\n\n---\n\n<!-- n2. -->\n\nPara two.');
		const rail = page.locator('nav[aria-label="Slide navigator"] button').nth(1);
		test.skip(!(await rail.isVisible()), 'the desktop slide rail is not shown at this width');
		await page.getByText('Para a.').click();
		await rail.click();
		await expect(page.locator('.ProseMirror-selectednode')).toHaveCount(0);
		// The caret sits just after the note: the first Backspace selects it, and only a second one removes it.
		await page.keyboard.press('Backspace');
		await expect(page.locator('.cs-host .cs-comment')).toHaveCount(1);
		expect(await savedDeck(page)).toContain('<!-- n2. -->');
		// Firefox leaves focus on the rail button after a click, so these keys never reach the editor and nothing is deleted at all.
		const inEditor = await page.evaluate(() => !!document.activeElement?.closest('.ProseMirror'));
		await page.keyboard.press('Backspace');
		await expect(page.locator('.cs-host .cs-comment')).toHaveCount(inEditor ? 0 : 1);
	});

	test('@crosswidth @gecko @webkit-tablet on a folded slide Escape keeps the caret in the note, so the next keys never reach the next slide', async ({ page }) => {
		await openDeckInCompose(page, '<!-- folded note. -->\n\nHidden paragraph.\n\n---\n\n## B\n\nPara b.');
		await page.getByRole('button', { name: /Collapse slide/ }).first().click();
		await pill(page, /note/).click();
		await page.keyboard.press('Escape');
		await page.keyboard.type('ZZ');
		await page.getByText('Para b.').click();
		const saved = await savedDeck(page);
		expect(saved).toContain('## B');
		expect(saved).not.toContain('## ZZ');
	});

	test('@crosswidth @gecko @webkit-tablet a note selected with the arrow key is not replaced by typing', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.getByText('Second paragraph.').click();
		await page.keyboard.press('Home');
		await page.keyboard.press('ArrowLeft');
		await page.keyboard.type('x');
		await expect.poll(() => savedDeck(page)).toContain('x');
		expect(await savedDeck(page)).toContain('<!-- a plain note. -->');
	});

	test('@crosswidth @gecko @webkit-tablet folding a slide while a note is half typed keeps the words', async ({ page }) => {
		await openDeckInCompose(page, '## A\n\n<!-- old words. -->\n\nPara a.\n\n---\n\n## B\n\nPara b.');
		await pill(page, /note/).click();
		const field = page.getByRole('textbox', { name: 'note text' });
		await field.press('Control+a');
		await field.pressSequentially('HALF TYPED');
		await page.getByRole('button', { name: /Collapse slide/ }).last().click();
		await expect.poll(() => savedDeck(page)).toContain('<!-- HALF TYPED -->');
	});

	test('@crosswidth @gecko @webkit-tablet deleting another slide while a note is half typed keeps the words', async ({ page }) => {
		await openDeckInCompose(page, '## One\n\nBody one.\n\n<!-- old note -->\n\n---\n\n## Two\n\nBody two.');
		await pill(page, /note/).click();
		await page.getByRole('textbox', { name: 'note text' }).pressSequentially(' EDITED');
		// Slide Two's own control (the toolbar's Delete slide acts on the slide with the caret).
		await page.locator('.cs-slide', { hasText: 'Body two.' }).getByRole('button', { name: 'Delete slide' }).click();
		await page.getByRole('button', { name: 'Confirm delete slide' }).click();
		await expect.poll(() => savedDeck(page)).toContain('<!-- old note EDITED -->');
		expect(await savedDeck(page)).not.toContain('## Two');
	});

	test('the three channels draw three different icons', async ({ page }) => {
		await openDeckInCompose(page, DECK.replace('<!-- a plain note. -->', '<!-- describe: a bar chart. -->\n\n<!-- a plain note. -->'));
		const glyphs = await page.locator('.cs-host .cs-comment .cs-comment-glyph').evaluateAll((els) => els.map((e) => e.innerHTML));
		expect(new Set(glyphs).size).toBe(3);
	});

	test('@crosswidth @gecko @webkit-tablet the Insert menu has a Motion item that opens the Library on its scenes', async ({ page }) => {
		await openDeckInCompose(page, DECK);
		await page.getByText('First paragraph.').click();
		await insertVia(page, 'Motion');
		// Motion lives in the Design section; the Library opens on it.
		await expect(page.getByRole('tab', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
	});
});
