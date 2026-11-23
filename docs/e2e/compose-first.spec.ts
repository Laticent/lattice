import fs from 'node:fs';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { CHROME, isPhone, openInspector, openSection, persistedSource, waitForStudioPaint } from './studio-fixture';

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

// Compose runs Fix all's passes between keystrokes too (deck-lint.ts `fixAllCompose`), with the Source editor's two
// guards: a result computed from a text that has since changed is not written, and says so; a second press while a run
// is going starts nothing. 501 inline-title cards on one slide need 500 passes, so the run is long enough to act inside.
const LONG = [
	'<!-- _class: cards-grid -->', '', '# Bets', '',
	...Array.from({ length: 501 }, (_, i) => `- **Bet ${i}.** body ${i}`),
	'',
].join('\n');
const STALE = 'The deck changed while Fix all was running, so nothing was changed. Press Fix all again.';

/** The deck the Studio last saved. */
const storedCompose = (page: Page) => persistedSource(page).then((v) => (v.startsWith('"') ? (JSON.parse(v) as string) : v));

test('@crosswidth @gecko @webkit-tablet typing in Compose while Fix all runs keeps the typing, writes no fixes, and says so', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no editor toolbar; Fix all lives in it');
	test.setTimeout(240_000);
	await openFresh(page, { 'lattice-studio-src-welcome': JSON.stringify(LONG) });
	const fix = page.getByRole('button', { name: 'Fix all issues', exact: true });
	await expect(fix).toBeEnabled({ timeout: 60_000 });
	await fix.click();
	// Type only once the run has read the deck: before that, the typing is part of what it fixes (the driver's chunk
	// loads first; 50 ms of margin in Chromium, measured). Editor.tsx, deck-lint.ts and editor.js mark the run.
	await expect(page.locator('html[data-fix-all-running]')).toBeAttached({ timeout: 30_000 });
	// The run is going: type at the end of the last card.
	const last = page.locator('#studio-pane-editor .ProseMirror li', { hasText: 'body 500' }).last();
	await last.click();
	await last.evaluate((node) => {
		const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
		let end: Text | null = null;
		for (let t = walker.nextNode(); t; t = walker.nextNode()) if ((t as Text).data.length) end = t as Text;
		if (!end) return;
		const r = document.createRange();
		r.setStart(end, end.data.length);
		r.collapse(true);
		getSelection()?.removeAllRanges();
		getSelection()?.addRange(r);
	});
	await page.keyboard.type(' TYPED');
	await expect(page.getByText(STALE)).toBeVisible({ timeout: 60_000 });
	await expect.poll(() => storedCompose(page)).toContain('TYPED');
	const src = await storedCompose(page);
	expect(src).toContain('**Bet 0.**');
	expect(src).toContain('**Bet 499.**');
	await expect(page.getByText(/^Fixed \d+ issue/)).toHaveCount(0);
});

test('@crosswidth @gecko @webkit-tablet a second Fix all press in Compose while one runs starts nothing', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no editor toolbar; Fix all lives in it');
	test.setTimeout(240_000);
	await openFresh(page, { 'lattice-studio-src-welcome': JSON.stringify(LONG) });
	const fix = page.getByRole('button', { name: 'Fix all issues', exact: true });
	await expect(fix).toBeEnabled({ timeout: 60_000 });
	await fix.click();
	await fix.click();
	// The run's own words, read rather than hard-coded: the count is whatever lint-core finds on LONG, and it grows as
	// rules land (500 when this test was written; 502 fixed and 1 refused once slot-contract and capacity-overflow fired on
	// the same deck). What this test owns is that ONE run speaks, not how many fixes it makes.
	const notice = page.getByText(/^Fixed \d+ issues/);
	await expect(notice).toBeVisible({ timeout: 60_000 });
	const words = (await notice.textContent()) ?? '';
	await expect.poll(() => storedCompose(page)).not.toContain('**Bet 0.**');
	// An absence needs the work it would come from to have had its turn: a second run started with the first shares the
	// page with it pass by pass and ends a few passes after it, inside 150 painted frames (a whole run paints at least
	// 128). Counted in frames, not milliseconds (HARD RULE #32).
	await page.evaluate(
		() =>
			new Promise<void>((done) => {
				let left = 150;
				const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
				requestAnimationFrame(tick);
			}),
	);
	// One run, one notice: the status pill is rewritten in place (lib/notify.ts), so a second run would replace the
	// first run's words with its own.
	await expect(notice).toHaveCount(1);
	await expect(notice).toHaveText(words);
	await expect(page.getByText(STALE)).toHaveCount(0);
});

// The Compose pass skips text it has already linted. Whatever set the count meanwhile (the Markdown editor's pass and its
// unmount's null, validation off's zeros) replaced that answer, so the pass must run again (the trio's checker and red team).
test('@crosswidth @gecko Fix all comes back after a Source round trip and after validation is turned off and on', async ({ page }) => {
	test.skip(isPhone(page), 'the phone has no editor toolbar; Fix all lives in it');
	// The Craft stop (the Inspector's launcher) and the advanced settings tier (its sections), with NO stored mode: Compose.
	await openFresh(page, {
		'lattice-studio-src-welcome': JSON.stringify(FIXABLE),
		'lattice-studio-settings': JSON.stringify({ posture: 'craft' }),
		'lattice-studio-settings-tier': JSON.stringify('advanced'),
	});
	const fix = page.getByRole('button', { name: 'Fix all issues', exact: true });
	await expect(fix).toBeEnabled({ timeout: 20_000 });
	await page.getByRole('button', { name: SOURCE, exact: true }).click();
	await expect(page.getByLabel('Deck source')).toBeVisible();
	await page.getByRole('button', { name: COMPOSE, exact: true }).click();
	await expect(page.locator('#studio-pane-editor .cs-host .ProseMirror')).toBeVisible();
	await expect(fix).toBeEnabled({ timeout: 20_000 });
	await openInspector(page);
	await openSection(page, CHROME.deckTab.general);
	const validation = page.getByRole('switch', { name: 'Inline validation' });
	await validation.click();
	await expect(fix).toBeDisabled();
	await validation.click();
	await expect(fix).toBeEnabled({ timeout: 20_000 });
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
	// `[aria-pressed]`: the live segment. The pre-paint skeleton draws a look-alike with no pressed state, and under load
	// `.first()` read it (a 1:1 ratio on the first palette).
	const compose = page.locator('[data-edit-seg=compose][aria-pressed]').first();
	await expect(page.getByRole('button', { name: COMPOSE, exact: true })).toHaveAttribute('aria-pressed', 'true');
	const worst = await worstContrast(page, compose);
	expect(worst.ratio, `lowest: ${worst.where}`).toBeGreaterThanOrEqual(4.5);
});

test('@crosswidth @webkit-tablet the unselected Compose segment keeps its gold word at AA in every palette', async ({ page }) => {
	test.skip(isPhone(page), 'the phone bar has its own case below');
	await openFresh(page, { 'lattice-studio-settings': JSON.stringify({ editMode: 'source' }) });
	await expect(page.getByRole('button', { name: SOURCE, exact: true })).toHaveAttribute('aria-pressed', 'true');
	const worst = await worstContrast(page, page.locator('[data-edit-seg=compose][aria-pressed]').first());
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
