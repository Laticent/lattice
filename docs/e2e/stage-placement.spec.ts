import { expect, gotoStudio, slideCount, test } from './studio-fixture';

// ── THE PROJECTOR PATH ───────────────────────────────────────────────────────
//
// "Press Stage, it lands on the projector and fills it" is the feature's headline journey,
// and until this file it was the one load-bearing claim with no artifact behind it: this
// sandbox has one screen, so `autoPlaceStage` + `fillExternalScreen` were verified by
// reading them. HARD RULE #23 is explicit that reading is not verifying.
//
// A second physical monitor cannot be conjured. What CAN be driven, and is driven here, is
// everything either side of it, split by how real each part is — because a file that mixed
// them would be making the same claim the rule exists to stop:
//
//   REAL, no stubbing at all:
//     · WebKit, where `getScreenDetails` does not exist — the "enhancement only" claim,
//       tested on an engine that genuinely lacks the API rather than one told to pretend.
//     · Firefox AND Chromium, where fullscreen is granted or refused by the BROWSER against
//       its own gesture rules. This is why the `gecko` project exists (see the config), and
//       why these cells are `@gecko`-tagged: the value is two engines disagreeing, which is
//       invisible if only one runs.
//     · Chromium on this machine's real single screen — the Stage must NOT fullscreen, or it
//       covers the console the presenter drives from.
//
//   HARNESSED, and only in the topology:
//     · The two-screen cases inject a screen list. What that tests is OUR logic — which
//       screen is chosen, what coordinates are handed to `moveTo`/`resizeTo`, whether
//       fullscreen is requested and against WHICH document. Whether Chromium then physically
//       moves the window to a monitor is Chromium's job, not ours, and is NOT claimed here.
//       Everything else about these cells is real: real popup, real controller, real code.

type FakeScreen = {
	availLeft: number;
	availTop: number;
	availWidth: number;
	availHeight: number;
	isInternal: boolean;
};
type Topology = { mode: 'screens'; screens: FakeScreen[]; resizeThrows?: boolean } | { mode: 'absent' } | { mode: 'denied' };

const INTERNAL: FakeScreen = { availLeft: 0, availTop: 0, availWidth: 1440, availHeight: 900, isInternal: true };
const PROJECTOR: FakeScreen = { availLeft: 1440, availTop: -120, availWidth: 1920, availHeight: 1080, isInternal: false };

/**
 * Install the topology, and instrument the placement calls.
 *
 * `window.open` is wrapped so the window the controller receives records what is asked of
 * it before passing the call through. That is the only way to observe placement without a
 * monitor: the coordinates our code CHOOSES are ours to get right, and they are what a
 * wrong screen or a mixed-up `availLeft` would corrupt.
 */
async function withTopology(page: import('@playwright/test').Page, topo: Topology) {
	await page.addInitScript((t: Topology) => {
		const w = window as unknown as { __place: unknown[]; getScreenDetails?: unknown };
		w.__place = [];
		const realOpen = window.open.bind(window);
		window.open = ((...args: Parameters<typeof window.open>) => {
			const win = realOpen(...args);
			if (win) {
				try {
					const mt = win.moveTo.bind(win);
					const rt = win.resizeTo.bind(win);
					win.moveTo = (x: number, y: number) => {
						w.__place.push({ fn: 'moveTo', x, y });
						try {
							mt(x, y);
						} catch {
							/* the browser may refuse; the CHOICE is what we are recording */
						}
					};
					win.resizeTo = (cx: number, cy: number) => {
						w.__place.push({ fn: 'resizeTo', w: cx, h: cy });
						if (t.mode === 'screens' && t.resizeThrows) throw new Error('refused');
						try {
							rt(cx, cy);
						} catch {
							/* ditto */
						}
					};
					// RECORD THE REQUEST, not the outcome. Headless declines an un-gestured
					// `requestFullscreen`, so "was the Stage fullscreened?" answers false whether
					// or not the `placed ?` guard held — which made the first draft of the
					// single-screen cells pass with that guard DELETED (measured). What the guard
					// controls is whether the call is MADE, so that is what is observed.
					const proto = (win as unknown as { Element: { prototype: Element } }).Element.prototype as unknown as {
						requestFullscreen: (o?: FullscreenOptions) => Promise<void>;
					};
					const rfs = proto.requestFullscreen;
					proto.requestFullscreen = function (this: Element, o?: FullscreenOptions) {
						w.__place.push({ fn: 'requestFullscreen', onDeck: !!this.querySelector?.('#latt-stage') });
						return rfs.call(this, o);
					};
				} catch {
					/* instrumentation is best-effort; the assertions will say so */
				}
			}
			return win;
		}) as typeof window.open;

		if (t.mode === 'absent') {
			try {
				delete (window as unknown as Record<string, unknown>).getScreenDetails;
			} catch {
				/* non-configurable — the cell asserts the outcome, not the delete */
			}
			Object.defineProperty(window, 'getScreenDetails', { value: undefined, configurable: true });
		} else if (t.mode === 'denied') {
			Object.defineProperty(window, 'getScreenDetails', {
				value: () => Promise.reject(new Error('permission denied')),
				configurable: true,
			});
		} else {
			Object.defineProperty(window, 'getScreenDetails', {
				value: async () => ({ screens: t.screens, currentScreen: t.screens[0] }),
				configurable: true,
			});
		}
	}, topo);
}

/** Open Present, then the Stage, and hand back the popup plus what placement was asked. */
async function openStage(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
	await gotoStudio(page);
	await slideCount(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	const popupPromise = context.waitForEvent('page');
	await launcher.click();
	const stage = await popupPromise;
	await expect(stage.locator('#latt-film .lattice')).not.toBeEmpty();
	return { stage, dialog, launcher };
}

const placement = (page: import('@playwright/test').Page) =>
	page.evaluate(() => (window as unknown as { __place: { fn: string; x?: number; y?: number; w?: number; h?: number; onDeck?: boolean }[] }).__place);

// ── REAL: the engine that does not have the API ──────────────────────────────
//
// `getScreenDetails` is Chromium-only. The docblock on `autoPlaceStage` promises
// "enhancement only: no Window Management permission, no second screen, or a refusal, and
// the presenter drags the window themselves" — and an engine that has never heard of the
// API is the honest test of that, not a Chromium told to pretend. If the promise is wrong,
// the Stage does not open at all on Safari, which is not a degraded experience but a dead
// feature on a browser presenters use.
test('@webkit-tablet the Stage opens and drives where Window Management does not exist', async ({ page, context }) => {
	const { stage, dialog } = await openStage(page, context);
	expect(
		await page.evaluate(() => 'getScreenDetails' in window),
		'this engine HAS the API — the cell is no longer testing what it says',
	).toBe(false);

	// The deck is on the room's surface and the console still drives it.
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(/^2 \//)).toBeVisible();
	// And the Stage drives back.
	await stage.keyboard.press('ArrowRight');
	await expect(dialog.getByText(/^3 \//)).toBeVisible();
	// Nothing was fullscreened, because nothing was placed.
	expect(await stage.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

// ── REAL: this machine's actual single screen ────────────────────────────────
//
// The regression the `placed ?` guard exists for, stated in `fillExternalScreen`'s own
// docblock: "requesting it unconditionally meant a single-screen laptop could have the Stage
// cover the console — the surface the presenter drives from." One screen is what this
// sandbox HAS, so no stubbing is needed to drive it.
test('@gecko on one screen the Stage never takes the display from the console', async ({ page, context }) => {
	const { stage, dialog } = await openStage(page, context);
	await page.waitForTimeout(1200); // the placement attempt is async; give it room to be wrong
	expect(await stage.evaluate(() => !!document.fullscreenElement), 'the Stage covered the console').toBe(false);
	// The console is still usable, which is the thing the guard protects.
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(/^2 \//)).toBeVisible();
});

// ── REAL: the browser decides fullscreen, so ask two browsers ────────────────
//
// `@gecko` runs this on Chromium AND Firefox at the same viewport. The config says why in
// as many words: a fullscreen request "is granted or refused by the BROWSER, against its own
// permissions model and its own rule for what counts as a user gesture, none of which
// Blink's answer predicts." Both of the Stage's own fullscreen affordances are driven here,
// because both are what a presenter reaches for when auto-placement did not fire.
test('@gecko the Stage fills the screen from the key and from the button', async ({ page, context }) => {
	const { stage } = await openStage(page, context);
	const isFull = () => stage.evaluate(() => !!document.fullscreenElement);

	await stage.locator('body').click({ position: { x: 5, y: 5 } });
	await stage.keyboard.press('f');
	await expect.poll(isFull, { message: '`f` did not fill the screen' }).toBe(true);
	// And it is the DECK document that filled, not the holding page it replaced.
	expect(await stage.evaluate(() => document.fullscreenElement?.querySelector('#latt-stage') !== null)).toBe(true);
	await stage.keyboard.press('f');
	await expect.poll(isFull).toBe(false);

	await stage.locator('#latt-full').click();
	await expect.poll(isFull, { message: 'the full-screen button did not fill the screen' }).toBe(true);
	await expect(stage.locator('#latt-full')).toHaveAttribute('aria-pressed', 'true');
});

// ── HARNESSED TOPOLOGY: which screen, and what coordinates ───────────────────
test('the Stage is aimed at the external screen, by that screen\'s own coordinates', async ({ page, context }) => {
	await withTopology(page, { mode: 'screens', screens: [INTERNAL, PROJECTOR] });
	const { stage } = await openStage(page, context);

	await expect
		.poll(async () => (await placement(page)).length, { message: 'the Stage was never aimed anywhere' })
		.toBeGreaterThan(0);
	const calls = await placement(page);
	// A NEGATIVE availTop is deliberate: a projector mounted above the laptop reports one,
	// and a `Math.max(0, …)` or an abs() slipped in anywhere would put the Stage on the
	// wrong screen while every "did we move it" check still passed.
	expect(calls.find((c) => c.fn === 'moveTo'), 'the Stage was not moved to the projector').toMatchObject({
		x: PROJECTOR.availLeft,
		y: PROJECTOR.availTop,
	});
	// avail*, NOT width/height: the OS bars are excluded, which is what makes the window fill
	// the usable area rather than sit under a taskbar.
	expect(calls.find((c) => c.fn === 'resizeTo'), 'the Stage was not sized to the projector').toMatchObject({
		w: PROJECTOR.availWidth,
		h: PROJECTOR.availHeight,
	});
	// Order matters, and the docblock says why: resize BEFORE the fullscreen attempt, so a
	// browser that declines still leaves the room a display-filling window.
	expect(calls.findIndex((c) => c.fn === 'resizeTo')).toBeGreaterThan(calls.findIndex((c) => c.fn === 'moveTo'));

	// AND the fill is requested — against the DECK document, not the holding page it
	// replaced. `document.open()` destroys `documentElement` and fullscreen exits with it,
	// which is the measured correction `fillExternalScreen`'s docblock records; asking too
	// early reported success for a document that no longer existed.
	await expect
		.poll(async () => (await placement(page)).some((c) => c.fn === 'requestFullscreen'), {
			message: 'the projector was never asked to fill',
		})
		.toBe(true);
	expect(
		(await placement(page)).find((c) => c.fn === 'requestFullscreen'),
		'fullscreen was requested against the holding page, not the deck',
	).toMatchObject({ onDeck: true });
	await expect(stage.locator('#latt-film .lattice')).not.toBeEmpty();
});

test('a screen with no isInternal flag still resolves to the one that is not current', async ({ page, context }) => {
	// THE CELL THAT FOUND A REAL DEFECT, and the reason this file exists.
	//
	// Real hardware does not always flag its internal panel — when it does not, EVERY screen
	// reports `isInternal: false`. The original selection read
	// `find((s) => !s.isInternal) || find((s) => s !== currentScreen)`, which looks like "an
	// external screen, or failing that any other screen" and is not: the first arm matches
	// `screens[0]` on that hardware, so the fallback written for exactly this case could
	// never run. Measured before the fix — the Stage was moved to (0, 0), which is the
	// laptop, on top of the console the presenter drives from.
	const a = { ...INTERNAL, isInternal: false };
	const b = { ...PROJECTOR, isInternal: false };
	await withTopology(page, { mode: 'screens', screens: [a, b] });
	await openStage(page, context);
	await expect.poll(async () => (await placement(page)).length).toBeGreaterThan(0);
	expect((await placement(page)).find((c) => c.fn === 'moveTo'), 'the Stage was placed on the console\'s own screen').toMatchObject({
		x: b.availLeft,
		y: b.availTop,
	});
});

test('the console\'s own screen is never chosen, however it is flagged', async ({ page, context }) => {
	// The invariant underneath the cell above, stated directly: whatever the flags say, the
	// Stage does not go where the console already is. Here the CURRENT screen is the one
	// flagged external — a presenter who already dragged the browser onto the projector —
	// and the only other screen is the internal one, so that is where the Stage must land.
	await withTopology(page, { mode: 'screens', screens: [PROJECTOR, INTERNAL] });
	await openStage(page, context);
	await expect.poll(async () => (await placement(page)).length).toBeGreaterThan(0);
	expect((await placement(page)).find((c) => c.fn === 'moveTo')).toMatchObject({
		x: INTERNAL.availLeft,
		y: INTERNAL.availTop,
	});
});

test('one screen is never treated as a projector', async ({ page, context }) => {
	await withTopology(page, { mode: 'screens', screens: [INTERNAL] });
	const { stage, dialog } = await openStage(page, context);
	await page.waitForTimeout(1200);
	const calls = await placement(page);
	expect(calls.filter((c) => c.fn !== 'requestFullscreen'), 'a single-screen laptop had its Stage moved').toEqual([]);
	expect(
		calls.find((c) => c.fn === 'requestFullscreen'),
		'fullscreen was REQUESTED on a single screen — the Stage would cover the console on any browser that grants it',
	).toBeUndefined();
	expect(await stage.evaluate(() => !!document.fullscreenElement), 'a single-screen laptop was fullscreened').toBe(false);
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(/^2 \//)).toBeVisible();
});

test('a refused Window Management permission degrades, and never throws', async ({ page, context }) => {
	// The `catch { /* permission denied / unsupported */ }`. A rejection here used to be the
	// kind of thing that takes the Studio down with it (§9's SecurityError), so the assertion
	// is not only "no placement" but "everything still works".
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await withTopology(page, { mode: 'denied' });
	const { stage, dialog } = await openStage(page, context);
	await page.waitForTimeout(1200);
	expect(await placement(page), 'a denied permission still moved or filled the Stage').toEqual([]);
	expect(await stage.evaluate(() => !!document.fullscreenElement)).toBe(false);
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(/^2 \//)).toBeVisible();
	expect(errors, 'a denied permission threw into the page').toEqual([]);
});

test('a browser that refuses to resize still gets the Stage onto the projector', async ({ page, context }) => {
	// The inner `try { win.resizeTo(…) } catch`. Losing the resize is a smaller loss than
	// losing the placement, and the code is written so one cannot take the other with it.
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));
	await withTopology(page, { mode: 'screens', screens: [INTERNAL, PROJECTOR], resizeThrows: true });
	const { stage } = await openStage(page, context);
	await expect.poll(async () => (await placement(page)).length).toBeGreaterThan(0);
	expect((await placement(page)).find((c) => c.fn === 'moveTo')).toMatchObject({ x: PROJECTOR.availLeft });
	await expect(stage.locator('#latt-film .lattice')).not.toBeEmpty();
	expect(errors, 'a refused resize threw into the page').toEqual([]);
});
