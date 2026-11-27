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
// request that never ends: no `deck-export` request and no capture document follow, the nightly trace's shape. It is a
// way to hold one step back on demand, not the nightly's cause: in that trace the sheet had answered 200 before the
// click (followups.d/3457). The test waits for the page to report that it started that step (a signal, not a
// duration), then moves the page's clock past the bound, and reads the toast.
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

const DECK = '---\ntheme: indaco\n---\n\n# Bounded\n\n---\n\n## Second slide\n\nA line of text.\n';

test('@crosswidth @webkit-phone @webkit-tablet @gecko a Webpage export whose theme never arrives stops with an error naming the step', async ({ page, context }) => {
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
	// The deck is typed at a desktop box, where the editor is in view (a phone box hides it behind the Read pane), as
	// share-narration-rate-limit.spec.ts does. The Share sheet is then driven at the project's OWN box, because where the
	// failure toast lands against the sheet's button is the thing the last check reads.
	const own = page.viewportSize();
	await page.setViewportSize({ width: 1440, height: 900 });
	await setEditorContent(page, DECK);
	if (own) await page.setViewportSize(own);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	await page.getByRole('button', { name: /Download webpage/ }).click();

	await expect.poll(() => progress.some((l) => l.includes('load the theme: started')), { message: 'the export reached its theme step' }).toBe(true);
	// The step logs its start BEFORE it fetches, so the request may land a moment after the log line: poll, don't read once.
	await expect.poll(() => held.length, { message: 'the export asked for the whole base sheet' }).toBeGreaterThan(0);
	// Jump past the bound and hold the page's clock there, in ONE call. The bound's timer was armed when the step logged
	// its start, before `now` is read below, so `now + 61 s` is past it. Pausing in the same call matters: the toast closes
	// itself after its dwell (2.6 s), the boxes below must be read while it is up, and a separate pause after a separate
	// jump raced the machine (a loaded run spent more than the gap between the two calls). Stepped by hand from here, the
	// dwell cannot run out between the toast appearing and the read (HARD RULE #32: wait for a signal, never race a timer).
	const now = await page.evaluate(() => Date.now());
	await page.clock.pauseAt(now + 61_000);
	const toast = page.locator('[data-sonner-toast][data-mounted="true"]').filter({ hasText: /Webpage failed: the step “load the theme” did not finish within 60 s/ });
	await expect
		.poll(async () => {
			await page.clock.runFor(50);
			return toast.count();
		}, { message: 'the failure toast is up' })
		.toBe(1);
	expect(progress.some((l) => /load the theme: failed/.test(l)), 'the progress log names the stalled step').toBe(true);
	expect(progress.some((l) => l.includes('render the deck: started')), 'nothing past the stalled step ran').toBe(false);
	expect(exporterRequests, 'the exporter was never loaded').toEqual([]);
	// The message says to try again, so the button must be free to press: enabled, and not under the toast at this box. At
	// the toaster's own bottom-center place it was not: on a 390-wide phone the toast overlapped the button and a press
	// missed, and at 820 it covered the label's start. ShareSheet raises its failures at the top.
	const again = page.getByRole('button', { name: /Download webpage/ });
	await expect(again).toBeEnabled();
	await expect(toast).toHaveAttribute('data-y-position', 'top');
	const [b, t] = [await again.boundingBox(), await toast.boundingBox()];
	expect(b && t, 'both boxes are on screen').toBeTruthy();
	if (b && t) expect(t.y + t.height <= b.y || t.y >= b.y + b.height || t.x + t.width <= b.x || t.x >= b.x + b.width, 'the toast clears the button').toBe(true);
});
