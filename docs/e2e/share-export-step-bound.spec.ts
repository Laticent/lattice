// A WEBPAGE EXPORT WHOSE THEME NEVER ARRIVES ENDS IN AN ERROR THAT NAMES THE STEP, NOT A SPINNER FOREVER.
//
// `shareHtmlPlayer` (docs/src/components/studio/share-export.ts) starts with a stretch of waits: the engine, the theme,
// the math faces, the Library photos, the render, the exporter's import. None of them was bounded, so one that never
// answered left the author on "Rendering the deck…" with no error, and the nightly trace could not say which wait it was
// (followups.d/3457; Studio e2e nightly run 45159654897). Each is now bounded by `exportStep`, and logs its start and end
// to `console.info`, which a trace keeps.
//
// Here the whole base sheet (`themes/lattice.css`) is never answered. The Studio's own preview draws from the style
// loader's subset and never needs it; the export asks for the whole sheet, so its "load the theme" step waits on a
// request that never ends. That is the one held-back wait that reproduced the nightly trace exactly: no `deck-export`
// request and no capture document. The test waits for the page to report that it started that step (a signal, not a
// duration), then moves the page's clock past the bound, and reads the toast.
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

const DECK = '---\ntheme: indaco\n---\n\n# Bounded\n\n---\n\n## Second slide\n\nA line of text.\n';

test('@gecko a Webpage export whose theme never arrives stops with an error naming the step', async ({ page, context }) => {
	const held: string[] = [];
	// Never answered and never aborted: the request stays open, as a stalled fetch does.
	await context.route(
		(u) => /\/themes\/lattice\.css$/.test(u.pathname),
		(route) => {
			held.push(route.request().url());
		},
	);
	const progress: string[] = [];
	page.on('console', (m) => {
		if (m.type() === 'info' && m.text().startsWith('lattice export')) progress.push(m.text());
	});
	const exporterRequests: string[] = [];
	page.on('request', (r) => {
		if (/\/deck-export\.[^/]*\.js$/.test(new URL(r.url()).pathname)) exporterRequests.push(r.url());
	});
	// Time flows as normal until `fastForward`; the clock only lets the test reach the bound without waiting it out.
	await page.clock.install();
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	await page.getByRole('button', { name: /Download webpage/ }).click();

	await expect.poll(() => progress.some((l) => l.includes('load the theme: started')), { message: 'the export reached its theme step' }).toBe(true);
	// The step logs its start BEFORE it fetches, so the request may land a moment after the log line: poll, don't read once.
	await expect.poll(() => held.length, { message: 'the export asked for the whole base sheet' }).toBeGreaterThan(0);
	await page.clock.fastForward(61_000);

	await expect(page.getByText(/Webpage failed: the step “load the theme” did not finish within 60 s/)).toBeVisible();
	expect(progress.some((l) => /load the theme: failed/.test(l)), 'the progress log names the stalled step').toBe(true);
	expect(progress.some((l) => l.includes('render the deck: started')), 'nothing past the stalled step ran').toBe(false);
	expect(exporterRequests, 'the exporter was never loaded').toEqual([]);
});
