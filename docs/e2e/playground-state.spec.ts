import { expect, test } from './studio-fixture';

// PR 5 of the Specimen Book plan (2026-07-05 decision §4/§6): the playground
// remembers where you were, syncs honestly, and never destroys a draft. These
// run against the BUILT site (astro preview) — the real surface, not a harness.

const HANDOFF_KEY = 'lattice-docs-pg-handoff';
const SOURCE_KEY = 'lattice-docs-pg-source';
const BACKUP_KEY = 'lattice-docs-pg-source-backup';
const SEARCH_KEY = 'lattice-docs-pg-search';
const COMPONENT_KEY = 'lattice-docs-pg-component';

// The engine paint is irrelevant here; stub the heavy externals like
// playground-paint.spec.ts does so state assertions aren't network-gated.
test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

async function gotoPlayground(page: import('@playwright/test').Page) {
	// This spec tests the EDITOR contract; a pristine fresh profile now opens
	// Explore by design (PR 6), so pin the surface. The Explore default itself
	// is covered in playground-explore.spec.ts.
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-template-trigger')).toBeVisible();
}

// Make sure the editor is showing: flip to ✎ Edit via the mode toggle if the
// CodeMirror surface isn't visible (a pick can leave the mobile pane on preview).
async function ensureEditorPane(page: import('@playwright/test').Page) {
	if (!(await page.locator('.cm-content').first().isVisible())) {
		await page.getByRole('tab', { name: 'Edit', exact: true }).click();
		await expect(page.locator('.cm-content').first()).toBeVisible();
	}
}

async function typeInEditor(page: import('@playwright/test').Page, text: string) {
	await ensureEditorPane(page);
	const cm = page.locator('.cm-content').first();
	await cm.click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

test('@crosswidth search and lens survive reopening the picker AND a reload', async ({ page }) => {
	await gotoPlayground(page);

	await page.locator('#pg-template-trigger').click();
	await page.getByPlaceholder(/Search components/).fill('kpi');
	await page.getByRole('option', { name: 'kpi', exact: true }).click();

	// Reopen: the query is still there (selection did NOT clear it).
	await page.locator('#pg-template-trigger').click();
	await expect(page.getByPlaceholder(/Search components/)).toHaveValue('kpi');
	await page.keyboard.press('Escape');

	// Reload: still there — and the picked component is remembered too.
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-template-trigger')).toContainText('kpi');
	await page.locator('#pg-template-trigger').click();
	await expect(page.getByPlaceholder(/Search components/)).toHaveValue('kpi');
	expect(await page.evaluate((k) => localStorage.getItem(k), SEARCH_KEY)).toBe('kpi');
	expect(await page.evaluate((k) => localStorage.getItem(k), COMPONENT_KEY)).toBe('kpi');
});

test('@crosswidth the picker detaches honestly when the draft holds no recognized component', async ({ page }) => {
	await gotoPlayground(page);
	await page.locator('#pg-template-trigger').click();
	await page.getByPlaceholder(/Search components/).fill('big-number');
	await page.getByRole('option', { name: 'big-number', exact: true }).click();
	await expect(page.locator('#pg-template-trigger')).toContainText('big-number');

	// Replace the draft with plain markdown — no `_class` line at all.
	await typeInEditor(page, '# just some notes, no component here');

	// The trigger says so instead of lying with a stale confident name.
	await expect(page.locator('#pg-template-trigger')).toContainText('draft differs');
});


test('@crosswidth a handoff over a pristine draft applies automatically and is consumed', async ({ page }) => {
	await page.addInitScript(
		([k, md]) => localStorage.setItem(k, JSON.stringify({ md, from: 'the landing page', ts: Date.now() })),
		[HANDOFF_KEY, '<!-- _class: quote -->\n\n> Handed off.\n'] as const,
	);
	await gotoPlayground(page);

	await expect
		.poll(async () => page.evaluate((k) => localStorage.getItem(k), SOURCE_KEY))
		.toContain('Handed off.');
	// Consumed on APPLY — the one-shot key is gone.
	expect(await page.evaluate((k) => localStorage.getItem(k), HANDOFF_KEY)).toBeNull();
});

test('@crosswidth a handoff over a dirty draft parks; Not now keeps it; Replace applies with a backup', async ({ page }) => {
	await gotoPlayground(page);
	await typeInEditor(page, '# my unsaved masterpiece');

	// A handoff arrives while the tab is open (another tab's "Open in Playground").
	await page.evaluate(
		([k, md]) => localStorage.setItem(k, JSON.stringify({ md, from: 'the component reference', ts: 42 })),
		[HANDOFF_KEY, '<!-- _class: quote -->\n\n> Incoming.\n'] as const,
	);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

	const bar = page.getByRole('region', { name: 'Incoming deck' });
	await expect(bar).toBeVisible();
	await expect(bar).toContainText('the component reference');

	// "Not now": the bar hides for this payload but the key stays parked.
	await bar.getByRole('button', { name: 'Not now' }).click();
	await expect(bar).toBeHidden();
	expect(await page.evaluate((k) => localStorage.getItem(k), HANDOFF_KEY)).not.toBeNull();

	// It re-offers on the next arrival (fresh ts) and Replace applies + backs up.
	await page.evaluate(
		([k, md]) => localStorage.setItem(k, JSON.stringify({ md, from: 'the component reference', ts: 43 })),
		[HANDOFF_KEY, '<!-- _class: quote -->\n\n> Incoming again.\n'] as const,
	);
	await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
	await bar.getByRole('button', { name: 'Replace draft' }).click();

	await expect
		.poll(async () => page.evaluate((k) => localStorage.getItem(k), SOURCE_KEY))
		.toContain('Incoming again.');
	expect(await page.evaluate((k) => localStorage.getItem(k), HANDOFF_KEY)).toBeNull();
	expect(await page.evaluate((k) => localStorage.getItem(k), BACKUP_KEY)).toContain('masterpiece');

	// The undo toast restores the parked draft.
	await page.locator('.pg-toast').getByRole('button', { name: 'Undo' }).click();
	await expect
		.poll(async () => page.evaluate((k) => localStorage.getItem(k), SOURCE_KEY))
		.toContain('masterpiece');
});

test('@crosswidth Reset names its target and arm-confirms over a dirty draft', async ({ page }) => {
	await gotoPlayground(page);
	await page.locator('#pg-template-trigger').click();
	await page.getByPlaceholder(/Search components/).fill('quote');
	await page.getByRole('option', { name: 'quote', exact: true }).click();
	await typeInEditor(page, '<!-- _class: quote -->\n\n> Edited beyond the sample.');

	await page.locator('#pg-galleries-trigger').click();
	const sheet = page.getByRole('dialog');
	const reset = sheet.getByRole('button', { name: /Reset to the quote example/ });
	await reset.click(); // arms
	await expect(sheet.getByRole('button', { name: /Replace your draft with the quote example/ })).toBeVisible();
	await sheet.getByRole('button', { name: /Replace your draft/ }).click(); // confirms

	await expect
		.poll(async () => page.evaluate((k) => localStorage.getItem(k), SOURCE_KEY))
		.not.toContain('Edited beyond the sample.');
	expect(await page.evaluate((k) => localStorage.getItem(k), BACKUP_KEY)).toContain('Edited beyond the sample.');
});
