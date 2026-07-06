import { expect, test } from './studio-fixture';

// PR 6 of the Specimen Book plan (2026-07-05 decision §4/§6): the Explore
// surface — walk plans, stepping, variant jump, deep links, and the Edit
// escape hatch. Real built site (astro preview), desktop + mobile projects.

test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

test('@crosswidth a fresh visit opens Explore and the walk bar narrates', async ({ page }) => {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	// Pristine first visit → Explore (the startup precedence rule).
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	const walk = page.locator('#pg-walk');
	await expect(walk).toBeVisible();
	await expect(walk.getByText(/slide 1 of \d+/)).toBeVisible();
	// Full-word chips, never single letters (§0.6).
	await expect(walk.getByRole('tab', { name: 'Title' })).toBeVisible();
	await expect(walk.getByRole('tab', { name: 'Stress test' })).toBeVisible();
});

test('@crosswidth stepping walks the plan and the URL carries the position', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	const walk = page.locator('#pg-walk');
	await expect(walk.getByText(/slide 1 of/)).toBeVisible();
	await walk.getByRole('button', { name: 'Next slide' }).click();
	await expect(walk.getByText(/slide 2 of/)).toBeVisible();
	await expect(page).toHaveURL(/c=kpi/);
	await expect(page).toHaveURL(/s=default/);
	// The variant select is a jump list in Explore.
	await page.locator('#pg-variant').click();
	await page.getByRole('option', { name: 'spotlight' }).click();
	await expect(page).toHaveURL(/s=variant%3Aspotlight|s=variant:spotlight/);
	await expect(walk.getByRole('tab', { name: 'spotlight' })).toHaveAttribute('aria-selected', 'true');
});

test('@crosswidth a stale step key falls back to the title slide with a notice', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read&s=variant:retired-thing', { waitUntil: 'domcontentloaded' });
	const walk = page.locator('#pg-walk');
	await expect(walk.getByText(/slide 1 of/)).toBeVisible();
	await expect(walk.getByText(/no longer exists/)).toBeVisible();
});

test('@crosswidth the last slide flows into the next component', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read&s=see-also', { waitUntil: 'domcontentloaded' });
	const walk = page.locator('#pg-walk');
	const next = walk.getByRole('button', { name: /Next component:/ });
	await expect(next).toBeVisible();
	await next.click();
	await expect(walk.getByText(/slide 1 of/)).toBeVisible();
	await expect(page).not.toHaveURL(/c=kpi/);
});

test('@crosswidth Edit this slide arm-confirms over a dirty draft and Explore never writes it', async ({ page }) => {
	// Seed a dirty draft, then explore. Top document only: init scripts re-run
	// inside every same-origin srcdoc preview frame, and an unguarded seed would
	// silently re-write the draft after each render.
	await page.addInitScript(() => {
		if (window !== window.top) return;
		localStorage.setItem('lattice-docs-pg-source', '# my unsaved masterpiece');
		localStorage.setItem('lattice-docs-pg-view', 'read');
	});
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	const walk = page.locator('#pg-walk');
	await expect(walk.getByText(/slide 1 of/)).toBeVisible();
	// Walking did not touch the draft.
	expect(await page.evaluate(() => localStorage.getItem('lattice-docs-pg-source'))).toBe('# my unsaved masterpiece');
	// The escape hatch asks first over a dirty draft…
	await walk.getByRole('button', { name: 'Edit this slide' }).click();
	await walk.getByRole('button', { name: /Replace your draft/ }).click();
	// …then lands in Edit with the slide in the editor and the draft backed up.
	await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
	await expect
		.poll(async () => page.evaluate(() => localStorage.getItem('lattice-docs-pg-source')))
		.toContain('kpi');
	expect(await page.evaluate(() => localStorage.getItem('lattice-docs-pg-source-backup'))).toContain('masterpiece');
});

test('@crosswidth the docs-reference deep link lands on the variant slide', async ({ page }) => {
	await page.goto('/components/evidence/kpi/', { waitUntil: 'domcontentloaded' });
	const link = page.getByRole('link', { name: /Explore in Playground/ }).first();
	await expect(link).toBeVisible();
	await link.click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('#pg-walk').getByText(/slide \d+ of/)).toBeVisible();
	await expect(page).toHaveURL(/view=read/);
	await expect(page).toHaveURL(/s=variant/);
});
