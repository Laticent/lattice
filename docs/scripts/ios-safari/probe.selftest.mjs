/**
 * Run studio-probe.js, photo-probe.js and panes-probe.js on Playwright's WebKit (an iPad-sized and an iPhone-sized page), against a docs build
 * already served at STUDIO_URL (default http://localhost:4321, `npm run build:e2e && npm run preview:e2e`).
 * It proves the probe itself before CI spends a macOS job on it: the iOS suite (run.sh) runs the same file
 * in Mobile Safari, where Playwright cannot go.
 *
 *   node scripts/ios-safari/probe.selftest.mjs
 *   PROBE=undo node scripts/ios-safari/probe.selftest.mjs   # the undo probe: edit, WebKit undo command, reload
 *   PROBE=chat-storage node scripts/ios-safari/probe.selftest.mjs   # chats move to IndexedDB across a reload; the allowance
 *   PROBE=font-cache node scripts/ios-safari/probe.selftest.mjs   # the font cache probe, against font-cache-server.mjs
 *   PROBE=present-memory [BASELINE_URL=http://localhost:4341] node scripts/ios-safari/probe.selftest.mjs   # Present on a photo deck
 *   PROBE=icon-grid [SHOTS=<dir>] node scripts/ios-safari/probe.selftest.mjs   # the icon grid on a phone: insert from Source, copy from Preview
 *   PROBE=player-charts node scripts/ios-safari/probe.selftest.mjs   # chart cards in an exported player, opened and closed by taps
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devices, webkit } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));
// The shared editor helper (show-editor.js, `latticeShowDeckEditor`, #2911), sent ahead of every Studio probe as run.mjs sends it.
const SHOW_EDITOR = fs.readFileSync(path.join(here, 'show-editor.js'), 'utf8');
const withEditorHelper = (source) => `${SHOW_EDITOR}\n${source}`;
// The Studio suite's page-side probes, as run.mjs runs them in Mobile Safari: each on a fresh page.
const PROBES = [
	{ file: 'studio-probe.js', fn: 'latticeStudioProbe' },
	{ file: 'photo-probe.js', fn: 'latticePhotoProbe' },
	{ file: 'panes-probe.js', fn: 'latticePanesProbe' },
	{ file: 'sheet-focus-probe.js', fn: 'latticeSheetFocusProbe' },
	// A first visit: nothing stored, so the Studio opens in Compose (run.mjs passes `seed: false` for it too).
	{ file: 'compose-probe.js', fn: 'latticeComposeProbe', fresh: true },
].map((p) => ({ ...p, source: withEditorHelper(fs.readFileSync(path.join(here, p.file), 'utf8')) }));
const BASE = process.env.STUDIO_URL || 'http://localhost:4321';
const SEED = fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8');

const shapes = [
	{ label: 'iPad-sized', options: { viewport: { width: 1180, height: 820 } } },
	// iPad Safari asks for the desktop site and reports about 1030 px: the bar folds Coach into "More controls" there.
	{ label: 'iPad-Safari-width', options: { viewport: { width: 1032, height: 1300 } } },
	{ label: 'iPhone-sized', options: { ...devices['iPhone 15 Pro'] } },
];
let failed = 0;
const browser = await webkit.launch();
const UNDO = withEditorHelper(fs.readFileSync(path.join(here, 'undo-probe.js'), 'utf8'));
const report = (label, file, result) => {
	console.log(`${label} ${file}: ${result.ok ? 'PASS' : `FAIL (${result.error})`} at ${result.width}px`);
	for (const s of result.steps) console.log(`  ${s.pass ? 'ok  ' : 'FAIL'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`);
	if (!result.ok) failed++;
};
if (process.env.PROBE === 'font-cache') {
	// The font cache probe, as run.mjs runs it: the control arm on one origin, the warm arm on the other, both served by
	// font-cache-server.mjs (start it first). A PERSISTENT profile: in Playwright's default ephemeral context WebKit keeps
	// no disk cache across preview documents, which would fail the warm arm for a reason Safari does not have.
	const FONT = withEditorHelper(fs.readFileSync(path.join(here, 'font-cache-probe.js'), 'utf8'));
	const origins = { control: process.env.CONTROL_URL || 'http://localhost:4321', warm: process.env.WARM_URL || 'http://localhost:4322' };
	await browser.close();
	for (const { label, options } of shapes) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'font-cache-'));
		const context = await webkit.launchPersistentContext(dir, options);
		for (const arm of ['control', 'warm']) {
			const page = await context.newPage();
			await page.addInitScript(SEED);
			await page.goto(`${origins[arm]}/studio/`, { waitUntil: 'domcontentloaded' });
			await page.addScriptTag({ content: FONT });
			report(label, `font-cache-probe.js ${arm}`, await page.evaluate((a) => globalThis.latticeFontCacheProbe(a), arm));
			await page.close();
		}
		await context.close();
		fs.rmSync(dir, { recursive: true, force: true });
	}
	process.exit(failed ? 1 : 0);
}
if (process.env.PROBE === 'chat-storage') {
	// The chat storage probe, as run.mjs runs it: plant the legacy threads, a real reload, then the after-reload half.
	const CHAT = fs.readFileSync(path.join(here, 'chat-storage-probe.js'), 'utf8');
	for (const { label, options } of shapes) {
		const context = await browser.newContext(options);
		const page = await context.newPage();
		await page.addInitScript(SEED);
		await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
		await page.addScriptTag({ content: CHAT });
		const first = await page.evaluate(() => globalThis.latticeChatStorageProbe());
		report(label, 'chat-storage-probe.js', first);
		if (first.ok) {
			await page.reload({ waitUntil: 'domcontentloaded' });
			await page.addScriptTag({ content: CHAT });
			report(label, 'chat-storage-probe.js after reload', await page.evaluate((seed) => globalThis.latticeChatStorageAfterReload(seed), first.seed));
		}
		await context.close();
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
}
if (process.env.PROBE === 'player-charts') {
	// The player chart probe (player-charts.mjs), the same sequence run.mjs runs in Mobile Safari, with Playwright's
	// touchscreen for the taps: an iPad-sized and an iPhone-sized page with touch. It exports the two decks itself, as
	// run.sh does, through the real CLI (CHROME_PATH or Puppeteer's Chrome).
	const { execFileSync } = await import('node:child_process');
	const { PLAYER_CHARTS_DECKS, PLAYER_CHARTS_SOURCE, runPlayerCharts } = await import('./player-charts.mjs');
	const root = path.resolve(here, '..', '..', '..');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'player-charts-'));
	const players = {};
	for (const [key, deck] of Object.entries(PLAYER_CHARTS_DECKS)) {
		players[key] = path.join(dir, `${key}.html`);
		execFileSync(process.execPath, [path.join(root, 'lattice.js'), path.join(root, deck), players[key], '--player', '-q'], { cwd: root, stdio: 'inherit' });
	}
	for (const shape of [{ label: 'iPad-sized', options: { viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true } }, shapes.at(-1)]) {
		const context = await browser.newContext(shape.options);
		const page = await context.newPage();
		const result = await runPlayerCharts({
			players: { deck: `file://${players.deck}`, hostile: `file://${players.hostile}` },
			go: (url) => page.goto(url),
			// In a function scope of its own, as WebDriver's execute-script runs it, so a second call never redeclares a const.
			call: (expr) => page.evaluate(`(() => {\n${PLAYER_CHARTS_SOURCE}\nreturn ${expr};\n})()`),
			tap: async (x, y) => {
				const t0 = Date.now();
				await page.touchscreen.tap(x, y);
				return Date.now() - t0;
			},
			// Playwright's WebKit has no touch drag, so the swipe is pointer events sent from the page: it proves the
			// sequence, not Safari's gesture (run.mjs sends a real one through safaridriver).
			swipe: (x1, y1, x2, y2) =>
				page.evaluate(
					([a, b, c, d]) => {
						const stage = document.querySelector('#lp-stage');
						const send = (type, x, y) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
						send('pointerdown', a, b);
						for (let k = 1; k <= 5; k++) send('pointermove', a + ((c - a) * k) / 5, b + ((d - b) * k) / 5);
						send('pointerup', 0, 0);
					},
					[x1, y1, x2, y2],
				),
		});
		report(shape.label, 'player-charts-probe.js', result);
		await context.close();
	}
	fs.rmSync(dir, { recursive: true, force: true });
	await browser.close();
	process.exit(failed ? 1 : 0);
}

if (process.env.PROBE === 'present-narration') {
	// The narration probe, as run.mjs runs it, minus the footprint: import the 4K deck, install the stand-in voice, play
	// Present with Guide on, voice on and then off. NARRATION_PLAY_S / NARRATION_SILENT_S shorten the arms here (default
	// 120 s / 30 s), since the steps, not the long-run memory, are what this proves.
	const { buildNarrationDeck, NARRATION_TITLE, narrationChecks } = await import('./present-narration.mjs');
	const NARRATION = fs.readFileSync(path.join(here, 'present-narration-probe.js'), 'utf8');
	const deck = await buildNarrationDeck();
	const b64 = Buffer.from(deck.bytes).toString('base64');
	const arm = async (voice, seconds) => {
		const out = { arm: voice ? 'voice on' : 'voice off', voice, samples: [] };
		const context = await browser.newContext(shapes.at(-1).options);
		const page = await context.newPage();
		await page.addInitScript(SEED);
		const call = (expr) => page.evaluate(`${NARRATION}\n${expr}`);
		try {
			await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
			await call(`latticeNarrationReceive(${JSON.stringify(b64)}, 0, 1)`);
			Object.assign(out, await call(`latticeNarrationImport(${JSON.stringify(NARRATION_TITLE)})`));
			await call('latticeNarrationVoice()');
			const played = await call(`latticeNarrationPlay(${voice})`);
			out.total = played.total;
			const t0 = Date.now();
			while (Date.now() - t0 < seconds * 1000) {
				// A sampling interval, as run.mjs reads every 30 s: what is read is work done (slide, clips, bytes), never time.
				await new Promise((r) => setTimeout(r, 10_000)); // flaky-ok: a sampling interval, the samples are judged on work done
				const s = await call('latticeNarrationSample()');
				out.samples.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
				console.log(`  ${out.arm} +${out.samples.at(-1).t}s: slide ${s.slide}, ${s.speech} spoken, ${s.liveMB} MB audio held of ${s.decodedMB} MB decoded at ${s.sampleRate} Hz`);
			}
			out.playedS = Math.round((Date.now() - t0) / 1000);
			out.alive = out.samples.at(-1)?.mark === played.mark;
		} catch (e) {
			out.error = String(e.message || e).split('\n')[0].slice(0, 300);
		}
		await context.close();
		return out;
	};
	const arms = [await arm(true, Number(process.env.NARRATION_PLAY_S || 120)), await arm(false, Number(process.env.NARRATION_SILENT_S || 30))];
	const steps = narrationChecks(arms, { slides: deck.slides, audioCapMB: Number(process.env.NARRATION_AUDIO_CAP_MB || 40), memory: false });
	report('iPhone-sized', 'present-narration-probe.js', { ok: steps.every((s) => s.pass), error: steps.filter((s) => !s.pass).map((s) => s.name).join('; '), width: arms[0].width, steps });
	await browser.close();
	process.exit(failed ? 1 : 0);
}

if (process.env.PROBE === 'present-memory') {
	// The Present probe, as run.mjs runs it, minus the footprint (only the Mac can read the simulator's): send the deck,
	// import it, reload, open Present, step six slides. iPhone-sized only, as the suite runs it. BASELINE_URL adds a second
	// arm that is reported and not judged, as PRESENT_BASELINE_URL does on the Mac.
	const { buildPresentDeck, PRESENT_TITLE, presentChecks } = await import('./present-memory.mjs');
	const PRESENT = fs.readFileSync(path.join(here, 'present-memory-probe.js'), 'utf8');
	const deck = await buildPresentDeck();
	const b64 = Buffer.from(deck.bytes).toString('base64');
	const PIECE = 4_000_000;
	const arm = async (name, base) => {
		const out = { arm: name };
		const context = await browser.newContext(shapes.at(-1).options);
		const page = await context.newPage();
		await page.addInitScript(SEED);
		const call = (expr) => page.evaluate(`${PRESENT}\n${expr}`);
		try {
			await page.goto(`${base}/studio/`, { waitUntil: 'domcontentloaded' });
			const n = Math.ceil(b64.length / PIECE);
			for (let i = 0; i < n; i++) await call(`latticePresentReceive(${JSON.stringify(b64.slice(i * PIECE, (i + 1) * PIECE))}, ${i}, ${n})`);
			const imported = await call(`latticePresentImport(${JSON.stringify(PRESENT_TITLE)}, ${deck.slides})`);
			Object.assign(out, { importMs: imported.importMs, width: imported.width });
			await page.goto(`${base}/studio/`, { waitUntil: 'domcontentloaded' });
			await call('latticePresentReady()');
			const opened = await call('latticePresentOpen()');
			Object.assign(out, { openMs: opened.openMs, slides: opened.total });
			const stepped = await call('latticePresentStep(6)');
			Object.assign(out, { stepsMs: stepped.steps.map((s) => s.ms), photos: stepped.steps.every((s) => s.photo), alive: (await call('latticePresentAlive()')).mark === opened.mark });
		} catch (e) {
			out.error = String(e.message || e).split('\n')[0].slice(0, 300);
		}
		await context.close();
		return out;
	};
	const mine = await arm('this build', BASE);
	const steps = presentChecks(mine, { slides: deck.slides, memory: false });
	report('iPhone-sized', 'present-memory-probe.js', { ok: steps.every((s) => s.pass), error: steps.filter((s) => !s.pass).map((s) => s.name).join('; '), width: mine.width, steps });
	if (process.env.BASELINE_URL) {
		const b = await arm('baseline', process.env.BASELINE_URL.replace(/\/$/, ''));
		console.log(`baseline (not judged): ${b.error ? `ERROR ${b.error}` : `opened in ${b.openMs} ms, steps ${b.stepsMs.join('/')} ms`}`);
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
}
if (process.env.PROBE === 'icon-grid') {
	// The icon grid probe, as run.mjs runs it on the iPhone: open the grid from the source pane and then from the preview,
	// a real touch tap on the first icon between open and check.
	const GRID = withEditorHelper(fs.readFileSync(path.join(here, 'icon-grid-probe.js'), 'utf8'));
	const context = await browser.newContext({ ...shapes.at(-1).options, permissions: [] });
	const page = await context.newPage();
	await page.addInitScript(SEED);
	await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
	const steps = [];
	let error;
	for (const where of ['source', 'preview']) {
		const open = await page.evaluate(`${GRID}\nlatticeIconGridOpen(${JSON.stringify(where)})`);
		steps.push(...open.steps);
		if (!open.ok) {
			error = `${where}: ${open.error}`;
			break;
		}
		await page.touchscreen.tap(open.x, open.y);
		const check = await page.evaluate(`${GRID}\nlatticeIconGridCheck(${JSON.stringify(where)}, ${JSON.stringify(open.name)}, ${Number(open.before) || 0})`);
		steps.push(...check.steps);
		if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `icon-grid-${where}.png`) });
		if (!check.ok) {
			error = `${where}: ${check.error}`;
			break;
		}
	}
	report('iPhone-sized', 'icon-grid-probe.js', { ok: !error, error, width: 393, steps });
	await browser.close();
	process.exit(failed ? 1 : 0);
}
if (process.env.PROBE === 'undo') {
	// The undo probe, as run.mjs runs it: the edit half, a real reload, then the after-reload half.
	for (const { label, options } of shapes) {
		const context = await browser.newContext(options);
		const page = await context.newPage();
		await page.addInitScript(SEED);
		await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
		await page.addScriptTag({ content: UNDO });
		const first = await page.evaluate(() => globalThis.latticeUndoProbe());
		report(label, 'undo-probe.js', first);
		if (first.ok) {
			await page.reload({ waitUntil: 'domcontentloaded' });
			await page.addScriptTag({ content: UNDO });
			report(label, 'undo-probe.js after reload', await page.evaluate(([b, a]) => globalThis.latticeUndoAfterReload(b, a), [first.before, first.after]));
		}
		await context.close();
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
}
for (const { label, options } of shapes) {
	for (const probe of PROBES) {
		const context = await browser.newContext(options);
		const page = await context.newPage();
		if (!probe.fresh) await page.addInitScript(SEED);
		await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
		await page.addScriptTag({ content: probe.source });
		const result = await page.evaluate((fn) => globalThis[fn](), probe.fn);
		console.log(`${label} ${probe.file}: ${result.ok ? 'PASS' : `FAIL (${result.error})`} at ${result.width}px`);
		for (const s of result.steps) console.log(`  ${s.pass ? 'ok  ' : 'FAIL'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`);
		if (!result.ok) failed++;
		await context.close();
	}
}
await browser.close();
process.exit(failed ? 1 : 0);
