import type { Page } from '@playwright/test';
import { expect, test } from './studio-fixture';

// The System diagnostic panel (docs/src/components/site/SystemOverlay*.tsx) on the real Studio, on every
// engine and width: Chromium at desktop and mobile (@crosswidth) and at tablet width from the desktop
// project, real WebKit on a phone and a tablet box, and Gecko. Design:
// engineering/decisions/2026-11-12-device-capability-tiers.md §5.
//
// HARD RULE #32: the runner's own hardware never decides a result. The CI browser draws in software, so
// an unpinned Studio reads as Lite there and may read as Full on a laptop; every assertion on an EXACT
// tier pins it with `?tier=`. Unpinned, the test asserts only that some tier and some reason are shown.
// The clipboard is stubbed in the page (permissions differ per engine), and every wait is on what the
// panel shows, never a duration.

const PANEL = '[data-testid="system-overlay"]';

/** The value cell of the panel row labeled `label`. */
const rowValue = (page: Page, label: string) =>
	page
		.locator(`${PANEL} dt`)
		.filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) })
		.locator('xpath=following-sibling::dd[1]');

/** Record what the panel copies, on any engine, without the clipboard permission. */
async function stubClipboard(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as { __copied?: string };
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: {
				writeText: async (text: string) => {
					w.__copied = text;
				},
			},
		});
	});
}

async function checkPanel(page: Page): Promise<void> {
	const panel = page.locator(PANEL);
	await expect(panel).toBeVisible();
	await expect(panel).toHaveCount(1);

	// Pinned: the exact tier, labeled as pinned so a screenshot is never mistaken for detection.
	await expect(rowValue(page, 'Tier')).toHaveText('Full (pinned by ?tier=)');
	await expect(rowValue(page, 'Browser')).not.toHaveText('');
	await expect(rowValue(page, 'Graphics')).not.toHaveText('');
	for (const f of ['Web Workers', 'IndexedDB storage', 'CSS :has()', 'CSS container queries', 'structuredClone()']) {
		await expect(rowValue(page, f)).toHaveText('Supported');
	}

	// Both actions sit outside the scroll area, so they are inside the viewport at every width.
	const vp = page.viewportSize();
	if (!vp) throw new Error('no viewport size');
	for (const name of ['Run speed test', 'Copy report']) {
		const box = await panel.getByRole('button', { name }).boundingBox();
		if (!box) throw new Error(`${name} has no box`);
		expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
		expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
	}

	// The speed test fills its row with a count of work units.
	await expect(rowValue(page, 'Speed test')).toHaveText('Not run yet');
	await panel.getByRole('button', { name: 'Run speed test' }).click();
	await expect(rowValue(page, 'Speed test')).toHaveText(/^\d+ units$/);

	// Copy report hands over the whole panel as text, with the speed test it just ran.
	await panel.getByRole('button', { name: 'Copy report' }).click();
	await expect(panel.getByRole('button', { name: 'Copied' })).toBeVisible();
	const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied ?? '');
	expect(copied.split('\n').slice(0, 4)).toEqual(['Lattice system report', '', 'Tier:', '  Tier: Full (pinned by ?tier=)']);
	expect(copied).toMatch(/\n {2}Speed test: \d+ units\n/);
	expect(copied).toContain('Required features:\n  Web Workers: Supported');
}

test('@crosswidth @webkit-phone @webkit-tablet @gecko the System panel shows the device, runs the speed test and copies a report', async ({ page }, testInfo) => {
	await stubClipboard(page);
	await page.goto('/studio/?system&tier=full', { waitUntil: 'domcontentloaded' });
	await checkPanel(page);

	// The tablet project runs only @visual and @a11y, so the tablet width is driven from desktop.
	if (testInfo.project.name === 'desktop') {
		await page.setViewportSize({ width: 820, height: 1180 });
		await page.reload({ waitUntil: 'domcontentloaded' });
		await checkPanel(page);
	}
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko unpinned, the System panel names a tier and why', async ({ page }) => {
	await page.goto('/studio/?system', { waitUntil: 'domcontentloaded' });
	// Which tier depends on the machine running the test, so only its shape is asserted (HARD RULE #32).
	await expect(rowValue(page, 'Tier')).toHaveText(/^(Full|Lite|Unsupported)$/);
	await expect(page.locator(`${PANEL} dt`).filter({ hasText: /^Why$/ }).first()).toBeVisible();
	await expect(page.locator(`${PANEL} [data-tier]`)).toHaveAttribute('data-tier', /^(full|lite|unsupported)$/);
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko the Storage overlay shares the island, and the System panel code stays unloaded until asked for', async ({ page }) => {
	const panelChunks: string[] = [];
	page.on('request', (r) => {
		if (/SystemOverlayPanel/.test(r.url())) panelChunks.push(r.url());
	});
	await page.goto('/studio/?storage', { waitUntil: 'domcontentloaded' });
	// The Storage overlay mounts from the same island as the System gate (SiteDiagnostics.tsx), in the
	// same render; once it is visible, a System import would already have been requested.
	await expect(page.locator('#lattice-storage-overlay')).toBeVisible();
	await expect(page.locator(PANEL)).toHaveCount(0);
	expect(panelChunks).toEqual([]);

	// Turning the panel on loads exactly one chunk for it.
	await page.goto('/studio/?system=1&tier=lite', { waitUntil: 'domcontentloaded' });
	await expect(rowValue(page, 'Tier')).toHaveText('Lite (pinned by ?tier=)');
	expect(panelChunks).toHaveLength(1);
});
