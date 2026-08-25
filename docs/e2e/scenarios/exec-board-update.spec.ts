import { currentSlide, expect, gotoStudio, openArchitect, railButtons, setEditorContent, shareExport, test, toastText } from '../studio-fixture';

// Persona: an exec prepping a board update. Goal: draft a ~6-slide quarterly
// deck, have the Coach score it board-ready, and walk out with a PDF. The test
// passes only if the persona SUCCEEDS at that goal — the oracles are the score
// crossing the bar (band `A`, i.e. ≥ 93 on the engine scorecard) and the exported
// artifact, not the presence of any control. The "≥ 8" bar named here before was the
// toy /10 heuristic, deleted long ago; nothing had checked any bar since.

// The 6-slide 2× PDF raster is the slowest export in the suite, and the 60s
// config timeout also pays for the authoring steps — give the goal chain room.
test.describe.configure({ timeout: 120_000 });

// A quarterly update authored to the shipped component contracts (HARD RULE #6):
// title / agenda / kpi / quote / stats / closing — the same shapes the seeded
// "Q3 Board Review" proves in-studio.
const DECK = [
	'<!-- _class: title -->\n\n# Q4 Board Update\n\n`Board · Q4 2026`\n\nGrowth held; spend stayed disciplined.',
	'<!-- _class: agenda -->\n\n## What this update covers.\n\n1. The quarter in four numbers\n2. What customers told us\n3. How the funnel converted\n4. The ask for Q1',
	'<!-- _class: kpi -->\n\n`Financial · Q4 2026`\n\n## The quarter in four numbers\n\n1. $4.6M\n   - Net revenue\n   - target $4.4M · +16% YoY `On plan` `Board`\n2. +16%\n   - YoY growth\n   - vs +18% last quarter `On plan` `Investor`\n3. 155\n   - New logos\n   - target 130 · +19% `On plan` `Sales`\n4. 1.2%\n   - Net churn\n   - target < 2% `On plan` `Success`',
	'<!-- _class: quote -->\n\n> Expansion outpaced new business again — the platform bet is compounding.\n\n— Maya Chen, COO',
	'<!-- _class: stats -->\n\n`Funnel · Q4 2026`\n\n## How the funnel converted, stage to stage.\n\n1. 41%\n   - Trial → activation\n2. 63%\n   - Activation → paid\n3. 127%\n   - Net revenue retention\n4. 10 mo\n   - CAC payback',
	'<!-- _class: closing -->\n\n## Fund the expansion motion — it is the cheapest growth we have.\n\n`Q1 plan follows`',
].join('\n\n---\n\n');

test('an exec drafts a quarterly deck, the Coach scores it board-ready, and it exports to PDF', async ({ page }) => {
	await gotoStudio(page);

	// Draft the deck. The preview follows the caret to the last edited slide, so
	// jump back to slide 1 before judging the opener.
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(6);
	await railButtons(page).nth(0).click();
	await expect(currentSlide(page)).toContainText('Q4 Board Update');

	// The Coach scores it with the REAL engine scorecard — an overall out of 100 and a
	// per-dimension read. The persona's goal is a BOARD-READY grade, so that bar is the
	// oracle, not merely "some grade rendered".
	await openArchitect(page);
	await expect(page.getByText('Deck read')).toBeVisible();

	// WAIT for THIS deck's assessment. The Coach re-assesses on every source change behind a
	// 400ms debounce, and while it re-runs it keeps the PREVIOUS deck's card on screen —
	// StudioShell.tsx swaps in the "Assessing" skeleton only when there is no scorecard at
	// all, which after the seeded deck is never. So reading straight after openArchitect
	// races the SEEDED deck's grade: it returned "A−\n90 / 100" (the seed's), while this
	// deck scores 100/A. Polling for the top band is both the wait and the assertion, and it
	// discriminates — the stale `A−` can never satisfy it, so this cannot pass on stale state.
	const scoreLine = () =>
		page.locator('div.items-baseline').filter({ hasText: '/ 100' }).innerText();
	await expect.poll(scoreLine, { timeout: 20_000 }).toMatch(/^A\n/);

	// Read the number out of "<band>\n<overall> / 100" by MATCHING it, never by stripping the
	// band off the front: scorecard.js bands with a TYPOGRAPHIC minus (U+2212), so the old
	// `/^[A-F+\-\s]*/` strip left `A−` behind and parseFloat saw NaN.
	const score = Number.parseFloat((await scoreLine()).match(/(\d+(?:\.\d+)?)\s*\/\s*100/)?.[1] ?? '');
	// 93 is the `A` threshold (lib/authoring/scorecard.js). A deck authored to the shipped
	// component contracts should clear it; if a scorer re-tune drops it below, the persona no
	// longer succeeds at the goal and this SHOULD fail.
	expect(score).toBeGreaterThanOrEqual(93);

	// The artifact: a real PDF download plus the pipeline's own "ready" claim.
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	// Six slides at 2× raster take a while — give the pipeline room to finish.
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await shareExport(page, 'pdf');
	expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
});
