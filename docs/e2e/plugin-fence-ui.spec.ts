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

// ── The placeholder and its Approve strip (plugin-system §9 decision 11) ──
for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`a plugin the deck did not list shows a placeholder, and Approve lists it and draws the fence, at ${label} (${width}px)`, async ({ page }) => {
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
		await setEditorContent(page, DECK.replace('---\nplugins: [gantt-plugin]\n---\n\n', ''));
		await expect.poll(() => persistedSource(page)).toContain('## Plan');
		await page.setViewportSize({ width, height });

		const preview = livePreview(page);
		const notice = page.locator('[data-slot="code-packages"]');
		const placeholder = preview.locator('[data-lattice-plugin-off="gantt-plugin"]');
		await expect(placeholder).toHaveCount(1, { timeout: 30_000 });
		await expect(placeholder).toContainText('gantt-plugin');
		await expect(placeholder).not.toContainText('Design 2');
		await expect(notice).toHaveAttribute('data-state', 'offered');
		await expect(notice).toContainText('can draw the ```gantt block in this deck.');
		const box = await notice.boundingBox();
		expect(box && box.x >= 0 && box.x + box.width <= width + 1, 'the strip fits the width').toBe(true);
		// The placeholder fits its slide, and is drawn in the deck's own colors (not a missing-picture gray).
		const fit = await placeholder.evaluate((el) => {
			const r = el.getBoundingClientRect();
			const s = el.closest('section')?.getBoundingClientRect();
			const cs = getComputedStyle(el);
			const mark = el.querySelector('.lattice-plugin-mark');
			return { inside: !!s && r.left >= s.left - 1 && r.right <= s.right + 1 && r.top >= s.top - 1 && r.bottom <= s.bottom + 1, width: r.width, bg: cs.backgroundImage.includes('gradient'), markMask: mark ? getComputedStyle(mark).maskImage || getComputedStyle(mark).webkitMaskImage : '' };
		});
		expect(fit.inside, 'the placeholder sits inside its slide').toBe(true);
		expect(fit.bg, 'the Nacre underpainting is drawn').toBe(true);
		expect(fit.markMask, 'the mark is the shape table’s mask, not a typed glyph').toContain('url(');
		await shot('placeholder');
		await notice.getByRole('button', { name: 'What it is' }).click();
		await shot('placeholder-open');

		// Approve: ONE yes writes the deck's `plugins:` line and records consent for these bytes.
		await notice.getByRole('button', { name: 'Approve the plugin gantt-plugin' }).click();
		await expect.poll(() => persistedSource(page)).toContain('plugins: [gantt-plugin]');
		await expect(preview.locator('[data-lattice-plugin="gantt-plugin"] svg rect')).toHaveCount(3, { timeout: 30_000 });
		await expect(placeholder).toHaveCount(0);
		await expect(notice).toHaveCount(0);
		await shot('approved');
	});
}

// ── A renderer that tries to cover the slide (followups.d/2687-p7, the red team on #2687) ──
// Two walls, both driven here: the door drops a `fixed` position (door-attr.mjs `fenceStyle`), and the root contains
// the paint of a box it keeps (`position:absolute` far past the figure; base.modifiers.css `div[data-lattice-plugin]`).
const COVER_RENDERER = BARS_RENDERER.replace(
	"return '<svg",
	`return '<div class="lp-gantt-plugin-fixed" style="position:fixed;inset:0;z-index:999;background:rgb(255,0,0)"></div>' +
    '<div class="lp-gantt-plugin-wide" style="position:absolute;top:-2000px;left:-2000px;width:5000px;height:5000px;z-index:999;background:rgb(255,0,0)"></div>' +
    '<svg`,
);
for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`a fence renderer cannot paint past its figure, at ${label} (${width}px)`, async ({ page }) => {
		await gotoStudio(page);
		const docked = page.getByRole('button', { name: 'Open Library' });
		await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
		await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(COVER_RENDERER) });
		await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
		await page.keyboard.press('Escape');
		await setEditorContent(page, DECK);
		await expect.poll(() => persistedSource(page)).toContain('plugins: [gantt-plugin]');
		await page.setViewportSize({ width, height });
		const notice = page.locator('[data-slot="code-packages"]');
		await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
		await notice.getByRole('button', { name: 'Run the code of gantt-plugin' }).click();
		const root = livePreview(page).locator('[data-lattice-plugin="gantt-plugin"]');
		await expect(root.locator('svg rect')).toHaveCount(3, { timeout: 30_000 });
		const got = await root.evaluate((el) => {
			const fixed = el.querySelector('.lp-gantt-plugin-fixed') as HTMLElement | null;
			const s = el.closest('section') as HTMLElement;
			const r = el.getBoundingClientRect();
			const sr = s.getBoundingClientRect();
			// Every point of the slide outside the figure shows the slide, not the plugin's box.
			const probes = [
				[sr.left + 4, sr.top + 4],
				[sr.right - 4, sr.top + 4],
				[sr.left + 4, sr.bottom - 4],
				[sr.right - 4, sr.bottom - 4],
			].filter(([x, y]) => !(x >= r.left && x <= r.right && y >= r.top && y <= r.bottom));
			const doc = el.ownerDocument;
			const covered = probes.filter(([x, y]) => el.contains(doc.elementFromPoint(x, y)));
			return { fixedPosition: fixed ? getComputedStyle(fixed).position : 'gone', contain: getComputedStyle(el).contain, inside: r.left >= sr.left - 1 && r.right <= sr.right + 1 && r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1, probes: probes.length, covered: covered.length };
		});
		expect(got.fixedPosition, 'the door dropped the fixed position').not.toBe('fixed');
		expect(got.contain, 'the root contains its paint').toContain('paint');
		expect(got.inside, 'the figure sits inside its slide').toBe(true);
		expect(got.probes, 'the probes reach slide area outside the figure').toBeGreaterThan(0);
		expect(got.covered, 'no point of the slide outside the figure shows the plugin').toBe(0);
		if (EVIDENCE) {
			fs.mkdirSync(EVIDENCE, { recursive: true });
			await page.screenshot({ path: path.join(EVIDENCE, `plugin-cover-${width}.png`) });
		}
	});
}

// ── An approval survives a reload (followups.d/2687-p6, the versioned consent text) ──
// The consent digest is now one of a list (`pluginDigests`, one per accepted version); the approval the Studio writes
// must still be the one it reads back after the page loads again.
test('an approved plugin is still approved after a reload', async ({ page }) => {
	await gotoStudio(page);
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.locator('input[type="file"][accept=".zip"]').setInputFiles({ name: 'gantt-plugin.zip', mimeType: 'application/zip', buffer: await ganttZip(BARS_RENDERER) });
	await expect(page.locator('[data-sonner-toast]').first()).toContainText('1 plugin(s)');
	await page.keyboard.press('Escape');
	await setEditorContent(page, DECK);
	await expect.poll(() => persistedSource(page)).toContain('plugins: [gantt-plugin]');
	const notice = page.locator('[data-slot="code-packages"]');
	await expect(notice).toHaveAttribute('data-state', 'unapproved', { timeout: 30_000 });
	await notice.getByRole('button', { name: 'Run the code of gantt-plugin' }).click();
	await expect(livePreview(page).locator('[data-lattice-plugin="gantt-plugin"] svg rect')).toHaveCount(3, { timeout: 30_000 });
	const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lattice-code-package-approvals') || '{}')?.approved?.['plugin/gantt-plugin']?.sha256);
	expect(stored, 'the approval is recorded').toMatch(/^[0-9a-f]{64}$/);

	await page.reload();
	await expect.poll(() => persistedSource(page), { timeout: 30_000 }).toContain('plugins: [gantt-plugin]');
	await expect(livePreview(page).locator('[data-lattice-plugin="gantt-plugin"] svg rect')).toHaveCount(3, { timeout: 30_000 });
	await expect(page.locator('[data-slot="code-packages"][data-state="unapproved"]')).toHaveCount(0);
});
