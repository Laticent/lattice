import { FRAME_MS, pauseFrames, stepFramesUntil } from './frame-clock';
import { expect, gotoStudio, openInspectorTab, test } from './studio-fixture';

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
	// The count below is only meaningful while all three messages are still within the 2600 ms dwell — past it they
	// would have expired on their own and a count of 1 would prove nothing. So the page's clock is STOPPED for the
	// clicks (frame-clock.ts): no dwell timer can run, on any runner, however slow. This used to time the clicks with a
	// stopwatch and fail a box too slow to land three in 2.6 s (HARD RULE #32, F1).
	await page.clock.install();
	await gotoStudio(page);
	await pauseFrames(page);

	// "New deck" raises a confirmation on every click. Three of them, back to back
	// through the real menu — the exact shape that used to stack.
	for (let i = 0; i < 3; i++) {
		await deckSwitcher(page).click();
		await page.getByRole('menuitem', { name: 'New deck' }).click();
	}
	// Sonner publishes a toast a macrotask late, on the stopped clock: step frames until it renders, a second of virtual
	// time at most, well inside the dwell.
	await stepFramesUntil(page, () => pills(page).first().isVisible(), Math.ceil(1000 / FRAME_MS));

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
	await page.locator('[data-testid="library-import-input"]').setInputFiles({
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
	await page.locator('[data-testid="library-import-input"]').setInputFiles({
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

// ── THE EXIT WINDOW, on the real surface ────────────────────────────────────
//
// The kernel's second trap (`src/lib/notify.ts`, "THE EXIT WINDOW"): closing a toast
// does not remove it. Sonner sets `data-removed="true"`, starts a 200ms exit
// animation and schedules `removeToast` for the end of it — and that pending removal
// matches BY ID VALUE (`TIME_BEFORE_UNMOUNT`, sonner 2.0.7 `dist/index.mjs:425,574`).
// A message raised on the SAME id inside those 200ms renders and is then deleted by
// the previous message's timer. It flashes and vanishes. So the kernel reuses a
// kind's id only while that kind's pill is LIVE, and rotates it once the pill closes.
//
// Both claims below were measured in jsdom against the real Sonner package
// (`src/lib/notify.dom.test.tsx`) and nowhere else, which is a gap this file exists
// to close: jsdom runs no animation frames, lays nothing out, and its timers are not
// the browser's. These two arms drive Chromium, the built Studio, the real Toaster
// and real wall-clock timers.
//
// THE HARD PART IS LANDING INSIDE 200ms, and a clock is the wrong instrument — an
// earlier attempt drove the window with a faked clock, PASSED with the defect pinned
// in, and was deleted rather than shipped as coverage that proves nothing. What works
// is to stop timing the window and start OBSERVING it: `data-removed="true"` is the
// exact instant it opens, so a MutationObserver installed in the page fires on that
// attribute and raises the next message from inside the same microtask — a few
// milliseconds in, deterministically, however loaded the box is.
//
// The click it dispatches is programmatic (`el.click()`), which is the one synthetic
// step here and is deliberate: a CDP round-trip cannot make the deadline, and the
// subject of these arms is the kernel's id bookkeeping, not the pointer. Everything
// the click then runs — React's handler, `settingsWrite`, `notify`/`notifyAction`,
// Sonner's store, the Toaster's render — is the real app in a real browser.

/** Install a one-shot page-side observer: the first time a toast starts exiting,
 *  synchronously click `selector`. Resolves once armed; the fire time is read back
 *  with `exitReplyFired` so a test can tell "the arm never fired" from "the pill
 *  never survived" — two very different failures with the same symptom. */
async function armExitReply(page: import('@playwright/test').Page, selector: string): Promise<void> {
	await page.evaluate((sel) => {
		const w = window as unknown as { __lxExitReply?: { at: number | null; clicked: boolean } };
		w.__lxExitReply = { at: null, clicked: false };
		const obs = new MutationObserver((records) => {
			for (const r of records) {
				const el = r.target as HTMLElement;
				if (!el.matches?.('[data-sonner-toast]')) continue;
				if (el.getAttribute('data-removed') !== 'true') continue;
				obs.disconnect();
				w.__lxExitReply = { at: performance.now(), clicked: false };
				const target = document.querySelector(sel) as HTMLElement | null;
				if (target) {
					target.click();
					w.__lxExitReply.clicked = true;
				}
				return;
			}
		});
		obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-removed'] });
	}, selector);
}

function exitReplyFired(page: import('@playwright/test').Page) {
	return page.evaluate(() => (window as unknown as { __lxExitReply?: { at: number | null; clicked: boolean } }).__lxExitReply ?? null);
}

/** Wait out the window by its OWN signal rather than by a clock: the previous
 *  message's pending `removeToast` detaches the exiting element when it fires, so
 *  once no toast is still marked `data-removed` the deadline has passed. A fixed
 *  sleep here would be a guess about a loaded box; this is the event itself. */
function exitingPill(page: import('@playwright/test').Page) {
	return page.locator('[data-sonner-toast][data-removed="true"]');
}

test('a status message raised inside the previous one’s exit window survives it', async ({ page }) => {
	await gotoStudio(page);

	// "Save a version" is a single-click status raiser — no menu in front of it, so the observer can re-run the
	// same route from inside the window. (It was the strip's Duplicate until Duplicate began confirming on the
	// strip itself rather than in a toast, 2026-10-27-slide-structure-strip.md §5.)
	await page.getByRole('button', { name: 'Version history' }).click();
	const save = page.getByRole('button', { name: 'Save a version' }).first();
	await save.click();
	await expect(pills(page).first()).toContainText('Version saved to history.');
	// Take the pointer off the pill: Sonner pauses every dwell while the stack is hovered
	// (`dist/index.mjs:605`), and a hovered pill never expires.
	await page.mouse.move(0, 0);

	// The observer finds the button by a mark, since it has no name of its own to select by.
	await save.evaluate((el) => el.setAttribute('data-exit-reply-target', ''));
	await armExitReply(page, '[data-exit-reply-target]');

	// Now let the pill expire on its own 2600ms dwell. The observer catches the exit.
	await expect.poll(async () => (await exitReplyFired(page))?.at ?? null, {
		timeout: 10_000,
		message: 'the pill never started exiting — the observer had nothing to reply to',
	}).not.toBeNull();
	expect((await exitReplyFired(page))?.clicked, 'the observer found no Save a version button to click').toBe(true);

	// Both messages share the `status` slot. With the id rotated on close, the second is
	// a NEW element that outlives the first's removal; on a shared fixed id it merges
	// into the exiting one and goes out with it, so the count lands on 0.
	await expect(exitingPill(page)).toHaveCount(0);
	await expect(pills(page)).toHaveCount(1);
	await expect(pills(page).first()).toContainText('Version saved to history.');
});

test('an action message raised inside a CLICKED affordance’s exit window survives it', async ({ page }) => {
	await gotoStudio(page);
	await openInspectorTab(page, 'general');

	// Every Inspector write raises an Undo through the `action` kind (`settingsWrite`
	// → `showUndo` → `notifyAction`). Two different toggles, so the second message is
	// distinguishable from the first by text rather than by counting.
	await page.getByRole('switch', { name: 'Inline pills and marks' }).click();
	const undo = pills(page).first();
	await expect(undo).toContainText('Inline pills and marks off');

	await armExitReply(page, 'button[role="switch"][aria-label="Auto-glossary"]');

	// CLICKING the affordance is the close path Sonner does not report: its action
	// button runs `onClick` then `deleteToast()` with no `onDismiss` at all
	// (`dist/index.mjs:816-821`), unlike the close button and the swipe. The kernel
	// wraps the caller's handler to report the close itself; without that wrap the slot
	// stays `live` forever, its id never rotates, and the exit-window protection is
	// simply OFF for the one kind that carries a button.
	await undo.getByRole('button', { name: 'Undo' }).click();

	await expect.poll(async () => (await exitReplyFired(page))?.at ?? null, {
		timeout: 10_000,
		message: 'the Undo pill never started exiting after its button was clicked',
	}).not.toBeNull();
	expect((await exitReplyFired(page))?.clicked, 'the observer found no Auto-glossary switch to click').toBe(true);

	await expect(exitingPill(page)).toHaveCount(0);
	await expect(pills(page).filter({ hasText: 'Auto-glossary on' })).toHaveCount(1);
});

// TRAP 3, on the real surface (notify.ts; ci-flake-audit §3). The OTHER edge of the exit window: a message raised just
// BEFORE the live pill's 2600 ms dwell ends. Sonner publishes a toast a macrotask late (`setTimeout` + `flushSync`), so
// the raise reuses the live id while the pill's own close timer, already due, fires first: the new text merges into a
// pill marked `data-removed` and goes with it, and the slot used to stay "live" on that dead id, so the NEXT message
// vanished too. That is how studio-smoke lost "Saved .pricing-trio".
//
// A click from outside cannot land in that one task on purpose, so the page's own timers place it: the next timer armed
// with the status dwell (2600 ms) gets a twin queued ahead of it, at the same delay, that clicks "Save a version". The
// raise then runs in the same tick as the close and before it, and its publish lands after: the order the trace showed.
// One body, two titles: `desktop` skips any `@webkit` title, and a phone width does not draw "Version history", so the
// `@gecko` copy runs on Chromium desktop and Gecko, and the `@webkit-tablet` copy on WebKit.
for (const tag of ['@gecko', '@webkit-tablet'])
test(`${tag} a status message raised just before the live pill closes, and the next one, both show`, async ({ page }) => {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Version history' }).click();
	const save = page.getByRole('button', { name: 'Save a version' }).first();
	await page.mouse.move(0, 0);

	await page.evaluate(() => {
		const w = window as unknown as { __trap3?: { armed: boolean; fired: boolean } };
		w.__trap3 = { armed: true, fired: false };
		const native = window.setTimeout.bind(window);
		window.setTimeout = ((fn: TimerHandler, delay?: number, ...rest: unknown[]) => {
			if (w.__trap3?.armed && delay === 2600) {
				w.__trap3.armed = false;
				native(() => {
					// Found at click time: the panel re-renders, so a mark set on the button earlier is gone by now.
					const btn = [...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === 'Save a version');
					btn?.click();
					if (w.__trap3) w.__trap3.fired = !!btn;
				}, 2600);
			}
			return native(fn, delay, ...rest);
		}) as typeof window.setTimeout;
	});

	// Message A, by a script click so no pointer hovers the stack (a hover pauses the dwell and re-arms a shorter timer).
	await save.evaluate((el) => (el as HTMLElement).click());
	await expect(pills(page).first()).toContainText('Version saved to history.');
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { __trap3?: { fired: boolean } }).__trap3?.fired ?? false), {
			timeout: 10_000,
			message: 'the dwell timer never armed, or no Save a version button was there to click: the race was never staged',
		})
		.toBe(true);

	// Message B, raised in the close's own tick: it must outlive the dying pill.
	const live = page.locator('[data-sonner-toast]:not([data-removed="true"])');
	await expect(exitingPill(page)).toHaveCount(0);
	await expect(live, 'the message raised as the old pill closed').toHaveCount(1);
	await expect(live.first()).toContainText('Version saved to history.');

	// Message C, right after: the slot must not still point at the dead pill.
	await save.evaluate((el) => (el as HTMLElement).click());
	await expect(live, 'the message after it').toHaveCount(1);
	await expect(live.first()).toContainText('Version saved to history.');
});
