// Live calls: quality readout, per-person volume and High fidelity, against fixtures.
//
// Why a bundled harness and not the Studio: the Studio mounts the panel only inside a live session,
// which needs a relay and a second browser. The panel is pure over `LiveView` + `LiveActions`
// (live-model.ts), so the harness feeds it both and records every action it calls. NIGHTLY, like the
// rest of this suite. What the two-browser tests (a local relay, real WebRTC) and
// tools/live-session-check.mjs cover is the transport; what this covers is what a person sees and
// can do in the panel. Fixtures: docs/e2e/live-panel-harness/.

import { expect, test } from '@playwright/test';
import { assertFocusTrapped, axeFindings, calls, closeMenu, type Harness, live, micMenu, onCall, open as openPage, optionsFor, startHarness } from './live-panel-harness/serve';

let harness: Harness;
test.beforeAll(async () => {
	harness = await startHarness();
});
test.afterAll(async () => {
	await harness?.close();
});
const open = (page: import('@playwright/test').Page, query = '') => openPage(page, harness.baseURL, query);

test('@crosswidth @webkit-phone the quality line shows on a call, with what you send, and nowhere else', async ({ page }) => {
	await open(page);
	await optionsFor(page, 'Amina').click();
	await expect(page.locator('[data-live-quality]')).toHaveCount(0); // not on a call
	await expect(page.locator('[data-live-volume]')).toHaveCount(0);
	await page.keyboard.press('Escape');
	await onCall(page);
	await optionsFor(page, 'Amina').click();
	await expect(page.locator('[data-live-quality]')).toContainText('Audio: 64 kbit/s · 0.4 % lost · 18 ms jitter');
	await expect(page.locator('[data-live-quality]')).toContainText('You send 64 kbit/s');
	await page.keyboard.press('Escape');
	// Loss is shown as a whole number from 10 %, to one decimal below it.
	await live(page, (l) => l.person('p2', { quality: { inKbps: 30, lostPct: 12.4, jitterMs: 90 } }));
	await optionsFor(page, 'Amina').click();
	await expect(page.locator('[data-live-quality]')).toContainText('Audio: 30 kbit/s · 12 % lost · 90 ms jitter');
	await expect(page.locator('[data-live-quality]')).not.toContainText('You send');
});

test('@crosswidth @webkit-phone the quality line is absent when nothing was measured, the volume slider stays', async ({ page }) => {
	await open(page);
	await onCall(page, { quality: undefined });
	await optionsFor(page, 'Amina').click();
	await expect(page.locator('[data-live-quality]')).toHaveCount(0);
	await expect(page.locator('[data-live-volume]')).toBeVisible();
});

test('@crosswidth @webkit-phone the volume slider runs 0–200 % in 10 % steps and reports what it sets', async ({ page }) => {
	await open(page);
	await onCall(page);
	await optionsFor(page, 'Amina').click();
	const slider = page.locator('[data-live-volume] input[type=range]');
	await expect(slider).toHaveAttribute('min', '0');
	await expect(slider).toHaveAttribute('max', '200');
	await expect(slider).toHaveAttribute('step', '10');
	await expect(slider).toHaveValue('100');
	await expect(page.locator('[data-live-volume]')).toContainText('100 %');
	await slider.focus();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('End');
	await page.keyboard.press('Home');
	const sets = (await calls(page)).filter((c) => c[0] === 'setVolume');
	expect(sets.map((c) => c[1])).toEqual(['p2', 'p2', 'p2']);
	expect(sets.map((c) => Math.round((c[2] as number) * 100))).toEqual([110, 200, 0]);
	// The slider is the only thing that took the arrow keys: the menu is still open.
	await expect(slider).toBeVisible();
});

test('@crosswidth @webkit-phone the volume follows the model, with a spoken value', async ({ page }) => {
	await open(page);
	await onCall(page, { volume: 1.5 });
	await optionsFor(page, 'Amina').click();
	const slider = page.locator('[data-live-volume] input[type=range]');
	await expect(slider).toHaveValue('150');
	await expect(slider).toHaveAttribute('aria-valuetext', '150 percent');
	await expect(slider).toHaveAccessibleName(/volume/i);
});

test('@crosswidth @webkit-phone High fidelity is a labeled switch that reports its change and explains itself', async ({ page }) => {
	await open(page);
	await onCall(page);
	await micMenu(page).click();
	const item = page.locator('[data-live-high-fidelity]');
	await expect(item).toHaveAttribute('aria-checked', 'false');
	await expect(item).toHaveAccessibleName(/High fidelity \(music\)/);
	await expect(page.locator('#live-hifi-note')).toContainText('128 kbit/s');
	await expect(page.locator('#live-hifi-note')).toContainText('Wear headphones');
	await expect(item).toHaveAttribute('aria-describedby', 'live-hifi-note');
	// A person must SEE the state, in both states: a drawn switch (track and thumb), not a mark that only appears when on.
	const sw = item.locator('[data-live-switch]');
	await expect(sw).toBeVisible();
	await expect(sw).toHaveAttribute('data-state', 'unchecked');
	expect(await sw.boundingBox()).toMatchObject({ width: 38, height: 22 });
	await item.click();
	expect((await calls(page)).filter((c) => c[0] === 'setHighFidelity')).toEqual([['setHighFidelity', true]]);
	// The model, not the click, owns the state: it shows on only once the controller says so.
	await live(page, (l) => l.call({ highFidelity: true }));
	// The menu stays open, so the person watches the switch flip rather than reopening the menu to find out.
	await expect(page.locator('[role=menu]')).toBeVisible();
	await expect(page.locator('[data-live-high-fidelity]')).toHaveAttribute('aria-checked', 'true');
	await expect(page.locator('[data-live-high-fidelity] [data-live-switch]')).toHaveAttribute('data-state', 'checked');
	await page.locator('[data-live-high-fidelity]').click();
	expect((await calls(page)).filter((c) => c[0] === 'setHighFidelity').pop()).toEqual(['setHighFidelity', false]);
});

test('@crosswidth @webkit-phone the microphone menu lists the microphones only when there is a choice', async ({ page }) => {
	await open(page);
	await onCall(page);
	await micMenu(page).click();
	await expect(page.getByRole('menuitem', { name: /Built-in microphone/ })).toHaveCount(0); // one microphone: no picker
	await page.keyboard.press('Escape');
	await live(page, (l) => l.call({ devices: [{ id: 'm1', label: 'Built-in microphone' }, { id: 'm2', label: 'USB microphone' }] }));
	await micMenu(page).click();
	await page.getByRole('menuitem', { name: /USB microphone/ }).click();
	expect((await calls(page)).filter((c) => c[0] === 'pickMic')).toEqual([['pickMic', 'm2']]);
});

test('@a11y @webkit-phone the person menu has no axe findings (known: the Volume slider inside role=menu), in both color modes', async ({ page }) => {
	// KNOWN DEFECT, expected to fail: the Volume slider sits directly inside the person menu's role="menu",
	// and axe reports `aria-required-children` ("children which are not allowed: input"). A `group` wrapper
	// does not satisfy it. The owner decides between a popover for Volume and a documented exception (#2633).
	// `test.fail` keeps the nightly green while it holds and turns it RED the moment it is fixed, so this
	// line cannot outlive the defect. Remove it with the fix.
	test.fail(true, 'aria-required-children: the Volume slider is inside role=menu (#2633)');
	await open(page);
	await onCall(page);
	for (const mode of ['dark', 'light']) {
		await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
		await optionsFor(page, 'Amina').click();
		expect(await axeFindings(page, { menuOpen: true }), `axe findings in a person's menu with the readout and volume (${mode})`).toEqual([]);
		expect(await assertFocusTrapped(page), 'focus escaped the open menu').toEqual([]);
		await closeMenu(page);
		await page.mouse.move(0, 0); // resting state: a hovered row has its own, lower contrast (a recorded follow-up)
	}
});

test('@a11y @webkit-phone the microphone menu, with its High fidelity switch, has no axe findings in both color modes', async ({ page }) => {
	await open(page);
	await onCall(page);
	for (const mode of ['dark', 'light']) {
		await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
		await micMenu(page).click();
		expect(await axeFindings(page, { menuOpen: true }), `axe findings in the microphone menu (${mode})`).toEqual([]);
		expect(await assertFocusTrapped(page), 'focus escaped the open menu').toEqual([]);
		await closeMenu(page);
		await page.mouse.move(0, 0);
	}
});
