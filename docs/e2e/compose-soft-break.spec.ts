import { openDeckInCompose, savedDeck } from './compose-insert';
import { expect, test } from './studio-fixture';

// A paragraph's soft line breaks survive an edit: the engine draws each as a break, so joining them changed the slide.
// followups.d/2846-p6; engineering/decisions/2026-10-21-compose-point-and-click.md §7b.

const DECK = ['<!-- _class: content -->', '', '## Notes', '', 'First line', 'second line', 'third line', '', '- item one', '  continued', '- item two'].join('\n');

test('@crosswidth @gecko @webkit-tablet typing in a paragraph keeps its line breaks', async ({ page }) => {
	await openDeckInCompose(page, DECK);
	// The paragraph is one block of three lines; a click on it lands on the middle one.
	await page.getByText('First line').first().click();
	await page.keyboard.press('End');
	await page.keyboard.type(' end');
	await expect.poll(() => savedDeck(page)).toBe(DECK.replace('second line', 'second line end'));
});
