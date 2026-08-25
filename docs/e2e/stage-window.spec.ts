import { expect, gotoStudio, setEditorContent, slideCount, test } from './studio-fixture';

// ── THE STAGE — the window the ROOM looks at ─────────────────────────────────
//
// Present used to have two presenter cockpits and no audience surface: the overlay
// showed the room an Exit button, a lens picker, four staging pills, a slide counter
// and a progress rail, and the second window duplicated the presenter's role rather
// than serving the audience (2026-08-24-stage-console-split.md §1–2). Architecture C
// splits them — the overlay stays the CONSOLE, and a chrome-free Stage window carries
// the deck to the projector.
//
// These cells drive the real thing, because every claim here is about a REAL second
// window and nothing else can stand in for one (HARD RULE #23): `context.waitForEvent
// ('page')` catches the popup, and the assertions are made inside it.
//
// What makes them oracles rather than formalities is the DIRECTION of the wire. The
// Stage does not navigate — the console posts `{pv:i}` at it, one way — so "the room
// followed the presenter" is measured on the Stage's own painted slide, and "the room
// cannot drive the deck" is measured by pressing the deck keys INSIDE the Stage and
// requiring the console not to move.

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

	// The audience surface: the deck, the caption host and the rail. Nothing else.
	await expect(stage.locator('#latt-rail')).toHaveCount(1);
	await expect(stage.locator('#latt-cc')).toHaveCount(1);
	// The five things §2 says the room should never have been shown.
	await expect(stage.getByRole('button', { name: 'Exit present' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Slides' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Rehearse' })).toHaveCount(0);
	await expect(stage.getByRole('button', { name: 'Stage' })).toHaveCount(0);
	await expect(stage.getByText(`1 / ${total}`, { exact: true })).toHaveCount(0);
	// And the talk track, which is the one thing that must never reach an audience screen.
	await expect(stage.getByText('Speaker notes')).toHaveCount(0);
});

test('the console drives the room, and the room cannot drive the console', async ({ page, context }) => {
	const { stage, dialog, total } = await openStage(page, context);
	expect(await shownSlide(stage)).toBe(0);

	// Console → Stage. Two steps, so a single stale paint cannot pass as a follow.
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`2 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(1);
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
	await expect.poll(() => shownSlide(stage)).toBe(2);

	// Stage → nothing. Every key that turns a deck anywhere else in the product is inert
	// here: the audience is not a second driver, which is the whole difference between
	// this window and the presenter window it replaced.
	for (const key of ['ArrowRight', 'ArrowLeft', 'PageDown', 'PageUp', 'Space', 'End', 'Home']) {
		await stage.keyboard.press(key);
	}
	await expect(dialog.getByText(`3 / ${total}`, { exact: true })).toBeVisible();
	expect(await shownSlide(stage)).toBe(2);
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

	// Closing the Stage hands it back, in the same press.
	await launcher.click();
	await expect(consoleRail).toHaveCount(1);
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
	await stage.evaluate(() => {
		const a = document.createElement('a');
		a.href = '/';
		a.textContent = 'link';
		document.body.appendChild(a);
		a.click();
	});
	await page.waitForTimeout(800);
	expect(stage.url(), 'a link click navigated the Stage').toBe(before);
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
