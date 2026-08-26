import { expect, gotoStudio, openLenses, test } from './studio-fixture';

// The DEPTH model on the REAL browser — HARD RULE #23. The jsdom tier (LensesPanel.test.tsx,
// lente/ladder.test.ts) proves the same resolution; this is the confirmation on the surface a person
// actually drives, through the real add → suggest → tag loop rather than a hand-written registry.
//
// The contract (2026-08-25-lens-view-defaults-and-depth.md §4): a RUNG is an altitude in one
// containment-checked chain, a CUT stands alone. A rung must contain the rung below it — that is what
// would make a "go deeper" step additive — and the panel has to say so, per slide, the moment it stops
// being true. A cut is held to nothing.
//
// Deliberately NOT `@smoke`, matching lenses-landing.spec.ts: the smoke set stays lean and
// `studio-smoke` is advisory (ci.yml keeps it out of `ci.needs`), so tagging would add per-PR runtime
// without adding a gate. The merge-gating proof is the jsdom pair, which runs in `docs-build`.

type Page = import('@playwright/test').Page;

test.beforeEach(async ({ page }) => {
	// An empty reader-view slate: workspace inheritance off before the app loads (the inherited-starters
	// path has its own spec), so this drives the manual add loop end to end.
	await page.addInitScript(() => {
		window.localStorage.setItem('lattice-studio-settings', JSON.stringify({ lensDefaults: false }));
	});
	await gotoStudio(page);
	await openLenses(page);
});

/** Add a reader view from the archetype menu. It arrives EXPANDED (the panel opens what you just added). */
async function addView(page: Page, name: RegExp) {
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await page.getByRole('button', { name }).click();
	await expect(page.getByRole('button', { name, expanded: true })).toBeVisible();
}

/** Accept the suggester's whole proposal, when it has one. A `base:all` view over a deck with nothing
 *  to drop legitimately proposes NOTHING — its membership is already every slide — so this is a
 *  conditional, not a wait: demanding the button would fail on the very case that needs no edit. */
async function acceptAllIfOffered(page: Page) {
	const acceptAll = page.getByRole('button', { name: 'Accept all' });
	if (await acceptAll.isVisible()) await acceptAll.click();
}

/** Collapse the expanded view row. */
async function collapse(page: Page, name: RegExp) {
	await page.getByRole('button', { name, expanded: true }).click();
}

/** Expand a collapsed view row. */
async function expand(page: Page, name: RegExp) {
	await page.getByRole('button', { name, expanded: false }).click();
	await expect(page.getByRole('button', { name, expanded: true })).toBeVisible();
}

/** The row (the `<li>`) of the currently expanded view. */
function rowOf(page: Page, name: RegExp) {
	return page.locator('li').filter({ has: page.getByRole('button', { name, expanded: true }) });
}

/** The row marker, matched EXACTLY — a substring match would also hit the words "depth ladder" in the
 *  note two lines below it, which is how the first draft of this spec passed on a page with no finding. */
const ladderMarker = (page: Page) => page.getByText('Ladder', { exact: true });

test('the add menu says which archetypes are rungs and which are cuts', async ({ page }) => {
	await page.getByRole('button', { name: /Add a reader view/ }).click();
	await expect(page.getByRole('button', { name: /Bottom line/ })).toContainText('rung');
	await expect(page.getByRole('button', { name: /The evidence/ })).toContainText('rung');
	await expect(page.getByRole('button', { name: /The story/ })).toContainText('cut');
	await expect(page.getByRole('button', { name: /The ask/ })).toContainText('cut');
});

test('two rungs the suggester filled report their altitudes, and nothing complains', async ({ page }) => {
	// The shipped decomposition, driven rather than asserted: the real suggester fills these two, and
	// brief ⊂ evidence falls out of that without anyone tagging by hand.
	await addView(page, /Bottom line/);
	await acceptAllIfOffered(page);
	await collapse(page, /Bottom line/);

	await addView(page, /The evidence/);
	await acceptAllIfOffered(page);
	await expect(page.getByText(/Rung 2 in the depth ladder .*everything in Bottom line, plus more/i)).toBeVisible();
	await collapse(page, /The evidence/);

	await expand(page, /Bottom line/);
	await expect(page.getByText(/Rung 1 in the depth ladder .*the shallowest altitude/i)).toBeVisible();

	// Nothing escapes: no marker on either row, no finding on the one that is open.
	await expect(ladderMarker(page)).toHaveCount(0);
	await expect(page.getByText(/missing from the rung above/i)).toHaveCount(0);
});

test('a cut is told it has no altitude above it, and is held to no containment', async ({ page }) => {
	await addView(page, /Bottom line/);
	await acceptAllIfOffered(page);
	await collapse(page, /Bottom line/);

	await addView(page, /The story/);
	await acceptAllIfOffered(page);
	await expect(page.getByText(/a standalone slice, not part of the deck’s depth ladder/i)).toBeVisible();
	// story overlaps brief without containing it — exactly what a cut is allowed to do, so: silence.
	await expect(ladderMarker(page)).toHaveCount(0);
});

test('taking a brief slide out of evidence breaks the ladder, and the panel names that slide', async ({ page }) => {
	await addView(page, /Bottom line/);
	await acceptAllIfOffered(page);
	// The first slide brief actually shows — the one to take away from the rung above it. Each row in
	// the membership list reads "<n> <title>", so the title is the last line of the button's text.
	const firstMember = rowOf(page, /Bottom line/).getByRole('button', { pressed: true }).first();
	const title = (await firstMember.innerText()).trim().split('\n').pop()?.trim() ?? '';
	expect(title).not.toBe('');
	await collapse(page, /Bottom line/);

	await addView(page, /The evidence/);
	await acceptAllIfOffered(page);
	await expect(ladderMarker(page)).toHaveCount(0); // sound before the edit

	// Untick that same slide in evidence — a base:all view, so this writes a `-evidence` exclusion.
	await rowOf(page, /The evidence/).getByRole('button', { name: title }).first().click();

	// The marker is on the row WITHOUT expanding it — an author who never opens the view still sees it.
	await expect(ladderMarker(page)).toBeVisible();

	await collapse(page, /The evidence/);
	await expand(page, /Bottom line/);
	await expect(page.getByText(/1 slide here is missing from the rung above/i)).toBeVisible();
	await expect(page.getByText(/Add it to the deeper view, or drop it from this one/i)).toBeVisible();
	// …and it names the slide, by the title an author reads — not an index.
	const finding = rowOf(page, /Bottom line/).locator('div').filter({ hasText: /missing from the rung above/ }).last();
	await expect(finding.getByText(title, { exact: true })).toBeVisible();
});
