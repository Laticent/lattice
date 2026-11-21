import { expect, gotoStudio, test, typeDeck } from './studio-fixture';

// PRESENT PLAYS ON A PHONE THAT HAS NEVER PICKED A VOICE.
//
// A touch device cannot run the on-device Kokoro voice, so the Studio never migrates a phone's voice selection to it:
// a phone that has not picked a voice keeps `provider: ''`. Preparing that empty selection asked the key store about
// provider `''`, which throws ("unknown key provider: "; voice-model.js `prepareSelectedVoice`). With the Voice on,
// Present's read-along waits for the voice before it starts its clock (read-aloud.ts), so the clock never started and
// Present sat on its first cue; with it off the clock starts first and the throw escaped uncaught. Both arms check
// both. Desktop Chromium migrates to Kokoro, which is why only a phone showed it.
//
// Only real WebKit at phone size reaches that state, so this runs on `webkit-phone` alone. No voice, no key, no network
// (HARD RULE #24): with nothing chosen Present reads on its estimate clock, and the caption band marks the live cue
// `data-state="now"`, so "it moved" is a cue index past 0, not a wait.
const DECK = `---
marp: true
theme: indaco
---

## Where the quarter turned.

Cost discipline held. Retention rose. Pipeline coverage sits below target. Guidance is unchanged.
`;

for (const voiceOn of [false, true]) {
	test(`Present moves past its first cue with no voice chosen, Voice ${voiceOn ? 'on' : 'off'} @webkit-phone`, async ({ page }) => {
		const thrown: string[] = [];
		page.on('pageerror', (e) => thrown.push(e.message));
		await gotoStudio(page);
		await typeDeck(page, DECK);
		// The premise: nothing is chosen. If a later change migrates phones to some voice, this test no longer covers
		// the empty selection and must say so, rather than pass without exercising it.
		const provider = await page.evaluate(() => JSON.parse(localStorage.getItem('lattice-studio-voice-selection') ?? '{}').provider ?? '');
		expect(provider, 'a phone that never picked a voice has none selected').toBe('');

		await page.getByRole('button', { name: 'Present', exact: true }).click();
		const dialog = page.getByRole('dialog', { name: 'Present' });
		await expect(dialog).toBeVisible();
		// Read each toggle's STATE before clicking: a blind click would flip one that already defaults the way we want.
		const cc = dialog.getByRole('button', { name: 'Captions' });
		if ((await cc.getAttribute('aria-pressed')) !== 'true') await cc.click();
		const voice = dialog.getByRole('button', { name: /^Voice (on|off)/ });
		if ((await voice.getAttribute('aria-pressed')) !== String(voiceOn)) await voice.click();
		await expect(voice).toHaveAttribute('aria-pressed', String(voiceOn));

		await dialog.getByRole('button', { name: 'Play the presentation' }).click();
		const liveCue = () => page.evaluate(() => Number(document.querySelector('[data-cue][data-state="now"]')?.getAttribute('data-cue') ?? -1));
		await expect.poll(liveCue, { message: 'the caption band never left its first cue', timeout: 30_000 }).toBeGreaterThan(0);
		expect(thrown.filter((m) => /key provider/.test(m)), 'preparing no voice threw').toEqual([]);
	});
}
