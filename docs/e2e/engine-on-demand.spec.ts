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
import { expect, gotoStudio, LIVE_PREVIEW, setEditorContent, test, typeDeck } from './studio-fixture';

const live = (page: Page) => page.frameLocator(LIVE_PREVIEW);

function engineRequests(page: Page): string[] {
	const seen: string[] = [];
	page.on('request', (r: Request) => {
		const m = r.url().match(/\/playground\/v\/[0-9a-f]+\/(esm\/[^?#]+)/);
		if (m) seen.push(m[1]);
	});
	return seen;
}

async function chartLoadsItsOwnKernel(page: Page) {
	const requests = engineRequests(page);
	await gotoStudio(page);
	await typeDeck(page, '<!-- _class: bar -->\n\n## Revenue by region\n\n- North `10`\n- South `20`\n- West `14`\n');
	await expect(live(page).locator('section.chart-frame svg').first()).toBeVisible({ timeout: 20_000 });
	expect(requests).toContain('esm/engine.js');
	expect(requests).toContain('esm/chart-bar.js');
	expect(requests.filter((r) => r.startsWith('esm/chart-') && r !== 'esm/chart-bar.js')).toEqual([]);
}

async function assetsResolveBesideTheEngine(page: Page) {
	await gotoStudio(page);
	await typeDeck(page, '# Assets\n\n$$\nE = mc^2\n$$\n\nRaw files land in `^{bucket, c4}` S3.\n\n```powershell\nGet-ChildItem -Path C:\\ | Where-Object { $_.Length -gt 1kb }\n```\n');
	const frame = live(page);
	await expect(frame.locator('.katex').first()).toBeVisible({ timeout: 20_000 });
	await expect(frame.locator('.lat-icon[data-icon="bucket"] svg')).toHaveCount(1, { timeout: 20_000 });
	await expect(frame.locator('pre code [class^="hljs-"]').first()).toBeAttached({ timeout: 20_000 });
}

/** Every grammar file a page fetches beside the engine (tools/build-hljs-languages.js). */
function grammarRequests(page: Page): string[] {
	const seen: string[] = [];
	page.on('request', (r: Request) => {
		const m = r.url().match(/\/playground\/v\/[0-9a-f]+\/hljs\/([^?#/]+)\.js/);
		if (m) seen.push(m[1]);
	});
	return seen;
}

// The code plugin's browser half carries no grammar but Lattice's shell grammar
// (engineering/decisions/2026-10-15-code-plugin.md §4.3): a deck fetches the languages its fences
// name and the ones those embed, and a deck with no code fetches none. Each half of that is a way
// for a fence to fail silently — plain monospace in the preview while the export is colored.
async function grammarsArriveWithTheirEmbeds(page: Page) {
	const grammars = grammarRequests(page);
	await gotoStudio(page);
	await typeDeck(page, '# No code here\n\nJust a sentence.\n');
	await expect(live(page).locator('section h1').first()).toHaveText('No code here', { timeout: 20_000 });
	expect(grammars, 'a deck with no fence fetches no grammar').toEqual([]);
	await typeDeck(page, '# Code\n\n```ts\nconst a: number = 1;\n```\n\n```html\n<script>let x = 1;</script>\n<style>a { color: red; }</style>\n```\n\n```sh\ndocker compose up -d --build\n```\n');
	const frame = live(page);
	await expect(frame.locator('code.language-ts .hljs-keyword').first()).toHaveText('const', { timeout: 20_000 });
	// HTML colors the script and style it embeds: JavaScript and CSS came with it.
	await expect(frame.locator('code.language-html .hljs-keyword').first()).toHaveText('let', { timeout: 20_000 });
	await expect(frame.locator('code.language-html .hljs-attribute').first()).toHaveText('color');
	// The shell grammar is built in, never fetched, and it is Lattice's (docker is a built-in).
	await expect(frame.locator('code.language-sh .hljs-built_in').first()).toHaveText('docker');
	expect(grammars).toEqual(expect.arrayContaining(['typescript', 'xml', 'javascript', 'css']));
	expect(grammars).not.toContain('bash');
	expect(new Set(grammars).size, 'each grammar is fetched once').toBe(grammars.length);
}

test('a deck fetches the grammars its fences name and the ones they embed, and none without code', async ({ page }) => grammarsArriveWithTheirEmbeds(page));


test('@smoke a chart slide loads its own kernel and draws, and no other chart kernel loads', async ({ page }) => chartLoadsItsOwnKernel(page));
test('math, an icon and an exotic fence still find their assets beside the ESM engine', async ({ page }) => assetsResolveBesideTheEngine(page));

// The same two on Safari's engine and Firefox's. import() and module preloading are engine behavior,
// so a Chromium pass cannot stand for either. iPad landscape, not the phone: the phone layout hides
// the editor these tests type into, and the engine path is the same at both widths. The desktop
// project excludes these copies (its grepInvert drops @webkit without @crosswidth), so each engine
// runs each test once.
test('@webkit-tablet @gecko a chart slide loads its own kernel and draws (WebKit, Gecko)', async ({ page }) => chartLoadsItsOwnKernel(page));
test('@webkit-tablet @gecko math, an icon and an exotic fence find their assets (WebKit, Gecko)', async ({ page }) => assetsResolveBesideTheEngine(page));

// And on the iPhone itself, as far as CI can reach one: WebKit with the iPhone 15 Pro profile,
// through the phone's one-pane layout. Not a physical device (HARD RULE #23), but the same
// engine at the same width a phone draws.
test('@webkit-phone a chart slide loads its own kernel and draws (iPhone WebKit)', async ({ page }) => chartLoadsItsOwnKernel(page));
test('@webkit-phone math, an icon and an exotic fence find their assets (iPhone WebKit)', async ({ page }) => assetsResolveBesideTheEngine(page));

test('a chart kernel that will not load says so, rather than drawing the chart as a list', async ({ page }) => {
	// What a tab that outlived a deploy sees: the old hash directory is gone at the origin.
	await page.route('**/esm/chart-funnel.js', (route) => route.fulfill({ status: 404, body: 'gone' }));
	await gotoStudio(page);
	await setEditorContent(page, '<!-- _class: funnel -->\n\n## Pipeline\n\n- Leads `400`\n- Qualified `120`\n- Won `30`\n');
	await expect(page.getByText(/couldn't load part of the app/i).first()).toBeVisible({ timeout: 20_000 });
	await expect(live(page).locator('section.funnel:not(.chart-frame) ul')).toHaveCount(0);
});

// The callout layer's lane and markers are their own chunk (engineering/decisions/2026-10-20-callout-placement.md
// §10): a chart with no callout never fetches them, one that writes a callout fetches them before it draws, and a
// chunk that will not load says so instead of drawing the chart without its notes.
const BAR_DECK = '<!-- _class: bar -->\n\n## Revenue by region\n\n- North `10`\n- South `20`\n- West `14`\n';
const CALLOUT = '\n`@callout{[{South led, for=South}]}`\n';

test('@smoke @webkit-tablet @webkit-phone @gecko a chart with no callout does not fetch the callout layer, and one with a callout does and draws it', async ({ page }) => {
	const requests = engineRequests(page);
	await gotoStudio(page);
	await typeDeck(page, BAR_DECK);
	await expect(live(page).locator('section.chart-frame svg').first()).toBeVisible({ timeout: 20_000 });
	expect(requests).toContain('esm/chart-bar.js');
	expect(requests, 'no callout, no callout layer').not.toContain('esm/callout-place.js');
	// A fresh page for the second deck: on the phone's one-pane layout a second replacement of the editor's content lost its
	// first characters (the harness types there, not a person), and the engine's request log still spans both.
	await gotoStudio(page);
	await typeDeck(page, BAR_DECK + CALLOUT);
	await expect(live(page).locator('section.chart-frame svg .legend-target').first()).toBeAttached({ timeout: 20_000 });
	await expect(live(page).locator('section.chart-frame svg text', { hasText: 'South led' }).first()).toBeVisible();
	expect(requests).toContain('esm/callout-place.js');
	expect(requests.filter((r) => r === 'esm/callout-place.js'), 'fetched once').toHaveLength(1);
});

test('a callout layer that will not load says so, rather than drawing the chart without its notes', async ({ page }) => {
	await page.route('**/esm/callout-place.js', (route) => route.fulfill({ status: 404, body: 'gone' }));
	await gotoStudio(page);
	await setEditorContent(page, BAR_DECK + CALLOUT);
	await expect(page.getByText(/couldn't load part of the app/i).first()).toBeVisible({ timeout: 20_000 });
	await expect(live(page).locator('svg text', { hasText: 'South led' })).toHaveCount(0);
});

test('a callout written through markup, which the scan cannot see, still loads the layer and draws', async ({ page }) => {
	const requests = engineRequests(page);
	await gotoStudio(page);
	await setEditorContent(page, `${BAR_DECK}\n<p><code>@callout<span></span>{[{South led, for=South}]}</code></p>\n`);
	await expect(live(page).locator('section.chart-frame svg text', { hasText: 'South led' }).first()).toBeVisible({ timeout: 20_000 });
	expect(requests).toContain('esm/callout-place.js');
	await expect(page.getByText(/couldn't load part of the app/i)).toHaveCount(0);
});
