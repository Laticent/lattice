// Read-aloud transport-edge regression test (NIGHTLY — real WebAudio, so it can't run per-PR/jsdom).
//
// WHY a bespoke harness and not the real Present UI: these edges exercise the read-aloud HOOK's
// transport STATE MACHINE (pause/resume, barge-in, mute→estimate, slide-nav teardown, synth-failed→
// silent), driving a real Suono stage + sequence over a real AudioContext. The Present UI mutes voice
// by default and gates the clocked path behind an OpenRouter connection — unmute+mock-TTS+deep
// caption selectors would be heavy and flaky and wouldn't test anything more of the hook. So we mount
// the REAL `useReadAloud` hook (bundled with esbuild) with only the byte SOURCE stubbed (a real 220ms
// WAV via `voice-stub.mjs`), and drive it with real <button> clicks (trusted gestures that unlock the
// AudioContext). Everything under test — the hook's RAF/mode logic, Suono's scheduler + decode + play
// + the latency-compensated clock — is production code. Fixtures: docs/e2e/read-aloud-harness/.

import fs from 'node:fs';
import { createServer, type Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(HERE, 'read-aloud-harness');
const REPO = path.resolve(HERE, '..', '..');
const SRC = path.join(REPO, 'docs', 'src');

let server: Server;
let baseURL = '';
let outDir = '';

// Trusted gestures aside, resume the context without a user-gesture gate so estimate/silent paths
// (mute, synth-failed) tick freely in headless CI.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

// The hook's transport state machine is viewport-independent — run it once (desktop), not ×3.
// biome-ignore lint/correctness/noEmptyPattern: Playwright's beforeEach requires the fixtures object as the first param; we need none, only testInfo.
test.beforeEach(({}, testInfo) => {
	test.skip(testInfo.project.name !== 'desktop', 'read-aloud hook test is viewport-independent');
});

test.beforeAll(async () => {
	// Bundle the REAL hook + real Suono, aliasing only the byte source to the stub. Built at test time
	// (never committed — HARD RULE #2) so it can't go stale against read-aloud.ts / Suono.
	const esbuild = await import('esbuild');
	outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-harness-'));
	const tryExt = (b: string) => {
		for (const c of [b, `${b}.ts`, `${b}.tsx`, `${b}.js`, `${b}.mjs`, path.join(b, 'index.ts'), path.join(b, 'index.tsx'), path.join(b, 'index.js')])
			if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
		return null;
	};
	await esbuild.build({
		entryPoints: [path.join(HARNESS, 'harness.tsx')],
		bundle: true, format: 'esm', outfile: path.join(outDir, 'bundle.js'),
		jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, tsconfigRaw: '{}', logLevel: 'error',
		plugins: [{
			name: 'ra-alias', setup(b) {
				// Pin React to docs/node_modules (one copy — else hooks throw "null useRef").
				b.onResolve({ filter: /^(react|react-dom)(\/.*)?$/ }, (a) => {
					const r = tryExt(path.join(REPO, 'docs', 'node_modules', a.path)) || tryExt(path.join(REPO, 'docs', 'node_modules', a.path, 'index'));
					return r ? { path: r } : null;
				});
				b.onResolve({ filter: /^@\// }, (a) => {
					if (a.path === '@/playground/voice-model.js') return { path: path.join(HARNESS, 'voice-stub.mjs') };
					const r = tryExt(path.join(SRC, a.path.replace(/^@\//, '')));
					return r ? { path: r } : null;
				});
			},
		}],
	});
	fs.copyFileSync(path.join(HARNESS, 'index.html'), path.join(outDir, 'index.html'));
	// The harness is exactly two static files (the single esbuild bundle + its host page). Map the
	// request URL through a fixed ALLOWLIST rather than joining it into a path — a request URL is
	// attacker-controlled in the general case, so letting it reach the filesystem is a path-traversal
	// sink (CodeQL js/path-injection). An allowlist means no user data ever becomes a path.
	const FILES: Record<string, { name: string; type: string }> = {
		'/': { name: 'index.html', type: 'text/html' },
		'/index.html': { name: 'index.html', type: 'text/html' },
		'/bundle.js': { name: 'bundle.js', type: 'text/javascript' },
	};
	server = createServer((req, res) => {
		const urlPath = (req.url || '/').split('?')[0];
		const entry = FILES[urlPath];
		if (!entry) {
			res.writeHead(404);
			res.end('nf');
			return;
		}
		fs.readFile(path.join(outDir, entry.name), (e, buf) => {
			if (e) {
				res.writeHead(404);
				res.end('nf');
			} else {
				res.writeHead(200, { 'content-type': entry.type });
				res.end(buf);
			}
		});
	});
	await new Promise<void>((r) => server.listen(0, r));
	baseURL = `http://127.0.0.1:${(server.address() as { port: number }).port}/index.html`;
});

test.afterAll(async () => {
	await new Promise<void>((r) => server?.close(() => r()));
	if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

type RA = { playing: boolean; rung: string | null; cue: number; word: number; progress: number; cues: number; finished: number };
const ra = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __RA: () => RA }).__RA());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(page: import('@playwright/test').Page, fail = false) {
	await page.addInitScript((f) => { (globalThis as unknown as { __FAIL: boolean }).__FAIL = f; }, fail);
	await page.goto(baseURL);
	await page.waitForFunction(() => typeof (window as unknown as { __RA?: unknown }).__RA === 'function');
}
/** Poll until `pred(state)` or timeout; returns the last state. */
async function until(page: import('@playwright/test').Page, pred: (s: RA) => boolean, timeoutMs = 9000): Promise<RA> {
	const t0 = Date.now();
	let s = await ra(page);
	while (!pred(s) && Date.now() - t0 < timeoutMs) { await sleep(80); s = await ra(page); }
	return s;
}

test('read-aloud: resolves the clocked path and reads to onFinish', async ({ page }) => {
	await open(page);
	await page.click('#play');
	expect((await ra(page)).rung).toBe('openrouter-tts'); // Suono clocked path engaged
	const done = await until(page, (s) => s.finished >= 1);
	expect(done.finished).toBe(1);
	expect(done.cues).toBe(4);
});

test('read-aloud: pause halts the highlight, resume RE-ARMS and reads to the end', async ({ page }) => {
	// Guards the two device bugs (IMG_2978): the highlight must FREEZE on pause (no pop-inducing
	// context state churn) and, crucially, RESUME must play on — Suono re-arms a fresh source from the
	// paused offset rather than leaning on the context to un-freeze a suspended clip (which silently
	// drops audio on iOS/Safari: "captions resume but the audio doesn't"). Headless has no audible
	// output, so we prove resume via the clock advancing past the paused cue and the read completing
	// exactly once — the audible pop/again is device-only (verified separately on the #950 preview).
	await open(page);
	await page.click('#play');
	await until(page, (s) => s.cue >= 1); // into the read
	await page.click('#pause');
	const a = await ra(page);
	expect(a.playing).toBe(false);
	await sleep(400);
	const b = await ra(page);
	expect(b.cue).toBe(a.cue); // frozen — the clock is paused while stopped
	expect(b.word).toBe(a.word);
	// Resume → the highlight must move PAST where it froze (the re-armed source is driving the clock).
	await page.click('#play');
	const moved = await until(page, (s) => s.playing && s.cue > a.cue, 4000);
	expect(moved.cue).toBeGreaterThan(a.cue);
	// A SECOND pause/resume cycle mid-read — the paused offset must accrue, not reset (multi-cycle).
	await page.click('#pause');
	const c = await ra(page);
	await sleep(300);
	expect((await ra(page)).cue).toBe(c.cue); // frozen again
	await page.click('#play');
	// …and it still reaches the end exactly once (no double-fire from a stale re-armed run).
	expect((await until(page, (s) => s.finished >= 1)).finished).toBe(1);
});

test('read-aloud: barge-in (re-play mid-read) restarts cleanly and completes once', async ({ page }) => {
	await open(page);
	await page.click('#play');
	await until(page, (s) => s.cue >= 2); // deep into the first read
	await page.click('#play'); // barge-in
	// It must restart: within a moment the highlight is back at cue 0…
	const restarted = await until(page, (s) => s.cue === 0 && s.playing, 2000);
	expect(restarted.cue).toBe(0);
	// …and the fresh run completes (exactly one more onFinish, no double-fire from a stale run).
	expect((await until(page, (s) => s.finished >= 1)).finished).toBe(1);
});

test('read-aloud: mute mid-slide falls to the silent estimate and still completes', async ({ page }) => {
	await open(page);
	await page.click('#play');
	await until(page, (s) => s.cue >= 1);
	await page.click('#mute'); // mid-read → stop audio, continue captions on the wall-clock estimate
	// Estimate mode is slower than the clips, so allow a longer window; it must reach the end.
	expect((await until(page, (s) => s.finished >= 1, 12000)).finished).toBe(1);
});

test('read-aloud: slide-nav mid-read tears down cleanly (new track, no ghost highlight)', async ({ page }) => {
	await open(page);
	await page.click('#play');
	await until(page, (s) => s.cue >= 1);
	await page.click('#nav'); // change the text → new slide
	// Poll for the SETTLED post-nav state: the new track loaded AND playback torn down. (The track
	// swap and the active-reset land on separate React commits, so an intermediate frame can show the
	// new cues with the old active still briefly set — wait for both before asserting no-ghost.)
	const after = await until(page, (s) => s.cues === 2 && !s.playing, 2000);
	expect(after.cues).toBe(2); // the new 2-sentence track loaded
	expect(after.playing).toBe(false); // nav stops playback
	expect(after.cue).toBe(-1); // no ghost highlight from the old slide
});

test('read-aloud: every synth failing falls to the silent estimate (highlight never hangs)', async ({ page }) => {
	await open(page, /* fail */ true); // synthOne returns null bytes for every sentence
	await page.click('#play');
	// No audio ever lands (audioBase stays null) → the run's terminal flips mode to the estimate,
	// which drives the highlight to the end. It must NOT hang.
	const done = await until(page, (s) => s.finished >= 1, 12000);
	expect(done.finished).toBe(1);
});
