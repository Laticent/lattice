import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// The Studio's in-memory narration cache is bounded by BYTES as well as by count (voice-model.js `cacheSet`,
// AUDIO_CACHE_MAX_BYTES). The unit test drives it in jsdom with fake `size` values; this drives it in a real engine with
// real Blobs: voice-model.js, bundled as it ships, answers OpenRouter's Gemini voice with real 24 kHz PCM (each answer
// 1.5 MB, about 31 s), wraps it as the WAV Blob the page keeps, and is asked for 24 different sentences, 36 MB in all.
// The device store is switched off, so what the page holds is the memory cache alone. No key is read or spent: the
// network is a stub inside the page (HARD RULE #24).

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', 'src');

let server: Server;
let baseURL = '';
let outDir = '';

test.beforeAll(async () => {
	const esbuild = await import('esbuild');
	outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-budget-'));
	const tryExt = (b: string) => {
		for (const c of [b, `${b}.ts`, `${b}.js`, `${b}.mjs`, path.join(b, 'index.ts'), path.join(b, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
		return null;
	};
	await esbuild.build({
		stdin: {
			contents: "import { AUDIO_CACHE_MAX_BYTES, createVoiceModel } from './playground/voice-model.js';\nwindow.__budget = { AUDIO_CACHE_MAX_BYTES, createVoiceModel };\n",
			resolveDir: SRC,
			loader: 'js',
		},
		bundle: true,
		format: 'esm',
		outfile: path.join(outDir, 'bundle.js'),
		define: { 'process.env.NODE_ENV': '"production"' },
		tsconfigRaw: '{}',
		logLevel: 'error',
		plugins: [
			{
				name: 'budget-alias',
				setup(b) {
					b.onResolve({ filter: /^@\// }, (a) => {
						const r = tryExt(path.join(SRC, a.path.replace(/^@\//, '')));
						return r ? { path: r } : null;
					});
				},
			},
		],
	});
	fs.writeFileSync(path.join(outDir, 'index.html'), '<!doctype html><meta charset="utf-8"><title>voice cache budget</title><script type="module" src="/bundle.js"></script>');
	server = createServer((req, res) => {
		const p = (req.url || '/').split('?')[0];
		const file = p === '/bundle.js' ? 'bundle.js' : 'index.html';
		res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : 'text/html' });
		res.end(fs.readFileSync(path.join(outDir, file)));
	});
	await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
	const addr = server.address();
	baseURL = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});

test.afterAll(async () => {
	await new Promise<void>((r) => server?.close(() => r()));
	if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

// Registered twice, as model-spine.spec.ts does: the first title runs on Chromium (desktop, phone width) and Firefox,
// the second on WebKit's iPad and iPhone, the engine the cap was written for.
for (const tags of ['@crosswidth @gecko', '@webkit-tablet @webkit-phone'])
	test(`${tags} the narration cache holds at most its byte budget of real PCM Blobs, dropping the oldest first`, async ({ page }) => {
		await page.goto(`${baseURL}/`);
		await page.waitForFunction(() => 'createVoiceModel' in ((window as unknown as { __budget?: object }).__budget ?? {}));
		const r = await page.evaluate(async () => {
			const { AUDIO_CACHE_MAX_BYTES, createVoiceModel } = (window as unknown as { __budget: { AUDIO_CACHE_MAX_BYTES: number; createVoiceModel: (o: object) => Record<string, (...a: unknown[]) => Promise<unknown>> } }).__budget;
			localStorage.setItem('lattice-present-narration-cache', '0'); // the device store off: only the memory cache holds clips
			localStorage.setItem('lattice-budget-voice-rung', 'openrouter');
			localStorage.setItem('lattice-budget-voice-or-model', 'google/gemini-3.1-flash-tts-preview'); // answers raw PCM
			const PCM_BYTES = 1_500_000; // about 31 s of 24 kHz 16-bit mono
			const asked: string[] = [];
			const fetchImpl = async (_url: string, init: { body: string }) => {
				asked.push(String(JSON.parse(init.body).input));
				const pcm = new Uint8Array(PCM_BYTES);
				for (let i = 0; i < pcm.length; i += 2) pcm[i + 1] = (i / 2) % 64; // a quiet ramp, so the bytes are not all zero
				return new Response(pcm, { status: 200, headers: { 'content-type': 'audio/pcm;rate=24000;channels=1' } });
			};
			const vm = createVoiceModel({ getOpenRouterKey: () => 'sk-or-v1-e2e-budget-0000', fetchImpl, keyPrefix: 'budget' });
			const texts = Array.from({ length: 24 }, (_, i) => `Sentence ${i} of the budget deck is read aloud here.`);
			for (const text of texts) await vm.synthOne({ text });
			const held: { i: number; size: number; blob: boolean }[] = [];
			for (let i = 0; i < texts.length; i++) {
				const c = (await vm.peekClip(texts[i])) as Blob | null;
				if (c) held.push({ i, size: c.size, blob: c instanceof Blob });
			}
			const askedBefore = asked.length;
			await vm.synthOne({ text: texts[0] }); // the oldest, dropped: asked for again
			const askedForOldest = asked.length - askedBefore;
			const askedBeforeNewest = asked.length;
			await vm.synthOne({ text: texts[texts.length - 1] }); // the newest, held: answered from memory
			return { budget: AUDIO_CACHE_MAX_BYTES, held, heldBytes: held.reduce((n, h) => n + h.size, 0), askedForOldest, askedForNewest: asked.length - askedBeforeNewest, synthesized: askedBefore };
		});
		expect(r.synthesized, 'every sentence was synthesized once').toBe(24);
		expect(r.held.length, 'some clips were dropped, and some kept').toBeGreaterThan(0);
		expect(r.held.length).toBeLessThan(24);
		expect(r.held.every((h) => h.blob), 'each kept clip is a real Blob, not an ArrayBuffer the page holds').toBe(true);
		expect(r.heldBytes, `held ${r.heldBytes} bytes against a budget of ${r.budget}`).toBeLessThanOrEqual(r.budget);
		// Oldest first: the clips kept are the newest ones, in one unbroken run up to the last sentence asked for.
		const kept = r.held.map((h) => h.i);
		expect(kept.at(-1)).toBe(23);
		expect(kept).toEqual(Array.from({ length: kept.length }, (_, k) => 24 - kept.length + k));
		expect(r.askedForOldest, 'the dropped oldest clip is synthesized again').toBe(1);
		expect(r.askedForNewest, 'the kept newest clip comes from memory').toBe(0);
	});
