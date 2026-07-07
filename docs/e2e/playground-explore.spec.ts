import { expect, test } from './studio-fixture';

// The Explore surface after the 2026-07-06 simplification: mode toggle, the Step
// dropdown (chips + variant select merged), stepping, deep links. Real built
// site (astro preview), desktop + mobile projects.

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
	await expect(walk.locator('.pg-walk-pos')).toContainText('1 / ');
	// The Step dropdown consolidates the walk steps.
	await expect(page.locator('#pg-step')).toBeVisible();
});

test('@crosswidth stepping walks the plan and the URL carries the position', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	const walk = page.locator('#pg-walk');
	await expect(walk.locator('.pg-walk-pos')).toContainText('1 / ');
	await walk.getByRole('button', { name: 'Next slide' }).click();
	await expect(walk.locator('.pg-walk-pos')).toContainText('2 / ');
	await expect(page).toHaveURL(/c=kpi/);
	await expect(page).toHaveURL(/s=default/);
	// The Step dropdown is a jump list in Explore.
	await page.locator('#pg-step').click();
	await page.getByRole('option', { name: 'spotlight' }).click();
	await expect(page).toHaveURL(/s=variant%3Aspotlight|s=variant:spotlight/);
	await expect(page.locator('#pg-step')).toContainText('spotlight');
});

test('@crosswidth a stale step key falls back to the title slide with a notice', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read&s=variant:retired-thing', { waitUntil: 'domcontentloaded' });
	const walk = page.locator('#pg-walk');
	await expect(walk.locator('.pg-walk-pos')).toContainText('1 / ');
	await expect(walk.getByText(/no longer exists/)).toBeVisible();
});

test('@crosswidth the last slide flows into the next component', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read&s=see-also', { waitUntil: 'domcontentloaded' });
	const walk = page.locator('#pg-walk');
	const next = walk.getByRole('button', { name: /Next component:/ });
	await expect(next).toBeVisible();
	await next.click();
	await expect(walk.locator('.pg-walk-pos')).toContainText('1 / ');
	await expect(page).not.toHaveURL(/c=kpi/);
});

test('@crosswidth flipping to Edit opens the deck markdown; back to Explore renders it', async ({ page }) => {
	await page.goto('/playground/?c=kpi&view=read', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('#pg-walk').locator('.pg-walk-pos')).toContainText('1 / ');
	// ✎ Edit — the editor opens the current deck's markdown (unified view/source).
	await page.getByRole('tab', { name: 'Edit' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'edit');
	await expect(page.locator('.cm-content').first()).toContainText('kpi');
	// ◱ Explore — renders whatever the editor now holds.
	await page.getByRole('tab', { name: 'Explore' }).click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
});

test('@crosswidth the docs-reference deep link lands on the variant slide', async ({ page }) => {
	await page.goto('/components/evidence/kpi/', { waitUntil: 'domcontentloaded' });
	const link = page.getByRole('link', { name: /Explore in Playground/ }).first();
	await expect(link).toBeVisible();
	await link.click();
	await expect(page.locator('body')).toHaveAttribute('data-view', 'read');
	await expect(page.locator('#pg-walk .pg-walk-pos')).toBeVisible();
	await expect(page).toHaveURL(/view=read/);
	await expect(page).toHaveURL(/s=variant/);
});
