import { expect, test } from '@playwright/test';
import { currentSlide, gotoStudio, railButtons, setEditorContent, slideCount } from './studio-fixture';

/**
 * The real Studio, on the separator forms it used to be blind to (#1271).
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. The unit tier already proves the boundary
 * scanner agrees with the engine's parser, and that is a claim about two functions. The
 * claim a user cares about is different and no unit test reaches it: **the rail, the
 * editor and the rendered preview all show the same slides**. Those three read the
 * boundary set through three different paths — `splitSlides` for the rail, `slideRanges`
 * for the caret sync, and a supplied `page` position for the painted number — and the bug
 * this closes was precisely that they could disagree with the render while agreeing with
 * each other (HARD RULE #23: a verification claim names its surface).
 *
 * Before this change, every deck below counted ONE slide in the rail and rendered TWO
 * sections. The preview painted a slide the rail could not select, and an edit addressed
 * to "slide 1" covered both.
 */

// Every thematic-break form markdown-it emits an `hr` for. The first is the one the old
// splitter recognized; the rest are the six it did not.
const SEPARATORS = ['---', '***', '___', '- - -', '--- ', '----', '  ---'];

const deckWith = (sep: string) =>
	['---', 'theme: indaco', 'paginate: true', '---', '', '# Alpha', '', 'first slide', '', sep, '', '# Beta', '', 'second slide', ''].join('\n');

test.describe('slide boundary forms — the rail agrees with the render', () => {
	for (const sep of SEPARATORS) {
		test(`a ${JSON.stringify(sep)} separator counts as two slides @studio`, async ({ page }) => {
			await gotoStudio(page);
			await setEditorContent(page, deckWith(sep));

			// The rail is the user-visible slide list. Two buttons, or the deck's second slide
			// is unreachable — which is what it was.
			await expect.poll(() => slideCount(page), { timeout: 15_000 }).toBe(2);

			// And the SECOND one is really the second slide, not a duplicate of the first.
			await railButtons(page).nth(1).click();
			await expect(currentSlide(page)).toContainText('Beta');
		});
	}

	test('a setext underline is a heading, so the rail shows ONE slide @studio', async ({ page }) => {
		// The disagreement of opposite sign: `Interlude` over `---` with no blank line is a
		// level-2 heading to the engine, and the old splitter counted it as a separator — so
		// the rail offered a slide the deck does not render. `split: rule` isolates the
		// question to the separator (under the default heading split the new h2 divides the
		// slide for an unrelated reason).
		await gotoStudio(page);
		await setEditorContent(page, ['---', 'theme: indaco', 'split: rule', '---', '', '# Alpha', '', 'Interlude', '---', '', 'more text', ''].join('\n'));
		await expect.poll(() => slideCount(page), { timeout: 15_000 }).toBe(1);
	});

	test('the painted page number is true on a `***` deck @studio', async ({ page }) => {
		// The number is the symptom that made all of this visible in the first place, and it
		// rides a different path than the rail count: a deck position supplied to the engine,
		// which `positionIsTrustworthy` used to REFUSE for exactly these separator forms. So
		// this asserts the painted pixel, not the function's answer.
		await gotoStudio(page);
		await setEditorContent(page, deckWith('***'));
		await expect.poll(() => slideCount(page), { timeout: 15_000 }).toBe(2);
		await railButtons(page).nth(1).click();
		await expect(currentSlide(page).locator('.lat-pagination')).toHaveText('2');
	});
});
