import { addedNote, expect, gotoStudio, openAddSlideFromStrip, railButtons, slideCount, stripNote, test, typeDeck } from './studio-fixture';

// Slide structural ops via the rail toolbar. The rail button count is the
// primary structural oracle (one button per slide — a fuzz invariant), asserted
// relative to the seed deck's size; toasts are the secondary signal.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

// "New slide" is the #1058 "one insert door" at the end of the slide strip
// (2026-10-27-slide-structure-strip.md §5), opened through the fixture helper rather than an
// open-coded `getByRole`. This spec is about the strip, so it opens from the preview pane's
// door specifically; every other spec takes whichever door `openAddSlide` reaches. The door opens the
// add-slide gallery rather than dropping a bare blank, so the quick-blank path is the
// gallery's synthetic Blank tile. (Until #1198 this test still asserted the retired
// "Slide added." toast — invisible because the fixture's toast locator was dead.)
test('add slide grows the deck by one', async ({ page }) => {
	const n = await slideCount(page);
	await openAddSlideFromStrip(page);
	await page.getByRole('button', { name: /^Insert Blank/i }).first().click();
	await expect(addedNote(page)).toContainText('Added after');
	await expect(railButtons(page)).toHaveCount(n + 1);
});

test('duplicate slide grows the deck by one', async ({ page }) => {
	const n = await slideCount(page);
	await page.getByRole('button', { name: 'Duplicate slide' }).click();
	await expect(stripNote(page)).toContainText('Slide duplicated');
	await expect(railButtons(page)).toHaveCount(n + 1);
});

// Delete takes one tap, and the strip note's Undo puts the slide back (2026-10-27-slide-structure-strip.md §7). The op
// is one step of Filo's history, so after typing elsewhere ⌘Z from the strip takes back the typing, then the delete.
// It asks first only in a Live session with others. (Until §7 shipped, delete armed on the first tap and confirmed on
// the second, because its Undo died on the next keystroke.)
test('delete takes one tap; the note’s Undo restores it, and after typing ⌘Z walks back to it', async ({ page }) => {
	const n = await slideCount(page);
	await railButtons(page).nth(2).click();
	await page.getByRole('button', { name: 'Delete slide' }).click();
	await expect(railButtons(page)).toHaveCount(n - 1);
	await expect(stripNote(page)).toContainText('Slide deleted');
	await stripNote(page).getByRole('button', { name: 'Undo', exact: true }).click();
	await expect(railButtons(page)).toHaveCount(n);

	await railButtons(page).nth(2).click();
	await page.getByRole('button', { name: 'Delete slide' }).click();
	await expect(railButtons(page)).toHaveCount(n - 1);
	// Type at the end of the deck, far from the deleted slide: the note's Undo goes, since it would now undo the typing.
	await page.locator('.cm-content').first().evaluate((el) => {
		// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
		const v = (el as any).cmTile.root.view;
		v.dispatch({ changes: { from: v.state.doc.length, insert: '\n\ntyped after the delete' }, userEvent: 'input.type' });
	});
	await expect(stripNote(page).getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0);
	await page.getByRole('button', { name: 'Duplicate slide' }).focus();
	const mod = (await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent))) ? 'Meta' : 'Control';
	await page.keyboard.press(`${mod}+z`);
	// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
	await expect.poll(() => page.locator('.cm-content').first().evaluate((el) => (el as any).cmTile.root.view.state.doc.toString() as string)).not.toContain('typed after the delete');
	await expect(railButtons(page)).toHaveCount(n - 1);
	await page.keyboard.press(`${mod}+z`);
	await expect(railButtons(page)).toHaveCount(n);
});

test('move slide later reorders the deck', async ({ page }) => {
	// Capture slides 1 and 2 by their class, then assert they swap.
	const first = await railButtons(page).nth(0).getAttribute('aria-label');
	const second = await railButtons(page).nth(1).getAttribute('aria-label');
	expect(first).not.toBe(second);

	await page.getByRole('button', { name: 'Move slide later' }).click();

	// Slide 1 now carries what was slide 2's class, and vice-versa (labels are
	// "Slide {n} — {class}"; compare just the class suffix).
	const classOf = (label: string | null) => (label ?? '').split('—')[1]?.trim();
	await expect(railButtons(page).nth(0)).toHaveAttribute('aria-label', new RegExp(`— ${classOf(second)}$`));
	await expect(railButtons(page).nth(1)).toHaveAttribute('aria-label', new RegExp(`— ${classOf(first)}$`));
});

test('move earlier is disabled on the first slide', async ({ page }) => {
	// Slide 1 is active on load → cannot move any earlier.
	await expect(page.getByRole('button', { name: 'Move slide earlier' })).toBeDisabled();
});

// The front-matter `say:` narration is keyed by slide number, so a move renumbers it with the slides
// (2026-10-27-slide-structure-strip.md §8): before, moving slide 1 later left "S0" narrating S1.
test('move slide later carries the say: narration with the slides', async ({ page }) => {
	const deck = '---\nsay:\n  1: Narrate zero\n  2: Narrate one\n---\n\n# S0\n\nzero\n\n---\n\n# S1\n\none\n\n---\n\n# S2\n\ntwo\n';
	await typeDeck(page, deck);
	await expect(railButtons(page)).toHaveCount(3);
	await railButtons(page).nth(0).click();
	await page.getByRole('button', { name: 'Move slide later' }).click();
	// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
	const source = () => page.locator('.cm-content').first().evaluate((el) => (el as any).cmTile.root.view.state.doc.toString() as string);
	await expect.poll(source).toMatch(/^# S1[\s\S]*^# S0/m);
	const text = await source();
	expect(text).toContain('  2: Narrate zero\n');
	expect(text).toContain('  1: Narrate one\n');
});

// A deck written without `---` (`split: headings`) is one block of several slides. The strip's ops act on the
// slide you see, cutting the block at its heading (2026-10-27-slide-structure-strip.md §6): before, Move did
// nothing, Duplicate doubled the whole block and Delete was refused.
test('ops act on one slide inside a heading-split block', async ({ page }) => {
	const deck = '---\nsplit: headings\n---\n\n# Alpha\n\na\n\n## Bravo\n\nb\n\n## Charlie\n\nc\n';
	await typeDeck(page, deck);
	await expect(railButtons(page)).toHaveCount(3);
	// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
	const source = () => page.locator('.cm-content').first().evaluate((el) => (el as any).cmTile.root.view.state.doc.toString() as string);
	const order = async () => [...(await source()).matchAll(/^#+ (\w+)/gm)].map((m) => m[1]).join(' ');

	await railButtons(page).nth(1).click();
	await page.getByRole('button', { name: 'Move slide later' }).click();
	await expect.poll(order).toBe('Alpha Charlie Bravo');
	await expect(railButtons(page)).toHaveCount(3);
	// The focus went with Bravo, now the last slide, so it cannot move later.
	await expect(page.getByRole('button', { name: 'Move slide later' })).toBeDisabled();

	await page.getByRole('button', { name: 'Duplicate slide' }).click();
	await expect.poll(order).toBe('Alpha Charlie Bravo Bravo');
	await expect(railButtons(page)).toHaveCount(4);

	await railButtons(page).nth(0).click();
	await page.getByRole('button', { name: 'Delete slide' }).click();
	await expect.poll(order).toBe('Charlie Bravo Bravo');
	await expect(railButtons(page)).toHaveCount(3);
});
