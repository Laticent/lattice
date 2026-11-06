import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// A ROW THAT STARTS TO APPLY WHILE THE PALETTE IS OPEN APPEARS IN IT (engineering/decisions/2026-11-03-security-findings-spine.md §The command palette's late row).
// The Studio lists a command only while it applies (studio-commands.ts), so a row can arrive after the palette opened:
// "Fix all issues" joins once lint has counted a fixable issue. Before the fix an open palette filtered to "Fix all"
// never showed it, even after the search was typed again; only closing and reopening did. The cause was cmdk's value
// fallback (CommandPalette.tsx, above `list`).
//
// NO RACE (HARD RULE #32). The row's arrival is the TEST's doing, not lint's speed: the lint core (`esm/lint.js`, which
// the editor's first lint pass imports) is held at the network until the palette is open and filtered, so the row
// cannot exist before that point on any machine, and the release is the one event that makes it apply.

// An inline card title (`- **Title.** body`, HARD RULE #5): lint-core's card rule carries a machine fix, and nothing
// else counts it. Before lint-core answers, "Fix all" falls back to the Studio's unknown-component count
// (StudioShell `fixableIssues`), so a near-miss name like `kpii` would add the row without lint and prove nothing.
const DECK = '---\ntheme: indaco\n---\n\n# Title\n\n---\n\n<!-- _class: cards-grid -->\n\n## Bets\n\n- **Bet one.** body\n- **Bet two.** body\n';

test('@crosswidth @webkit-phone @webkit-tablet @gecko an open palette shows a row that starts to apply while it is open', async ({ page }) => {
	test.setTimeout(120_000);
	let release!: () => void;
	const released = new Promise<void>((r) => {
		release = r;
	});
	let held = 0;
	await page.route('**/esm/lint.js', async (route) => {
		held++;
		await released;
		await route.continue();
	});
	await gotoStudio(page);
	// Below 700px the Studio shows one pane at a time and the editor sits behind the Source cell (editor-lint.spec.ts
	// `revealEditor`); gated on the width `useBreakpoint` reads, not on a project name.
	const width = page.viewportSize()?.width;
	if (width !== undefined && width <= 699) {
		await page.getByRole('button', { name: 'Markdown source', exact: true }).first().click();
		await expect(page.getByLabel('Deck source')).toBeVisible();
	}
	await setEditorContent(page, DECK);
	await page.keyboard.press('ControlOrMeta+k');
	const search = page.getByPlaceholder('Search or run a command…');
	await search.fill('Fix all');
	const row = page.getByRole('option', { name: 'Fix all issues' });
	// The palette is filtered and lint has not counted anything: the lint core has not been served.
	await expect(page.getByRole('option', { name: 'How do I fix every issue at once?' })).toBeVisible();
	await expect(row).toHaveCount(0);
	release();
	await expect(row).toBeVisible({ timeout: 30_000 });
	await expect(search, 'the palette never closed').toBeVisible();
	await expect(search).toHaveValue('Fix all');
	expect(held, 'the lint core went through the hold').toBeGreaterThan(0);
});
