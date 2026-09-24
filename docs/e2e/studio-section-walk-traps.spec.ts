import type { Page } from '@playwright/test';
import { expect, gotoStudio, livePreview, persistedSource, railButtons, test } from './studio-fixture';

// ── The section walker reads the deck the way the browser does, on the STUDIO route ──────
//
// #2279 moved `splitSections` (lib/core/split-sections.js) onto the `scanTags` tokenizer, so
// three shapes that used to derail the per-slide Form pass stopped doing it: a comment that
// quotes a section tag, a `>` inside a quoted attribute, and an apostrophe in an UNQUOTED
// attribute value. That PR drove /playground. This drives /studio, the one reachable surface
// it did not exercise, through the real markdown editor — the Studio keeps its own deck
// store and never reads the Playground's `lattice-docs-pg-source` handoff key.
//
// The claim is per SLIDE, not per deck: before the fix, the walk stopped at the first trap and
// every slide after it lost its Form stamp while the deck still looked mostly right. So each
// slide is asserted on its own, and the trap slides sit in the MIDDLE with a clean slide after
// them, where a walker that stopped early would show.

const DECK = [
	'## A clean slide first',
	'',
	'Nothing unusual here.',
	'',
	'---',
	'',
	'## A comment quoting a section tag',
	'',
	'<!-- quoting <section class="title"> in a note -->',
	'',
	'The note above opens a section tag inside a comment.',
	'',
	'---',
	'',
	'## A greater-than inside a quoted attribute',
	'',
	'<p title="a>b">This paragraph carries a quoted attribute holding a greater-than sign.</p>',
	'',
	'---',
	'',
	"## An apostrophe in an unquoted attribute",
	'',
	"<p data-tip=it's>This paragraph carries an unquoted attribute holding an apostrophe.</p>",
	'',
	'---',
	'',
	'## A clean slide last',
	'',
	'A walker that stopped early would leave this one bare.',
].join('\n');

const HEADINGS = [
	'A clean slide first',
	'A comment quoting a section tag',
	'A greater-than inside a quoted attribute',
	'An apostrophe in an unquoted attribute',
	'A clean slide last',
];

/** Replace the whole deck through the REAL markdown editor (the compose-fenced-code idiom). */
async function seedDeck(page: Page, source: string): Promise<void> {
	// At 390px the Studio shows ONE pane, so the editor has to be selected before it can be
	// typed into; the bottom bar's control is there at every width.
	const sourceTab = page.getByRole('button', { name: 'Markdown source', exact: true }).first();
	if (await sourceTab.isVisible().catch(() => false)) await sourceTab.click();
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Backspace');
	await page.keyboard.insertText(source);
	await expect.poll(() => persistedSource(page), { timeout: 20_000 }).toContain('A clean slide last');
}

test('every slide is stamped when the deck quotes a section tag, a ">" or an apostrophe @crosswidth', async ({ page }, testInfo) => {
	await gotoStudio(page);
	await seedDeck(page, DECK);

	// At 390px the Studio shows ONE pane and seeding left it on Source, so bring the preview up.
	const previewTab = page.getByRole('button', { name: 'Preview', exact: true }).first();
	if (await previewTab.isVisible().catch(() => false)) await previewTab.click();

	const preview = livePreview(page);
	// ANTI-VACUITY: the new deck must actually be the one painted, or "every slide is stamped"
	// is a claim about the seed deck.
	await expect(preview.locator('section h2', { hasText: HEADINGS[4] })).toBeAttached({ timeout: 40_000 });

	// The preview paints the CURRENT slide, so each one is visited through the rail.
	await expect(railButtons(page)).toHaveCount(HEADINGS.length);
	for (const [i, heading] of HEADINGS.entries()) {
		// The rail scrolls sideways at 390px, so a chip past the edge is brought into view first.
		await railButtons(page).nth(i).scrollIntoViewIfNeeded();
		await railButtons(page).nth(i).click();
		const slide = preview.locator('section', { has: preview.locator('h2', { hasText: heading }) }).first();
		await expect(slide, heading).toHaveAttribute('data-form', '2d', { timeout: 20_000 });
		await expect(slide, heading).toHaveAttribute('data-frame', /\S/);
		// The masthead band is the Form chrome a stopped walk dropped; the title lives in it.
		await expect(slide.locator('.cell-masthead h2', { hasText: heading }), heading).toBeAttached();
		await page.screenshot({ path: testInfo.outputPath(`slide-${i + 1}.png`) });
	}

});
