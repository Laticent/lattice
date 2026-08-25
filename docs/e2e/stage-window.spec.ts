import { expect, gotoStudio, setEditorContent, slideCount, test } from './studio-fixture';

// ── THE STAGE — the window the ROOM looks at ─────────────────────────────────
//
// Present used to have two presenter cockpits and no audience surface: the overlay
// showed the room an Exit button, a lens picker, four staging pills, a slide counter
// and a progress rail, and the second window duplicated the presenter's role rather
// than serving the audience (2026-08-24-stage-console-split.md §1–2). Architecture C
// splits them — the overlay stays the CONSOLE, and a Stage window carries the deck to
// the projector, chrome-free at rest: its transport is a bar that hides itself until a
// pointer or a key summons it.
//
// These cells drive the real thing, because every claim here is about a REAL second
// window and nothing else can stand in for one (HARD RULE #23): `context.waitForEvent
// ('page')` catches the popup, and the assertions are made inside it.
//
// What makes them oracles rather than formalities is the SINGLE WRITER. Both surfaces
// drive — the presenter stands at the machine the Stage is on, and a projected window
// you cannot operate is not safer, just inert — but only the console owns `idx`. A
// gesture on the Stage posts an ACTION at the console, and the `{pv:i}` that comes back
// is what repaints. So "the room followed the presenter" is measured on the Stage's own
// painted slide, and "a gesture on the Stage moved the deck" is measured on the
// CONSOLE's counter — the writer, not the surface the gesture was made on.

/** Open Present, then the Stage, and hand back both surfaces. */
async function openStage(page: import('@playwright/test').Page, context: import('@playwright/test').BrowserContext) {
	await gotoStudio(page);
	const total = await slideCount(page);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// A ≥ md affordance: the launcher is `hidden … md:inline-flex`, because a phone has no
	// second screen to stage onto. This file carries no width tag, so today only `desktop`
	// runs it — the guard is here so that tagging it onto a narrow project later SKIPS
	// rather than fails, and it is keyed on the control actually being offered rather than
	// on a width, so it tracks the breakpoint instead of a number copied out of the CSS.
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');

	const popupPromise = context.waitForEvent('page');
	await launcher.click();
	const stage = await popupPromise;
	// The deck really lands — the holding page is replaced and the engine paints.
	await expect(stage.locator('#latt-film .lattice')).not.toBeEmpty();
	return { stage, dialog, total, launcher };
}

/** Which slide the Stage is actually SHOWING — the one section left visible by the fit. */
const shownSlide = (stage: import('@playwright/test').Page) =>
	stage.evaluate(() => {
		const secs = Array.from(document.querySelectorAll('.lattice > section'));
		return secs.findIndex((s) => (s as HTMLElement).style.visibility !== 'hidden');
	});

test('the Stage carries the deck and NONE of the presenter\'s instruments', async ({ page, context }) => {
	const { stage, total } = await openStage(page, context);

	// The audience surface: the deck, the caption host and the rail.
	await expect(stage.locator('#latt-rail')).toHaveCount(1);
	await expect(stage.locator('#latt-cc')).toHaveCount(1);
	// The four things §2 says the room should never have been shown. The SLIDE COUNTER is
	// no longer on this list — it lives in the Stage's own auto-hiding control bar, where
	// it is furniture for whoever is standing at this machine rather than something the
	// room reads over the deck. What matters is that the PRESENTER's instruments are absent.
	await expect(stage.getByRole('button', { name: 'Exit present' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Slides' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Rehearse' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Stage' })).toHaveCount(0);
	// And the talk track, which is the one thing that must never reach an audience screen.
	await expect(stage.getByText('Speaker notes')).toHaveCount(0);
	// The controls that ARE here start hidden, so at rest the room still sees only the deck.
	// (Their behavior is driven in the controls cell below; this pins the resting state,
	// which is what "carries none of the presenter's instruments" now means.)
	await expect.poll(() => stage.locator('#latt-ctl').evaluate((el) => getComputedStyle(el).opacity), { timeout: 15_000 }).toBe('0');
	expect(total).toBeGreaterThan(1);
});

test('EITHER surface drives the deck, and the other follows', async ({ page, context }) => {
	// REVERSED from the first cut, which asserted the room could NOT drive and pressed
	// seven keys on the Stage to prove it. That was the wrong invariant: the case it
	// prevented is not an audience member wandering up to a projector, it is the presenter
	// standing at the machine the Stage is on, unable to advance their own deck.
	//
	// What has to hold instead is that there is ONE writer. A gesture on the Stage posts an
	// ACTION to the console, the console moves `idx`, and the `{pv}` that comes back is what
	// repaints — so the two surfaces cannot disagree about which slide is up, and a keypress
	// on each cannot race to different answers.
	const { stage, dialog, total } = await openStage(page, context);
	expect(await shownSlide(stage)).toBe(0);

	// Console → Stage. Two steps, so a single stale paint cannot pass as a follow.
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(1);
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(2);

	// Stage → Console. The console's counter is the oracle: it proves the move went THROUGH
	// the opener rather than the Stage having repainted itself locally and drifted.
	await stage.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`4 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(3);
	await stage.keyboard.press('ArrowLeft');
	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(2);

	// Home/End travel too — the full shared keymap, not a next/prev subset.
	await stage.keyboard.press('End');
	await expect(dialog.getByText(`${total} / ${total}`, { exact: true })).toBeVisible();
	await stage.keyboard.press('Home');
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(0);

	// And ONE step per gesture — an echo would show up here as a double-advance, which is
	// the failure mode a two-way relay invites and the reason the Stage posts an action
	// rather than an index.
	await stage.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await page.waitForTimeout(400);
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
});

test('the Stage carries auto-hiding controls, and its full-screen button is real', async ({ page, context }) => {
	const { stage, dialog, total } = await openStage(page, context);
	const bar = stage.locator('#latt-ctl');
	await expect(bar).toHaveCount(1);

	// HIDDEN AT REST — by opacity, so it keeps its place in the tab order for a keyboard
	// user who has no pointer to summon it with. The room sees the deck, not the controls.
	// POLLED, not slept: the fade is a signal with a name, so waiting for it to arrive beats
	// betting 2.8s is longer than a 2.4s timer on a loaded box.
	await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).opacity), { timeout: 15_000 }).toBe('0');

	// SUMMONED by the pointer, the video-player idiom.
	await stage.mouse.move(400, 300);
	await expect.poll(() => bar.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');

	// The transport works, and goes through the console like every other gesture.
	await stage.locator('#latt-next').click();
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await stage.locator('#latt-prev').click();
	await expect(dialog.getByText(`1 / ${total}`, { exact: true })).toBeVisible();

	// The counter tracks the deck rather than guessing.
	await expect(stage.locator('#latt-count')).toHaveText(`1 / ${total}`);

	// FULL SCREEN, through the real API — from a button, because the Fullscreen API wants a
	// user gesture in THIS document and a click here is one. Headless Chromium honors
	// requestFullscreen, so this is measurable; what stays unverified is auto-fullscreen
	// onto a second physical display at open time (§7).
	await stage.locator('#latt-full').click();
	await expect.poll(() => stage.evaluate(() => !!document.fullscreenElement)).toBe(true);
	await stage.locator('#latt-full').click();
	await expect.poll(() => stage.evaluate(() => !!document.fullscreenElement)).toBe(false);
});

test('the progress rail lives on whichever surface the room is watching', async ({ page, context }) => {
	// §3's rule, as an observable: the rail is audience furniture, so it follows the deck
	// to the Stage and comes back to the console when there is no Stage — and is never on
	// both at once, which is the duplication the split exists to end.
	const { stage, dialog, launcher } = await openStage(page, context);
	const consoleRail = dialog.getByRole('group', { name: /Deck progress/ });
	const stageRail = stage.locator('#latt-rail [role="group"]');

	await expect.poll(() => stageRail.count()).toBe(1);
	await expect(consoleRail).toHaveCount(0);

	// AND IT IS ACTUALLY DRAWN. "The rail is on the Stage" passed while the rail was
	// twelve pixels wide: the host div shrink-wrapped, so `width:100%` resolved against
	// nothing and the row's own padding pushed it off a 1280px display. A presence check
	// cannot see that, which makes it a vacuous pass on the one surface where an invisible
	// progress bar is unrecoverable. So measure: the rail spans most of the window, its
	// segments have real width, and its track paints an actual color.
	const geom = await stage.evaluate(() => {
		const rail = document.querySelector('#latt-rail [role="group"]') as HTMLElement | null;
		const seg = document.querySelector('.latt-rail-seg') as HTMLElement | null;
		const track = document.querySelector('.latt-rail-fill[data-tier="track"]') as HTMLElement | null;
		return {
			railW: rail ? rail.getBoundingClientRect().width : 0,
			winW: window.innerWidth,
			segW: seg ? seg.getBoundingClientRect().width : 0,
			ink: track ? getComputedStyle(track).backgroundColor : '',
		};
	});
	expect(geom.railW, 'the Stage rail does not span the display').toBeGreaterThan(geom.winW * 0.7);
	expect(geom.segW, 'the Stage rail has zero-width segments').toBeGreaterThan(4);
	expect(geom.ink, 'the Stage rail track paints nothing — the palette tokens never reached the popup').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent|^$/);

	// AND THE TOGGLE GOVERNS IT WHERE IT LIVES. The unit cell that carries this name never
	// opened a Stage, so it proved only the console-dock half — deleting the Stage portal's
	// `railOn` gate left the whole 1611-test suite green. This is the half that was open:
	// the presenter's Rail button has to reach the rail on the surface the ROOM is watching,
	// which is the only surface where it matters.
	const railToggle = dialog.getByRole('button', { name: /Progress rail/ });
	await railToggle.click();
	await expect.poll(() => stageRail.count(), { message: 'Rail off did not clear the Stage rail' }).toBe(0);
	await railToggle.click();
	await expect.poll(() => stageRail.count(), { message: 'Rail on did not restore the Stage rail' }).toBe(1);

	// Closing the Stage hands it back, in the same press.
	await launcher.click();
	await expect(consoleRail).toHaveCount(1);
});

// A PINCH IS NOT A SWIPE, AND A TRACKPAD PINCH IS NOT A WHEEL.
//
// `present-transport.mjs` names this exact pair as the #1294 root cause: every slide surface
// hand-rolled "first touch to last touch is a swipe" and none counted the fingers, and a
// trackpad pinch arrives as ctrl+wheel that no surface read. The Stage shipped both defects
// again — measured on this document before the fix, pinch-out AND pinch-in both turned the
// deck forward, and ctrl+wheel went back a slide. The kernel's own `up()` docblock states the
// contract the Stage was breaking: reading `swipeBlocked` is what a surface must do BEFORE
// calling `swipeAction`. Nothing tested the Stage's wheel or touch path at all.
//
// The oracle is the CONSOLE's counter, because the console is the single writer: if the deck
// moved, it moved there.
test('@parity a pinch on the Stage zooms nothing and turns nothing', async ({ page, context }) => {
	test.skip(!test.info().project.use.hasTouch, 'this project models a device with no touchscreen');
	const { stage, dialog, total } = await openStage(page, context);
	const at = (n: number) => dialog.getByText(`${n} / ${total}`, { exact: true });
	await stage.keyboard.press('ArrowRight');
	await expect(at(2)).toBeVisible();

	const box = await stage.locator('#latt-view').boundingBox();
	if (!box) throw new Error('the Stage view has no box');
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	// Two fingers, spreading — a pinch-out across far more than the 45px swipe threshold.
	await stage.touchscreen.tap(cx, cy); // prime the touch pipeline
	await stage.evaluate(
		({ x, y }) => {
			const t = (id: number, px: number) => new Touch({ identifier: id, target: document.body, clientX: px, clientY: y });
			const fire = (type: string, touches: Touch[]) =>
				document.body.dispatchEvent(new TouchEvent(type, { touches, changedTouches: touches, bubbles: true, cancelable: true }));
			fire('touchstart', [t(1, x - 20), t(2, x + 20)]);
			fire('touchmove', [t(1, x - 200), t(2, x + 200)]);
			// THE FINGERS LIFT ONE AT A TIME, and each touchend REPORTS THE FINGER THAT LIFTED in
			// `changedTouches` while `touches` keeps the ones still down. Ending the gesture with
			// an empty `changedTouches` instead is what made the first draft of this arm vacuous:
			// the hand-rolled reader this cell exists to retire reads `changedTouches[0]`, so it
			// bailed early and the mutation passed. A pinch that ends the way a real one does
			// hands it a 180px horizontal flick — which is exactly the bug.
			const lift = (touches: Touch[], changed: Touch[]) =>
				document.body.dispatchEvent(new TouchEvent('touchend', { touches, changedTouches: changed, bubbles: true, cancelable: true }));
			lift([t(2, x + 200)], [t(1, x - 200)]);
			lift([], [t(2, x + 200)]);
		},
		{ x: cx, y: cy },
	);
	await page.waitForTimeout(400);
	await expect(at(2), 'a pinch turned the deck — the finger count was never read').toBeVisible();

	// And the trackpad form of the same gesture.
	await stage.mouse.move(cx, cy);
	await stage.keyboard.down('Control');
	await stage.mouse.wheel(0, -120);
	await stage.keyboard.up('Control');
	await page.waitForTimeout(400);
	await expect(at(2), 'ctrl+wheel (a trackpad pinch) scrubbed the deck').toBeVisible();

	// A REAL one-finger swipe still turns it, which is what makes the guard a fix and not
	// a mute button.
	await stage.evaluate(
		({ x, y }) => {
			const t = (px: number) => new Touch({ identifier: 9, target: document.body, clientX: px, clientY: y });
			const fire = (type: string, touches: Touch[]) =>
				document.body.dispatchEvent(new TouchEvent(type, { touches, changedTouches: touches, bubbles: true, cancelable: true }));
			// ONE touchend, carrying the END point in `changedTouches` — that is where a real
			// touchend reports the finger that lifted, and `touches` is empty because none is
			// left down. (A stray second touchend would clear the start point before the swipe
			// could be measured, which is a way to write this cell so it can never pass.)
			fire('touchstart', [t(x + 150)]);
			document.body.dispatchEvent(
				new TouchEvent('touchend', { touches: [], changedTouches: [t(x - 150)], bubbles: true, cancelable: true }),
			);
		},
		{ x: cx, y: cy },
	);
	await expect(at(3), 'a genuine one-finger swipe stopped turning the deck').toBeVisible();
});

// THE BAR'S BUTTONS KEEP THEIR OWN KEYS. `PRESENT_KEYMAP` maps Space to `next` and the Stage
// binds keydown on `window`, so a keyboard user who tabbed to "Previous slide" and pressed
// Space got the deck moved FORWARD — and Space on the full-screen button advanced the deck
// instead of filling the screen. The bar's whole justification is that it stays keyboard
// reachable; reachable and wrong is worse than absent.
test('the Stage control bar answers to the keyboard it is reachable by', async ({ page, context }) => {
	const { stage, dialog, total } = await openStage(page, context);
	const at = (n: number) => dialog.getByText(`${n} / ${total}`, { exact: true });
	await stage.keyboard.press('ArrowRight');
	await stage.keyboard.press('ArrowRight');
	await expect(at(3)).toBeVisible();

	await stage.locator('#latt-prev').focus();
	await stage.keyboard.press(' ');
	await expect(at(2), 'Space on the PREVIOUS button moved the deck forward').toBeVisible();

	await stage.locator('#latt-next').focus();
	await stage.keyboard.press('Enter');
	await expect(at(3)).toBeVisible();

	// An arrow key still drives the deck while a button holds focus — the fix is scoped to
	// the two keys a button natively owns, not a blanket stand-down.
	await stage.locator('#latt-full').focus();
	await stage.keyboard.press('ArrowLeft');
	await expect(at(2), 'the arrows stopped working while the bar had focus').toBeVisible();
});

test('a Stage the presenter closes by hand is reported, not left driving a dead window', async ({ page, context }) => {
	const { stage, dialog, launcher } = await openStage(page, context);
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');

	// The `{stage:'closed'}` unload beat, on the real window. Polling `win.closed` would
	// report this up to a poll late — mid-sentence, on the one control a presenter is
	// looking at to know whether the room can still see the deck.
	await stage.close();
	await expect(launcher).toHaveAttribute('aria-pressed', 'false');
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toHaveCount(1);
});

test('the caption crawl plays on the Stage, and not in the console', async ({ page, context }) => {
	// Captions are an accessibility feature FOR THE ROOM — they only work on the screen the
	// room is watching (§3). No key and no voice are needed: the reader's cue clock runs on
	// the silent rung exactly as it does on a narrated one.
	test.setTimeout(120_000);
	const { stage, dialog } = await openStage(page, context);
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();

	// The crawl is REAL text from the reader's track, painted in the Stage's own document —
	// which is what proves the portal reached across, not merely that a host div exists.
	const crawl = stage.locator('#latt-cc .latt-cc-line');
	await expect.poll(() => crawl.count(), { timeout: 60_000 }).toBeGreaterThan(0);
	await expect(crawl.first()).not.toBeEmpty();
	// …and the console's dock is not running a second copy at the same time.
	await expect(dialog.locator('.latt-cc-line')).toHaveCount(0);

	// AND IT IS LEGIBLE FROM THE BACK OF THE ROOM. The first version copied the opener's
	// ink across, and the Stage's letterbox is dark in BOTH modes — so a light-mode app
	// painted near-black captions on a near-black surround. "The crawl is present" cannot
	// see that; contrast can. 4.5:1 is the text floor, measured on the spoken line.
	const ink = await stage.evaluate(() => {
		const lin = (c: number) => {
			const x = c / 255;
			return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
		};
		// TWO SERIALIZATIONS, and reading only the first one is how this oracle lied to its
		// author. Chromium reports a plain color as `rgb(232, 231, 231)` — 0–255 — but the
		// result of a `color-mix()` as `color(srgb 0.68 0.67 0.67 / 0.45)`, where the channels
		// are 0–1. A parser that takes "the first three numbers" reads the second form as
		// near-black and reports 1.12:1 for a line that is plainly legible on screen. The
		// crawl's read/upcoming lines ARE `color-mix()`, so this is the common case, not an edge.
		const parse = (v: string) => {
			const n = (v.match(/-?[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number);
			return v.startsWith('color(') ? n.map((c) => c * 255) : n;
		};
		const lum = (c: number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
		// The SPOKEN line specifically. Falling back to "any caption line" would let this pass
		// by measuring a deliberately faded one, which is the opposite of what it is asking.
		const line = document.querySelector('.latt-cc-line[data-state="now"]');
		if (!line) return { ratio: 0, found: false };
		const a = lum(parse(getComputedStyle(line).color));
		const b = lum(parse(getComputedStyle(document.body).backgroundColor));
		return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), found: true };
	});
	expect(ink.found, 'no line was marked as the one being spoken — the oracle had nothing to measure').toBe(true);
	expect(ink.ratio, 'the caption crawl is not legible against the Stage letterbox').toBeGreaterThanOrEqual(4.5);
});

test('the Guide cursor is drawn in the Stage document, not on the console', async ({ page, context }) => {
	// Guide aims the ROOM's attention at the text being narrated. Pointing at the console's
	// copy would gesture at a screen only the presenter can see — so the Vetrina stage is
	// mounted in the Stage window, and its cues resolve against that document (`guideCueInDoc`).
	test.setTimeout(120_000);
	const CURSOR = '.vetrina-cursor';
	const { stage, dialog } = await openStage(page, context);
	await expect(page.locator(CURSOR)).toHaveCount(0);

	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(stage.locator(CURSOR)).toHaveCount(1);
	await expect(page.locator(CURSOR)).toHaveCount(0);

	// And it really points: driving the narration moves it onto the slide, away from the
	// spawn point Vetrina puts it at. A stage that resolved nothing leaves it at spawn; one
	// that resolved the wrong document leaves it nowhere at all.
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	const size = await stage.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
	const spawn = { x: size.w / 2, y: size.h * 0.42 };
	await expect
		.poll(
			async () => {
				const box = await stage.locator(CURSOR).boundingBox();
				if (!box) return 0;
				return Math.hypot(box.x + box.width / 2 - spawn.x, box.y + box.height / 2 - spawn.y);
			},
			{ timeout: 60_000, message: 'the Guide cursor never left its spawn point inside the Stage — it resolved no target there' },
		)
		.toBeGreaterThan(40);
});

test('a Stage that is NAVIGATED away is noticed, and does not take the Studio with it', async ({ page, context }) => {
	// THE CELL THAT DID NOT EXIST, and its absence is why this shipped. "A hand-closed Stage
	// is reported" passed while covering ONE of four teardown paths: `window.close()` is the
	// only one where the unload beat keeps its `e.source`, so the guard silently dropped the
	// beat from a link click, an F5 or a Back. The console then held a dead handle — pill
	// lit, captions and rail on NEITHER surface — and kept posting the live slide index at a
	// page it no longer owned. Worse, reading that window during render threw a SecurityError
	// once it was cross-origin, and the next keystroke swapped the whole Studio for its crash
	// card. Measured, both of those, before the fix.
	const { stage, dialog, launcher } = await openStage(page, context);
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toHaveCount(0);

	// Same-origin is the reachable case here; the cross-origin escalation needs a second
	// origin, which `s1`-style probes cover outside the suite.
	await stage.goto('/');

	await expect(launcher).toHaveAttribute('aria-pressed', 'false');
	// The audience chrome comes HOME rather than vanishing from both surfaces.
	await expect(dialog.getByRole('group', { name: /Deck progress/ })).toHaveCount(1);
	// And the Studio is still standing — this is the crash the render-time deref caused.
	await expect(dialog).toBeVisible();
	await page.keyboard.press('ArrowRight'); // force a re-render, which is what used to kill it
	await expect(dialog).toBeVisible();
});

test('the Stage does not follow links — the room cannot navigate the deck away', async ({ page, context }) => {
	// A deck's own `<a href>` survives sanitizing and is clickable on the projected copy.
	// A click there stranded the console and handed a foreign origin `window.opener` on the
	// origin that holds the user's API key. On the audience surface a link click is always
	// accidental, so it is simply not a gesture.
	const { stage, launcher } = await openStage(page, context);
	const before = stage.url();
	// THREE SHAPES, because the guard's first selector caught only one of them. Measured
	// against `sanitizeSlideHtml`, all three survive it; measured in Chromium, `closest
	// ('a[href]')` is FALSE for the SVG link (an SVG `<a>` carries `xlink:href`, not an
	// `href` attribute) and false for `<area>` (which is not an `<a>` at all) — and a real
	// click on the SVG one navigated the window. A cell that tested only the plain anchor
	// was green the whole time the other two were open.
	for (const shape of ['plain', 'svg', 'area'] as const) {
		await stage.evaluate((which) => {
			for (const n of document.querySelectorAll('.probe-link')) n.remove();
			const box = document.createElement('div');
			box.className = 'probe-link';
			box.style.cssText = 'position:fixed;inset:0;z-index:99999';
			if (which === 'plain') box.innerHTML = '<a id="hit" href="/">link</a>';
			else if (which === 'svg')
				box.innerHTML = '<svg width="200" height="60"><a xlink:href="/"><rect id="hit" width="200" height="60" fill="#888"/></a></svg>';
			else
				// A REAL, decodable 200x60 image — not a 1x1 gif stretched by attributes. Measured:
				// a stretched 1x1 produces no hit region at all, so a click on the map went
				// nowhere with the guard REMOVED, and testing it that way would have been a third
				// vacuous pass hiding inside the cell written to end the first two.
				box.innerHTML =
					'<img id="hit" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAA8CAYAAAA5jHreAAAAJUlEQVR4nO3BMQEAAADCoPVPbQ0PoAAAAAAAAAAAAAAAAAAAvgYyAAABlDrDNQAAAABJRU5ErkJggg==" width="200" height="60" usemap="#pm"><map name="pm"><area shape="rect" coords="0,0,200,60" href="/"></map>';
			document.body.appendChild(box);
		}, shape);
		// An `<area>` has no box of its own, so Playwright will not click it — the click has to
		// land on the IMAGE at the hot spot's coordinates, which is also how a person hits one.
		const target = stage.locator('#hit');
		await expect(target).toBeVisible();
		const hitBox = await target.boundingBox();
		if (!hitBox) throw new Error(`the ${shape} probe has no box`);
		await stage.mouse.click(hitBox.x + hitBox.width / 2, hitBox.y + hitBox.height / 2);
		await page.waitForTimeout(400);
		expect(stage.url(), `a ${shape} link click navigated the Stage`).toBe(before);
	}
	await stage.evaluate(() => {
		for (const n of document.querySelectorAll('.probe-link')) n.remove();
	});
	await expect(launcher).toHaveAttribute('aria-pressed', 'true');
});

// THE NOTE, ON THE SURFACE THE ROOM IS LOOKING AT.
//
// A speaker note is never narrated (2026-08-24). That was fixed in the kernel and pinned
// on the exported `.vtt` — but neither is the surface a presenter actually stands in front
// of, and HARD RULE #23 is explicit that a claim names its surface and carries an artifact
// from THAT one. The independent checker marked exactly this gap: whether the note is
// PAINTED in the live caption crawl before the async projection lands was reasoned from
// source, not measured, because nobody drove the real Studio.
//
// This drives it. A multi-line note on a chart-family slide is the shape that leaked — the
// Studio's own note editor writes multi-line notes, and a chart narrator hands its
// un-consumed lines to the flattener at projection precedence. The Stage is the harshest
// place for it to be wrong: it is the copy projected to the room, so a leak here is the
// private remark on the wall behind the presenter.
test('a multi-line speaker note is never painted in the Stage caption crawl', async ({ page, context }) => {
	test.setTimeout(120_000);
	const SECRET = 'PRIVATEROOMLEAK';
	await gotoStudio(page);
	await setEditorContent(
		page,
		[
			'---', 'theme: indaco', '---', '',
			'# Cover', '', 'Opening body text for the cover slide.', '',
			'---', '<!-- _class: funnel -->', '# Signup funnel', '',
			// MULTI-LINE, and in the `note:` form the Studio's editor writes.
			'<!-- note:', `${SECRET} churn is forty percent and legal has not cleared it`, '-->', '',
			'- Visitors `1000`', '- Signups `500`', '- Paid `100`', '',
		].join('\n'),
	);

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const launcher = dialog.getByRole('button', { name: 'Stage' });
	test.skip((await launcher.count()) === 0, 'the Stage is not offered below the md breakpoint');
	const popupPromise = context.waitForEvent('page');
	await launcher.click();
	const stage = await popupPromise;
	await expect(stage.locator('#latt-film .lattice')).not.toBeEmpty();

	// Play, and walk onto the noted slide — the crawl only speaks the slide it is on.
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	const crawl = stage.locator('#latt-cc .latt-cc-line');
	await expect.poll(() => crawl.count(), { timeout: 60_000 }).toBeGreaterThan(0);
	await page.keyboard.press('ArrowRight');

	// THE POSITIVE CONTROL FIRST. Without it "the secret never appeared" also passes on a
	// crawl that never rendered anything, which is how the ladder cells certified a live
	// leak. The funnel's computed facts are what this slide should be saying.
	await expect
		.poll(async () => (await crawl.allTextContents()).join(' '), { timeout: 60_000 })
		.toMatch(/one thousand|Visitors/i);

	// …and across the whole run the note is nowhere in the room's copy.
	const seen = (await crawl.allTextContents()).join(' ');
	expect(seen, 'a speaker note reached the audience caption crawl').not.toContain(SECRET);
	expect(seen, 'and neither did any word of its body').not.toMatch(/cleared it/i);
	// Belt and braces: the whole Stage document, not just the crawl nodes.
	const body = await stage.evaluate(() => document.body.innerText);
	expect(body, 'the note is not anywhere on the audience surface').not.toContain(SECRET);
});
