// The Live panel against fixtures: the real <LivePanel> (real menus, Tailwind and palette tokens).
//
// Why a bundled harness and not the Studio: the Studio mounts the panel only inside a live session,
// which needs a relay and a second browser. The panel is pure over `LiveView` + `LiveActions`
// (live-model.ts), so the harness feeds it both and records every action it calls. NIGHTLY, like the
// rest of this suite. What the two-browser tests (a local relay, real WebRTC) and
// tools/live-session-check.mjs cover is the transport; what this covers is what a person sees and
// can do in the panel. Fixtures: docs/e2e/live-panel-harness/.

import { expect, test } from '@playwright/test';
import { assertFocusTrapped, axeFindings, calls, closeMenu, type Harness, live, onCall, open as openPage, optionsFor, startHarness } from './live-panel-harness/serve';

let harness: Harness;
test.beforeAll(async () => {
	harness = await startHarness();
});
test.afterAll(async () => {
	await harness?.close();
});
const open = (page: import('@playwright/test').Page, query = '') => openPage(page, harness.baseURL, query);

test('@crosswidth @webkit-phone your own row carries the call: join, mute, leave', async ({ page }) => {
	await open(page);
	// Not on the call yet: Join audio AND the Your audio popover are both on your row (nothing waits for a state).
	await expect(page.getByRole('button', { name: 'Your audio', exact: true })).toBeVisible();
	await page.getByRole('button', { name: 'Join audio', exact: true }).click();
	await onCall(page);
	await page.getByRole('button', { name: 'Mute', exact: true }).click();
	await page.getByRole('button', { name: 'Leave call' }).click();
	expect((await calls(page)).map((c) => c[0])).toEqual(['toggleMic', 'toggleMic', 'leaveCall']);
});

test('@crosswidth @webkit-phone leaving or ending the session asks first, and acts once', async ({ page }) => {
	await open(page);
	await page.getByRole('button', { name: 'Session options' }).click();
	await page.getByRole('menuitem', { name: /End session for everyone/ }).click();
	await expect(page.getByRole('dialog')).toContainText('End the session for everyone?');
	expect((await calls(page)).filter((c) => c[0] === 'end')).toHaveLength(0);
	await page.getByRole('button', { name: /^End session/ }).dblclick();
	expect((await calls(page)).filter((c) => c[0] === 'end')).toHaveLength(1);
	await live(page, (l) => l.clear());
	await live(page, (l) => l.set({ isHost: false }));
	await page.getByRole('button', { name: 'Session options' }).click();
	await page.getByRole('menuitem', { name: /Leave session/ }).click();
	await expect(page.getByRole('dialog')).toContainText('Leave the session?');
});

test('@crosswidth @webkit-phone the person menu stays inside the screen and the page never scrolls sideways', async ({ page }) => {
	await open(page);
	await onCall(page);
	await optionsFor(page, 'Amina').click();
	const menu = page.locator('[role=menu]');
	await expect(menu).toBeVisible();
	const box = (await menu.boundingBox()) as { x: number; y: number; width: number; height: number };
	const vp = page.viewportSize() as { width: number; height: number };
	expect(box.x).toBeGreaterThanOrEqual(0);
	expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
	expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('@crosswidth @webkit-phone in the docked column at its narrowest, the invite shortens and nothing overflows', async ({ page }) => {
	await open(page, '?w=272');
	await expect(page.getByRole('button', { name: 'Copy invite link' })).toContainText('Copy');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
	await onCall(page);
	const row = page.locator('[data-live-call]');
	const r = (await row.boundingBox()) as { x: number; width: number };
	expect(r.x + r.width).toBeLessThanOrEqual(272);
});

test('@a11y @webkit-phone the panel and a person\'s menu have no axe findings, in both color modes', async ({ page }) => {
	await open(page);
	// No volume or quality: those rows are the call-feature spec's (live-panel-calls.spec.ts), which names its own known finding.
	await onCall(page, { volume: undefined, quality: undefined });
	for (const mode of ['dark', 'light']) {
		await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
		expect(await axeFindings(page), `axe findings in the panel (${mode})`).toEqual([]);
		await optionsFor(page, 'Amina').click();
		expect(await axeFindings(page, { menuOpen: true }), `axe findings in a person's menu (${mode})`).toEqual([]);
		expect(await assertFocusTrapped(page), 'focus escaped the open menu').toEqual([]);
		await closeMenu(page);
		await page.mouse.move(0, 0); // resting state: a hovered row has its own, lower contrast (a recorded follow-up)
	}
});
