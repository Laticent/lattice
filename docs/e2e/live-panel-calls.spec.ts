// Live calls: quality readout, per-person volume and High fidelity, against fixtures.
//
// Why a bundled harness and not the Studio: the Studio mounts the panel only inside a live session,
// which needs a relay and a second browser. The panel is pure over `LiveView` + `LiveActions`
// (live-model.ts), so the harness feeds it both and records every action it calls. NIGHTLY, like the
// rest of this suite. What the two-browser tests (a local relay, real WebRTC) and
// tools/live-session-check.mjs cover is the transport; what this covers is what a person sees and
// can do in the panel. Fixtures: docs/e2e/live-panel-harness/.

import { expect, test } from '@playwright/test';
import { assertFocusTrapped, axeFindings, calls, closeMenu, type Harness, live, onCall, open as openPage, optionsFor, startHarness, volumeFor, yourAudio } from './live-panel-harness/serve';

let harness: Harness;
test.beforeAll(async () => {
	harness = await startHarness();
});
test.afterAll(async () => {
	await harness?.close();
});
const open = (page: import('@playwright/test').Page, query = '') => openPage(page, harness.baseURL, query);

test('@crosswidth @webkit-phone the volume button is on every other row in every state, and says what is possible', async ({ page }) => {
	await open(page);
	// You are not on the call: the button is still there, and says what to do.
	await expect(volumeFor(page, 'Amina')).toBeVisible();
	await expect(volumeFor(page, 'Amina')).toHaveAttribute('data-live-available', 'false');
	await volumeFor(page, 'Amina').click();
	await expect(page.locator('[data-live-audio-unavailable]')).toContainText('Join the call to hear and adjust people.');
	await expect(page.locator('[data-live-volume]')).toHaveCount(0);
	await page.getByRole('button', { name: 'Join audio', exact: true }).last().click();
	expect((await calls(page)).filter((c) => c[0] === 'toggleMic')).toHaveLength(1);
	await page.keyboard.press('Escape');
	// You are on the call, they are not.
	await live(page, (l) => l.set({ call: { inCall: true, muted: false, denied: false, devices: [], device: null, highFidelity: false } }));
	await volumeFor(page, 'Amina').click();
	await expect(page.locator('[data-live-audio-unavailable]')).toContainText("Amina isn't on the call yet.");
	await page.keyboard.press('Escape');
	// Both on the call: the slider. Never on your own row.
	await onCall(page);
	await expect(volumeFor(page, 'Amina')).toHaveAttribute('data-live-available', 'true');
	await expect(volumeFor(page, 'Sharmarke')).toHaveCount(0);
});

test('@crosswidth @webkit-phone the quality line shows on a call, with what you send, and nowhere else', async ({ page }) => {
	await open(page);
	await onCall(page);
	await volumeFor(page, 'Amina').click();
	await expect(page.locator('[data-live-quality]')).toContainText('Audio: 64 kbit/s · 0.4 % lost · 18 ms jitter');
	await expect(page.locator('[data-live-quality]')).toContainText('You send 64 kbit/s');
	await page.keyboard.press('Escape');
	// Loss is shown as a whole number from 10 %, to one decimal below it.
	await live(page, (l) => l.person('p2', { quality: { inKbps: 30, lostPct: 12.4, jitterMs: 90 } }));
	await volumeFor(page, 'Amina').click();
	await expect(page.locator('[data-live-quality]')).toContainText('Audio: 30 kbit/s · 12 % lost · 90 ms jitter');
	await expect(page.locator('[data-live-quality]')).not.toContainText('You send');
	// It is not in the person's menu any more: that menu holds actions only.
	await page.keyboard.press('Escape');
	await optionsFor(page, 'Amina').click();
	await expect(page.locator('[role=menu] [data-live-quality], [role=menu] [data-live-volume]')).toHaveCount(0);
});

test('@crosswidth @webkit-phone the quality line is absent when nothing was measured, the volume slider stays', async ({ page }) => {
	await open(page);
	await onCall(page, { quality: undefined });
	await volumeFor(page, 'Amina').click();
	await expect(page.locator('[data-live-quality]')).toHaveCount(0);
	await expect(page.locator('[data-live-volume]')).toBeVisible();
});

test('@crosswidth @webkit-phone the volume slider runs 0–200 % in 10 % steps and reports what it sets', async ({ page }) => {
	await open(page);
	await onCall(page);
	await volumeFor(page, 'Amina').click();
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
	// The slider took the arrow keys, and the popover is still open.
	await expect(slider).toBeVisible();
});

test('@crosswidth @webkit-phone the volume follows the model, with a spoken value', async ({ page }) => {
	await open(page);
	await onCall(page, { volume: 1.5 });
	await volumeFor(page, 'Amina').click();
	const slider = page.locator('[data-live-volume] input[type=range]');
	await expect(slider).toHaveValue('150');
	await expect(slider).toHaveAttribute('aria-valuetext', '150 percent');
	await expect(slider).toHaveAccessibleName(/volume/i);
});

test('@crosswidth @webkit-phone High fidelity is a labeled switch that reports its change and explains itself', async ({ page }) => {
	await open(page);
	await onCall(page);
	await yourAudio(page).click();
	const sw = page.locator('[data-live-high-fidelity]');
	await expect(sw).toHaveRole('switch');
	await expect(sw).toHaveAttribute('aria-checked', 'false');
	await expect(sw).toHaveAccessibleName(/High fidelity \(music\)/);
	await expect(page.locator('#live-hifi-note')).toContainText('128 kbit/s');
	await expect(page.locator('#live-hifi-note')).toContainText('Wear headphones');
	await expect(sw).toHaveAttribute('aria-describedby', 'live-hifi-note');
	// A person must SEE the state, in both states: a drawn track and thumb, not a mark that appears only when on.
	await expect(sw).toBeVisible();
	await expect(sw).toHaveAttribute('data-state', 'unchecked');
	expect(await sw.boundingBox()).toMatchObject({ width: 38, height: 22 });
	await sw.click();
	expect((await calls(page)).filter((c) => c[0] === 'setHighFidelity')).toEqual([['setHighFidelity', true]]);
	// The model, not the click, owns the state: it shows on only once the controller says so.
	await live(page, (l) => l.call({ highFidelity: true }));
	await expect(page.locator('[data-live-your-audio]')).toBeVisible(); // the popover stays open: you watch it flip
	await expect(sw).toHaveAttribute('aria-checked', 'true');
	await expect(sw).toHaveAttribute('data-state', 'checked');
	await sw.click();
	expect((await calls(page)).filter((c) => c[0] === 'setHighFidelity').pop()).toEqual(['setHighFidelity', false]);
});

test('@crosswidth @webkit-phone Your audio is on your row before you join, and says what needs a live microphone', async ({ page }) => {
	await open(page);
	await expect(yourAudio(page)).toBeVisible();
	await yourAudio(page).click();
	await expect(page.locator('[data-live-meter-note]')).toHaveText('Join audio to see your microphone move.');
	await expect(page.locator('[data-live-high-fidelity]')).toBeDisabled();
	await expect(page.locator('#live-hifi-note')).toContainText('Join audio first');
	// The level is set ahead of the call and remembered.
	await page.locator('[data-live-mic-level] input[type=range]').focus();
	await page.keyboard.press('ArrowRight');
	expect((await calls(page)).filter((c) => c[0] === 'setMicLevel')).toEqual([['setMicLevel', 1.1]]);
	await page.getByRole('button', { name: 'Join audio', exact: true }).last().click();
	expect((await calls(page)).filter((c) => c[0] === 'toggleMic')).toHaveLength(1);
});

test('@crosswidth @webkit-phone the mic meter follows what you send, and a muted microphone shows nothing', async ({ page }) => {
	await open(page);
	await onCall(page);
	await live(page, (l) => l.level(0.04));
	await yourAudio(page).click();
	const meter = page.locator('[data-live-meter]');
	await expect(meter).toHaveRole('meter');
	await expect(meter).toHaveAccessibleName('Microphone level');
	await expect(page.locator('[data-live-meter-note]')).toHaveText('Say something: the bar should move.');
	await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(20);
	const quiet = Number(await meter.getAttribute('aria-valuenow'));
	await live(page, (l) => l.level(0.4));
	await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBeGreaterThan(quiet);
	await live(page, (l) => l.level(0));
	await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBe(0);
	// Muted: the bar stops reading and says so.
	await live(page, (l) => l.call({ muted: true }));
	await live(page, (l) => l.level(0.4));
	await expect(page.locator('[data-live-meter-note]')).toHaveText('You are muted.');
	await expect.poll(async () => Number(await meter.getAttribute('aria-valuenow'))).toBe(0);
});

test('@crosswidth @webkit-phone mic level runs 0–200 % in 10 % steps, follows the model, and says when it cannot act', async ({ page }) => {
	await open(page);
	await onCall(page);
	await live(page, (l) => l.call({ micLevel: 1.5 }));
	await yourAudio(page).click();
	const slider = page.locator('[data-live-mic-level] input[type=range]');
	await expect(slider).toHaveAttribute('max', '200');
	await expect(slider).toHaveAttribute('step', '10');
	await expect(slider).toHaveValue('150');
	await expect(slider).toHaveAccessibleName(/mic level/i);
	await expect(slider).toHaveAttribute('aria-valuetext', '150 percent');
	await slider.focus();
	await page.keyboard.press('Home');
	await page.keyboard.press('End');
	expect((await calls(page)).filter((c) => c[0] === 'setMicLevel').map((c) => c[1])).toEqual([0, 2]);
	// A browser without Web Audio cannot shape the send: the control is there, disabled, and says why.
	await live(page, (l) => l.call({ canShapeMic: false }));
	await expect(slider).toBeDisabled();
	await expect(page.locator('[data-live-mic-level]')).toContainText("This browser can't change your level.");
});

test('@crosswidth @webkit-phone a stalled send is shown on your row and explained, and a microphone is not offered before you join', async ({ page }) => {
	await open(page);
	// Before you join, with two microphones known (left over from an earlier call): no list, because picking one would JOIN.
	await live(page, (l) => l.call({ devices: [{ id: 'm1', label: 'Built-in microphone' }, { id: 'm2', label: 'USB microphone' }] }));
	await yourAudio(page).click();
	await expect(page.getByRole('radiogroup', { name: 'Microphone' })).toHaveCount(0);
	await expect(page.locator('[data-live-mic-hint]')).toHaveText('Join audio to choose a microphone.');
	await page.keyboard.press('Escape');
	// On the call, the audio context is suspended (a phone call): others hear silence, and you are told.
	await onCall(page);
	await expect(yourAudio(page)).toHaveAttribute('data-stalled', 'false');
	await live(page, (l) => l.call({ stalled: true }));
	const trigger = page.getByRole('button', { name: /Your audio: your microphone has stopped sending/ });
	await expect(trigger).toBeVisible();
	await trigger.click();
	await expect(page.locator('[data-live-stalled]')).toContainText('Your microphone has stopped sending');
	await expect(page.locator('[data-live-stalled]')).toHaveRole('alert');
});

test('@crosswidth @webkit-phone Hearing: one volume for everyone, and a speaker picker only where the browser can pick', async ({ page }) => {
	await open(page);
	await onCall(page);
	await yourAudio(page).click();
	const master = page.locator('[data-live-master] input[type=range]');
	await expect(master).toHaveValue('100');
	await expect(master).toHaveAccessibleName(/everyone/i);
	await master.focus();
	await page.keyboard.press('End');
	await page.keyboard.press('Home');
	expect((await calls(page)).filter((c) => c[0] === 'setMasterVolume').map((c) => c[1])).toEqual([2, 0]);
	// One speaker (or none known yet): no list, and it says why, in both states.
	await expect(page.locator('[data-live-output-note]')).toHaveText('Only one speaker found.');
	await page.keyboard.press('Escape');
	// Before you join: whether the browser CAN pick a speaker does not depend on the call.
	await live(page, (l) => l.set({ call: { inCall: false, muted: false, denied: false, devices: [], device: null, highFidelity: false, micLevel: 1, canShapeMic: false, stalled: false, masterVolume: 1, outputs: [], output: null, canPickOutput: true } }));
	await yourAudio(page).click();
	await expect(page.locator('[data-live-output-note]')).toHaveText('Join audio to list your speakers.');
	await page.keyboard.press('Escape');
	// A browser that cannot pick (Safari): the section is there and says so.
	await live(page, (l) => l.call({ canPickOutput: false }));
	await yourAudio(page).click();
	await expect(page.locator('[data-live-output-note]')).toContainText('no speaker picker');
	await page.keyboard.press('Escape');
	// Two speakers: a radio group, and picking one reports it.
	await onCall(page);
	await live(page, (l) => l.call({ canPickOutput: true, outputs: [{ id: 'default', label: 'Default speaker' }, { id: 'usb-1', label: 'USB speaker' }], output: null }));
	await yourAudio(page).click();
	const group = page.getByRole('radiogroup', { name: 'Speaker' });
	await expect(group.getByRole('radio', { name: 'Default speaker' })).toBeChecked();
	await group.getByRole('radio', { name: 'USB speaker' }).click();
	expect((await calls(page)).filter((c) => c[0] === 'pickOutput')).toEqual([['pickOutput', 'usb-1']]);
});

test('@crosswidth @webkit-phone the microphone list appears only when there is a choice, as a radio group', async ({ page }) => {
	await open(page);
	await onCall(page);
	await yourAudio(page).click();
	await expect(page.getByRole('radiogroup', { name: 'Microphone' })).toHaveCount(0); // one microphone: no picker
	await page.keyboard.press('Escape');
	await live(page, (l) => l.call({ devices: [{ id: 'm1', label: 'Built-in microphone' }, { id: 'm2', label: 'USB microphone' }] }));
	await yourAudio(page).click();
	const group = page.getByRole('radiogroup', { name: 'Microphone' });
	await expect(group.getByRole('radio', { name: 'Built-in microphone' })).toBeChecked();
	await group.getByRole('radio', { name: 'USB microphone' }).click();
	expect((await calls(page)).filter((c) => c[0] === 'pickMic')).toEqual([['pickMic', 'm2']]);
});

test('@a11y @webkit-phone the person menu and the volume popover have no axe findings, in both color modes', async ({ page }) => {
	await open(page);
	await onCall(page);
	for (const mode of ['dark', 'light']) {
		await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
		await optionsFor(page, 'Amina').click();
		expect(await axeFindings(page, { menuOpen: true }), `axe findings in a person's menu (${mode})`).toEqual([]);
		expect(await assertFocusTrapped(page), 'focus escaped the open menu').toEqual([]);
		await closeMenu(page);
		await page.mouse.move(0, 0); // resting state: a hovered row has its own, lower contrast (a recorded follow-up)
		await volumeFor(page, 'Amina').click();
		await expect(page.locator('[data-live-person-audio]')).toBeVisible();
		await page.mouse.move(0, 0); // resting state, as everywhere here
		expect(await axeFindings(page), `axe findings in the volume popover (${mode})`).toEqual([]);
		await page.keyboard.press('Escape');
		await page.mouse.move(0, 0);
	}
});

test('@a11y @webkit-phone the Your audio popover has no axe findings, before and during a call, in both color modes', async ({ page }) => {
	await open(page);
	for (const mode of ['dark', 'light']) {
		await page.evaluate((m) => document.documentElement.setAttribute('data-mode', m), mode);
		for (const inCall of [false, true]) {
			if (inCall) {
				await onCall(page);
				await live(page, (l) => l.call({ devices: [{ id: 'm1', label: 'Built-in microphone' }, { id: 'm2', label: 'USB microphone' }], outputs: [{ id: 'default', label: 'Default speaker' }, { id: 'usb-1', label: 'USB speaker' }] }));
			}
			await yourAudio(page).click();
			await expect(page.locator('[data-live-your-audio]')).toBeVisible();
			await page.mouse.move(0, 0); // resting state, as everywhere here
			expect(await axeFindings(page), `axe findings in Your audio (${mode}, ${inCall ? 'on the call' : 'before joining'})`).toEqual([]);
			await page.keyboard.press('Escape');
		}
		await live(page, (l) => l.set({}));
	}
});
