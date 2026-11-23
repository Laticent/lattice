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
 *   PROBE=codec-support node scripts/ios-safari/probe.selftest.mjs   # the narration codec probe, in Chromium, WebKit and Firefox
 *   PROBE=present-memory [BASELINE_URL=http://localhost:4341] node scripts/ios-safari/probe.selftest.mjs   # Present on a photo deck
 *   PROBE=present-keepalive node scripts/ios-safari/probe.selftest.mjs   # Present stays awake, immersive tap, captions, Next keeps playing
 *   PROBE=present-landscape [SHAPES=<label,…>] [NO_TURN=1] node scripts/ios-safari/probe.selftest.mjs   # the 4K photo deck presented sideways: canvas, captions
 *   PROBE=empty-deck [SHOTS=<dir>] node scripts/ios-safari/probe.selftest.mjs   # empty the deck, tap the start grid's canvas, read the caret
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
	// It asks its runner for a real tap at the stop that focuses the editor (#3291): `tapRunner` below answers.
	{ file: 'compose-probe.js', fn: 'latticeComposeProbe', fresh: true, taps: true },
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
			// The same pages in the same order as run.mjs: the server's blank page first, where the settings are seeded, and
			// `since` stamped before it, so the probe's check that nothing fetched a face before the Studio runs here too.
			const since = Date.now();
			await page.goto(`${origins[arm]}/__probe/blank`, { waitUntil: 'load' });
			await page.addScriptTag({ content: SEED });
			await page.goto(`${origins[arm]}/studio/`, { waitUntil: 'domcontentloaded' });
			await page.addScriptTag({ content: FONT });
			report(label, `font-cache-probe.js ${arm}`, await page.evaluate(([a, s]) => globalThis.latticeFontCacheProbe(a, s), [arm, since]));
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
			players: { deck: `file://${players.deck}`, hostile: `file://${players.hostile}`, k4: `file://${players.k4}` },
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

if (process.env.PROBE === 'codec-support') {
	// The narration codec probe, as run.mjs runs it, in each of Playwright's engines (the iPhone answer needs the Mac's
	// simulator: Linux WebKit decodes with GStreamer, not Apple's media stack).
	const { chromium, firefox } = await import('@playwright/test');
	const { codecChecks } = await import('./codecs.mjs');
	// Suono's Opus encoder and Ogg writer (docs/src/lib/suono/opus.ts), the code the Studio ships, bundled by esbuild into
	// one plain script that puts them on `SuonoOpus`.
	const { buildSync } = await import('esbuild');
	const muxer = buildSync({ entryPoints: [path.join(here, '../../src/lib/suono/opus.ts')], bundle: true, format: 'iife', globalName: 'SuonoOpus', write: false }).outputFiles[0].text;
	const probe = `${muxer}\n${fs.readFileSync(path.join(here, 'codec-probe.js'), 'utf8')}`;
	const dir = path.join(here, 'codec-fixtures');
	const files = fs.readdirSync(dir).sort().map((name) => ({ name, b64: fs.readFileSync(path.join(dir, name)).toString('base64') }));
	await browser.close();
	for (const [name, engine] of Object.entries({ chromium, webkit, firefox })) {
		const b = await engine.launch();
		const page = await b.newPage();
		await page.route('https://codec.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>codec</title>' }));
		await page.goto('https://codec.test/');
		const r = await page.evaluate(`${probe}\nlatticeCodecProbe(${JSON.stringify(files)})`);
		for (const [k, v] of Object.entries(r.roundTrip)) console.log(`  ${name} round trip ${k}: ${v.ok ? `${v.kbps} kbps, ${v.extraMs} ms longer` : `NO (${v.error})`}${v.ogg ? `; our Ogg ${v.ogg.ok ? `${v.ogg.extraMs} ms longer, pre-skip ${v.ogg.preSkip}${v.ogg.preSkipReported ? ' reported' : ' default'}` : `NO (${v.ogg.error})`}` : ''}`);
		const steps = codecChecks(r);
		report(name, 'codec-probe.js', { ok: steps.every((s) => s.pass), error: steps.filter((s) => !s.pass).map((s) => s.name).join('; '), width: '-', steps });
		await b.close();
	}
	process.exit(failed ? 1 : 0);
}
if (process.env.PROBE === 'present-narration') {
	// The narration probe, as run.mjs runs it, minus the footprint: import the 4K deck, install the stand-in voice, play
	// Present with Guide on, voice on and then off. The voice arm walks to slide NARRATION_TARGET_SLIDE (15), as run.mjs does,
	// with NARRATION_PLAY_S (300 s) only a ceiling; NARRATION_SILENT_S, when set, adds a reported voice-off arm.
	const { buildNarrationDeck, NARRATION_TITLE, narrationChecks } = await import('./present-narration.mjs');
	const NARRATION = fs.readFileSync(path.join(here, 'present-narration-probe.js'), 'utf8');
	const deck = await buildNarrationDeck();
	const b64 = Buffer.from(deck.bytes).toString('base64');
	const arm = async (voice, seconds, untilSlide = 0) => {
		const out = { arm: voice ? 'voice on' : 'voice off', voice, samples: [] };
		const context = await browser.newContext(shapes.at(-1).options);
		const page = await context.newPage();
		await page.addInitScript(SEED);
		const call = (expr) => page.evaluate(`${NARRATION}\n${expr}`);
		try {
			await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
			await call(`latticeNarrationReceive(${JSON.stringify(b64)}, 0, 1)`);
			Object.assign(out, await call(`latticeNarrationImport(${JSON.stringify(NARRATION_TITLE)})`));
			await call(`latticeNarrationVoice(${JSON.stringify(process.env.NARRATION_VOICE || 'openrouter-gemini')})`);
			const played = await call(`latticeNarrationReady(${voice})`);
			out.total = played.total;
			// The tap a presenter makes, as run.mjs makes it with a WebDriver touch.
			await page.touchscreen.tap(played.x, played.y);
			await call('latticeNarrationStarted()');
			const t0 = Date.now();
			while (Date.now() - t0 < seconds * 1000) {
				// A sampling interval, as run.mjs reads every 30 s: what is read is work done (slide, clips, bytes), never time.
				await new Promise((r) => setTimeout(r, 10_000)); // flaky-ok: a sampling interval, the samples are judged on work done
				// Walk the deck as run.mjs does on the simulator (Next every 10 s), so both read the same work.
				await call('latticeNarrationNext()');
				const s = await call('latticeNarrationSample()');
				out.samples.push({ t: Math.round((Date.now() - t0) / 1000), ...s });
				console.log(`  ${out.arm} +${out.samples.at(-1).t}s: slide ${s.slide}, audio ${s.audio}, ${s.speech} spoken (${s.pcm} as PCM), ${s.liveMB} MB audio held of ${s.decodedMB} MB decoded at ${s.sampleRate} Hz`);
				// As run.mjs: the judged arm ends on WORK, once Present stands on the target slide (HARD RULE #32).
				if (untilSlide > 0 && (s.slide ?? 0) >= untilSlide) break;
			}
			out.playedS = Math.round((Date.now() - t0) / 1000);
			out.alive = out.samples.at(-1)?.mark === played.mark;
			out.pressure = await call('latticeNarrationPressure()');
			console.log(`  ${out.arm} after collection pressure: ${out.pressure.beforeMB} -> ${out.pressure.afterMB} MB of decoded audio uncollected (${out.pressure.clips} clips, ${out.pressure.decodedMB} MB decoded in all)`);
		} catch (e) {
			out.error = String(e.message || e).split('\n')[0].slice(0, 300);
		}
		await context.close();
		return out;
	};
	const TARGET_SLIDE = Number(process.env.NARRATION_TARGET_SLIDE || 15);
	const SILENT_S = Number(process.env.NARRATION_SILENT_S || 0);
	const arms = [await arm(true, Number(process.env.NARRATION_PLAY_S || 300), TARGET_SLIDE), ...(SILENT_S > 0 ? [await arm(false, SILENT_S)] : [])];
	const steps = narrationChecks(arms, { slides: deck.slides, audioCapMB: Number(process.env.NARRATION_AUDIO_CAP_MB || 40), memory: false, targetSlide: TARGET_SLIDE });
	report('iPhone-sized', 'present-narration-probe.js', { ok: steps.every((s) => s.pass), error: steps.filter((s) => !s.pass).map((s) => s.name).join('; '), width: arms[0].width, steps });
	await browser.close();
	process.exit(failed ? 1 : 0);
}

if (process.env.PROBE === 'present-keepalive') {
	// The Present keep-alive probe, as run.mjs runs it: open Present, press Fullscreen, wait for the chrome to fade, a touch
	// tap on the slide (Playwright's touchscreen, where run.mjs sends a WebDriver touch), Play, Next, close. iPhone-sized only.
	const KEEP = fs.readFileSync(path.join(here, 'present-keepalive-probe.js'), 'utf8');
	const context = await browser.newContext(shapes.at(-1).options);
	const page = await context.newPage();
	await page.addInitScript(SEED);
	const call = (expr) => page.evaluate(`${KEEP}\n${expr}`);
	const r = {};
	let error = '';
	try {
		await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
		await call('latticeKeepaliveArmErrors()');
		const at = await call('latticeKeepalivePresentAt()');
		await page.touchscreen.tap(at.x, at.y);
		r.open = await call('latticeKeepaliveOpen()');
		r.immersive = await call('latticeKeepaliveImmersive()');
		await page.touchscreen.tap(r.immersive.x, r.immersive.y);
		r.shown = await call('latticeKeepaliveShown()');
		r.wakeAfterTap = await call('latticeKeepaliveWake()');
		r.play = await call('latticeKeepalivePlay()');
		r.next = await call('latticeKeepaliveNext()');
		r.close = await call('latticeKeepaliveClose()');
		r.voiceOn = await call('latticeKeepaliveVoiceOn()');
	} catch (e) {
		error = String(e.message || e).split('\n')[0].slice(0, 300);
	}
	// Playwright's WebKit has no Screen Wake Lock, so that one check is reported and not judged here (the Mac judges it).
	const steps = (await page.evaluate(`${KEEP}\nlatticeKeepaliveChecks(${JSON.stringify(r)}, { realSafari: false })`)).map((s) => (s.name.startsWith('Present holds') && !r.open?.hasApi ? { ...s, pass: true, detail: `${s.detail} (no Wake Lock API in Playwright WebKit: not judged here)` } : s));
	if (error) steps.push({ name: 'the probe ran to the end', pass: false, detail: error });
	report('iPhone-sized', 'present-keepalive-probe.js', { ok: steps.every((s) => s.pass), error: steps.filter((s) => !s.pass).map((s) => s.name).join('; '), width: r.open?.width, steps });
	await context.close();
	await browser.close();
	process.exit(failed ? 1 : 0);
}
if (process.env.PROBE === 'present-landscape') {
	// The landscape probe, as run.mjs runs it, minus the footprint and the turn (the page here starts sideways): send the
	// 4K photo deck with spoken notes, import it, reload, open Present, read the canvas, play the captions on the phones,
	// step six slides. The iPad Pro 13-inch as Safari shows it sideways (1376 CSS px at 2x, less its bars), and the two
	// iPhone sizes, because the larger one is the closest a phone comes to the FOUR_K_FROM line.
	const { buildPresentDeck, PRESENT_TITLE_LANDSCAPE, presentChecks, landscapeChecks } = await import('./present-memory.mjs');
	const PRESENT = fs.readFileSync(path.join(here, 'present-memory-probe.js'), 'utf8');
	const PIECE = 4_000_000;
	const deck = await buildPresentDeck(undefined, undefined, '4k', PRESENT_TITLE_LANDSCAPE, true);
	const b64 = Buffer.from(deck.bytes).toString('base64');
	// Each device starts upright and is turned once Present is open, as a person does it and as run.mjs turns the
	// simulator: a phone held sideways shows the Studio no Present button at all.
	const sideways = [
		{ label: 'iPad-13-landscape', expect: process.env.IPAD_EXPECT || 'hd', captions: false, options: { viewport: { width: 1032, height: 1302 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, turned: { width: 1376, height: 958 } },
		{ label: 'iPhone-15-Pro-landscape', expect: 'hd', captions: true, options: { ...devices['iPhone 15 Pro'] }, turned: devices['iPhone 15 Pro landscape'].viewport },
		{ label: 'iPhone-15-Pro-Max-landscape', expect: 'hd', captions: true, options: { ...devices['iPhone 15 Pro Max'] }, turned: devices['iPhone 15 Pro Max landscape'].viewport },
	];
	const only = process.env.SHAPES ? process.env.SHAPES.split(',') : null;
	for (const shape of sideways.filter((x) => !only || only.includes(x.label))) {
		const out = { wantHeading: `${PRESENT_TITLE_LANDSCAPE}.`, rotatedBy: 'the viewport' };
		const context = await browser.newContext(shape.options);
		const page = await context.newPage();
		await page.addInitScript(SEED);
		const call = (expr) => page.evaluate(`${PRESENT}\n${expr}`);
		try {
			await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
			const n = Math.ceil(b64.length / PIECE);
			for (let i = 0; i < n; i++) await call(`latticePresentReceive(${JSON.stringify(b64.slice(i * PIECE, (i + 1) * PIECE))}, ${i}, ${n})`);
			const imported = await call(`latticePresentImport(${JSON.stringify(PRESENT_TITLE_LANDSCAPE)}, ${deck.slides})`);
			Object.assign(out, { importMs: imported.importMs, width: imported.width });
			await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
			await call(`latticePresentReady(${JSON.stringify(PRESENT_TITLE_LANDSCAPE)})`);
			const opened = await call('latticePresentOpen()');
			Object.assign(out, { openMs: opened.openMs, slides: opened.total, heading: opened.heading, box: opened.box });
			// NO_TURN=1 leaves the page upright: the failing arm for "the simulator is turned to landscape".
			await call('latticePresentWatchTurn()');
			if (!process.env.NO_TURN) await page.setViewportSize(shape.turned);
			out.geo = await call('latticePresentGeometry()');
			out.box = out.geo.box;
			if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `${shape.label}-open.png`) });
			if (shape.captions) out.captions = await call('latticePresentCaptions()');
			if (process.env.SHOTS && shape.captions) await page.screenshot({ path: path.join(process.env.SHOTS, `${shape.label}-captions.png`) });
			const stepped = await call('latticePresentStep(6)');
			Object.assign(out, { stepsMs: stepped.steps.map((x) => x.ms), photos: stepped.steps.every((x) => x.photo), alive: (await call('latticePresentAlive()')).mark === opened.mark });
		} catch (e) {
			out.error = String(e.message || e).split('\n')[0].slice(0, 300);
		}
		const g = out.geo || {};
		console.log(`${shape.label}: viewport ${g.innerW}x${g.innerH} at ${g.dpr}x, host ${g.hostW} px, slide ${g.slideW} px on screen, laid out ${g.box}`);
		if (process.env.TURN_TRACE) console.log(`  turn: ${g.turn}`);
		const steps = [...presentChecks(out, { slides: deck.slides, memory: false }), ...landscapeChecks(out, { expect: shape.expect, captions: shape.captions })];
		report(shape.label, 'present-memory-probe.js', { ok: steps.every((x) => x.pass), error: steps.filter((x) => !x.pass).map((x) => x.name).join('; '), width: out.width, steps });
		await context.close();
	}
	await browser.close();
	process.exit(failed ? 1 : 0);
}
if (process.env.PROBE === 'present-memory') {
	// The Present probe, as run.mjs runs it, minus the footprint (only the Mac can read the simulator's): send the deck,
	// import it, reload, open Present, step six slides. iPhone-sized only, as the suite runs it. BASELINE_URL adds a second
	// arm that is reported and not judged, as PRESENT_BASELINE_URL does on the Mac.
	const { buildPresentDeck, PRESENT_TITLE, PRESENT_TITLE_4K, presentChecks } = await import('./present-memory.mjs');
	const PRESENT = fs.readFileSync(path.join(here, 'present-memory-probe.js'), 'utf8');
	const PIECE = 4_000_000;
	const fixture = async (deckSize, title) => {
		const deck = await buildPresentDeck(undefined, undefined, deckSize, title);
		return { deck, b64: Buffer.from(deck.bytes).toString('base64'), title };
	};
	const hd = await fixture('', PRESENT_TITLE);
	const k4 = await fixture('4k', PRESENT_TITLE_4K);
	const arm = async (name, base, { deck, b64, title } = hd) => {
		const out = { arm: name, wantHeading: `${title}.` };
		const context = await browser.newContext(shapes.at(-1).options);
		const page = await context.newPage();
		await page.addInitScript(SEED);
		const call = (expr) => page.evaluate(`${PRESENT}\n${expr}`);
		try {
			await page.goto(`${base}/studio/`, { waitUntil: 'domcontentloaded' });
			const n = Math.ceil(b64.length / PIECE);
			for (let i = 0; i < n; i++) await call(`latticePresentReceive(${JSON.stringify(b64.slice(i * PIECE, (i + 1) * PIECE))}, ${i}, ${n})`);
			const imported = await call(`latticePresentImport(${JSON.stringify(title)}, ${deck.slides})`);
			Object.assign(out, { importMs: imported.importMs, width: imported.width });
			await page.goto(`${base}/studio/`, { waitUntil: 'domcontentloaded' });
			await call(`latticePresentReady(${JSON.stringify(title)})`);
			const opened = await call('latticePresentOpen()');
			Object.assign(out, { openMs: opened.openMs, slides: opened.total, heading: opened.heading, box: opened.box });
			const stepped = await call('latticePresentStep(6)');
			Object.assign(out, { stepsMs: stepped.steps.map((s) => s.ms), photos: stepped.steps.every((s) => s.photo), alive: (await call('latticePresentAlive()')).mark === opened.mark });
		} catch (e) {
			out.error = String(e.message || e).split('\n')[0].slice(0, 300);
		}
		await context.close();
		return out;
	};
	const mine = await arm('this build', BASE);
	const mine4k = await arm('this build, 4K deck', BASE, k4);
	const steps = [
		...presentChecks(mine, { slides: hd.deck.slides, memory: false }),
		...presentChecks(mine4k, { slides: k4.deck.slides, memory: false, box: '1280px' }).map((c) => ({ ...c, name: `4K deck · ${c.name}` })),
	];
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
if (process.env.PROBE === 'empty-deck') {
	// The empty-deck tap, as run.mjs runs it after the Compose tap: empty the deck, a real touch on the start grid's
	// background, read the caret, put the deck back. A first visit (nothing stored), so the Studio opens in Compose.
	const EMPTY = withEditorHelper(fs.readFileSync(path.join(here, 'empty-deck-probe.js'), 'utf8'));
	for (const { label, options } of shapes) {
		const context = await browser.newContext({ ...options, hasTouch: true });
		const page = await context.newPage();
		await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
		await page.addScriptTag({ content: EMPTY });
		const steps = [];
		const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail: String(detail) });
		let error;
		try {
			const prep = await page.evaluate(() => globalThis.latticeEmptyDeckPrep());
			step('the start grid shows on the emptied deck, with a still point on its background', prep.hit, `${prep.x},${prep.y} under ${prep.under}, still ${prep.still} frames`);
			step('the editor does not have the focus before the tap', !prep.focusedBefore);
			if (prep.hit) {
				await page.touchscreen.tap(prep.x, prep.y);
				const seen = await page.evaluate(() => globalThis.latticeEmptyDeckRead());
				step('a tap on the canvas gives the editor the focus', seen.focused, `active: ${seen.active}`);
				step('a caret, not a range, sits in the empty line', seen.inLine && seen.caret, `in ${seen.where}`);
				step('the start grid stays until something is typed', seen.shown);
				if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, `empty-deck-${label}.png`) });
			}
			step('the saved deck is back in Source', await page.evaluate((t) => globalThis.latticeEmptyDeckRestore(t), prep.saved), `${prep.saved.length} characters`);
		} catch (e) {
			error = String(e.message || e);
		}
		const result = { ok: !error && steps.every((s) => s.pass), error, width: page.viewportSize()?.width, steps };
		report(label, 'empty-deck-probe.js', result);
		await context.close();
	}
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
/**
 * Run a probe that asks for real taps, as run.mjs `composeProbePage` does over WebDriver: start it, and answer each
 * `__latticeTapRequest` with a touchscreen tap (a page with touch) or a mouse click, judged as run.mjs judges it: a caret,
 * in the block under the tap point, with the editor focused. Playwright's taps have no hold to stretch, so there is no
 * long-press guard here.
 */
async function tapRunner(page, fn, touch) {
	await page.evaluate((name) => {
		window.__latticeTapBridge = true;
		window.__composeResult = null;
		globalThis[name]().then(
			(r) => {
				window.__composeResult = r;
			},
			(e) => {
				window.__composeResult = { ok: false, error: String(e), steps: [] };
			},
		);
	}, fn);
	for (;;) {
		const handle = await page.waitForFunction(() => window.__composeResult || (window.__latticeTapRequest && !window.__latticeTapRequest.taken && window.__latticeTapRequest), null, { timeout: 360_000 });
		const next = await handle.jsonValue();
		if (next && 'ok' in next && 'steps' in next) return next;
		await page.evaluate(() => {
			window.__latticeTapRequest.taken = true;
		});
		if (touch) await page.touchscreen.tap(next.x, next.y);
		else await page.mouse.click(next.x, next.y);
		const seen = await page
			.waitForFunction(
				({ x, y }) => {
					const block = document.elementFromPoint(x, y)?.closest('h1, h2, h3, h4, h5, h6, p, li');
					const sel = getSelection();
					return !!(block && sel?.isCollapsed && block.contains(sel.anchorNode) && document.activeElement?.closest('.ProseMirror'));
				},
				{ x: next.x, y: next.y },
				{ timeout: 4000 },
			)
			.then(
				() => true,
				() => false,
			);
		const verdict = { ok: seen, detail: `${touch ? 'touchscreen tap' : 'mouse click'} at ${next.x},${next.y}${seen ? '' : '; no caret in the block, or the editor not focused'}` };
		await page.evaluate((v) => window.__latticeTapDone(v), verdict);
	}
}
for (const { label, options } of shapes) {
	for (const probe of PROBES) {
		const context = await browser.newContext(options);
		const page = await context.newPage();
		if (!probe.fresh) await page.addInitScript(SEED);
		await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
		await page.addScriptTag({ content: probe.source });
		const result = probe.taps ? await tapRunner(page, probe.fn, !!options.hasTouch) : await page.evaluate((fn) => globalThis[fn](), probe.fn);
		console.log(`${label} ${probe.file}: ${result.ok ? 'PASS' : `FAIL (${result.error})`} at ${result.width}px`);
		for (const s of result.steps) console.log(`  ${s.pass ? 'ok  ' : 'FAIL'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`);
		if (!result.ok) failed++;
		await context.close();
	}
}
await browser.close();
process.exit(failed ? 1 : 0);
