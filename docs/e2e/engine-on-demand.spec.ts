// The ESM engine on the real Studio (engineering/decisions/2026-10-14-engine-spine.md).
//
// The docs site loads the engine as ES modules: chart kernels arrive on demand, and every sibling
// asset (KaTeX, fence grammars, plugin data, chart kernels) resolves from the directory the engine
// came from (src/lib/engine-base.ts). Each of those was a way for the move to fail SILENTLY: a
// loader that found no engine <script> tag skipped its asset and the slide showed source text with
// no error anywhere. So each test here renders one slide in the live preview and asserts the drawn
// result, and the last one asserts that a kernel that will not load says so instead of drawing
// the chart as its source list.
import type { Page, Request } from '@playwright/test';
import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, test } from './studio-fixture';

const live = (page: Page) => page.frameLocator(LIVE_PREVIEW);

function engineRequests(page: Page): string[] {
	const seen: string[] = [];
	page.on('request', (r: Request) => {
		const m = r.url().match(/\/playground\/v\/[0-9a-f]+\/(esm\/[^?#]+)/);
		if (m) seen.push(m[1]);
	});
	return seen;
}

test('@smoke a chart slide loads its own kernel and draws, and no other chart kernel loads', async ({ page }) => {
	const requests = engineRequests(page);
	await gotoStudio(page);
	await setEditorContent(page, '<!-- _class: bar -->\n\n## Revenue by region\n\n- North `10`\n- South `20`\n- West `14`\n');
	await expect(live(page).locator('section.chart-frame svg').first()).toBeVisible({ timeout: 20_000 });
	expect(requests).toContain('esm/engine.js');
	expect(requests).toContain('esm/chart-bar.js');
	expect(requests.filter((r) => r.startsWith('esm/chart-') && r !== 'esm/chart-bar.js')).toEqual([]);
});

test('math, an icon and an exotic fence still find their assets beside the ESM engine', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, '# Assets\n\n$$\nE = mc^2\n$$\n\nRaw files land in `^{bucket, c4}` S3.\n\n```powershell\nGet-ChildItem -Path C:\\ | Where-Object { $_.Length -gt 1kb }\n```\n');
	const frame = live(page);
	await expect(frame.locator('.katex').first()).toBeVisible({ timeout: 20_000 });
	await expect(frame.locator('.lat-icon[data-icon="bucket"] svg')).toHaveCount(1, { timeout: 20_000 });
	await expect(frame.locator('pre code [class^="hljs-"]').first()).toBeAttached({ timeout: 20_000 });
});

test('a chart kernel that will not load says so, rather than drawing the chart as a list', async ({ page }) => {
	// What a tab that outlived a deploy sees: the old hash directory is gone at the origin.
	await page.route('**/esm/chart-funnel.js', (route) => route.fulfill({ status: 404, body: 'gone' }));
	await gotoStudio(page);
	await setEditorContent(page, '<!-- _class: funnel -->\n\n## Pipeline\n\n- Leads `400`\n- Qualified `120`\n- Won `30`\n');
	await expect(page.getByText(/couldn't load part of the app/i).first()).toBeVisible({ timeout: 20_000 });
	await expect(live(page).locator('section.funnel:not(.chart-frame) ul')).toHaveCount(0);
});
