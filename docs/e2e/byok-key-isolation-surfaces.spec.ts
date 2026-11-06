import type { BrowserContext, Page } from '@playwright/test';
import JSZip from 'jszip';
import { BEACON_HOST, HOSTILE, SEEDED_KEY } from './hostile-deck';
import { CHROME, expect, gotoStudio, livePreview, setEditorContent, shareExport, test } from './studio-fixture';

// A SHARED DECK CANNOT READ THE AUTHOR'S KEY — ON THE SURFACES BESIDES THE STUDIO PREVIEW.
//
// `byok-key-isolation.spec.ts` proves the Studio preview. The same deck reaches the author's
// origin, where their keys live, through other same-origin documents, each with its own
// sanitizer call (lifecycle note §4, follow-up 3048-p5):
//
//   · Read Article  — `ReadArticle.tsx`, the deck projected into the page itself
//   · the Stage     — `stage-window.js` `buildStageDoc`, a popup on this origin
//   · Print         — `PrintOptionsPanel.tsx` → `deck-preview.js` `buildSrcdoc`, the print sheets
//   · PDF export    — `deck-export.js`, the capture frame
//   · Webpage export — `player-prune-browser.ts`, which runs the assembled player on this origin
//     (its sections pass the capture frame's sanitizer, and `assemblePlayer` sanitizes again)
//
// Each test renders `hostile-deck.ts` on one surface with a canary key seeded, proves the deck
// really rendered there (a positive control), waits for the signal the handlers ride on, and
// asserts nothing ran and no beacon left. The red arm, every sanitizer call returning its input,
// is recorded in the lifecycle note §4 with what each surface did.
//
//   · Library scene art — a motion package's SVG, drawn into the Library with innerHTML after
//     `sanitizeSceneAssets` (on save and on every read). Not a deck, so it gets its own payload.
//
test.describe.configure({ timeout: 240_000 });

async function seed(page: Page) {
	const beacons: string[] = [];
	await page.route(`${BEACON_HOST}/**`, async (route) => {
		beacons.push(route.request().url());
		await route.abort();
	});
	await page.addInitScript((key) => {
		try {
			if (!sessionStorage.getItem('e2e-seeded')) {
				localStorage.setItem('lattice-db-or-key', key);
				sessionStorage.setItem('e2e-seeded', '1');
			}
		} catch {
			/* storage unavailable — the positive controls below fail loudly instead */
		}
	}, SEEDED_KEY);
	await gotoStudio(page);
	await setEditorContent(page, HOSTILE);
	await expect(livePreview(page).getByText('Probe body text.')).toBeVisible({ timeout: 60_000 });
	return beacons;
}

/** Every image in `scope` has loaded or failed (so a surviving `onerror` has run), then two frames for queued toggle/load events. */
async function settled(scope: ReturnType<Page['locator']> | ReturnType<ReturnType<Page['locator']>['contentFrame']>) {
	// Whichever comes first per image: already complete, a load/error event, or decode() settling.
	// decode() alone never settles for an image in a slide the Stage keeps hidden, and Firefox never
	// marks a refused image complete, so no single signal covers every surface and engine.
	// An image whose URL cannot be fetched at all (the Stage's popup resolves `src="x"` against a
	// document with no base) never loads or errors, so no handler on it can run: it is left out.
	await scope.locator('img').evaluateAll((imgs) =>
		Promise.all(
			imgs.filter((el) => /^(https?|data|blob):/.test((el as HTMLImageElement).src)).map(
				(el) =>
					new Promise<void>((done) => {
						const i = el as HTMLImageElement;
						if (i.complete) return done();
						i.addEventListener('load', () => done(), { once: true });
						i.addEventListener('error', () => done(), { once: true });
						i.decode().then(done, done);
					}),
			),
		),
	);
	await scope.locator('body').evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function expectNoLeak(page: Page, beacons: string[]) {
	const leaked = await page.evaluate(() => (window as unknown as { __byokLeak?: string[] }).__byokLeak ?? []);
	expect(leaked, 'no payload in the deck should run on this surface').toEqual([]);
	expect(beacons, 'no payload should reach the beacon host').toEqual([]);
}

test('@gecko Read Article: a hostile deck cannot read the key', async ({ page }) => {
	const beacons = await seed(page);
	await page.getByRole('button', { name: CHROME.postureStops[0] }).click();
	await page.getByRole('button', { name: CHROME.readArticle }).click();
	const article = page.locator('article.st-read-article');
	await expect(article.getByText('Probe body text.')).toBeVisible({ timeout: 60_000 });
	await settled(page.locator('html'));
	await expectNoLeak(page, beacons);
});

test('@gecko the Stage popup: a hostile deck cannot read the key', async ({ page, context }: { page: Page; context: BrowserContext }) => {
	const beacons = await seed(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	const popup = context.waitForEvent('page');
	await launcher.click();
	const stage = await popup;
	await expect(stage.locator('#latt-film .lattice').getByText('Probe body text.')).toBeAttached({ timeout: 60_000 });
	// The popup's own `load` event: it fires once every image the document started has loaded or
	// failed. (Its images never report per-image events to a settle helper; measured, they stay
	// `complete: false` with neither event, while the window still loads.)
	await stage.waitForLoadState('load');
	// One task turn for a queued `toggle` event (rAF does not run in a popup the browser has not painted).
	await stage.evaluate(() => new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => r(null); c.port2.postMessage(0); }));
	await expectNoLeak(page, beacons);
	// And nothing landed on the popup's own window either (a payload whose `opener` was cut).
	expect(await stage.evaluate(() => (window as unknown as { __byokLeak?: string[] }).__byokLeak ?? [])).toEqual([]);
});

for (const [format, label] of [
	['pdf', 'PDF export (the capture frame)'],
	// Print's own document is built when the author prints: the frame shown in its options step is
	// a Studio preview (single-slide-render), already covered. "Download PDF" is the exit that
	// builds the print sheets through `buildSrcdoc` without a browser print dialog.
	['print', 'Print deck (the print sheets)'],
	['webpage', 'Webpage export (the prune frame)'],
] as const) {
	test(`@gecko ${label}: exporting a hostile deck cannot read the key`, async ({ page }) => {
		const beacons = await seed(page);
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		await expect(page.getByRole('dialog')).toBeVisible();
		const download = page.waitForEvent('download', { timeout: 200_000 });
		await shareExport(page, format);
		// The export has rendered the whole deck by the time its file is handed over: that is the
		// signal every handler in its frame would already have fired on.
		expect((await download).suggestedFilename()).toMatch(format === 'webpage' ? /\.html$/ : /\.pdf$/);
		await expectNoLeak(page, beacons);
	});
}

test('@gecko Library scene art: an imported motion package cannot read the key', async ({ page }) => {
	const beacons = await seed(page);
	const leak = (tag: string) => `top.__byokLeak=(top.__byokLeak||[]).concat('${tag}:'+localStorage.getItem('lattice-db-or-key'))`;
	// A valid scene whose drawing carries the handler vectors an SVG can hold.
	const spec = { source: 'svg', duration: 4000, hero: 1, asset: 'route.svg', elements: [{ id: 'p', pathRef: 'p1', motion: [{ verb: 'draw', span: 1 }] }] };
	const art =
		'<svg viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">' +
		`<image href="x" width="10" height="10" onerror="${leak('svg-image-onerror')}"/>` +
		`<foreignObject width="50" height="20"><img xmlns="http://www.w3.org/1999/xhtml" src="x" onerror="${leak('fo-img-onerror')}"/><details xmlns="http://www.w3.org/1999/xhtml" open="" ontoggle="${leak('fo-details-ontoggle')}"><summary>s</summary></details></foreignObject>` +
		`<script>${leak('svg-script')}</script>` +
		'<path id="p1" d="M5 50 H95" stroke="currentColor" stroke-width="4"/></svg>';
	const zip = new JSZip();
	zip.file('probe-route/probe-route.manifest.json', JSON.stringify({ name: 'probe-route', type: 'motion', format: 1, label: 'Probe route' }));
	zip.file('probe-route/probe-route.scene.json', JSON.stringify(spec));
	zip.file('probe-route/probe-route.art.svg', art);

	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
	await page.locator('[data-testid="library-import-input"]').setInputFiles({ name: 'probe.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
	// Positive control: the card drew this art (its path is in the page).
	const card = page.locator('[aria-hidden] > svg').filter({ has: page.locator('path#p1') });
	await expect(card).toHaveCount(1, { timeout: 60_000 });
	await settled(page.locator('html'));
	await expectNoLeak(page, beacons);
});
