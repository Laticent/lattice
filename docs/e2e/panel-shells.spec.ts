import type { Locator, Page, Route } from '@playwright/test';
import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The six Studio panels that load on first open show a look-alike shell until their code arrives
// (docs/src/components/studio/lazy-panel.tsx, panel-shells.tsx). The shell promises one thing
// above all: the frame does not move when the panel replaces it. This spec holds each panel's
// chunk, measures the frame in the shell, releases the chunk, and measures it again in the loaded
// panel. A shell that drifts from its panel after a restyle fails here, not in a user's cold open.
// engineering/decisions/2026-09-26-studio-panel-lazy-loading.md §"How the shells are vetted".

type Panel = {
	name: string;
	/** The panel's own chunk: `/_astro/<Name>.<hash>.js`. */
	chunk: RegExp;
	open: (page: Page) => Promise<void>;
	/** The frame pieces the shell draws exactly where the panel draws them. */
	frame: (page: Page) => Locator[];
	sheet: boolean;
};

const chunkRe = (name: string) => new RegExp(`/_astro/${name}\\.[^/]*\\.js`);
const topDialog = (page: Page) => page.getByRole('dialog').last();

const PANELS: Panel[] = [
	{
		name: 'Share',
		chunk: chunkRe('ShareSheet'),
		open: (page) => page.getByRole('button', { name: 'Share', exact: true }).first().click(),
		frame: (page) => [topDialog(page), topDialog(page).getByRole('heading', { name: /^Share “/ }), topDialog(page).getByText('Present link'), topDialog(page).getByText('Print source')],
		sheet: true,
	},
	{
		name: 'Workspace',
		chunk: chunkRe('WorkspaceSheet'),
		open: (page) => page.getByRole('button', { name: CHROME.workspaceSettings, exact: true }).first().click(),
		frame: (page) => [topDialog(page), topDialog(page).getByRole('heading', { name: 'Workspace' }), topDialog(page).getByRole('tablist', { name: 'Workspace settings' })],
		sheet: true,
	},
	{
		name: 'Library',
		chunk: chunkRe('Library'),
		open: (page) => page.getByRole('button', { name: CHROME.library, exact: true }).first().click(),
		frame: (page) => [page.getByRole('heading', { name: 'Library' }), page.getByRole('tablist', { name: 'Library sections' }), page.getByRole('searchbox', { name: 'Search library' }).or(page.getByLabel('Search library')).first()],
		sheet: false,
	},
	{
		name: 'Chat',
		chunk: chunkRe('ArchitectChat'),
		open: (page) => page.getByRole('button', { name: CHROME.chat, exact: true }).first().click(),
		frame: (page) => [page.locator('textarea[placeholder="Connect a model to chat…"], textarea[placeholder="Ask or instruct…"]').first()],
		sheet: false,
	},
	{
		name: 'Reader views',
		chunk: chunkRe('LensesPanel'),
		open: (page) => page.getByRole('button', { name: CHROME.lenses, exact: true }).first().click(),
		frame: (page) => [page.getByText('A subset of this deck for one reader — you approve exactly what they see.')],
		sheet: false,
	},
	{
		name: 'Slide settings',
		chunk: chunkRe('SlideContext'),
		open: (page) => page.getByRole('button', { name: CHROME.slideSettings, exact: true }).first().click(),
		frame: (page) => [page.getByText('No changes yet'), page.getByRole('button', { name: 'Reset slide' })],
		sheet: false,
	},
];

/** Hold every request for `chunk` until `release()`. The warm-up requests it too, so it stays held. */
async function holdChunk(page: Page, chunk: RegExp) {
	const held: Route[] = [];
	let released = false;
	await page.route(chunk, (route) => (released ? route.continue() : held.push(route)));
	return {
		release: async () => {
			released = true;
			for (const route of held.splice(0)) await route.continue();
		},
	};
}

async function boxes(locators: Locator[]) {
	return Promise.all(locators.map(async (l) => (await l.boundingBox()) ?? null));
}

const shell = (page: Page) => page.locator('[data-panel-shell]');

/** Resolves once the top dialog has no running animation: the sheet has finished sliding in. */
async function slideInDone(page: Page) {
	await expect.poll(() => topDialog(page).evaluate((e) => e.getAnimations().filter((a) => a.playState === 'running').length)).toBe(0);
}

for (const panel of PANELS) {
	test(`the ${panel.name} shell draws its frame exactly where the panel does`, async ({ page }) => {
		await gotoStudio(page);
		const hold = await holdChunk(page, panel.chunk);
		await panel.open(page);
		await expect(shell(page)).toHaveCount(1);
		if (panel.sheet) await slideInDone(page); // measure the shell where it rests, not mid-slide
		const before = await boxes(panel.frame(page));
		await hold.release();
		await expect(shell(page)).toHaveCount(0);
		const after = await boxes(panel.frame(page));
		for (const [i, box] of before.entries()) {
			expect(box, `frame piece ${i} missing in the shell`).not.toBeNull();
			expect(after[i], `frame piece ${i} missing in the loaded panel`).not.toBeNull();
			for (const key of ['x', 'y', 'width', 'height'] as const) {
				expect(Math.abs((box as NonNullable<typeof box>)[key] - (after[i] as NonNullable<typeof box>)[key]), `frame piece ${i} ${key} moved`).toBeLessThanOrEqual(1);
			}
		}
	});
}

test('a cold sheet slides in once, even when its code arrives mid-slide', async ({ page }) => {
	await gotoStudio(page);
	const hold = await holdChunk(page, chunkRe('ShareSheet'));
	await page.evaluate(() => {
		const w = window as unknown as { __xs: number[] };
		w.__xs = [];
		const tick = () => {
			const d = [...document.querySelectorAll('[role=dialog]')].filter((e) => e.getClientRects().length).at(-1);
			if (d) w.__xs.push(Math.round(d.getBoundingClientRect().x));
			requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.getByRole('button', { name: 'Share', exact: true }).first().click();
	// Release while the shell is still sliding in: the case where a naive swap would restart it.
	await expect.poll(() => topDialog(page).evaluate((e) => e.getAnimations().some((a) => a.playState === 'running'))).toBe(true);
	await hold.release();
	await expect(shell(page)).toHaveCount(0);
	await expect(topDialog(page).getByText('Present link')).toBeVisible();
	const xs = await page.evaluate(() => (window as unknown as { __xs: number[] }).__xs);
	// A second slide-in shows as the sheet moving back out: x growing after it had been falling.
	const backwards = xs.filter((x, i) => i > 0 && x - xs[i - 1] > 4).length;
	expect(backwards, `sheet x per frame: ${xs.join(',')}`).toBe(0);
});

test('Escape closes a sheet while its shell is still up', async ({ page }) => {
	await gotoStudio(page);
	const hold = await holdChunk(page, chunkRe('WorkspaceSheet'));
	await page.getByRole('button', { name: CHROME.workspaceSettings, exact: true }).first().click();
	await expect(shell(page)).toHaveCount(1);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
	await hold.release();
});

test('a panel whose code fails to load shows the reload card inside its own frame', async ({ page }) => {
	await gotoStudio(page);
	await page.route(chunkRe('ShareSheet'), (route) => route.fulfill({ status: 404, body: '' }));
	await page.getByRole('button', { name: 'Share', exact: true }).first().click();
	const alert = topDialog(page).getByRole('alert');
	await expect(alert).toContainText(/couldn't load part of the app/i);
	await expect(alert.getByRole('button', { name: /reload/i })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog')).toHaveCount(0);
});
