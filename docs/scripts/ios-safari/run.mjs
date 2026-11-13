/**
 * Drive Mobile Safari in ONE booted iOS Simulator through safaridriver and run a probe there: studio-probe.js, then panes-probe.js, in the
 * real Studio (PROBE=studio, the default), photo-probe.js in the real Studio (PROBE=photo), the photo memory arms of photo-memory.mjs
 * on pages of their own (PROBE=photo-memory), jpeg-probe.js, the shared JPEG encoder
 * against Safari's own (PROBE=jpeg), focus-sync-probe.js, real taps on the Playground's editor under a busy page
 * (PROBE=focus-sync), undo-probe.js, the Filo undo checks across a reload (PROBE=undo), or font-cache-probe.js, whether
 * the Studio's warmed fonts are read from Safari's cache (PROBE=font-cache, against font-cache-server.mjs), or chat-storage-probe.js,
 * chats moving from localStorage to IndexedDB across a reload and the localStorage allowance (PROBE=chat-storage), or what Present costs
 * on a deck of phone photos (PROBE=present-memory, present-memory.mjs and present-memory-probe.js). SIM_UDID=mac drives the
 * Mac's own Safari instead (the undo probe's desktop half: the WebKit undo command, and a real ⌘Z key).
 * Plain WebDriver over fetch: no client library, so nothing new to install on the macOS runner.
 *
 *   SIM_UDID=<udid> SIM_LABEL=iPad [PROBE=jpeg] node scripts/ios-safari/run.mjs
 *
 * Env: WEBDRIVER_URL (safaridriver, default http://localhost:4444), STUDIO_URL (the served docs build, default
 * http://localhost:4321), ARTIFACT_DIR (where the screenshot and result JSON go), SESSION_ATTEMPTS (default 3). Exits 1 when the probe fails or
 * the session is not really iOS (a silent fallback to macOS Safari must never read as a pass). Exits 3 when no session
 * could be created at all (safaridriver never reached the simulator, or safaridriver itself is gone): no probe code ran,
 * so run.sh restarts safaridriver, reboots the device and tries once more.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLIDES, seedScript, TAPS, verdict } from './focus-sync-deck.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const WD = process.env.WEBDRIVER_URL || 'http://localhost:4444';
const BASE = process.env.STUDIO_URL || 'http://localhost:4321';
const UDID = process.env.SIM_UDID;
const LABEL = process.env.SIM_LABEL || 'iOS';
const OUT = process.env.ARTIFACT_DIR || path.join(process.cwd(), 'ios-safari-artifacts');
const PROBE = process.env.PROBE || 'studio';
const ROOT = path.resolve(here, '..', '..', '..');
/** A Studio probe's source with the shared editor helper ahead of it (show-editor.js, `latticeShowDeckEditor`, #2911).
 * It sits up here because the top-level `await` below runs the probe, and a `const` read before its line throws. */
const SHOW_EDITOR = fs.readFileSync(path.join(here, 'show-editor.js'), 'utf8');
const withEditorHelper = (source) => `${SHOW_EDITOR}\n${source}`;
// The encoder goes in as its own source text, the way lib/export/chrome-recode.js sends it. The pictures: a slide-sized
// synthetic photograph made in the page, and the committed screenshots below. The page's bytes for the synthetic one must
// equal Node's: the same file in every engine is the encoder's contract.
const JPEG_PICTURES = [
	'engineering/decisions/2026-10-05-state-chart-tile-look/01-options-light.jpg',
	'engineering/decisions/2026-10-05-state-chart-tile-look/02-options-dark.jpg',
	'engineering/decisions/2026-09-29-inline-icons/tabler-contact-sheet-light.jpg',
	'engineering/decisions/2026-09-29-inline-icons/tabler-contact-sheet-dark.jpg',
];

if (!UDID) throw new Error('run.mjs: SIM_UDID is required');
fs.mkdirSync(OUT, { recursive: true });

async function wd(method, url, body) {
	const res = await fetch(`${WD}${url}`, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	const json = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(json.value ?? json).slice(0, 600)}`);
	return json.value;
}

const MAC = UDID === 'mac';
/** Exit code for "no session could be created": no probe code ran, and run.sh may restart the stack and try again. */
const NO_SESSION = 3;

/**
 * safaridriver sometimes cannot reach a freshly booted simulator ("The host application never became ready", "timed out
 * while connecting to a Safari instance", "Booting Simulator.app if not already running"): main's nightly lost 3 of its
 * first 3 days of iOS runs to it, each before any probe code ran, on either device. Retry the session SESSION_ATTEMPTS
 * times (default 3; run.sh passes 2 when it can still restart the device). When safaridriver itself is gone (a refused connection: it can die after a timed-out session), retrying here is
 * useless, so exit NO_SESSION at once and let run.sh restart it. Any other error is real.
 */
const ATTEMPTS = Number(process.env.SESSION_ATTEMPTS || 3);
async function createSession() {
	for (let attempt = 1; ; attempt++) {
		try {
			return await wd('POST', '/session', {
				capabilities: {
					alwaysMatch: MAC ? { browserName: 'Safari', platformName: 'mac' } : { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': UDID },
				},
			});
		} catch (e) {
			const message = String(e.message);
			const gone = /fetch failed/.test(message) || e.cause?.code === 'ECONNREFUSED';
			if (gone || (attempt >= ATTEMPTS && /session not created/.test(message))) {
				console.log(`${LABEL}: no session (${gone ? 'safaridriver is not answering' : `attempt ${attempt} of ${ATTEMPTS}`}): ${message.slice(0, 300)}`);
				process.exit(NO_SESSION);
			}
			if (!/session not created/.test(message)) throw e;
			console.log(`${LABEL}: session not created (attempt ${attempt} of ${ATTEMPTS}): ${message.slice(0, 200)}; trying again in 20 s`);
			await new Promise((r) => setTimeout(r, 20000));
		}
	}
}
const session = await createSession();
const id = session.sessionId;
const caps = session.capabilities || {};
let ok = false;
try {
	const platform = String(caps.platformName || '').toLowerCase();
	if (!MAC && platform !== 'ios') throw new Error(`the session is not iOS (platformName ${caps.platformName}): refusing a macOS fallback`);
	// safaridriver reports `macOS` (or `mac`) for the desktop session.
	if (MAC && !platform.startsWith('mac')) throw new Error(`the session is not macOS Safari (platformName ${caps.platformName})`);
	console.log(`${LABEL}: session on ${caps.platformName} ${caps.platformVersion || ''}, Safari ${caps.browserVersion || '?'}`);
	// The script limit must outlast a probe's own cold-start waits (150 s each since 2026-11-04, D3 on #3034) plus its steps.
	await wd('POST', `/session/${id}/timeouts`, { script: 360000, pageLoad: 180000 });
	const result = PROBE === 'jpeg' ? await runJpegProbe(id) : PROBE === 'focus-sync' ? await runFocusSyncProbe(id) : PROBE === 'photo' ? await runPhotoProbe(id) : PROBE === 'undo' ? await runUndoProbe(id) : PROBE === 'completion' ? await runCompletionProbe(id) : PROBE === 'chat-storage' ? await runChatStorageProbe(id) : PROBE === 'photo-memory' ? await runPhotoMemoryProbe(id) : PROBE === 'present-memory' ? await runPresentMemoryProbe(id) : PROBE === 'font-cache' ? await runFontCacheProbe(id) : await runStudioProbe(id);
	result.session = { platformName: caps.platformName, platformVersion: caps.platformVersion, browserVersion: caps.browserVersion, label: LABEL };
	console.log(`${LABEL}: ${result.ok ? 'PASS' : `FAIL (${result.error})`} at ${result.width}px — ${result.ua}`);
	for (const s of result.steps) console.log(`  ${s.pass ? 'ok  ' : 'FAIL'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`);
	fs.writeFileSync(path.join(OUT, `${PROBE}-${LABEL}.json`), `${JSON.stringify(result, null, 2)}\n`);
	ok = !!result.ok;
} finally {
	try {
		const png = await wd('GET', `/session/${id}/screenshot`);
		fs.writeFileSync(path.join(OUT, `${PROBE}-${LABEL}.png`), Buffer.from(png, 'base64'));
	} catch (e) {
		console.log(`${LABEL}: no screenshot (${e.message})`);
	}
	await wd('DELETE', `/session/${id}`).catch(() => {});
}
process.exit(ok ? 0 : 1);


/**
 * Load a fresh Studio (settings seeded on its own origin first) and run one page-side probe in it. `seed: false` clears the
 * stored settings instead, so the Studio opens as it does for a new visitor (compose-probe.js): the session keeps
 * localStorage from the probes before it, and those stored Source.
 */
async function studioPage(id, file, fn, { seed = true } = {}) {
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
	const settings = seed ? fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8') : "try { localStorage.removeItem('lattice-studio-settings'); } catch {}";
	await wd('POST', `/session/${id}/execute/sync`, { script: settings, args: [] });
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/studio/` });
	const probe = withEditorHelper(fs.readFileSync(path.join(here, file), 'utf8'));
	return wd('POST', `/session/${id}/execute/async`, {
		script: `${probe}\nconst done = arguments[arguments.length - 1];\n${fn}().then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
		args: [],
	});
}

/**
 * The Studio suite (PROBE=studio): the preview payload probe (studio-probe.js), the pane-swap probe (panes-probe.js, #2916),
 * the sheet focus probe (sheet-focus-probe.js, #3108) and the first-visit Compose probe (compose-probe.js), each on a fresh page. One result: every step, each named for its probe, and a pass only when both pass. The photo suite
 * (PROBE=photo): the photo verdict probe, photo-probe.js. Each is its own platform suite with its own paths, so a sanitizer change
 * does not pay for the photo check and a Coach change does run it; together they used to make one job that ran out of its 30 minutes
 * on a slow runner. The photo memory arms (PROBE=photo-memory, #2998) are a suite of their own for the same reason: inside this
 * one they took the job to 27.6 minutes of its 30.
 */
async function runStudioProbe(id) {
	const preview = await studioPage(id, 'studio-probe.js', 'latticeStudioProbe');
	const panes = await studioPage(id, 'panes-probe.js', 'latticePanesProbe');
	// Focus back on the opener after a sheet closes (ui/sheet.tsx, #3108), in real Mobile Safari.
	const focus = await studioPage(id, 'sheet-focus-probe.js', 'latticeSheetFocusProbe');
	// A first visit, with nothing stored: Compose is the default and its slide toolbar holds still (compose-probe.js).
	const compose = await studioPage(id, 'compose-probe.js', 'latticeComposeProbe', { seed: false });
	// Then a real touch tap on a Compose paragraph, on that page: the probe above places its caret through the Selection API,
	// which never shows the keyboard or runs Safari's own tap-to-focus path.
	const tap = compose.ok ? await composeTouchTap(id) : { ok: false, steps: [], error: 'skipped: the Compose probe failed' };
	const named = (label, r) => (r.steps || []).map((s) => ({ ...s, name: `${label} · ${s.name}` }));
	return {
		ok: !!preview.ok && !!panes.ok && !!focus.ok && !!compose.ok && !!tap.ok,
		error: [preview.error && `preview: ${preview.error}`, panes.error && `panes: ${panes.error}`, focus.error && `sheet focus: ${focus.error}`, compose.error && `compose: ${compose.error}`, tap.error && `compose tap: ${tap.error}`].filter(Boolean).join('; ') || undefined,
		ua: panes.ua ?? preview.ua,
		width: panes.width ?? preview.width,
		steps: [...named('preview', preview), ...named('panes', panes), ...named('sheet focus', focus), ...named('compose', compose), ...named('compose tap', tap)],
	};
}

/**
 * A WebDriver touch tap on a Compose paragraph, as a finger does it: the caret lands in that paragraph, the editor has the
 * focus, and the paragraph carries the caret-line mark (`cs-active-line`). Also records whether the software keyboard came
 * up (the visual viewport shrinks), as a detail: a simulator with a hardware keyboard attached does not show it.
 */
async function composeTouchTap(id) {
	const run = (script) => wd('POST', `/session/${id}/execute/sync`, { script, args: [] });
	const steps = [];
	const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail: String(detail) });
	try {
		const target = await run(`
			document.activeElement?.blur?.(); getSelection()?.removeAllRanges();
			const ps = [...document.querySelectorAll('#studio-pane-editor .cs-host .ProseMirror > .cs-slide p')].filter((p) => p.textContent.trim().length > 8);
			const p = ps[1] || ps[0];
			if (!p) return null;
			window.__touchIndex = ps.indexOf(p);
			p.scrollIntoView({ block: 'center' });
			return { text: p.textContent.slice(0, 40), vv: visualViewport ? visualViewport.height : innerHeight };`);
		if (!target) return { ok: false, steps, error: 'no Compose paragraph to tap' };
		const at = await run(`const r = [...document.querySelectorAll('#studio-pane-editor .cs-host .ProseMirror > .cs-slide p')].filter((p) => p.textContent.trim().length > 8)[window.__touchIndex].getBoundingClientRect(); return { x: Math.round(r.left + Math.min(r.width / 2, 40)), y: Math.round(r.top + r.height / 2) };`);
		await wd('DELETE', `/session/${id}/actions`).catch(() => {});
		// NO HOLD between down and up. A tap has none, and the simulator can stretch a hold: with an 80 ms pause here, a slow
		// iPad simulator (run 43266767594, the one whose session had already timed out once) read the tap as a long press and
		// selected the word under the finger, so the paragraph held a range, not a caret, and correctly got no caret-line mark.
		const tapStart = Date.now();
		await wd('POST', `/session/${id}/actions`, {
			actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x: at.x, y: at.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }],
		});
		const tapMs = Date.now() - tapStart;
		await wd('DELETE', `/session/${id}/actions`).catch(() => {});
		const seen = await wd('POST', `/session/${id}/execute/async`, {
			args: [],
			script: `const done = arguments[arguments.length - 1];
				const t0 = performance.now();
				const read = () => {
					const p = [...document.querySelectorAll('#studio-pane-editor .cs-host .ProseMirror > .cs-slide p')].filter((p) => p.textContent.trim().length > 8)[window.__touchIndex];
					const sel = getSelection();
					const node = sel && sel.anchorNode;
					const inP = !!(p && node && p.contains(node));
					const focused = !!(document.activeElement && document.activeElement.closest('.ProseMirror'));
					const marked = !!(p && p.classList.contains('cs-active-line'));
					const caret = !!(sel && sel.isCollapsed);
					if ((inP && caret && focused && marked) || performance.now() - t0 > 4000) done({ inP, caret, picked: sel ? String(sel).slice(0, 40) : '', focused, marked, vv: visualViewport ? visualViewport.height : innerHeight, active: document.activeElement && document.activeElement.className });
					else requestAnimationFrame(read);
				};
				read();`,
		});
		step('a touch tap puts the caret in the tapped paragraph', seen.inP && seen.caret, `"${target.text}" at ${at.x},${at.y}, gesture ${tapMs} ms${seen.caret ? '' : `, but it SELECTED "${seen.picked}" (read as a long press)`}`);
		step('the editor has the focus after the tap', seen.focused, `active: ${seen.active}`);
		step('the tapped paragraph carries the caret-line mark', seen.marked);
		step('the software keyboard (detail only)', true, seen.vv < target.vv - 100 ? `up: viewport ${target.vv} to ${seen.vv}` : `not shown: viewport ${target.vv} to ${seen.vv}`);
		return { ok: steps.every((x) => x.pass), steps };
	} catch (e) {
		return { ok: false, steps, error: String(e.message || e) };
	}
}

/** The photo memory suite (PROBE=photo-memory): the two arms below, on pages of their own (no docs build). */
async function runPhotoMemoryProbe(id) {
	const memory = await runPhotoMemory(id);
	const page = await wd('POST', `/session/${id}/execute/sync`, { script: 'return { ua: navigator.userAgent, width: innerWidth };', args: [] }).catch(() => ({}));
	return { ...memory, ua: page?.ua, width: page?.width };
}

/**
 * The photo memory arms (photo-memory.mjs, #2998): ten distinct 12MP photos in ten preview-sized frames, first by their own
 * addresses, then through the preview-sized copies, each arm on its own origin so Safari gives it a fresh content process. The
 * memory is the physical footprint of the simulator's WebKit content and GPU processes, read on the Mac 6 s after the photos land, as
 * each process's growth over a read taken on the arm's empty page (growthMB: memory another process frees meanwhile does not
 * cancel it). The copies run first, each arm on its own site (photo-memory.mjs). Checks: the original arm costs at least
 * 60 MB (CI has read 86 to 117 MB; under that, the reader is not reading Safari's processes and the last check would pass on
 * nothing), and the copies cost at most 60% of it (Linux WebKit: 27%; CI: 15 to 32%).
 */
async function runPhotoMemory(id) {
	const { startPhotoMemoryFixture, simulatorWebContentMB, growthMB } = await import('./photo-memory.mjs');
	const FRAMES = 10;
	const TILE = 180;
	const fixture = await startPhotoMemoryFixture(FRAMES);
	console.log(`${LABEL}: photo-memory fixture ready in ${fixture.buildMs} ms (${fixture.madePhotos} photos made, the rest reused)`);
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const arms = [];
	const driverUp = () => fetch(`${WD}/status`).then((r) => r.ok, () => false);
	const runArm = async (i, scaled) => {
		await wd('POST', `/session/${id}/url`, { url: fixture.origins[i] });
		await sleep(3000);
		const r0 = Date.now();
		const base = await simulatorWebContentMB();
		const readMs = Date.now() - r0;
		const t = Date.now();
		const ran = await wd('POST', `/session/${id}/execute/async`, {
			script: `const done = arguments[arguments.length - 1]; window.run(${FRAMES}, ${scaled}, ${TILE}, window.devicePixelRatio).then(done, (e) => done({ error: String(e) }));`,
			args: [],
		});
		const settledMs = Date.now() - t;
		await sleep(6000);
		const g = growthMB(base, await simulatorWebContentMB());
		return { arm: scaled ? 'scaled' : 'original', baseMB: g.baseMB, aboveBaseMB: g.grew, freedMB: g.freed, settledMs, readMs, copies: !!ran?.copies, error: ran?.error };
	};
	try {
		// The copies first: a run's leftovers lower the NEXT arm's reading as they are freed, and the
		// originals arm is the one that must clear a floor.
		for (const [i, scaled] of [true, false].entries()) {
			const name = scaled ? 'scaled' : 'original';
			// A WebDriver call can drop mid-arm (an iPhone run lost safaridriver's connection, ECONNRESET, inside the
			// arm's script). That once threw out of the whole run and its results. Now the arm is tried once more while
			// safaridriver still answers, and otherwise fails as a named step with the error.
			for (let attempt = 1; ; attempt++) {
				try {
					const a0 = Date.now();
					const arm = await runArm(i, scaled);
					console.log(`${LABEL}: memory arm ${name}: ${arm.aboveBaseMB} MB above ${arm.baseMB} MB (others freed ${arm.freedMB} MB), photos settled in ${arm.settledMs} ms, one memory read ${arm.readMs} ms, arm ${Date.now() - a0} ms${arm.error ? `, page error ${arm.error}` : ''}`);
					arms.push(arm);
					break;
				} catch (e) {
					const message = `${String(e.message || e).slice(0, 200)}${e.cause?.code ? ` (${e.cause.code})` : ''}`;
					const up = await driverUp();
					console.log(`${LABEL}: memory arm ${name} attempt ${attempt} lost its WebDriver call: ${message}; safaridriver ${up ? 'still answers' : 'is gone'}`);
					if (attempt < 2 && up) continue;
					arms.push({ arm: name, error: `the WebDriver call failed: ${message}` });
					break;
				}
			}
			if (arms.at(-1).error && arms.at(-1).aboveBaseMB === undefined) break;
		}
	} finally {
		fixture.close();
	}
	const scaled = arms.find((a) => a.arm === 'scaled') ?? { error: 'not run' };
	const orig = arms.find((a) => a.arm === 'original') ?? { error: 'not run' };
	const steps = [
		{ name: 'the original photos cost the simulator WebKit at least 60 MB', pass: orig.aboveBaseMB >= 60 && !orig.error, detail: orig.aboveBaseMB === undefined ? orig.error : `${orig.aboveBaseMB} MB above ${orig.baseMB} MB (other processes freed ${orig.freedMB} MB), settled in ${orig.settledMs} ms` },
		{ name: 'the frames showed preview-sized copies', pass: !!scaled.copies && !scaled.error, detail: scaled.error || '' },
		{ name: 'the copies cost at most 60% of the originals', pass: scaled.aboveBaseMB !== undefined && orig.aboveBaseMB !== undefined && scaled.aboveBaseMB <= orig.aboveBaseMB * 0.6, detail: `${scaled.aboveBaseMB ?? '?'} MB vs ${orig.aboveBaseMB ?? '?'} MB (other processes freed ${scaled.freedMB ?? '?'} MB), settled in ${scaled.settledMs ?? '?'} ms` },
	];
	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, arms, steps };
}
async function runPhotoProbe(id) {
	return studioPage(id, 'photo-probe.js', 'latticePhotoProbe');
}

/**
 * The Present memory probe (PROBE=present-memory, PR #3148): a deck of eighteen phone-photo-sized pictures (present-memory.mjs,
 * 24 MB, about the owner's 33 MB of `data:` text) imported through "Import deck…", the page reloaded so the deck comes back
 * from the browser's store, then Present opened and stepped six slides. Each step is timed until the next slide's heading
 * AND photo are painted (present-memory-probe.js). The simulator's WebKit footprint is read on the Mac before Present
 * opens, after it opens and after the steps (photo-memory.mjs).
 *
 * Two arms when PRESENT_BASELINE_URL is set (the suite sets the production site): this build, which must pass, and the
 * baseline, which is only reported and has a time budget. Before #3148 merged, that baseline was the before; after it, it
 * is the last deploy, so a nightly compares `main` with what is live. The verdict is
 * present-memory.mjs `presentChecks`: work, not time (HARD RULE #32). PRESENT_MEMORY_CAP_MB defaults to 300: the first run
 * (2026-11-12, run 43238984976) read 124 MB on this change and 795 MB on `main`. A simulator has no memory limit, so this is
 * the cost an iPhone would weigh, not the reload itself.
 */
async function runPresentMemoryProbe(id) {
	const { buildPresentDeck, PRESENT_TITLE, presentChecks } = await import('./present-memory.mjs');
	const { simulatorWebContentMB, growthMB } = await import('./photo-memory.mjs');
	const CAP_MB = Number(process.env.PRESENT_MEMORY_CAP_MB || 300);
	const deck = await buildPresentDeck();
	const b64 = Buffer.from(deck.bytes).toString('base64');
	const PIECE = 4_000_000;
	const pieces = Math.ceil(b64.length / PIECE);
	const source = fs.readFileSync(path.join(here, 'present-memory-probe.js'), 'utf8');
	const call = (expr) => wd('POST', `/session/${id}/execute/async`, { script: `${source}\nconst done = arguments[arguments.length - 1];\nPromise.resolve().then(() => ${expr}).then(done, (e) => done({ error: String(e) }));`, args: [] });
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const mac = UDID === 'mac';
	const readMB = async () => (mac ? new Map() : simulatorWebContentMB());
	const failIf = (r, what) => {
		if (r?.error) throw new Error(`${what}: ${r.error}`);
		return r;
	};
	const arm = async (name, base) => {
		const out = { arm: name, base };
		try {
			await wd('POST', `/session/${id}/url`, { url: `${base}/` });
			await wd('POST', `/session/${id}/execute/sync`, { script: fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8'), args: [] });
			await wd('POST', `/session/${id}/url`, { url: `${base}/studio/` });
			for (let i = 0; i < pieces; i++) failIf(await call(`latticePresentReceive(${JSON.stringify(b64.slice(i * PIECE, (i + 1) * PIECE))}, ${i}, ${pieces})`), 'sending the deck');
			const imported = failIf(await call(`latticePresentImport(${JSON.stringify(PRESENT_TITLE)}, ${deck.slides})`), 'importing the deck');
			out.importMs = imported.importMs;
			out.ua = imported.ua;
			out.width = imported.width;
			// A fresh page: the deck comes back from the browser's store, and nothing the import held is still in memory.
			await wd('POST', `/session/${id}/url`, { url: `${base}/studio/` });
			failIf(await call('latticePresentReady()'), 'the deck after the reload');
			// Settle times, not waits for a signal: memory has no "settled" event. runPhotoMemory reads the same way, and the
			// margin is wide (102-124 MB read against the 300 MB cap), so a slow runner shifts a reading, not the verdict.
			await sleep(8000);
			const m0 = await readMB();
			const opened = failIf(await call('latticePresentOpen()'), 'opening Present');
			out.openMs = opened.openMs;
			out.slides = opened.total;
			await sleep(3000);
			const m1 = await readMB();
			const stepped = failIf(await call('latticePresentStep(6)'), 'stepping through Present');
			out.stepsMs = stepped.steps.map((s) => s.ms);
			out.photos = stepped.steps.every((s) => s.photo);
			out.schemes = [...new Set(stepped.steps.map((s) => s.scheme))].join('/');
			await sleep(3000);
			const m2 = await readMB();
			out.alive = (await call('latticePresentAlive()'))?.mark === opened.mark;
			const open = growthMB(m0, m1);
			const all = growthMB(m0, m2);
			out.baseMB = all.baseMB;
			out.openGrewMB = open.grew;
			out.grewMB = all.grew;
			out.freedMB = all.freed;
		} catch (e) {
			out.error = String(e.message || e).slice(0, 300);
		}
		console.log(`${LABEL}: present arm ${name}: ${out.error ? `ERROR ${out.error}` : `opened in ${out.openMs} ms, steps ${out.stepsMs.join('/')} ms, ${out.grewMB} MB above ${out.baseMB} MB (Present alone ${out.openGrewMB} MB), photos ${out.schemes}, ${out.alive ? 'no reload' : 'THE PAGE RELOADED'}`}`);
		return out;
	};
	const arms = [await arm('this build', BASE)];
	const baseline = process.env.PRESENT_BASELINE_URL;
	// The baseline is reported, never judged, so a slow production Studio must not spend the job's 30 minutes: past its
	// budget it is recorded as over budget and the job ends (process.exit below drops the call still in flight).
	const BASELINE_BUDGET_MS = Number(process.env.PRESENT_BASELINE_BUDGET_MS || 6 * 60_000);
	if (baseline) arms.push(await Promise.race([arm('baseline', baseline.replace(/\/$/, '')), sleep(BASELINE_BUDGET_MS).then(() => ({ arm: 'baseline', error: `over its ${BASELINE_BUDGET_MS / 1000} s budget` }))]));
	const a = arms[0];
	const steps = presentChecks(a, { slides: deck.slides, capMB: CAP_MB, memory: !mac });
	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, ua: a.ua, width: a.width, deckBytes: deck.bytes.length, arms, steps };
}

/**
 * The font cache probe (font-cache-probe.js, PROBE=font-cache): the control arm on STUDIO_URL, where font-cache-server.mjs
 * refuses the warm-up, then the warm arm on WARM_URL, each a fresh Studio on its own origin so each starts with a cold
 * cache. Both arms must pass: the control proves the probe can see a miss, the warm arm is the finding.
 */
async function runFontCacheProbe(id) {
	const source = withEditorHelper(fs.readFileSync(path.join(here, 'font-cache-probe.js'), 'utf8'));
	const steps = [];
	let last = null;
	for (const [arm, origin] of [
		['control', BASE],
		['warm', process.env.WARM_URL || 'http://localhost:4322'],
	]) {
		await wd('POST', `/session/${id}/url`, { url: `${origin}/` });
		await wd('POST', `/session/${id}/execute/sync`, { script: fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8'), args: [] });
		await wd('POST', `/session/${id}/url`, { url: `${origin}/studio/` });
		last = await wd('POST', `/session/${id}/execute/async`, {
			script: `${source}\nconst done = arguments[arguments.length - 1];\nlatticeFontCacheProbe(${JSON.stringify(arm)}).then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
			args: [],
		});
		steps.push(...(last.steps || []).map((s) => ({ ...s, name: `${arm} · ${s.name}` })));
	}
	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, ua: last?.ua, width: last?.width, steps };
}

/**
 * The undo probe (undo-probe.js): the edit half in a fresh Studio, a real reload through WebDriver, then the after-reload
 * half. On the Mac it then presses a real ⌘Z (a WebDriver key action, which Safari delivers as a keydown) if the text is
 * still unchanged, since a Mac's keyboard needs no on-screen button.
 */
async function runUndoProbe(id) {
	const source = withEditorHelper(fs.readFileSync(path.join(here, 'undo-probe.js'), 'utf8'));
	const run = (call) =>
		wd('POST', `/session/${id}/execute/async`, {
			script: `${source}\nconst done = arguments[arguments.length - 1];\n${call}.then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
			args: [],
		});
	const first = await studioPage(id, 'undo-probe.js', 'latticeUndoProbe');
	if (!first.ok) return first;
	await wd('POST', `/session/${id}/refresh`, {});
	const second = await run(`latticeUndoAfterReload(${JSON.stringify(first.before)}, ${JSON.stringify(first.after)})`);
	const steps = [...first.steps, ...(second.steps || []).map((s) => ({ ...s, name: `after reload · ${s.name}` }))];
	let ok = !!second.ok;
	let error = second.error;
	if (MAC) {
		const text = () => wd('POST', `/session/${id}/execute/sync`, { script: `${source}\nreturn undoProbeKit({ steps: [] }).deckText();`, args: [] });
		const t0 = Date.now();
		while ((await text()) === first.after && Date.now() - t0 < 20000) {
			await wd('POST', `/session/${id}/actions`, {
				actions: [{ type: 'key', id: 'kb', actions: [{ type: 'keyDown', value: '\uE03D' }, { type: 'keyDown', value: 'z' }, { type: 'keyUp', value: 'z' }, { type: 'keyUp', value: '\uE03D' }] }],
			});
			await new Promise((r) => setTimeout(r, 1000));
		}
		const now = await text();
		const pass = now === first.before;
		steps.push({ name: 'after reload · a real ⌘Z key undid the edit made before the reload', pass, detail: pass ? '' : JSON.stringify(String(now).slice(-40)) });
		// A Mac's undo after a reload is the ⌘Z key. Safari's Edit → Undo not reaching the history then
		// is a known gap (followups.d/2959-p3-mac-edit-menu-undo-after-reload.md): reported on its step, not failing the run.
		for (const s of steps) {
			if (!s.pass && /WebKit offers its undo command/.test(s.name)) {
				s.pass = true;
				s.name = `${s.name} — KNOWN GAP on macOS, followups.d/2959-p3-mac-edit-menu-undo-after-reload.md`;
			}
		}
		ok = pass && steps.every((s) => s.pass);
		error = ok ? undefined : [steps.filter((s) => !s.pass).map((s) => s.name).join('; '), pass ? '' : 'the ⌘Z key did not undo after the reload'].filter(Boolean).join('; ');
	}
	return { ok, error, ua: second.ua ?? first.ua, width: first.width, steps };
}

/**
 * The completion probe (completion-probe.js, one-off for PR #3174): keys as WebDriver key actions, a menu row picked by an
 * element click, the deck and the menu read back from the page.
 */
async function runCompletionProbe(id) {
	const source = withEditorHelper(fs.readFileSync(path.join(here, 'completion-probe.js'), 'utf8'));
	const first = await studioPage(id, 'completion-probe.js', 'latticeCompletionReady');
	if (!first.ok) return first;
	const steps = [];
	const page = (call) => wd('POST', `/session/${id}/execute/sync`, { script: `${source}\nreturn ${call};`, args: [] });
	const set = (doc) => page(`latticeCompletionSet(${JSON.stringify(doc)})`);
	const state = () => page('latticeCompletionState()');
	const CTRL = '\uE009';
	const ALT = '\uE00A';
	const keys = (mods, key) =>
		wd('POST', `/session/${id}/actions`, {
			actions: [{ type: 'key', id: 'kb', actions: [...mods.map((m) => ({ type: 'keyDown', value: m })), { type: 'keyDown', value: key }, { type: 'keyUp', value: key }, ...mods.reverse().map((m) => ({ type: 'keyUp', value: m }))] }],
		});
	const type = (text) => wd('POST', `/session/${id}/actions`, { actions: [{ type: 'key', id: 'kb', actions: [...text].flatMap((c) => [{ type: 'keyDown', value: c }, { type: 'keyUp', value: c }]) }] });
	const until = async (pred, ms = 8000) => {
		const t0 = Date.now();
		for (;;) {
			const st = await state();
			if (pred(st)) return st;
			if (Date.now() - t0 > ms) return st;
			await new Promise((r) => setTimeout(r, 150));
		}
	};
	const step = (name, pass, st) => steps.push({ name, pass: !!pass, detail: pass ? '' : JSON.stringify({ labels: st.labels.slice(0, 6), hint: st.hint, tail: st.doc.slice(-40) }) });
	const FM = '---\ntitle: Probe\n---\n\n';
	const ESC = '\uE00C';
	const TAB = '\uE004';

	await set(`${FM}<!-- _class: `);
	let st = await until((x) => x.labels.includes('cards-grid'));
	step('a bare _class: position opens nothing by itself', !st.labels.length, st);
	await keys([CTRL], ' ');
	st = await until((x) => x.labels.includes('cards-grid'));
	step('Ctrl-Space opens the component menu', st.labels.includes('cards-grid'), st);
	await keys([], ESC);
	st = await until((x) => !x.labels.length);
	step('Escape closes it', !st.labels.length, st);

	await keys([ALT], ESC);
	st = await until((x) => x.labels.includes('cards-grid'));
	step('Option-Esc opens the component menu', st.labels.includes('cards-grid'), st);
	await keys([], ESC);

	await set(`${FM}# A heading\n\nSome prose`);
	await keys([CTRL], ' ');
	st = await until((x) => x.hint);
	step('Ctrl-Space where nothing completes shows "No suggestions here"', st.hint && !st.labels.length, st);

	await set('---\ntitle: Probe\n');
	await type('them');
	st = await until((x) => x.labels.includes('theme'));
	step('typing a front-matter key opens its menu', st.labels.includes('theme'), st);
	await new Promise((r) => setTimeout(r, 300)); // past CodeMirror's 75 ms interaction delay, as a person's Tab is
	await keys([], TAB);
	st = await until((x) => x.doc.includes('theme: ') && x.labels.length > 0);
	step('Tab accepts it, and the theme values open at once', st.doc.includes('theme: ') && st.labels.length > 0, st);
	await keys([], ESC);

	await set(`${FM}<!-- _class: `);
	await keys([CTRL], ' ');
	st = await until((x) => x.labels.includes('cards-grid'));
	const marked = await page("latticeCompletionMark('cards-grid')");
	if (marked) {
		const el = await wd('POST', `/session/${id}/element`, { using: 'css selector', value: '[data-probe-pick]' });
		const eid = el['element-6066-11e4-a52e-4f735466cecf'] || el.ELEMENT;
		await wd('POST', `/session/${id}/element/${eid}/click`, {});
	}
	st = await until((x) => x.doc.includes('<!-- _class: cards-grid'));
	step(`a ${MAC ? 'click' : 'tap'} on a menu row picks it`, marked && st.doc.includes('<!-- _class: cards-grid'), st);

	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, ua: first.ua, width: first.width, steps };
}

/**
 * The chat storage probe (chat-storage-probe.js): plant the threads an earlier build left in localStorage in a booted
 * Studio, reload for real, then check they moved to IndexedDB and measure the localStorage allowance
 * (engineering/decisions/2026-11-11-studio-storage-pointer-records.md §11).
 */
async function runChatStorageProbe(id) {
	const source = fs.readFileSync(path.join(here, 'chat-storage-probe.js'), 'utf8');
	const first = await studioPage(id, 'chat-storage-probe.js', 'latticeChatStorageProbe');
	if (!first.ok) return first;
	await wd('POST', `/session/${id}/refresh`, {});
	const second = await wd('POST', `/session/${id}/execute/async`, {
		script: `${source}\nconst done = arguments[arguments.length - 1];\nlatticeChatStorageAfterReload(${JSON.stringify(first.seed)}).then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
		args: [],
	});
	const steps = [...first.steps, ...(second.steps || []).map((s) => ({ ...s, name: `after reload · ${s.name}` }))];
	return { ok: !!second.ok, error: second.error, ua: second.ua ?? first.ua, width: first.width, steps };
}

/**
 * The Playground's click-a-line check (docs/e2e/playground-focus-sync.spec.ts) on real Mobile Safari. Each tap is a real
 * WebDriver tap on the editor line, not a script: a scripted click would not move CodeMirror's caret the way a finger does.
 * The page is kept busy on purpose (FOCUS_SYNC_BURN_MS of work per 100 ms), the load that made the old code move the editor.
 */
async function runFocusSyncProbe(id) {
	const probe = fs.readFileSync(path.join(here, 'focus-sync-probe.js'), 'utf8');
	const burn = Number(process.env.FOCUS_SYNC_BURN_MS ?? 150);
	// Every call re-sends the probe source: WebDriver runs each script in its own scope. The burner lives on `window`.
	const call = (expr) =>
		wd('POST', `/session/${id}/execute/async`, {
			script: `${probe}\nconst done = arguments[arguments.length - 1];\nPromise.resolve(${expr}).then(done, (e) => done({ error: String(e) }));`,
			args: [],
		});
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
	await wd('POST', `/session/${id}/execute/sync`, { script: seedScript, args: [] });
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/playground/?view=edit` });
	const result = { ua: '', width: 0, steps: [], ok: false };
	try {
		const ready = await call(`lsPrepare(${SLIDES}, 0)`);
		if (ready?.error) throw new Error(ready.error);
		result.width = ready.width;
		result.ua = await wd('POST', `/session/${id}/execute/sync`, { script: 'return navigator.userAgent', args: [] });
		await call('lsWatch()');
		const second = await call('lsTarget()');
		if (!second) throw new Error('no slide after the first can be both tapped (its line on screen) and centered by the preview on this device');
		const TARGETS = [1, second];
		console.log(`${LABEL}: tapping slide 1 and slide ${second} alternately`);
		const rows = [];
		const methods = new Set();
		/** One tap on the line of `slide`: an element click first, then a touch tap by coordinates if the caret did not land. */
		const tap = async (label, slide) => {
			const before = await wd('POST', `/session/${id}/execute/sync`, { script: `${probe}\nreturn lsBefore();`, args: [] });
			await call('lsEvents()');
			const line = await wd('POST', `/session/${id}/execute/sync`, { script: `${probe}\nreturn lsFind(${slide});`, args: [] });
			const ref = line['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(line)[0];
			/** One way of tapping, tried until the caret lands: what each did, as the page saw it, goes into the failure message. */
			const attempts = [];
			const touch = (x, y, move, hold) => [
				{
					type: 'pointer',
					id: 'finger',
					parameters: { pointerType: 'touch' },
					actions: [
						{ type: 'pointerMove', duration: move, x, y },
						{ type: 'pointerDown', button: 0 },
						{ type: 'pause', duration: hold },
						{ type: 'pointerUp', button: 0 },
					],
				},
			];
			const mouse = (x, y) => [
				{
					type: 'pointer',
					id: 'mouse',
					parameters: { pointerType: 'mouse' },
					actions: [
						{ type: 'pointerMove', duration: 0, x, y },
						{ type: 'pointerDown', button: 0 },
						{ type: 'pause', duration: 50 },
						{ type: 'pointerUp', button: 0 },
					],
				},
			];
			const ways = [
				['element click', () => wd('POST', `/session/${id}/element/${ref}/click`, {})],
				['touch tap', async () => wd('POST', `/session/${id}/actions`, { actions: touch(...Object.values(await call(`lsCenter(${slide})`)), 0, 80) })],
				['slow touch tap', async () => wd('POST', `/session/${id}/actions`, { actions: touch(...Object.values(await call(`lsCenter(${slide})`)), 100, 200) })],
				['mouse click', async () => wd('POST', `/session/${id}/actions`, { actions: mouse(...Object.values(await call(`lsCenter(${slide})`))) })],
			];
			let method = '';
			const release = () => wd('DELETE', `/session/${id}/actions`).catch(() => {});
			for (const [name, run] of ways) {
				await release();
				await call('lsEvents()');
				let note = '';
				try {
					await run();
				} catch (e) {
					note = ` threw ${String(e.message).slice(0, 120)}`;
				}
				const landed = await call(`lsCaret(${slide}, 3000)`);
				const seen = await call('lsEvents()');
				await release();
				attempts.push(`${name}${note}: ${landed ? 'caret placed' : 'no caret'}; events ${JSON.stringify(seen)}`);
				if (landed) {
					method = name;
					break;
				}
				await call('lsEvents()');
			}
			if (!method) {
				const state = await call(`lsState(${slide})`);
				throw new Error(`${label} on slide ${slide}: no way of tapping placed the caret.\n  ${attempts.join('\n  ')}\n  page: ${state}`);
			}
			methods.add(method);
			console.log(`${LABEL}: ${label} on slide ${slide} landed by ${method}`);
			const row = await call(`lsAfter(${slide}, ${before})`);
			if (row?.error) throw new Error(`${label} on slide ${slide}: ${row.error}`);
			return row;
		};
		// Four taps on a quiet page first: they tell a tap that never lands (the harness) from one the burner starves.
		const quiet = [];
		for (let i = 0; i < 4; i++) quiet.push(await tap(`quiet tap ${i + 1}`, TARGETS[i % TARGETS.length]));
		const q = verdict(quiet);
		result.steps.push({ name: 'four taps on a quiet page', pass: q.ok, detail: `${q.uncentered} left the slide uncentered, ${q.jumps} moved the editor; landed by ${[...methods].join(', ')}` });
		if (q.uncentered) {
			// Say what the page looked like once, with the first slide that did not center.
			const miss = quiet.findIndex((x) => x.centered === false);
			result.steps.push({ name: 'a slide that did not center', pass: false, detail: `${await call(`lsState(${quiet[miss].slide})`)} frame: ${await call(`lsFrame(${quiet[miss].slide})`)}` });
		}
		await call(`lsBurn(${burn})`);
		for (let i = 0; i < TAPS; i++) rows.push(await tap(`tap ${i + 1}`, TARGETS[i % TARGETS.length]));
		const v = verdict(rows);
		result.steps.push({ name: `${v.taps} taps under the burner (${burn} ms)`, pass: v.ok, detail: `${v.uncentered} left the slide uncentered, ${v.jumps} moved the editor, worst ${Math.round(v.worst)} px` });
		result.rows = rows;
		if (!v.ok || !q.ok) result.error = `quiet: ${q.uncentered} uncentered, ${q.jumps} jumps of ${q.taps}; under the burner: ${v.uncentered} uncentered, ${v.jumps} jumps of ${v.taps}, worst ${Math.round(v.worst)} px`;
		result.ok = v.ok && q.ok;
	} catch (e) {
		result.error = String(e?.message ?? e);
	}
	return result;
}

async function runJpegProbe(id) {
	const { createJpegEncoder } = await import(path.join(ROOT, 'lib', 'core', 'jpeg-encode.mjs'));
	const probe = fs.readFileSync(path.join(here, 'jpeg-probe.js'), 'utf8');
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
	const images = JPEG_PICTURES.map((p) => ({ name: path.basename(p), b64: fs.readFileSync(path.join(ROOT, p)).toString('base64') }));
	const result = await wd('POST', `/session/${id}/execute/async`, {
		script: `${probe}\nconst done = arguments[arguments.length - 1];\nlatticeJpegProbe(${createJpegEncoder.toString()}, arguments[0]).then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
		args: [images],
	});
	if (result.reference) {
		const photo = new Function(`${probe}\nreturn syntheticPhoto;`)()(2560, 1440);
		const enc = createJpegEncoder({ width: 2560, height: 1440, quality: 90 });
		enc.addRows(photo, 1440);
		const sha = (b) => createHash('sha256').update(b).digest('hex');
		const same = sha(Buffer.from(result.reference, 'base64')) === sha(enc.finish());
		result.steps.push({ name: 'the same bytes as Node', pass: same, detail: same ? '' : 'Safari wrote different bytes from the same pixels' });
		if (!same) {
			result.ok = false;
			result.error = 'Safari wrote different bytes from the same pixels';
		}
		delete result.reference;
	}
	if (result.total) console.log(`${LABEL}: Safari's encoder ${result.total.native} B, ours ${result.total.ours} B over ${result.rows.length} pictures`);
	return result;
}

/**
 * The office probe (PROBE=office): each one-slide editable .pptx that tools/office-quicklook.mjs cut (its index.json),
 * opened in Mobile Safari, which previews an Office file with the same importer as Preview in the Files app, and
 * captured. One screenshot a slide, under office/ in the artifacts: the review is by eye against LibreOffice and Quick
 * Look, so a step fails only when Safari could not open the file or capture it.
 */
