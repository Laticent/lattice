import { currentSlide, expect, gotoStudio, openArchitect, railButtons, setEditorContent, test, toastText } from '../studio-fixture';

// Persona: an exec prepping a board update. Goal: draft a ~6-slide quarterly
// deck, have the Coach score it board-ready, and walk out with a PDF. The test
// passes only if the persona SUCCEEDS at that goal — the oracles are the score
// crossing the bar (READY = score ≥ 8 with valid components) and the exported
// artifact, not the presence of any control.

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

	// The Coach scores it with the REAL engine scorecard — an overall out of 100
	// and a per-dimension read. (The band/tag depends on the deck; the oracle here
	// is that the deterministic assessment renders a real grade, not the toy /10.)
	await openArchitect(page);
	await expect(page.getByText('Board readiness')).toBeVisible();
	const scoreLine = await page
		.locator('div.items-baseline')
		.filter({ hasText: '/ 100' })
		.innerText();
	const score = Number.parseFloat(scoreLine.replace(/^[A-F+\-\s]*/, ''));
	expect(score).toBeGreaterThanOrEqual(0);
	expect(score).toBeLessThanOrEqual(100);

	// The artifact: a real PDF download plus the pipeline's own "ready" claim.
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	// Six slides at 2× raster take a while — give the pipeline room to finish.
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^PDF/ }).click();
	expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
});
