// Real-surface verification for the Vetrina tour recorder (LTT step 4).
//
// HARD RULE #23: the claim is "a tour recorded at one screen replays from its LTT, and the click
// still lands on its word at other screens, because the cursor's lead is recomputed there". Unit
// tests hold the arithmetic on a fake stage; only a real browser has a real cursor whose trip
// length depends on where the button actually is. So this runs the REAL `run()` and `createStage`
// in Chromium: it records a tour at 1440 px, then replays it from the LTT it wrote at 1440, 820
// and 390 px, and measures when the click lands against when the narration reaches the word.
//
// Run: node tools/verify-tour-recorder.mjs   (writes .scratch/out/tour-recorder/, exits non-zero on a failed check)

import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');
const { resolveChrome } = require('./lib/resolve-chrome');
const { validateLtt } = require('@laticent/ltt');

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, '.scratch/out/tour-recorder');
mkdirSync(OUT, { recursive: true });
const DOCS = path.join(ROOT, 'docs/src');

// The library, the Cadenza narrator and the recorder, bundled from SOURCE into one page script.
const entry = `
import { createTourRecorder, findCueWord, recordedLine, replayNarrator, run, storyboard } from '@/lib/vetrina';
import { cadenzaNarrator } from '@/lib/vetrina-narration/cadenza-narrator';
window.V = { createTourRecorder, findCueWord, recordedLine, replayNarrator, run, storyboard, cadenzaNarrator };
`;
const bundle = (
	await esbuild.build({
		stdin: { contents: entry, resolveDir: DOCS, loader: 'ts' },
		bundle: true,
		format: 'iife',
		write: false,
		alias: { '@': DOCS, '@laticent/ltt': path.join(DOCS, 'lib/ltt/index.ts') },
		tsconfigRaw: '{}',
		logLevel: 'silent',
	})
).outputFiles[0].text;

// A small app: the report, and a Publish button the cursor must cross the screen to reach. On a
// narrow screen it wraps below the text, so the trip is shorter.
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>
body{margin:0;font:18px/1.4 system-ui,sans-serif;background:#f6f7f9;color:#111}
#app{display:flex;flex-wrap:wrap;gap:24px;padding:32px;min-height:100vh;box-sizing:border-box;align-content:space-between}
.report{flex:1 1 320px;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px #0002}
#publish{align-self:flex-end;margin-left:auto;font:600 18px system-ui;padding:14px 28px;border:0;border-radius:10px;background:#1b4dd8;color:#fff}
</style></head><body><div id="app"><div class="report"><h1>Q3 report</h1><p>Revenue ahead of plan; payback is slipping.</p></div><button id="publish">Publish</button></div>
<script>${bundle}</script></body></html>`;
const page0 = path.join(OUT, 'app.html');
writeFileSync(page0, html);

/** One run in the page. `ltt` absent: record. Present: replay from it. Resolves with the timings. */
const runInPage = (ltt) =>
	new Promise((resolve) => {
		const { createTourRecorder, run, storyboard, cadenzaNarrator, replayNarrator } = window.V;
		const LINE = 'Now click Publish to send it to the board.';
		const spokeAt = [];
		const inner = cadenzaNarrator({ pace: 'moderate' });
		const speak = inner.speak.bind(inner);
		// A "voice" that runs 30% longer than its plan, as a real voice rarely matches one. The
		// recorder re-times each line to what it really took, so the recording's word times differ
		// from the live plan's — which is what lets the replay check below fail.
		inner.speak = (text, o) => {
			spokeAt.push({ text, at: performance.now() });
			const h = speak(text, o);
			const ms = inner.plan(text)?.durationMs ?? 0;
			return { cancel: h.cancel, done: h.done.then(() => new Promise((r) => setTimeout(r, ms * 0.3))) };
		};
		const narrate = ltt ? replayNarrator(ltt, inner) : inner;
		let actedAt = 0;
		const steps = [
			{ say: 'This is the quarterly report.', settle: 200 },
			{
				say: LINE,
				at: 'Publish',
				point: '#publish',
				click: true,
				act: () => {
					actedAt = performance.now();
					window.__acted?.();
				},
				settle: 300,
			},
			{ act: () => new Promise((r) => setTimeout(r, 400)), settle: 0 },
			{ say: 'It is on its way.', settle: 0 },
		];
		const digest = async (t) => `sha256:${[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
		const record = createTourRecorder({ id: 'publish-demo', inputs: { engine: `sha256:${'0'.repeat(64)}`, pace: 'moderate' }, digest });
		const btn = document.getElementById('publish').getBoundingClientRect();
		run({
			root: document.getElementById('app'),
			actions: {},
			play: storyboard('', steps),
			narrate,
			record,
			intro: false,
			onStop: async (reason) => {
				const line = spokeAt.find((s) => s.text === LINE);
				// The plan this run aligned to: the recording's line when replaying (its FIRST
				// occurrence: asking `narrate.plan` now, after the line was spoken, would ask for the
				// second), the live plan when recording.
				const plan = ltt ? window.V.recordedLine(ltt, LINE, 0) : inner.plan(LINE);
				const word = window.V.findCueWord(plan, 'Publish');
				const live = window.V.findCueWord(inner.plan(LINE), 'Publish');
				resolve({ reason, ltt: ltt ? null : await record.ltt(steps), lineAt: line?.at ?? 0, wordMs: word?.startMs ?? 0, liveMs: live?.startMs ?? 0, actedAt, button: { x: Math.round(btn.x), y: Math.round(btn.y) } });
			},
		});
	});

const chrome = resolveChrome();
if (!chrome) {
	console.error('verify-tour-recorder: no Chromium (set CHROME_PATH) — SKIPPED, nothing verified.');
	process.exit(0);
}
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
const check = (label, ok, detail = '') => {
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	if (!ok) process.exitCode = 1;
};

async function once(viewport, ltt, shot) {
	const page = await browser.newPage();
	await page.setViewport(viewport);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	// The screenshot is taken the moment the click's action runs: the cursor is on the button and
	// the caption is on the word.
	let shotDone = Promise.resolve();
	await page.exposeFunction('__acted', () => {
		shotDone = page.screenshot({ path: shot });
	});
	await page.goto(`file://${page0}`);
	const r = await page.evaluate(runInPage, ltt);
	await shotDone;
	await page.close();
	return { ...r, errors };
}

const REC = { width: 1440, height: 900 };
const rec = await once(REC, null, path.join(OUT, 'record-1440.png'));
writeFileSync(path.join(OUT, 'publish-demo.ltt.json'), `${JSON.stringify(rec.ltt, null, 2)}\n`);
check('the recording ran to the end', rec.reason === 'complete', rec.reason);
check('validateLtt accepts the recording', validateLtt(rec.ltt).length === 0, validateLtt(rec.ltt).join('; '));
check('the recording is seekable and carries its screen', rec.ltt.seekable === true && rec.ltt.inputs.viewport?.w === 1440, JSON.stringify(rec.ltt.inputs.viewport));
const acts = rec.ltt.segments.flatMap((s) => s.actions ?? []);
check('the word cue became an action with its word', acts.length === 1 && acts[0].match === 'publish' && acts[0].target === '#publish', JSON.stringify(acts));
check('the awaited act split the tour, and its wait was recorded', rec.ltt.segments.length === 2 && rec.ltt.segments[1].after === 'act' && rec.ltt.segments[1].waitedMs >= 390, `waitedMs ${rec.ltt.segments[1]?.waitedMs}`);

// The storyboard aligns the cursor's ARRIVAL with the word; the press follows, and the action runs
// when the press is done. `stage.ts` `press` holds 480 ms at full motion, so the arrival is the
// action's time minus that. What must hold: the arrival meets the word at every screen.
const PRESS_MS = 480;
const offset = (r) => Math.round(r.actedAt - PRESS_MS - (r.lineAt + r.wordMs));
const rows = [['record', 1440, rec]];
for (const vp of [REC, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
	const r = await once(vp, rec.ltt, path.join(OUT, `replay-${vp.width}.png`));
	rows.push(['replay', vp.width, r]);
	check(`replay at ${vp.width}px ran without errors`, r.reason === 'complete' && !r.errors.length, `${r.reason} ${r.errors.join('; ')}`);
	// The recording stretched the line ~1.3x, so a replay that planned from the LIVE narrator
	// would find the word ~30% earlier. This is the check that fails if replay ignores the file.
	check(`replay at ${vp.width}px plans the line from the recording, not the live plan`, r.wordMs > r.liveMs * 1.2 && Math.abs(r.wordMs - r.liveMs * 1.3) < 40, `${Math.round(r.wordMs)} ms vs live ${Math.round(r.liveMs)} ms`);
}
console.log('\n  run      width  button (x,y)   word at (ms into line)   arrival − word (ms)');
for (const [kind, w, r] of rows) console.log(`  ${kind.padEnd(7)}  ${String(w).padStart(5)}  ${`${r.button.x},${r.button.y}`.padEnd(13)}  ${String(Math.round(r.wordMs)).padStart(22)}   ${String(offset(r)).padStart(17)}`);
const offs = rows.map(([, , r]) => offset(r));
check('the cursor arrives on its word at every screen (within 60 ms)', offs.every((o) => Math.abs(o) <= 60), offs.join(', '));
check('the buttons really sit in different places, so the trips differ', new Set(rows.slice(1).map(([, , r]) => `${r.button.x},${r.button.y}`)).size === 3);
await browser.close();
