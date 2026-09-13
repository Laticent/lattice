import { expect, type Page, test } from '@playwright/test';

// The Vetrina exemplar + stress battery (design doc §15.6, §16) — the v1 proof that
// the FULL surface holds on a real browser (HARD RULE #23). Every oracle is
// cause→effect on STATE (the board's data-* attributes the walkthroughs write, or a
// computed CSS token), never wall-clock or pixels — so these are deterministic and
// block per-PR. The generic non-Studio host also proves the library is decoupled.

const BOARD = '#vt-board';
const STAGE = '.vetrina-stage';

const attr = (page: Page, name: string) => page.locator(BOARD).getAttribute(name);
const goto = (page: Page, demo: string) => page.goto(`/vetrina-exemplars/?demo=${demo}`);

test('gestures — all five of the frozen alphabet play, in order, and the run completes', async ({ page }) => {
	await goto(page, 'gestures');
	await expect(page.locator(STAGE)).toBeVisible();
	// Each gesture logs its meaning-bearing kind as it plays.
	await expect.poll(() => attr(page, 'data-gestures')).toBe('wave circle check cross shake');
	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect.poll(() => attr(page, 'data-vt-reason')).toBe('complete');
});

test('gestures under reduced motion still complete (collapse, never hang)', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await goto(page, 'gestures');
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => attr(page, 'data-gestures')).toBe('wave circle check cross shake');
	await expect.poll(() => attr(page, 'data-vt-reason')).toBe('complete');
});

test('drag — a successful move drops the item at its new place', async ({ page }) => {
	await goto(page, 'drag-ok');
	await expect(page.locator(STAGE)).toBeVisible();
	// The reorder act succeeds → the storyboard drops a3 above a1. Final order: a3, a1, a2.
	await expect.poll(() => page.locator('#widget-a ol li').evaluateAll((els) => els.map((e) => e.id))).toEqual(['a3', 'a1', 'a2']);
	await expect.poll(() => attr(page, 'data-vt-reason')).toBe('complete');
});

test('drag — a rejected move snaps back and shows a cross (the trust invariant)', async ({ page }) => {
	await goto(page, 'drag-fail');
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => attr(page, 'data-drag-rejected')).toBe('true');
	// The order is UNCHANGED — the theater never showed a completed move that didn't happen.
	await expect.poll(() => page.locator('#widget-a ol li').evaluateAll((els) => els.map((e) => e.id))).toEqual(['a1', 'a2', 'a3']);
	await expect.poll(() => attr(page, 'data-vt-reason')).toBe('complete');
});

test('theming — CSS-first: the mounted stage inherits the host :root --vt-* across light AND dark', async ({ page }) => {
	await goto(page, 'theming');
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => attr(page, 'data-vt-phase')).toBe('holding');

	// Light mode: the stage's --vt-accent is the host's :root light value — NOT the JS default.
	//
	// READ IT AS A COLOR, NOT AS A STRING. A custom property's computed value is the token
	// stream as it survived the build, not a parsed color — and astro 7's CSS minifier
	// rewrites the page's authored `rgb(20, 120, 220)` to `#1478dc`. Same color, and the
	// render is pixel-identical, but a literal string comparison went red on the astro 6 -> 7
	// bump (#1483) for a difference that is purely serialization. What this case is actually
	// asserting is PROVENANCE — the host's value reached the stage rather than the JS default —
	// so canonicalize through the browser's own color parser and the assertion stops depending
	// on how any future minifier chooses to spell it.
	const readAccent = () =>
		page.locator(STAGE).evaluate((el) => {
			const raw = getComputedStyle(el).getPropertyValue('--vt-accent').trim();
			const probe = el.ownerDocument.createElement('span');
			probe.style.color = raw;
			el.ownerDocument.body.appendChild(probe);
			const parsed = getComputedStyle(probe).color;
			probe.remove();
			return parsed;
		});
	expect(await readAccent()).toBe('rgb(20, 120, 220)');

	// Flip the host's mode: the cascade re-resolves the token with ZERO engine mode-switch code.
	await page.evaluate(() => document.documentElement.setAttribute('data-mode', 'dark'));
	await expect.poll(readAccent).toBe('rgb(240, 90, 60)');
});

test('instant beat — the act applies with NO cursor glide, typing, or gesture (no theater)', async ({ page }) => {
	await goto(page, 'instant');
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => attr(page, 'data-vt-phase')).toBe('holding');

	// The instant reorder took effect — a3 moved above a1 — so the act ran.
	await expect.poll(() => page.locator('#widget-a ol li').evaluateAll((els) => els.map((e) => e.id))).toEqual(['a3', 'a1', 'a2']);

	// …but the cursor never traveled to widget A (no `point` glide): it stays near its center
	// spawn. Had the beat used the normal path, the cursor would have glided left to the list.
	const cursorLeft = await page.locator('.vetrina-cursor').evaluate((el) => el.getBoundingClientRect().left);
	const mid = await page.evaluate(() => window.innerWidth / 2);
	expect(cursorLeft).toBeGreaterThan(mid - 100);
});

test('theming (JS) — a concrete accent themes the cursor BODY and its cues alike', async ({ page }) => {
	// Regression guard (the derived --vt-cursor-fill bug): the cursor body tints from
	// var(--vt-cursor-fill), whose default lives on :root — so a JS accent set inline on the
	// stage must ALSO emit --vt-cursor-fill inline, or the body stays the house blue while the
	// cues track the accent. Assert the cursor subtree resolves the token to the JS accent.
	await goto(page, 'theming-js');
	await expect(page.locator('.vetrina-stage')).toBeVisible();
	await expect.poll(() => attr(page, 'data-vt-phase')).toBe('holding');

	const accent = 'rgb(255, 40, 140)';
	const readOnLayer = () => page.locator('.vetrina-stage').evaluate((el) => getComputedStyle(el).getPropertyValue('--vt-accent').trim());
	const readCursorFill = () => page.locator('.vetrina-cursor').evaluate((el) => getComputedStyle(el).getPropertyValue('--vt-cursor-fill').trim());
	expect(await readOnLayer()).toBe(accent);
	// The body's token resolves to the SAME accent (not the #2b6ef2 :root default).
	expect(await readCursorFill()).toBe(accent);
});

test('narration dock — one consolidated pill (dot + narration + Exit), placement:top moves it to the top edge', async ({ page }) => {
	await goto(page, 'theming'); // holds on the stage so the dock is readable
	await expect(page.locator('.vetrina-stage')).toBeVisible();
	await expect.poll(() => attr(page, 'data-vt-phase')).toBe('holding');

	const dock = page.locator('.vetrina-caption');
	await expect(dock).toBeVisible();
	// Consolidated: the Exit control lives INSIDE the single dock — there is no separate
	// top "Live demo" chrome strip anymore.
	await expect(dock.locator('button[aria-label="Exit the demo"]')).toHaveCount(1);
	await expect(page.locator('.vetrina-chrome')).toHaveCount(0);
	// Default edge is the bottom.
	expect(await dock.evaluate((el) => getComputedStyle(el).bottom)).not.toBe('auto');

	// placement:'top' moves the SAME dock to the top edge (a curated option).
	await page.goto('/vetrina-exemplars/?demo=theming&placement=top');
	const topDock = page.locator('.vetrina-caption');
	await expect(topDock).toBeVisible();
	expect(await topDock.evaluate((el) => getComputedStyle(el).top)).toBe('14px');
});

test('bad accent — an exfil-shaped url() accent is rejected; no stage ever mounts', async ({ page }) => {
	await goto(page, 'bad-accent');
	// resolveTheme throws synchronously inside run(); the host catches + marks it.
	await expect.poll(() => attr(page, 'data-accent-rejected')).toBe('true');
	await expect(page.locator(STAGE)).toHaveCount(0);
});

test('decouple — a run scoped to widget A resolves the shared target INSIDE A, never B', async ({ page }) => {
	await goto(page, 'decouple');
	await expect(page.locator(STAGE)).toBeVisible();
	// Both widgets carry a `.scoped-target`; the root-scoped resolve must land in A.
	await expect.poll(() => attr(page, 'data-resolved-widget')).toBe('a');
	await expect.poll(() => attr(page, 'data-vt-reason')).toBe('complete');
});

test('interleave + take-over — composed segments drive state that survives a mid-run take-over', async ({ page }) => {
	await goto(page, 'interleave');
	await expect(page.locator(STAGE)).toBeVisible();
	// The segment + loop + branch run before the hand-off, recording steps 1,2,3.
	await expect.poll(() => attr(page, 'data-steps')).toBe('1 2 3');
	await expect.poll(() => attr(page, 'data-vt-phase')).toBe('awaiting');

	// Take over with a real click. The run stops; the recorded state PERSISTS; step 4 (past the
	// hand-off) is never reached.
	await page.locator('#decoy').click();
	await expect(page.locator(STAGE)).toHaveCount(0);
	await expect.poll(() => attr(page, 'data-vt-reason')).toBe('takeover');
	expect(await attr(page, 'data-steps')).toBe('1 2 3');
});

// ── reveal: a target below the fold ────────────────────────────────────────────────────────
//
// The one oracle in this file that measures RECTANGLES rather than the board's own state
// attributes, and it has to: the subject IS scroll position. (`vetrina-geometry.spec.ts` sets the
// precedent — a cue's agreement with the thing it names is geometry or it is nothing.) It is still
// cause→effect and still deterministic: the demo holds on the stage at `phase=holding`, so nothing
// here waits on wall-clock.
//
// The defect it pins: nothing in the stage scrolled, ever. `#far-target` sits more than a viewport
// down the page, so on the unfixed build all three numbers below go the other way — the page never
// moves (scrollY 0), the target stays below the window, and the cursor faithfully parks on it
// OFF-SCREEN, which is exactly what made this look like "the tour does nothing" on a phone.

/** Where the cue and its target ended up, in viewport coordinates. The cursor is measured by its
 *  own box rather than its inline `left`/`top`, so the hand's paint-only wobble and the
 *  translate(-50%,-50%) are both accounted for by the browser rather than by arithmetic here. */
async function revealGeometry(page: Page) {
	return page.evaluate(() => {
		const t = document.querySelector('#far-target')?.getBoundingClientRect();
		const c = document.querySelector('.vetrina-cursor')?.getBoundingClientRect();
		return {
			scrollY: window.scrollY,
			view: window.innerHeight,
			target: t ? { top: t.top, bottom: t.bottom, left: t.left, right: t.right } : null,
			cursor: c ? { x: (c.left + c.right) / 2, y: (c.top + c.bottom) / 2 } : null,
		};
	});
}

async function expectRevealed(page: Page): Promise<void> {
	await goto(page, 'reveal');
	await expect(page.locator(STAGE)).toBeVisible();
	await expect.poll(() => attr(page, 'data-vt-phase')).toBe('holding');

	const g = await revealGeometry(page);
	expect(g.target, 'no #far-target — the reveal exemplar measured nothing').not.toBeNull();
	expect(g.cursor, 'no cursor — the reveal exemplar measured nothing').not.toBeNull();
	// The page moved by more than half a window. This is also the guard on the oracle itself: a
	// scroll that large can only mean the target started well below the fold, which is the
	// condition the case exists to create.
	expect(g.scrollY, 'the page never scrolled — the cue is pointing off-screen').toBeGreaterThan(g.view / 2);
	// The target is fully on screen, top and bottom — within a pixel. `block: 'nearest'` lands the
	// bottom edge FLUSH with the window's, so at 390x844 it measured 844.171875 against a viewport
	// of 844: fractional layout, not an overshoot. A whole pixel of slack is the right size for
	// that and still an order of magnitude below the failure this pins (a target ~1,100px down).
	expect(g.target?.top).toBeGreaterThanOrEqual(-1);
	expect(g.target?.bottom).toBeLessThanOrEqual(g.view + 1);
	// And the cursor is ON it (a 4px slack for the hand's landing wobble).
	expect(g.cursor?.y, `cursor at y=${g.cursor?.y} vs target ${g.target?.top}-${g.target?.bottom}`).toBeGreaterThanOrEqual((g.target?.top ?? 0) - 4);
	expect(g.cursor?.y).toBeLessThanOrEqual((g.target?.bottom ?? 0) + 4);
	expect(g.cursor?.x).toBeGreaterThanOrEqual((g.target?.left ?? 0) - 4);
	expect(g.cursor?.x).toBeLessThanOrEqual((g.target?.right ?? 0) + 4);

	// The second half of the demo is a gesture-only beat on the same target — a verb that never
	// passes through `point`, and whose reveal is therefore its own. It completes.
	await expect.poll(() => attr(page, 'data-vt-phase'), { timeout: 20_000 }).toBe('done');
	await expect.poll(() => attr(page, 'data-vt-reason')).toBe('complete');
}

test('reveal @crosswidth — a target below the fold is scrolled into view and the cursor lands on it', async ({ page }) => {
	await expectRevealed(page);
});

// REAL WEBKIT AT AN IPHONE BOX, because two things in this fix are engine-specific and the report
// was an iPhone. `behavior: 'instant'` is a WebIDL enum member (Safari 15.4+), so an engine that
// does not know it throws from the dictionary conversion rather than ignoring it — a Chromium pass
// cannot see that at all. And `block: 'nearest'` is the browser's own judgment about what is
// already visible. This is the WebKit ENGINE, not iOS: real touch, Safari's collapsing chrome and
// the visual-viewport offset are still owed on a device (HARD RULE #23).
test('reveal @webkit-phone — the same on real WebKit, where `behavior: instant` is an engine question', async ({ page }) => {
	await expectRevealed(page);
});
