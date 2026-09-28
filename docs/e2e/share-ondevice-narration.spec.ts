// The FREE, KEYLESS path to a narrated webpage export: no OpenRouter key, only the on-device
// (Kokoro) voice. #2423's follow-up recorded it as unreachable (record: engineering/decisions/
// 2026-08-04-shared-deck-narration-audio.md §10); driving the real panel with a real Kokoro load found why. The panel read voice
// availability ONCE, at mount, and the Workspace does not cancel a Kokoro download when it
// closes — so an author who opened Share while the ~80 MB load ran got an audio switch that
// stayed disabled after the voice was ready, and an export with no sound in it.
//
// WHAT IS STUBBED, AND WHY ONLY THAT. The model module (`https://esm.run/kokoro-js`) is
// replaced by a tiny ESM file whose `generate()` returns a short tone, because CI cannot fetch
// 80 MB of weights on every PR. Everything the defect lives in stays real: the same-origin
// Kokoro worker, the rung's `ready()` and its `db-voice-changed` event, the Workspace, the
// export panel, the bake (which encodes the clips to mp3) and the exported player file. The
// load is HELD until the test releases it, so the panel is provably open before the voice is
// ready — the order the old mount-time read could not survive.
import * as fs from 'node:fs';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

test.setTimeout(180_000);

const DECK = `---
theme: indaco
---

# Probe

Cost discipline held. Pipeline coverage sits below target.

---

## The close

Guidance is unchanged for now.
`;

// A stand-in for kokoro-js with the one surface the worker calls. `from_pretrained` waits for
// a BroadcastChannel message from the page, so the test decides when the "download" finishes.
const FAKE_KOKORO = `
export class KokoroTTS {
  static from_pretrained() {
    return new Promise((resolve) => {
      const ch = new BroadcastChannel('fake-kokoro');
      ch.onmessage = () => { ch.close(); resolve(new KokoroTTS()); };
    });
  }
  async generate() {
    const rate = 24000, n = Math.floor(rate * 0.3), audio = new Float32Array(n);
    for (let i = 0; i < n; i++) audio[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / rate);
    return { audio, sampling_rate: rate };
  }
}
export default { KokoroTTS };
`;

test('with only the on-device voice, loaded while the panel is open, the export ships with audio', async ({ page, context }) => {
	// WASM path, deterministically: the rung picks WebGPU when `navigator.gpu` exists.
	await context.addInitScript(() => {
		try {
			delete (Object.getPrototypeOf(navigator) as { gpu?: unknown }).gpu;
		} catch {
			/* not present — nothing to remove */
		}
	});
	await context.route('https://esm.run/kokoro-js', (route) =>
		route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE_KOKORO }),
	);
	const workers: string[] = [];
	page.on('worker', (w) => workers.push(w.url()));
	await gotoStudio(page);
	// UNDO THE FIXTURE'S WORKER BLOCK, so the worker path this spec claims to cover is the one
	// that runs. `gotoStudio` makes constructing the Kokoro worker throw (so no spec pulls the real
	// model), and the rung then falls back to loading on the MAIN THREAD — which would still pass
	// here, silently testing a different path. The block is a subclass, so its prototype is the
	// native Worker. Nothing has built the worker yet: the rung constructs it on "Download".
	await page.evaluate(() => {
		window.Worker = Object.getPrototypeOf(window.Worker);
	});
	await setEditorContent(page, DECK);

	// Start the on-device load, then leave the Workspace while it runs.
	await page.getByRole('button', { name: 'Workspace settings', exact: true }).first().click();
	const ws = page.getByRole('dialog').last();
	await ws.getByRole('tab', { name: 'On-device' }).click();
	await ws.getByRole('button', { name: /Get ~80MB|^Load$/ }).click();
	await ws.getByRole('button', { name: 'Download', exact: true }).click();
	await page.keyboard.press('Escape');

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	const audio = page.getByRole('switch', { name: 'Include narration audio' });
	// No key and no voice yet: nothing can speak, and the panel says so. The COPY, not just the
	// disabled switch — the switch is also disabled while the availability read is in flight, so
	// only this line proves the panel had settled on "no voice" before the load finishes.
	await expect(page.getByText(/Connect a cloud voice in the Workspace, or summon the on-device voice/)).toBeVisible();
	await expect(audio).toBeDisabled();

	// The voice finishes loading with the panel still open.
	await page.evaluate(() => new BroadcastChannel('fake-kokoro').postMessage('go'));
	expect(workers.some((u) => /kokoro-worker/.test(u)), 'the voice loaded in the same-origin worker, not the main-thread fallback').toBe(true);
	await expect(audio, 'the panel noticed the voice arrive').toBeEnabled();
	await audio.click();

	const sheet = page.getByRole('dialog').last();
	await expect(sheet.getByText(/Narrated by the on-device voice you rehearse with/)).toBeVisible();
	await expect(sheet.getByText(/free, on this device/)).toBeVisible();
	await expect(sheet.getByText(/Connect OpenRouter/)).toHaveCount(0);
	await expect(sheet.getByText(/bills the whole deck/)).toHaveCount(0);

	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByRole('button', { name: /Download webpage/ }).click()]);
	const file = test.info().outputPath('narrated.html');
	await dl.saveAs(file);
	const html = fs.readFileSync(file, 'utf8');
	expect(html, 'the file carries audio blocks').toContain('application/lattice+audio');
	// One clip per sentence the deck speaks (3 sentences across the two slides).
	expect((html.match(/data:audio\/mpeg;base64,/g) ?? []).length).toBeGreaterThanOrEqual(3);
});

// The other direction: availability DROPPING under a switch that is on. With a (mock) cloud key the
// author turns audio on; the key then disconnects. The panel re-reads availability on
// `db-model-changed` (what `disconnectOpenRouter` emits), finds nothing that can speak, and must
// still let the author turn audio OFF — it used to disable the switch in its checked state.
// The Workspace's Disconnect button cannot be pressed while the Share sheet is open, so the test
// does what that button does: clear the key and emit the event. Every OpenRouter request is
// refused, so nothing can spend (HARD RULE #24); the key is the repo's standard mock string.
test('a switch that is on can still be turned off after the cloud key disconnects', async ({ page, context }) => {
	await context.route(/openrouter\.ai/, (route) => route.abort());
	await context.addInitScript(() => {
		try {
			localStorage.setItem('lattice-db-or-key', 'sk-e2e-mock-not-a-real-key');
		} catch {
			/* storage unavailable — the test then fails on the enabled check below */
		}
	});
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: /Webpage/ }).click();
	const audio = page.getByRole('switch', { name: 'Include narration audio' });
	await expect(audio).toBeEnabled();
	await audio.click();
	await expect(audio).toBeChecked();

	await page.evaluate(() => {
		localStorage.removeItem('lattice-db-or-key');
		window.dispatchEvent(new Event('db-model-changed'));
	});
	await expect(page.getByText(/Connect a cloud voice in the Workspace, or summon the on-device voice/)).toBeVisible();
	await expect(audio, 'on, and still operable').toBeEnabled();
	await audio.click();
	await expect(audio).not.toBeChecked();
	await expect(audio, 'off, and now nothing can turn it back on').toBeDisabled();
});
