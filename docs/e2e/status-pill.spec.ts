import { expect, gotoStudio, test } from './studio-fixture';

// ONE status pill, not a pile.
//
// Every transient confirmation in the Studio used to mint its own toast, and the
// Toaster showed three at once, so anything that spoke twice inside the 2600ms
// dwell stacked. Status messages now share a single Sonner id and rewrite one
// pill in place (`src/lib/notify.ts`).
//
// This runs on the real Studio because the mechanism is Sonner's own store plus
// its rendered stack — a unit test can only see the options object we hand over,
// which is what `notify.test.ts` pins. It cannot see how many `<li>` land.

/** The toast elements themselves — NOT the `[data-sonner-toaster]` container the
 *  fixture's `appToast` returns. This spec counts pills, so it needs the items. */
function pills(page: import('@playwright/test').Page) {
	return page.locator('[data-sonner-toast]');
}

function deckSwitcher(page: import('@playwright/test').Page) {
	return page.locator('header').getByRole('button', { name: /slides?$/ }).first();
}

test('three confirmations inside one dwell leave a single pill', async ({ page }) => {
	await gotoStudio(page);

	// "New deck" raises a confirmation on every click. Three of them, back to back
	// through the real menu — the exact shape that used to stack.
	const started = Date.now();
	for (let i = 0; i < 3; i++) {
		await deckSwitcher(page).click();
		await page.getByRole('menuitem', { name: 'New deck' }).click();
	}
	const elapsed = Date.now() - started;

	// The assertion below is only meaningful while all three messages are still
	// within the 2600ms dwell — past it they would have expired on their own and a
	// count of 1 would prove nothing. So the window is asserted, not assumed: a box
	// too slow to land three clicks in time fails here and says why, rather than
	// passing for the wrong reason.
	expect(elapsed, 'three confirmations must land inside the pill dwell').toBeLessThan(2600);

	// Wait for the pill to RENDER, then count in one shot. A retrying `toHaveCount`
	// would keep polling while the stack drained and report the count it settled on
	// (0, once everything expired) rather than the pile-up it was raised to catch —
	// measured: this spec reported "Received: 0" against a build without the shared
	// id, where the number that matters is 3.
	await expect(pills(page).first()).toBeVisible();
	expect(await pills(page).count(), 'status messages must share one pill').toBe(1);
	await expect(pills(page).first()).toContainText('New deck created');
});

/** A real Lattice asset zip whose themes both reach off the device, so the import
 *  gate refuses each one and the Library has a multi-line outcome to report. */
async function refusedBundle(): Promise<Buffer> {
	const { default: JSZip } = await import('jszip');
	const zip = new JSZip();
	const items = ['alpha', 'beta'].map((name) => {
		// A remote `url()` is the `css-url-remote` refusing rule — the beacon.
		zip.file(`${name}.css`, `.x{background:url(https://example.invalid/${name}.png)}`);
		return { kind: 'theme', name, label: name, css: `${name}.css` };
	});
	zip.file('manifest.json', JSON.stringify({ format: 'lattice-asset/1', kind: 'bundle', items }));
	return zip.generateAsync({ type: 'nodebuffer' }) as Promise<Buffer>;
}

async function openLibrary(page: import('@playwright/test').Page) {
	const docked = page.getByRole('button', { name: 'Open Library' });
	await ((await docked.count()) ? docked : page.getByRole('button', { name: 'Library', exact: true })).click();
}

// Both of these drive the REAL import funnel, because both defects they cover were
// invisible to every other tier: one was a message destroyed by a second message in
// the same tick, the other a stylesheet rule that has to WIN a cascade. A unit test
// sees neither — jsdom loads no Tailwind sheet, so `getComputedStyle` returns '' for
// every utility (measured).

test('a refused import names each refusal on its own line', async ({ page }) => {
	await gotoStudio(page);
	await openLibrary(page);
	await page.locator('input[type="file"][accept=".zip"]').setInputFiles({
		name: 'refused.zip',
		mimeType: 'application/zip',
		buffer: await refusedBundle(),
	});

	const pill = page.locator('[data-sonner-toast]').first();
	await expect(pill).toContainText('Nothing could be imported');
	const desc = pill.locator('[data-description]');
	await expect(desc).toContainText('alpha');
	await expect(desc).toContainText('beta');

	// Sonner renders the description as a bare text node and sets no `white-space`
	// of its own, so without the primitive's rule the two refusals collapse onto one
	// line and each name glues onto the previous reason. The rule must WIN, not just
	// match — Sonner's own `[data-sonner-toast]` rules are unlayered (HARD RULE #26).
	await expect(desc).toHaveCSS('white-space', 'pre-line');
});

test('a corrupt bundle reports WHY, not that the file was empty', async ({ page }) => {
	await gotoStudio(page);
	await openLibrary(page);
	await page.locator('input[type="file"][accept=".zip"]').setInputFiles({
		name: 'corrupt.zip',
		mimeType: 'application/zip',
		buffer: Buffer.from('this is not a zip at all'),
	});

	// The reason used to be raised by the `catch` and then overwritten in the same
	// tick by the `finally`'s generic line — so a corrupt file reported as an empty
	// one. Sharing a pill is what made that lossy; the funnel composes one message.
	const pill = page.locator('[data-sonner-toast]').first();
	await expect(pill).toContainText('Import failed');
	await expect(pill).not.toContainText('Nothing to import from that file.');
});
