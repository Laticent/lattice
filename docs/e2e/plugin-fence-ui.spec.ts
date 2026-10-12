import fs from 'node:fs';
import path from 'node:path';
import { BARS_RENDERER, ganttZip } from './plugin-fence-fixture';
import { CHROME, expect, gotoStudio, livePreview, openInspector, openSection, persistedSource, setEditorContent, test } from './studio-fixture';

// ── The zip plugin's notice and its row in the Plugins tab, at the three widths the Studio ships ──
//
// What the sandbox withholds is plugin-fence.spec.ts (network log, three engines). This spec is the
// WEBSITE half (CLAUDE.md QUALITY BAR: no website change is done without the three widths): the consent
// strip above the preview, the drawn fence, and the plugin's own row in deck settings with its list
// checkbox and Remove, reachable at 1440, 820 and 390. With LATTICE_EVIDENCE_DIR=<dir> it saves each
// state; off by default, so CI writes nothing.

const EVIDENCE = process.env.LATTICE_EVIDENCE_DIR || '';
const DECK = '---\nplugins: [gantt-plugin]\n---\n\n## Plan\n\n```gantt\nDesign 2\nBuild 4\nShip 3\n```\n';

async function openDeckSettings(page: import('@playwright/test').Page, width: number): Promise<void> {
	if (width >= 1200) await openInspector(page);
	else if (width > 500) {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
		await page.locator('[role=menuitem],[role=menuitemradio],button,[role=button]').filter({ hasText: CHROME.deckSettingsAt.tabletItem }).first().click();
	} else await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
	await openSection(page, CHROME.deckTab.plugins);
}

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`a zip plugin: the consent strip, the drawn fence and its Plugins row, at ${label} (${width}px)`, async ({ page }) => {
		const shot = async (name: string) => {
			if (!EVIDENCE) return;
			fs.mkdirSync(EVIDENCE, { recursive: true });
			await page.screenshot({ path: path.join(EVIDENCE, `plugin-${name}-${width}.png`) });
		};
		await gotoStudio(page);
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(BARS_RENDERER) });
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
		await page.keyboard.press('Escape');
		await setEditorContent(page, DECK);
		await expect.poll(() => persistedSource(page)).toContain('plugins: [gantt-plugin]');
		await page.setViewportSize({ width, height });

		// The consent strip, then the approval.
		const notice = page.locator('[data-slot="code-packages"]');
		await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
		await expect(notice).toContainText('This deck uses code from the plugin “gantt-plugin”, which has not run.');
		const box = await notice.boundingBox();
		expect(box && box.x >= 0 && box.x + box.width <= width + 1, 'the strip fits the width').toBe(true);
		await shot('notice');
		await notice.getByRole('button', { name: 'What it is' }).click();
		await shot('notice-open');
		await notice.getByRole('button', { name: 'Run the code of gantt-plugin' }).click();
		await expect(livePreview(page).locator('[data-lattice-plugin="gantt-plugin"] svg rect')).toHaveCount(3, { timeout: 30_000 });
		await shot('drawn');
		// The editor does not call the listed plugin unknown (the lint knows the host's zip plugins).
		await expect(page.locator('.cm-lintRange-warning')).toHaveCount(0);

		// Its row in deck settings.
		await openDeckSettings(page, width);
		const row = page.locator('[data-plugin-installed="gantt-plugin"]');
		await expect(row).toBeVisible({ timeout: 15_000 });
		await expect(row).toContainText('From a zip');
		await expect(row).toContainText('Approved in this browser');
		const sw = row.getByRole('checkbox', { name: /List Gantt \(zip\) in this deck/ });
		await expect(sw).toHaveAttribute('aria-checked', 'true');
		await row.scrollIntoViewIfNeeded();
		await shot('tab');
		// Unlisting writes the deck's list, and the fence goes back to code.
		await sw.click();
		await expect.poll(() => persistedSource(page)).not.toContain('plugins:');
		// Remove takes it off the shelf.
		await row.getByRole('button', { name: 'Remove' }).click();
		await expect(page.locator('[data-plugin-installed]')).toHaveCount(0);
	});
}
