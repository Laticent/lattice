import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { CHROME, gotoStudio, livePreview, setEditorContent } from './studio-fixture';

// Every chart in the Studio's in-app Reading view paints in color, in light and dark.
//
// The view renders Read · Article in the app's TOP-LEVEL document (reader-mode tools read only
// the top level), so it cannot take the player's whole-document sheet. Until 2026-09-25 it took
// none at all: radar, bar, heatmap and quadrant drew solid SVG-initial black, and kanban,
// progress and roadmap printed as unstyled text (followups.d/2344-p1). It now ships the engine's
// FLAT pack, pruned to the article and fenced to its figures (`scopedArticleCss`,
// docs/src/components/studio/article-projection.ts). `check:render`'s reading pass guards the
// same sheet on a bare page; this spec is the real surface, READ_ARTICLE_CSS and the app
// around it included (HARD RULE #23).
const GALLERY = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../lib/components/chart/chart.gallery.md'), 'utf8');

/** Per chart figure: how many drawn SVG shapes it has, how many compute to opaque black, and
 *  whether its status pills (flow charts) kept their pill ground. */
function figurePaints(page: import('@playwright/test').Page) {
	return page.locator('article.st-read-article').evaluate((article) => {
		const out: { chart: string; shapes: number; black: number; pills: number; bare: number; markers: number; unmarked: number }[] = [];
		for (const fig of article.querySelectorAll('figure.lp-figure.chart-frame, figure.lp-figure:has(> svg)')) {
			const chart = [...fig.classList].filter((c) => !c.startsWith('lp-') && c !== 'chart-frame').join(' ') || '?';
			let shapes = 0;
			let black = 0;
			for (const el of fig.querySelectorAll('svg rect, svg path, svg circle, svg polygon, svg ellipse')) {
				const cs = getComputedStyle(el);
				if (cs.fill === 'none' || cs.display === 'none' || cs.visibility === 'hidden') continue;
				shapes++;
				if (cs.fill === 'rgb(0, 0, 0)' && cs.fillOpacity !== '0') black++;
			}
			// A state marker is a ::before disc. The Studio's engine ships its CSS minified, which
			// writes `:before`, and the prune once read that as a class and dropped every marker.
			const markers = [...fig.querySelectorAll('.cell-state-text, .roadmap-legend-mark')];
			const unmarked = markers.filter((m) => getComputedStyle(m, '::before').content === 'none').length;
			const pills = [...fig.querySelectorAll('.chart-status')];
			const bare = pills.filter((p) => getComputedStyle(p).backgroundImage === 'none').length;
			out.push({ chart, shapes, black, pills: pills.length, bare, markers: markers.length, unmarked });
		}
		return out;
	});
}

for (const scheme of ['light', 'dark'] as const) {
	test(`every chart in the Reading view keeps its paint (${scheme})`, async ({ page }, testInfo) => {
		test.setTimeout(180_000);
		await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
		await page.setViewportSize({ width: 1440, height: 900 });
		await gotoStudio(page);
		await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), scheme);
		await setEditorContent(page, GALLERY);
		await expect(livePreview(page).locator('section').first()).toBeVisible({ timeout: 60_000 });

		await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
		// THE FENCE'S OWN CLAIM: the deck sheet reaches the figures and nothing of the app. The
		// app's chrome must compute the same with the article open as without it. (A red-team pass
		// found hoisted @font-face / @keyframes / @property reaching the app; they are dropped now.)
		// WIDTH is in the snapshot because a face swap leaves the family list untouched. What this
		// proves is narrower than it looks: the SHIPPED sheet leaves the chrome alone. With the
		// @font-face drop reverted it still passes, because the deck's faces are the files the site
		// already self-hosts. A HOSTILE theme's faces, keyframes and @property are pinned at the
		// kernel instead (test/unit/export/rehost-scope.test.js), where the input can be authored.
		const chrome = () =>
			page.evaluate(() =>
				[...document.querySelectorAll('header, header *, nav, nav *')].slice(0, 60).map((el) => {
					const cs = getComputedStyle(el);
					return `${el.tagName}.${(el.getAttribute('class') || '').slice(0, 40)}[${el.getAttribute('aria-label') || ''}] ${[Math.round(el.getBoundingClientRect().width), cs.fontFamily, cs.color, cs.backgroundColor, cs.backgroundImage, cs.animationName].join('|')}`;
				}),
			);
		// Settle first: the posture buttons fade their pressed state, and a snapshot taken mid-fade
		// differs from one taken later for reasons that have nothing to do with the deck sheet. A CSS
		// transition is an Animation, so the signal is every running one finishing.
		// Finite ones only: an infinite spinner never finishes.
		const settled = () =>
			page.evaluate(() =>
				Promise.all(
					document
						.getAnimations()
						.filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
						.map((a) => a.finished.catch(() => null)),
				),
			);
		await settled();
		const chromeBefore = await chrome();
		await page.getByRole('button', { name: CHROME.readArticle }).click();
		const article = page.locator('article.st-read-article');
		await expect(article.locator('figure.lp-figure').first()).toBeVisible({ timeout: 60_000 });

		await settled();
		expect(await chrome(), 'opening the article restyled the app chrome').toEqual(chromeBefore);
		const paints = await figurePaints(page);
		expect(paints.length, 'the gallery re-hosts its charts as figures').toBeGreaterThan(10);
		expect(paints.some((p) => p.markers > 0), 'the roadmap brings its state markers').toBe(true);
		for (const p of paints) {
			// A chart may carry a legitimately black ink (a hairline, a near-black status hue), never a
			// mostly-black drawing: the failure this guards painted every fill SVG-initial black.
			if (p.shapes) expect(p.black * 2, `${p.chart}: ${p.black} of ${p.shapes} shapes paint black`).toBeLessThanOrEqual(p.shapes);
			expect(p.bare, `${p.chart}: ${p.bare} of ${p.pills} status pills lost their ground`).toBe(0);
			expect(p.unmarked, `${p.chart}: ${p.unmarked} of ${p.markers} state markers lost their disc`).toBe(0);
		}

		// One shot per figure at the wide layout, for the reviewer: the flow and table charts are
		// where the view's own table/figure rules meet the deck's.
		const figs = article.locator('figure.lp-figure');
		for (let i = 0; i < (await figs.count()); i++) {
			await figs.nth(i).screenshot({ path: testInfo.outputPath(`figure-${scheme}-${String(i).padStart(2, '0')}.png`) });
		}

		for (const width of [1440, 820, 390]) {
			await page.setViewportSize({ width, height: 900 });
			await article.locator('figure.lp-figure').first().scrollIntoViewIfNeeded();
			await page.screenshot({ path: testInfo.outputPath(`read-article-${scheme}-${width}.png`), fullPage: false });
			// The page never scrolls sideways; a wide chart scrolls inside its own figure.
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
		}
	});
}
