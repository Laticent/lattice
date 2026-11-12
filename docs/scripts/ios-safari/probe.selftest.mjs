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
