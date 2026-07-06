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
	const readAccent = () => page.locator(STAGE).evaluate((el) => getComputedStyle(el).getPropertyValue('--vt-accent').trim());
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
