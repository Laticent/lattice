import fs from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { isPhone, waitForStudioPaint } from './studio-fixture';

// COMPOSE FIRST (engineering/decisions/2026-11-10-compose-first.md). The rest of the suite stores Source
// before it opens the Studio (`gotoStudio` in studio-fixture.ts), because its editor helpers type Markdown.
// This file is the one place that opens the Studio the way a new visitor does, with nothing stored, and pins
// what that visitor gets: Compose, listed before Source, with words wherever the pane can hold them.

const COMPOSE = 'Compose — rich editor';
const SOURCE = 'Markdown source';

/** A deck with one finding the lint core fixes on its own: a card-style item written inline. */
const FIXABLE = '<!-- _class: cards-grid -->\n\n# Three things\n\n- **Speed.** It renders fast.\n- **Taste.** It looks right.\n- **Trust.** It never surprises.\n';

async function openFresh(page: Page, seed: Record<string, string> = {}): Promise<void> {
	if (Object.keys(seed).length) {
		await page.addInitScript((entries) => {
			for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
		}, seed);
	}
	await page.goto('/studio/', { waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
}

/** The visible order of the two mode buttons, by their left edge (or, on a phone's bar, the same). */
async function modeOrder(page: Page): Promise<string[]> {
	const xs = await Promise.all(
		[COMPOSE, SOURCE].map(async (name) => ({ name, x: (await page.getByRole('button', { name, exact: true }).first().boundingBox())?.x ?? Number.NaN })),
	);
	return xs.sort((a, b) => a.x - b.x).map((e) => e.name);
}

test('@crosswidth @gecko @webkit-tablet a first visit writes in Compose, and Compose is listed before Source', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has its own case below');
	await openFresh(page);
	await expect(page.getByRole('button', { name: COMPOSE, exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
	await expect(page.getByLabel('Deck source')).toHaveCount(0);
	expect(await modeOrder(page)).toEqual([COMPOSE, SOURCE]);
});

test('@crosswidth @gecko @webkit-tablet choosing Source is remembered across a reload', async ({ page }) => {
	test.skip(isPhone(page), 'the phone opens on the preview; the phone case below covers its bar');
	await openFresh(page);
	await page.getByRole('button', { name: SOURCE, exact: true }).click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
	await page.reload({ waitUntil: 'domcontentloaded' });
	await waitForStudioPaint(page);
	await expect(page.getByRole('button', { name: SOURCE, exact: true })).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByLabel('Deck source')).toBeVisible();
});

// The words go only when the pane cannot hold them: the editor pane at a tablet's 820 px is about 377 px, and
// both words fit there. Measured by the text being RENDERED, and by the header row not overflowing its box.
for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
] as const) {
	test(`the Compose and Source words show at ${label} width, and the header row does not overflow`, async ({ page }) => {
		await page.setViewportSize({ width, height });
		await openFresh(page);
		for (const name of [COMPOSE, SOURCE]) {
			const word = page.getByRole('button', { name, exact: true }).locator('span');
			await expect(word).toBeVisible();
		}
		const row = await page.locator('#studio-pane-editor [data-slot="edit-bar"]').evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
		expect(row.scroll, 'the editor header row overflows its pane').toBeLessThanOrEqual(row.client);
	});
}

test('@crosswidth @gecko @webkit-tablet Fix all works in Compose', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no editor toolbar; Fix all lives in it');
	await openFresh(page, { 'lattice-studio-src-welcome': JSON.stringify(FIXABLE) });
	const fix = page.getByRole('button', { name: 'Fix all issues', exact: true });
	await expect(fix).toBeEnabled({ timeout: 20_000 });
	await fix.click();
	await expect(fix).toBeDisabled({ timeout: 20_000 });
	await page.getByRole('button', { name: SOURCE, exact: true }).click();
	await expect(page.getByLabel('Deck source')).not.toContainText('**Speed.**');
});

test('@mobile @webkit-phone the phone bar lists Compose before Source, and Compose opens by default', async ({ page }) => {
	await openFresh(page);
	expect(await modeOrder(page)).toEqual([COMPOSE, SOURCE]);
	await page.getByRole('button', { name: COMPOSE, exact: true }).first().click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
});

// COMPOSE STAYS GOLD AND READABLE (owner, 2026-11-11, on an iPhone). Its word is the accent mixed with a fifth of the
// heading ink (`--lx-compose`), selected or not; selected, it sits on the light chip, never the ink cell. Measured
// here in every palette and mode against the color actually behind the word: the plain accent fell to 4.08:1 on
// the chip (carbone light), and on the phone's ink cell to 1:1 in a monochrome palette.
const PALETTES = fs.readdirSync(new URL('../../themes/', import.meta.url), { withFileTypes: true })
	.filter((d) => d.isDirectory() && !d.name.endsWith('-dark'))
	.map((d) => d.name);

/** WCAG contrast of `cell`'s text against the first opaque background at or above it, in each palette and mode. */
async function worstContrast(page: Page, cell: Locator): Promise<{ ratio: number; where: string }> {
	return cell.evaluate((el, palettes) => {
		const canvas = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
		const rgba = (css: string): number[] => {
			if (!canvas) return [0, 0, 0, 0];
			canvas.clearRect(0, 0, 1, 1);
			canvas.fillStyle = css;
			canvas.fillRect(0, 0, 1, 1);
			return [...canvas.getImageData(0, 0, 1, 1).data];
		};
		const lum = ([r, g, b]: number[]) => {
			const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
			return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
		};
		const root = document.documentElement;
		// The cells fade their color (`transition-colors`): without this the read is the PREVIOUS palette's color.
		const still = document.createElement('style');
		still.textContent = '*,*::before,*::after{transition:none!important}';
		document.head.append(still);
		let worst = { ratio: Number.POSITIVE_INFINITY, where: '' };
		for (const palette of palettes) {
			for (const mode of ['light', 'dark']) {
				root.setAttribute('data-palette', palette);
				root.setAttribute('data-mode', mode);
				const fg = rgba(getComputedStyle(el).color);
				let node: Element | null = el;
				let bg = [0, 0, 0, 0];
				while (node && bg[3] < 255) {
					bg = rgba(getComputedStyle(node).backgroundColor);
					node = node.parentElement;
				}
				const [a, b] = [lum(fg), lum(bg)];
				const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
				if (ratio < worst.ratio) worst = { ratio: Math.round(ratio * 100) / 100, where: `${palette} ${mode}` };
			}
		}
		still.remove();
		return worst;
	}, PALETTES);
}

test('@crosswidth @webkit-tablet the selected Compose segment keeps its gold word at AA in every palette', async ({ page }) => {
	test.skip(isPhone(page), 'the phone bar has its own case below');
	await openFresh(page);
	const compose = page.locator('[data-edit-seg=compose]').first();
	await expect(page.getByRole('button', { name: COMPOSE, exact: true })).toHaveAttribute('aria-pressed', 'true');
	const worst = await worstContrast(page, compose);
	expect(worst.ratio, `lowest: ${worst.where}`).toBeGreaterThanOrEqual(4.5);
});

test('@mobile @webkit-phone the phone bar Compose cell keeps its gold word at AA, selected or not, in every palette', async ({ page }) => {
	test.skip(!isPhone(page), 'phone only');
	await openFresh(page);
	const cell = page.getByRole('button', { name: COMPOSE, exact: true }).first();
	await expect(cell).toHaveAttribute('aria-pressed', 'false');
	const idle = await worstContrast(page, cell);
	expect(idle.ratio, `not selected, lowest: ${idle.where}`).toBeGreaterThanOrEqual(4.5);
	await cell.click();
	await expect(cell).toHaveAttribute('aria-pressed', 'true');
	const lit = await worstContrast(page, cell);
	expect(lit.ratio, `selected, lowest: ${lit.where}`).toBeGreaterThanOrEqual(4.5);
});
