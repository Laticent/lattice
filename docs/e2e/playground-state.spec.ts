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

// ── The divider comes back where you left it, and the pane MEASURES that share (#1553) ────
//
// Two assertions, because the second is the one that hurts and it hides behind the first.
//
// The tempting fix for a splitter that restores late is to hand the saved layout to the
// library as the group's `defaultLayout`, which is what the Studio now does. That is WRONG on
// this surface and silently so: `getPanelStyles` reads the prop during RENDER, and this island
// is `client:load`, so the server renders the panel's `defaultSize` and the client's first
// render disagrees. React 19 does not patch inline-style hydration mismatches ("this won't be
// patched up"), so the DOM keeps the server's declarations while React's prop record believes
// the client's. `flex-basis: 0` and `flex-shrink: 1` never get written, `flex-basis` resolves
// to `auto`, and from then on the grow values stop deciding the layout. Measured on that build:
// a divider dragged to 472px came back at 678px.
//
// The give-away is that the library's own state stays RIGHT while the pixels go wrong — which
// is why the existing `split.spec.ts` reload test, which asserts `aria-valuenow`, sails
// straight past it. So this test measures the PANE, and then nudges the separator by keyboard
// and measures again: a frozen basis moves the pane by a fraction of what the share says.
test('the split divider restores where it was dragged, and the pane measures that share', async ({ page }) => {
	await gotoPlayground(page);
	const group = page.locator('#pg-split');
	const editor = page.locator('#pg-split-editor');
	await expect(group).toBeVisible();
	const handle = group.locator('[data-slot="resizable-handle"]').first();
	const width = async () => Math.round((await editor.boundingBox())!.width);

	const box = await handle.boundingBox();
	if (!box) throw new Error('the split divider has no box — the group never laid out');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 12 });
	await page.mouse.up();
	const dragged = await width();
	// Guard against a vacuous pass: if the drag did nothing, every assertion below is trivial.
	expect(dragged, 'the drag did not move the divider — the rest of this test proves nothing').toBeLessThan(600);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(editor).toBeVisible();
	await expect
		.poll(width, { timeout: 15_000, message: 'the saved split was not restored after reload' })
		.toBeCloseTo(dragged, -1);

	// …and the pane must MEASURE its share, not merely report it. One keyboard step moves the
	// separator by a known percentage of the group; with a live flex-basis the pane follows,
	// with a frozen one it drifts a fraction of the distance (measured: 34px against 72px).
	const before = await width();
	const valueBefore = Number(await handle.getAttribute('aria-valuenow'));
	await handle.focus();
	await page.keyboard.press('Shift+ArrowRight');
	await expect.poll(async () => Number(await handle.getAttribute('aria-valuenow'))).toBeGreaterThan(valueBefore);
	const valueAfter = Number(await handle.getAttribute('aria-valuenow'));
	const groupW = Math.round((await group.boundingBox())!.width);
	const expectedDelta = ((valueAfter - valueBefore) / 100) * groupW;
	const actualDelta = (await width()) - before;
	expect(
		actualDelta,
		`the pane moved ${actualDelta}px where its own aria-valuenow claims ${Math.round(expectedDelta)}px — its flex-basis is frozen`,
	).toBeGreaterThan(expectedDelta * 0.75);
});
