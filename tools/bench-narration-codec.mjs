#!/usr/bin/env node
/**
 * Bench the cost of keeping narration as Ogg Opus: how long encoding takes per clip, how a worker pool scales it,
 * and whether it stalls the page.
 *
 * The narration codec bake-off (engineering/decisions/2026-11-17-narration-codec-bakeoff.md) chose Ogg Opus, and the
 * Studio now encodes each raw-audio narration clip in workers (docs/src/playground/opus-encode-pool.js). This
 * reproduces the timing numbers behind that choice. It was a scratch script during the bake-off.
 *
 *   node tools/bench-narration-codec.mjs                       # Chromium, WebKit, Firefox
 *   node tools/bench-narration-codec.mjs --engines chromium    # one engine
 *   node tools/bench-narration-codec.mjs --kbps 32 --clips 48  # another bitrate or clip count
 *   node tools/bench-narration-codec.mjs --wav a.wav --mp3 a.mp3
 *
 * WHAT IT RUNS. Suono's real `encodeOpus` (docs/src/lib/suono/opus.ts), bundled by esbuild into each worker, on two
 * chains:
 *   WAV -> Opus  the worker parses the WAV (`samplesFromWav`) and encodes it. The page only posts the bytes.
 *   MP3 -> Opus  the page decodes the MP3 (`decodeAudioData`) and hands the samples to a worker to encode. Workers
 *                have no AudioContext, so this decode cannot move off the page.
 * Each chain runs through pools of 1, 2 and 4 workers. The inputs default to the iOS codec probe's speech fixtures
 * (docs/scripts/ios-safari/codec-fixtures), the same speech as WAV and as MP3.
 *
 * WHAT IT REPORTS, per engine and pool size: milliseconds of encode per clip, throughput as a multiple of real time
 * (seconds of speech encoded per second of wall clock), and the longest gap between animation frames while the pool
 * runs. Compare that gap with the idle gap printed on the engine's first line: when the two match, the encode did not
 * stall the page.
 *
 * No CPU-slowdown arm: Chromium's DevTools throttling slows the page but not its workers (measured: 13 ms/clip at
 * 1x and at 4x), so it would report a phone the encode never ran on. The iOS Simulator arm of the codec probe
 * (the `ios-safari-codec-support` platform suite) is the slow-device number.
 *
 * It is a measurement, not a test: nothing here passes or fails (HARD RULE #32). WebKit and Firefox come from
 * Playwright and install themselves when docs' e2e suite runs; Chromium is preinstalled in the cloud sandbox.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = path.join(ROOT, 'docs');
const FIXTURES = path.join(DOCS, 'scripts/ios-safari/codec-fixtures');
// esbuild and Playwright are docs' dependencies, so resolve them from there.
const requireFromDocs = createRequire(path.join(DOCS, 'package.json'));
const { buildSync } = requireFromDocs('esbuild');
const { chromium, firefox, webkit } = requireFromDocs('@playwright/test');

function arg(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const wavPath = arg('wav', path.join(FIXTURES, 'speech.wav'));
const mp3Path = arg('mp3', path.join(FIXTURES, 'mp3-lame-tagged.mp3'));
const kbps = Number(arg('kbps', '64')); // the workspace's default narration bitrate
const CLIPS = Number(arg('clips', '24'));
const engines = arg('engines', 'chromium,webkit,firefox').split(',');

/** Seconds of audio in a PCM WAV, from its header: data bytes / (rate * channels * bytes per sample). */
function wavSeconds(buf) {
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	let rate = 0;
	let channels = 1;
	let bits = 16;
	for (let at = 12; at + 8 <= buf.length; ) {
		const id = buf.toString('ascii', at, at + 4);
		const size = view.getUint32(at + 4, true);
		if (id === 'fmt ') {
			channels = view.getUint16(at + 10, true);
			rate = view.getUint32(at + 12, true);
			bits = view.getUint16(at + 22, true);
		} else if (id === 'data') {
			return size / (rate * channels * (bits / 8));
		}
		at += 8 + size + (size % 2);
	}
	throw new Error(`${wavPath}: no data chunk`);
}

const wavBuf = fs.readFileSync(wavPath);
const clipSecs = wavSeconds(wavBuf);
const bundle = buildSync({ entryPoints: [path.join(DOCS, 'src/lib/suono/opus.ts')], bundle: true, format: 'iife', globalName: 'SuonoOpus', write: false }).outputFiles[0].text;
const workerSrc = `${bundle}
self.onmessage = async (e) => {
	const { id, wav, pcm, sampleRate, bitrate } = e.data;
	const t0 = performance.now();
	let samples = pcm, rate = sampleRate;
	if (wav) { const r = SuonoOpus.samplesFromWav(wav); samples = r.samples; rate = r.sampleRate; }
	const out = await SuonoOpus.encodeOpus(samples, rate, { bitrate });
	self.postMessage({ id, ms: performance.now() - t0, bytes: out ? out.length : 0 }, out ? [out.buffer] : []);
};`;
const wav = wavBuf.toString('base64');
const mp3 = fs.readFileSync(mp3Path).toString('base64');

async function run(name, engine) {
	const browser = await engine.launch();
	const page = await browser.newPage();
	// A real https origin: WebCodecs needs a secure context, and about:blank cannot start a blob: worker everywhere.
	await page.route('https://bench.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>bench</title>' }));
	await page.goto('https://bench.test/');
	const r = await page.evaluate(
		async ({ workerSrc, wav, mp3, CLIPS, clipSecs, bitrate }) => {
			const bytes = (b64) => {
				const s = atob(b64);
				const u = new Uint8Array(s.length);
				for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
				return u.buffer;
			};
			const url = URL.createObjectURL(new Blob([workerSrc], { type: 'text/javascript' }));
			// The longest gap between animation frames while `fn` runs: what a viewer would see as a stall.
			const watch = async (fn) => {
				let worst = 0;
				let last = performance.now();
				let on = true;
				const tick = (t) => {
					worst = Math.max(worst, t - last);
					last = t;
					if (on) requestAnimationFrame(tick);
				};
				requestAnimationFrame(tick);
				const out = await fn();
				on = false;
				return { ...out, worstFrameGapMs: Math.round(worst) };
			};
			const idle = await watch(() => new Promise((r) => setTimeout(() => r({}), 1500)));
			const pool = (n) => {
				const ws = Array.from({ length: n }, () => new Worker(url));
				return {
					run: (jobs) =>
						new Promise((resolve) => {
							const per = [];
							let next = 0;
							let done = 0;
							const give = (w) => {
								if (next >= jobs.length) return;
								const id = next++;
								const j = jobs[id]();
								w.postMessage({ id, ...j.msg }, j.transfer);
							};
							for (const w of ws) {
								w.onmessage = (e) => {
									per.push(e.data);
									done++;
									if (done === jobs.length) resolve(per);
									else give(w);
								};
								give(w);
							}
						}),
					close: () => {
						for (const w of ws) w.terminate();
					},
				};
			};
			const wavJob = () => {
				const w = bytes(wav);
				return { msg: { wav: w, bitrate }, transfer: [w] };
			};
			const mean = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
			const results = {};
			for (const n of [1, 2, 4]) {
				const p = pool(n);
				// Warm each worker once (script parse, the encoder's delay measurement), so the numbers are steady state.
				await p.run(Array.from({ length: n }, () => wavJob));
				const wavRun = await watch(async () => {
					const t0 = performance.now();
					const per = await p.run(Array.from({ length: CLIPS }, () => wavJob));
					const wall = performance.now() - t0;
					if (per.some((x) => !x.bytes)) return { noEncoder: true };
					return { perClipMs: mean(per.map((x) => x.ms)), oggBytes: mean(per.map((x) => x.bytes)), xRealtime: Math.round((CLIPS * clipSecs * 1000) / wall) };
				});
				const ctx = new OfflineAudioContext(1, 1, 48000);
				const decodeTimes = [];
				const mp3Run = await watch(async () => {
					const t0 = performance.now();
					const pcms = [];
					for (let i = 0; i < CLIPS; i++) {
						const d0 = performance.now();
						const buf = await ctx.decodeAudioData(bytes(mp3));
						decodeTimes.push(performance.now() - d0);
						pcms.push(buf.getChannelData(0).slice());
					}
					const per = await p.run(pcms.map((pcm) => () => ({ msg: { pcm, sampleRate: 48000, bitrate }, transfer: [pcm.buffer] })));
					const wall = performance.now() - t0;
					return { perClipEncodeMs: mean(per.map((x) => x.ms)), perClipDecodeMs: mean(decodeTimes), xRealtime: Math.round((CLIPS * clipSecs * 1000) / wall) };
				});
				p.close();
				results[`pool ${n}`] = { wav: wavRun, mp3: mp3Run };
			}
			return { idleWorstFrameGapMs: idle.worstFrameGapMs, cores: navigator.hardwareConcurrency, results };
		},
		{ workerSrc, wav, mp3, CLIPS, clipSecs, bitrate: kbps * 1000 },
	);
	await browser.close();
	console.log(`== ${name} · ${r.cores} cores · idle worst frame gap ${r.idleWorstFrameGapMs} ms`);
	for (const [k, v] of Object.entries(r.results)) {
		if (v.wav.noEncoder) {
			console.log(`  ${k}: no Opus encoder in a worker on this engine`);
			continue;
		}
		console.log(
			`  ${k}: WAV->Opus ${v.wav.perClipMs} ms/clip, ${v.wav.xRealtime}x realtime, ${v.wav.oggBytes} B/clip, worst frame gap ${v.wav.worstFrameGapMs} ms` +
				` | MP3->Opus decode ${v.mp3.perClipDecodeMs} + encode ${v.mp3.perClipEncodeMs} ms/clip, ${v.mp3.xRealtime}x realtime, worst frame gap ${v.mp3.worstFrameGapMs} ms`,
		);
	}
}

console.log(`${CLIPS} clips of ${clipSecs.toFixed(2)} s (${path.relative(ROOT, wavPath)}, ${path.relative(ROOT, mp3Path)}) at ${kbps} kbps`);
const ENGINES = { chromium, webkit, firefox };
for (const e of engines) {
	if (!ENGINES[e]) throw new Error(`unknown engine ${e}; use ${Object.keys(ENGINES).join(', ')}`);
	await run(e, ENGINES[e]);
}
