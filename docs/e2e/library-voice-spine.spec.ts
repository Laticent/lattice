// /cadenza and /suono on the voice spine (followups 3079-p3-library-pages-on-the-voice-spine): both
// library pages speak in the author's STORED voice selection (the Studio's), never a ladder of whatever
// was ready, and never write it. Every provider is mocked; nothing reaches the network.
import type { Page } from '@playwright/test';
import { expect, test } from './studio-fixture';

// Fake credentials: named FAKE, not KEY, so no reader (or scanner) mistakes them for secrets.
const OR_FAKE = 'sk-or-v1-e2e-library-voice-0b0b';
const GEM = 'AIzaE2eLibraryVoiceFake000c3d4';
const SEL = (o: object) => JSON.stringify({ v: 1, last: {}, ...o });

/** A 0.2 s silent 16-bit mono WAV at 24 kHz: real audio bytes for the players to decode. */
function wav(): Buffer {
	const samples = 4800;
	const b = Buffer.alloc(44 + samples * 2);
	b.write('RIFF', 0);
	b.writeUInt32LE(36 + samples * 2, 4);
	b.write('WAVEfmt ', 8);
	b.writeUInt32LE(16, 16);
	b.writeUInt16LE(1, 20);
	b.writeUInt16LE(1, 22);
	b.writeUInt32LE(24000, 24);
	b.writeUInt32LE(48000, 28);
	b.writeUInt16LE(2, 32);
	b.writeUInt16LE(16, 34);
	b.write('data', 36);
	b.writeUInt32LE(samples * 2, 40);
	return b;
}

async function seed(page: Page, entries: Record<string, string>) {
	await page.addInitScript((e) => {
		if (sessionStorage.getItem('lib-voice-seeded')) return;
		for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v);
		sessionStorage.setItem('lib-voice-seeded', '1');
	}, entries);
}

/** Answer OpenRouter and Gemini; record who was asked to speak, and with what. */
async function mockProviders(page: Page) {
	const spoke = { openrouter: [] as { model: string; voice: string }[], gemini: [] as string[] };
	await page.route('https://openrouter.ai/**', async (route) => {
		const url = route.request().url();
		if (url.includes('/audio/speech')) {
			const body = JSON.parse(route.request().postData() || '{}');
			spoke.openrouter.push({ model: body.model, voice: body.voice });
			return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav() });
		}
		if (url.includes('/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ id: 'hexgrad/kokoro-82m', name: 'Kokoro', pricing: { prompt: '0.0000006', completion: '0' }, architecture: { output_modalities: ['speech'] }, supported_voices: ['af_heart', 'af_bella'] }] }) });
		return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":{}}' });
	});
	await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
		const req = route.request();
		if (req.method() === 'OPTIONS') return route.fulfill({ status: 204 });
		const url = req.url().split('?')[0];
		if (url.endsWith(':generateContent')) {
			spoke.gemini.push(url);
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/wav', data: wav().toString('base64') } }] } }] }) });
		}
		if (url.endsWith('/v1beta/models')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ models: [{ name: 'models/gemini-3.8-flash-lite-tts' }] }) });
		if (url.endsWith('/v1beta/voices')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ voices: [{ id: 'kore', display_name: 'Kore' }] }) });
		return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
	});
	return spoke;
}

const stored = (page: Page) => page.evaluate(() => localStorage.getItem('lattice-studio-voice-selection'));

test.describe('@crosswidth @webkit-phone @webkit-tablet @gecko library pages read the stored voice selection', () => {
	test('/cadenza speaks in a stored Gemini voice, not the OpenRouter voice its key could reach', async ({ page }) => {
		const sel = SEL({ source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', voice: 'kore' });
		await seed(page, { 'lattice-db-or-key': OR_FAKE, 'lattice-db-gemini-key': GEM, 'lattice-studio-voice-selection': sel });
		const spoke = await mockProviders(page);
		await page.goto('/libraries/cadenza/');
		await expect(page.locator('#voiceLabel')).toHaveText('Gemini voice', { timeout: 30_000 });
		// The page's Kokoro picker does not apply to a Gemini voice.
		await expect(page.locator('#voiceSel')).toBeDisabled();
		await page.locator('#play').click();
		await expect.poll(() => spoke.gemini.length, { timeout: 30_000 }).toBeGreaterThan(0);
		expect(spoke.openrouter).toEqual([]);
		expect(await stored(page)).toBe(sel);
		await page.screenshot({ path: test.info().outputPath('cadenza-gemini.png') });
	});

	test('/cadenza speaks a stored OpenRouter voice, and its picker changes the voice for the page only', async ({ page }) => {
		const sel = SEL({ source: 'cloud', provider: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_bella' });
		await seed(page, { 'lattice-db-or-key': OR_FAKE, 'lattice-studio-voice-selection': sel });
		const spoke = await mockProviders(page);
		await page.goto('/libraries/cadenza/');
		await expect(page.locator('#voiceLabel')).toHaveText('cloud voice', { timeout: 30_000 });
		await expect(page.locator('#voiceSel')).toBeEnabled();
		await page.locator('#voiceSel').selectOption('bm_george');
		await page.locator('#play').click();
		await expect.poll(() => spoke.openrouter.length, { timeout: 30_000 }).toBeGreaterThan(0);
		expect(spoke.openrouter[0]).toEqual({ model: 'hexgrad/kokoro-82m', voice: 'bm_george' });
		// The Studio's selection is untouched by the page's picker.
		expect(await stored(page)).toBe(sel);
	});

	test('/cadenza with no voice chosen and no key says it uses the browser voice, and asks no provider', async ({ page }) => {
		const spoke = await mockProviders(page);
		await page.goto('/libraries/cadenza/');
		// Exactly the browser voice: a fresh desktop must NOT get a Kokoro selection written for it (the
		// one-time migration a Studio read runs), which would make the page silent (checker, PR #3105).
		await expect(page.locator('#voiceLabel')).toHaveText('browser voice', { timeout: 30_000 });
		await page.locator('#play').click();
		await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
		expect(spoke.openrouter).toEqual([]);
		expect(spoke.gemini).toEqual([]);
		expect(await stored(page)).toBeNull();
	});

	test('/cadenza with a stored on-device Kokoro voice downloads nothing until Play, and says so', async ({ page }) => {
		const sel = SEL({ source: 'device', provider: 'kokoro', model: '', voice: 'af_bella' });
		await seed(page, { 'lattice-studio-voice-selection': sel });
		await mockProviders(page);
		const kokoro: string[] = [];
		page.on('request', (r) => {
			if (/kokoro|huggingface|onnx/i.test(r.url()) && !r.url().includes('/libraries/')) kokoro.push(r.url());
		});
		await page.goto('/libraries/cadenza/');
		await expect(page.locator('#voiceLabel')).toHaveText('silent · on-device voice loads on Play', { timeout: 30_000 });
		await page.waitForLoadState('networkidle');
		expect(kokoro).toEqual([]);
		expect(await stored(page)).toBe(sel);
	});

	test('/cadenza with a stored Gemini voice and no Gemini key says which key it needs, and speaks nothing else', async ({ page }) => {
		const sel = SEL({ source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', voice: 'kore' });
		await seed(page, { 'lattice-db-or-key': OR_FAKE, 'lattice-studio-voice-selection': sel });
		const spoke = await mockProviders(page);
		await page.goto('/libraries/cadenza/');
		await expect(page.locator('#voiceLabel')).toHaveText('silent · needs a Gemini key', { timeout: 30_000 });
		await page.locator('#play').click();
		await expect(page.locator('#play')).toHaveAttribute('aria-label', 'Pause');
		expect(spoke.openrouter).toEqual([]);
		expect(spoke.gemini).toEqual([]);
	});

	test('/suono speaks a stored Gemini voice on a Gemini key alone, with no OpenRouter key', async ({ page }) => {
		const sel = SEL({ source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', voice: 'kore' });
		await seed(page, { 'lattice-db-gemini-key': GEM, 'lattice-studio-voice-selection': sel });
		const spoke = await mockProviders(page);
		await page.goto('/libraries/suono/');
		await expect(page.locator('#keyDotLabel')).toHaveText('voice ready', { timeout: 30_000 });
		await page.locator('#playBtn').click();
		await expect.poll(() => spoke.gemini.length, { timeout: 30_000 }).toBeGreaterThan(0);
		expect(spoke.openrouter).toEqual([]);
	});

	test('/suono speaks in a stored Gemini voice when its voice mode is on', async ({ page }) => {
		const sel = SEL({ source: 'cloud', provider: 'gemini', model: 'gemini-3.8-flash-lite-tts', voice: 'kore' });
		await seed(page, { 'lattice-db-or-key': OR_FAKE, 'lattice-db-gemini-key': GEM, 'lattice-studio-voice-selection': sel });
		const spoke = await mockProviders(page);
		await page.goto('/libraries/suono/');
		// Voice mode turns on once the stored voice's key opens.
		await expect(page.locator('#keyDotLabel')).not.toHaveText('no key', { timeout: 30_000 });
		await page.locator('#playBtn').click();
		await expect.poll(() => spoke.gemini.length, { timeout: 30_000 }).toBeGreaterThan(0);
		expect(spoke.openrouter).toEqual([]);
		expect(await stored(page)).toBe(sel);
		await page.screenshot({ path: test.info().outputPath('suono-gemini.png') });
	});
});
