import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// A FRESH GENERATE AFTER A REOPEN MUST NOT OVERWRITE THE REOPENED RECORD.
//
// This is the one hazard the id pin introduced rather than closed. Save is now id-pinned
// (#1839), and the component faculty's bare generate replaces name, description, CSS,
// skeleton and manifest with a wholly different component. Leave `compEditingId` set
// across that and the unrelated component OVERWRITES the record you opened: reopen
// `.quarter-callout`, ask for a pricing table, Save, and every deck saying
// `_class: quarter-callout` renders unstyled. Before the id pin the same save created a
// second record, so this failure did not exist until the fix for the other one landed.
//
// Theme and finish avoid it by accident — both keep an existing name (`if (out.name &&
// !name.trim())`), so their generate lands on the record you opened. Only the component
// branch replaces the name outright, which is correct for a new component and exactly why
// the id has to go.
//
// THE MODEL IS MOCKED, NOT SPENT. HARD RULE #24 bars our `OPEN_ROUTER_KEY` from any
// per-PR test path and explicitly permits the opposite: a Playwright spec that intercepts
// the endpoint (`page.route`) or drives the Studio on a test key. Both apply here — the
// seeded key is a throwaway string that never leaves the browser, and no request reaches
// openrouter.ai because the route handler fulfills every one.

/** A gate-clean component the mocked model "returns" — deliberately unrelated to the
 *  record under edit, because the defect is that it lands on that record. */
const GENERATED = {
	name: 'pricing-trio',
	function: 'comparison',
	form: 'panel',
	substance: 'structure',
	bucket: 'comparison',
	// 3–5 entries, because `validateManifest` requires it — a shorter list leaves Save
	// disabled on `manifest:tags` and the spec never reaches its assertion.
	tags: ['pricing', 'tiers', 'comparison'],
	description: 'Three pricing tiers side by side.',
	css: 'section.pricing-trio { display: grid; place-content: center; }\nsection.pricing-trio h2 { color: var(--accent); }',
	skeleton: '<!-- _class: pricing-trio -->\n\n## Pricing\n\nThree tiers, side by side.',
};

/**
 * Make the Studio believe a model is connected, and answer for it.
 *
 * `architectModel().ready()` is nothing more than `!!localStorage['lattice-db-or-key']`,
 * so a throwaway string is a complete connection as far as the app is concerned. Dedup is
 * switched off because it would otherwise make its own embeddings call before the
 * generate — a second request this spec has no reason to model.
 */
async function mockModel(page: Parameters<typeof gotoStudio>[0]) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
			localStorage.setItem('lattice-db-dedup', 'off');
		} catch {
			/* storage unavailable — the test will fail loudly on the missing control */
		}
	});
	let calls = 0;
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (!url.includes('/chat/completions')) {
			// Catalog / key / credits probes — answer emptily rather than let them out.
			await route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[]}' });
			return;
		}
		calls += 1;
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				id: 'gen-e2e',
				choices: [{ message: { role: 'assistant', content: JSON.stringify(GENERATED) }, finish_reason: 'stop' }],
				usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, cost: 0 },
			}),
		});
	});
	return { chatCalls: () => calls };
}

async function retype(page: Parameters<typeof gotoStudio>[0], label: string, text: string) {
	await page.getByRole('textbox', { name: label }).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

test('@smoke a generate after reopening a component does not overwrite the reopened record', async ({ page }) => {
	test.slow();
	const model = await mockModel(page);
	await gotoStudio(page);

	// Save a component this spec owns.
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await page.getByRole('button', { name: 'Component', exact: true }).click();
	await page.getByRole('textbox', { name: 'Component name' }).fill('quarter-callout');
	await retype(page, 'Component skeleton', '<!-- _class: quarter-callout -->\n\n## Revenue is up 24%\n\nGrowth.');
	await retype(page, 'Component CSS', 'section.quarter-callout { display: grid; }\nsection.quarter-callout h2 { color: var(--accent); }');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved .*quarter-callout/)).toBeVisible();

	// Reopen it from the Library — this is what sets `compEditingId`.
	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await page.getByRole('button', { name: 'Edit .quarter-callout' }).click();
	await expect(page.getByRole('textbox', { name: 'Component name' })).toHaveValue('quarter-callout');

	// …then ask for something completely different.
	const prompt = page.getByRole('textbox', { name: /describe a component/i });
	await expect(prompt, 'the component faculty should offer its generate field with a model connected').toBeVisible();
	await prompt.fill('three pricing tiers side by side');
	await prompt.press('Enter');

	await expect(page.getByRole('textbox', { name: 'Component name' })).toHaveValue('pricing-trio', { timeout: 30_000 });
	expect(model.chatCalls(), 'the mocked endpoint should have been asked at least once').toBeGreaterThan(0);

	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved .*pricing-trio/)).toBeVisible();

	// THE ASSERTION. Both records exist: the generate created a NEW component and left the
	// one that was open for editing alone. With `compEditingId` still set, the save would
	// have written `pricing-trio` over `quarter-callout`'s id and the first card would be
	// gone.
	await page.getByRole('button', { name: /Back to Compose/ }).click();
	await page.getByRole('button', { name: CHROME.library }).click();
	await expect(
		page.getByRole('button', { name: 'Edit .quarter-callout' }),
		'the reopened record must survive a generate that replaced the draft',
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Edit .pricing-trio' })).toBeVisible();
});
