/**
 * Drive Mobile Safari in ONE booted iOS Simulator through safaridriver and run a probe there: studio-probe.js, then panes-probe.js (and on
 * the iPhone, icon-grid-probe.js), in the
 * real Studio (PROBE=studio, the default), photo-probe.js in the real Studio (PROBE=photo), the photo memory arms of photo-memory.mjs
 * on pages of their own (PROBE=photo-memory), jpeg-probe.js, the shared JPEG encoder
 * against Safari's own (PROBE=jpeg), focus-sync-probe.js, real taps on the Playground's editor under a busy page
 * (PROBE=focus-sync), undo-probe.js, the Filo undo checks across a reload (PROBE=undo), or font-cache-probe.js, whether
 * the Studio's warmed fonts are read from Safari's cache (PROBE=font-cache, against font-cache-server.mjs), or chat-storage-probe.js,
 * chats moving from localStorage to IndexedDB across a reload and the localStorage allowance (PROBE=chat-storage), or what Present costs
 * on a deck of phone photos (PROBE=present-memory, present-memory.mjs and present-memory-probe.js), or chart detail cards in an
 * exported HTML player, opened and closed by real taps (PROBE=player-charts, player-charts.mjs). SIM_UDID=mac drives the
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
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { SLIDES, seedScript, TAPS, verdict } from './focus-sync-deck.mjs';
import { PLAYER_CHARTS_SOURCE, runPlayerCharts } from './player-charts.mjs';
import { inEditorOf, LONG_PRESS_MS, pressMovedOut, pressSelected, pressSelectedWord, tapClicked, tapHold, tapLag, tapVerdict } from './tap-guard.mjs';

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

async function wd(method, url, body, { timeoutMs } = {}) {
	const res = await fetch(`${WD}${url}`, {
		method,
		headers: { 'content-type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
		signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
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
 *
 * EVERY ATTEMPT IS BOUNDED (SESSION_TIMEOUT_MS, default 150 s). safaridriver gives up on a simulator by itself after about
 * 100-117 s ("timed out while connecting to a Safari instance"; nightlies 2026-11-06, 11-10, 11-13, 11-15), and the slowest
 * session it ever made took about 105 s from Safari's launch (2026-11-11). But on 2026-11-15 (run 43712612297) the attempt
 * after such a timeout got no reply at all: POST /session hung from 12:41:27 to 12:46:32, 305 s, until Node's own 300 s
 * headers timeout ended it as "fetch failed". A driver that holds a session request past 150 s is stuck: NO_SESSION, so
 * run.sh restarts it, in the time the job still has.
 *
 * SAFARI IS RELAUNCHED BEFORE EACH RETRY. A timed-out session leaves the simulator's Safari paired with it: the next attempt
 * was refused at once with "The Safari instance is already paired with another WebDriver session" (2026-11-10, run
 * 42819824102) or hung (2026-11-15). run.sh's in-place attempt relaunches Safari first, and on 2026-11-15 that attempt had a
 * session 23 s after the relaunch. The wait between attempts stays 20 s (2 s for the old Safari to go, 18 s for the new).
 * SAFARI_RELAUNCH_MS sets that wait for test/unit/tools/ios-safari-session.test.js only; unset, it is the same 2 s and 18 s.
 */
const ATTEMPTS = Number(process.env.SESSION_ATTEMPTS || 3);
const SESSION_TIMEOUT_MS = Number(process.env.SESSION_TIMEOUT_MS || 150000);
const RELAUNCH_MS = Number(process.env.SAFARI_RELAUNCH_MS || 20000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * One simctl call, bounded: a hung simctl must not hold the job either. A failure is logged, not fatal: the session decides.
 * 60 s, well under the 480 s that run.sh allows Safari's FIRST launch after a boot (its LAUNCH_LIMIT, from #3168): first
 * launches took 156 s and 252 s on run 43370280534, and 123 s on 43784118094. This relaunch hits an already booted device;
 * it took about 12 s on run 43776570714 and about 31 s on 43784118094. A relaunch past 60 s is logged and the retry still
 * runs; if that retry fails, run.mjs exits 3 and run.sh reboots for its second start, which pays the long first launch
 * under its own limit. A 480 s cap here would let one stuck relaunch spend 8 minutes first.
 * `terminate` gets 10 s of its own: in jobs 134052840145 and 134181405957 it ran out the full 60 s (ETIMEDOUT) and the launch
 * after it still started Safari and a session followed about 22 s later, so the wait bought nothing (ios-safari-font-cache).
 */
const SIMCTL_MS = { terminate: Number(process.env.SIMCTL_TERMINATE_MS || 10000) };
const simctl = (...args) => {
	try {
		execFileSync('xcrun', ['simctl', ...args], { stdio: 'inherit', timeout: SIMCTL_MS[args[0]] ?? 60000 });
	} catch (e) {
		console.log(`${LABEL}: xcrun simctl ${args.join(' ')} failed (${String(e.message).slice(0, 200)})`);
	}
};
async function createSession() {
	for (let attempt = 1; ; attempt++) {
		try {
			return await wd(
				'POST',
				'/session',
				{
					capabilities: {
						alwaysMatch: MAC ? { browserName: 'Safari', platformName: 'mac' } : { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': UDID },
					},
				},
				{ timeoutMs: SESSION_TIMEOUT_MS },
			);
		} catch (e) {
			const message = String(e.message);
			const stuck = e.name === 'TimeoutError';
			const gone = stuck || /fetch failed/.test(message) || e.cause?.code === 'ECONNREFUSED';
			if (gone || (attempt >= ATTEMPTS && /session not created/.test(message))) {
				const why = stuck ? `safaridriver did not answer POST /session within ${SESSION_TIMEOUT_MS} ms` : gone ? 'safaridriver is not answering' : `attempt ${attempt} of ${ATTEMPTS}`;
				console.log(`${LABEL}: no session (${why}): ${message.slice(0, 300)}`);
				process.exit(NO_SESSION);
			}
			if (!/session not created/.test(message)) throw e;
			console.log(`${LABEL}: session not created (attempt ${attempt} of ${ATTEMPTS}): ${message.slice(0, 200)}; relaunching Safari and trying again in 20 s`);
			if (MAC) {
				await sleep(RELAUNCH_MS);
			} else {
				simctl('terminate', UDID, 'com.apple.mobilesafari');
				await sleep(Math.min(2000, RELAUNCH_MS));
				simctl('launch', UDID, 'com.apple.mobilesafari');
				await sleep(RELAUNCH_MS - Math.min(2000, RELAUNCH_MS));
			}
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
	const result = PROBE === 'jpeg' ? await runJpegProbe(id) : PROBE === 'focus-sync' ? await runFocusSyncProbe(id) : PROBE === 'photo' ? await runPhotoProbe(id) : PROBE === 'undo' ? await runUndoProbe(id) : PROBE === 'chat-storage' ? await runChatStorageProbe(id) : PROBE === 'photo-memory' ? await runPhotoMemoryProbe(id) : PROBE === 'present-memory' ? await runPresentMemoryProbe(id) : PROBE === 'present-keepalive' ? await runPresentKeepaliveProbe(id) : PROBE === 'font-cache' ? await runFontCacheProbe(id) : PROBE === 'player-charts' ? await runPlayerChartsProbe(id) : await runStudioProbe(id);
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
 * the sheet focus probe (sheet-focus-probe.js, #3108) and the first-visit Compose probe (compose-probe.js), each on a fresh page, then on
 * the Compose page a touch tap on a paragraph and one on an empty deck's start grid (empty-deck-probe.js). One result: every step, each named for its probe, and a pass only when both pass. The photo suite
 * (PROBE=photo): the photo verdict probe, photo-probe.js. Each is its own platform suite with its own paths, so a sanitizer change
 * does not pay for the photo check and a Coach change does run it; together they used to make one job that ran out of its 30 minutes
 * on a slow runner. The photo memory arms (PROBE=photo-memory, #2998) are a suite of their own for the same reason: inside this
 * one they took the job to 27.6 minutes of its 30.
 */
async function runStudioProbe(id) {
	// A probe that fails gets its own screenshot NOW, before the next probe loads a fresh page over it: the session's one
	// screenshot is taken at the end, and on 2026-11-15 (run 43712612297) it showed the Compose probe's page, three probes
	// after the panes probe that failed.
	const shotIfFailed = async (name, r) => {
		if (r?.ok) return r;
		try {
			const png = await wd('GET', `/session/${id}/screenshot`);
			fs.writeFileSync(path.join(OUT, `${PROBE}-${LABEL}-${name}.png`), Buffer.from(png, 'base64'));
		} catch (e) {
			console.log(`${LABEL}: no screenshot of the failed ${name} probe (${e.message})`);
		}
		return r;
	};
	const preview = await shotIfFailed('preview', await studioPage(id, 'studio-probe.js', 'latticeStudioProbe'));
	const panes = await shotIfFailed('panes', await studioPage(id, 'panes-probe.js', 'latticePanesProbe'));
	// Focus back on the opener after a sheet closes (ui/sheet.tsx, #3108), in real Mobile Safari.
	const focus = await shotIfFailed('sheet-focus', await studioPage(id, 'sheet-focus-probe.js', 'latticeSheetFocusProbe'));
	// A first visit, with nothing stored: Compose is the default and its slide toolbar holds still (compose-probe.js).
	const compose = await shotIfFailed('compose', await composeProbePage(id));
	// Then a real touch tap on a Compose paragraph, on that page, from a blurred editor. The probe above taps only its first
	// stop (the one that focuses the editor) and places its later carets through the Selection API, which never shows the
	// keyboard.
	const tap = compose.ok ? await composeTouchTap(id) : { ok: false, steps: [], error: 'skipped: the Compose probe failed' };
	// Then the empty deck, on that page: a real touch on the start grid's canvas gives Compose's empty line the caret, the
	// "tap here to start writing" hint's promise (empty-deck-probe.js; 2026-11-17-compose-empty-deck.md).
	const empty = compose.ok ? await shotIfFailed('empty-deck', await emptyDeckTap(id)) : { ok: false, steps: [], error: 'skipped: the Compose probe failed' };
	// The icon grid's phone path (icon-grid-probe.js, #2578): the iPhone only, where Menu → Search / commands is the way in.
	const icons = LABEL === 'iPhone' ? await shotIfFailed('icon-grid', await iconGridProbe(id)) : { ok: true, steps: [] };
	const named = (label, r) => (r.steps || []).map((s) => ({ ...s, name: `${label} · ${s.name}` }));
	return {
		ok: !!preview.ok && !!panes.ok && !!focus.ok && !!compose.ok && !!tap.ok && !!empty.ok && !!icons.ok,
		error: [preview.error && `preview: ${preview.error}`, panes.error && `panes: ${panes.error}`, focus.error && `sheet focus: ${focus.error}`, compose.error && `compose: ${compose.error}`, tap.error && `compose tap: ${tap.error}`, empty.error && `empty deck tap: ${empty.error}`, icons.error && `icon grid: ${icons.error}`].filter(Boolean).join('; ') || undefined,
		ua: panes.ua ?? preview.ua,
		width: panes.width ?? preview.width,
		steps: [...named('preview', preview), ...named('panes', panes), ...named('sheet focus', focus), ...named('compose', compose), ...named('compose tap', tap), ...named('empty deck tap', empty), ...named('icon grid', icons)],
	};
}

// Function declarations, not consts: the probes start from top-level code above, before a later `const` line has run.
function tapLogInstall() {
	return `
	const log = (window.__tapLog = { t0: performance.now(), events: [] });
	const inEditorOf = ${inEditorOf.toString()};
	const name = (el) => (el && el.nodeType === 1 ? el.tagName + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + (el.textContent ? ' "' + el.textContent.trim().slice(0, 20) + '"' : '') : String(el && el.nodeName));
	if (!window.__tapLogOn) {
		window.__tapLogOn = true;
		for (const type of ['touchstart', 'touchend', 'touchcancel', 'pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'contextmenu']) {
			window.addEventListener(type, (e) => {
				const L = window.__tapLog;
				if (!L) return;
				const pt = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e;
				// The EVENT's own time (e.timeStamp, the same clock as performance.now()), not the listener's: a main thread blocked
				// between touchstart and touchend must not lengthen the hold the guard reads. lag is how late the listener ran.
				const now = performance.now();
				const at = e.timeStamp > 0 && e.timeStamp <= now ? e.timeStamp : now;
				L.events.push({ type, t: Math.round(at - L.t0), lag: Math.round(now - at), x: Math.round(pt.clientX), y: Math.round(pt.clientY), target: name(e.target), pointerType: e.pointerType || '' });
			}, { capture: true, passive: true });
		}
		// Focus moves too: a selection that leaves the editor names whoever took the focus (the undo doorbell, #3241's legend).
		for (const type of ['focusin', 'focusout']) {
			window.addEventListener(type, (e) => {
				const L = window.__tapLog;
				const el = e.target && e.target.nodeType === 1 ? e.target : null;
				const doorbell = !!(el && el.closest('[data-undo-doorbell]'));
				if (L) L.events.push({ type, t: Math.round(performance.now() - L.t0), lag: 0, x: 0, y: 0, inEditor: inEditorOf(el), doorbell, target: name(e.target) + (doorbell ? ' [undo doorbell]' : '') });
			}, { capture: true, passive: true });
		}
		document.addEventListener('selectionchange', () => {
			const L = window.__tapLog;
			if (!L) return;
			const sel = getSelection();
			const node = sel && sel.anchorNode;
			const host = node && (node.nodeType === 3 ? node.parentElement : node);
			L.events.push({ type: 'selectionchange', t: Math.round(performance.now() - L.t0), collapsed: !!(sel && sel.isCollapsed), inEditor: inEditorOf(host), text: sel ? String(sel).slice(0, 24) : '', target: name(node && node.nodeType === 3 ? node.parentElement : node) + (sel && !sel.isCollapsed && sel.focusNode ? ' .. focus in ' + name(sel.focusNode.nodeType === 3 ? sel.focusNode.parentElement : sel.focusNode) + ' @' + sel.focusOffset : '') });
		}, { capture: true, passive: true });
	}`;
}

/** One line for the tap log: the time from touchstart to touchend as the page saw it, where each event landed and on what, and the selection changes. */
function summarizeTapLog(log) {
	if (!log?.events) return 'no log';
	const ev = log.events;
	if (!ev.length) return 'NO EVENTS';
	const first = (type) => ev.find((e) => e.type === type);
	const ts = first('touchstart');
	const te = first('touchend') || first('touchcancel');
	const held = ts && te ? `${te.type === 'touchcancel' ? 'touchcancel' : 'touchend'} ${te.t - ts.t} ms after touchstart` : 'no touchstart/touchend pair';
	const parts = ev.map((e) => (e.type === 'selectionchange' ? `selectionchange@${e.t}${e.collapsed ? ' caret' : ` "${String(e.text).replace(/\s+/g, ' ').trim()}"`} in ${e.target}` : `${e.type}@${e.t}${e.lag ? `(+${e.lag})` : ''} ${e.x},${e.y} ${e.target}`));
	return `${held}; ${parts.slice(0, 30).join(' | ')}${parts.length > 30 ? ` | +${parts.length - 30} more` : ''}`;
}

/**
 * One finger touch at `at`, as a tap is: down then up with NO pause between them (a forced hold only for the long-press
 * control). The simulator stretches any hold it is sent: 150 ms arrived as 345 and 300 as 632 (dispatch 43798678775),
 * while taps with no pause arrived as 29-43 ms. Returns the gesture's WebDriver time in ms.
 */
async function touchAt(id, at, forcedHold = 0) {
	await wd('DELETE', `/session/${id}/actions`).catch(() => {});
	const t = Date.now();
	await wd('POST', `/session/${id}/actions`, {
		actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x: at.x, y: at.y }, { type: 'pointerDown', button: 0 }, ...(forcedHold ? [{ type: 'pause', duration: forcedHold }] : []), { type: 'pointerUp', button: 0 }] }],
	});
	const ms = Date.now() - t;
	await wd('DELETE', `/session/${id}/actions`).catch(() => {});
	return ms;
}

/**
 * The tap the Compose probe asks for at the stop that focuses the editor (compose-probe.js `tapInto`, #3291): delivered with
 * the same long-press guard as `composeTouchTap` (tap-guard.mjs), and judged by whether a caret landed in the block the
 * tapped point holds, with the editor focused. Returns the verdict the probe records as a step.
 */
async function probeTap(id, at) {
	const run = (script) => wd('POST', `/session/${id}/execute/sync`, { script, args: [] });
	const tries = [];
	for (let n = 1; n <= 2; n++) {
		if (n > 1) {
			// The multi-tap window: a second tap inside it is a double tap, which selects a word.
			await new Promise((r) => setTimeout(r, 1000));
			await run('document.activeElement?.blur?.(); getSelection()?.removeAllRanges();');
		}
		await run(tapLogInstall());
		const tapMs = await touchAt(id, at);
		const seen = await wd('POST', `/session/${id}/execute/async`, {
			args: [],
			script: `const done = arguments[arguments.length - 1];
				const t0 = performance.now();
				const read = () => {
					const sel = getSelection();
					const node = sel && sel.anchorNode;
					// The block under the tap point: the probe does not mark its target (a marked node is one ProseMirror redraws).
					const under = document.elementFromPoint(${at.x}, ${at.y});
					const block = under && under.closest('h1, h2, h3, h4, h5, h6, p, li');
					const inAim = !!(block && node && block.contains(node));
					const caret = !!(sel && sel.isCollapsed);
					const focused = !!(document.activeElement && document.activeElement.closest('.ProseMirror'));
					if ((inAim && caret && focused) || performance.now() - t0 > 4000) done({ inAim, caret, focused, picked: sel ? String(sel).slice(0, 40) : '', log: window.__tapLog || null });
					else requestAnimationFrame(read);
				};
				read();`,
		});
		const hold = tapHold(seen.log);
		const selected = pressSelected(seen.log);
		const decision = tapVerdict({ caret: seen.inAim && seen.caret && seen.focused, hold, selected, delivery: n, lag: tapLag(seen.log) });
		tries.push({ n, tapMs, hold, seen, decision });
		console.log(`${LABEL}: compose probe tap ${n} at ${at.x},${at.y} (${at.what}): gesture ${tapMs} ms; hold ${hold ?? 'none'} ms; ${decision}; page saw ${summarizeTapLog(seen.log)}`);
		if (decision !== 'redeliver') break;
		console.log(`${LABEL}: compose probe tap ${n} RE-DELIVERED: held ${hold} ms, ${redeliverWhy(seen.log)}`);
	}
	const last = tries.at(-1);
	const holds = tries.map((t) => `${t.hold ?? 'no touch'} ms`).join(', then ');
	const detail = `sent ${at.x},${at.y}; hold ${holds}${tries.length > 1 ? ` (the first was a long press, so the tap was delivered again: ${redeliverWhy(tries[0].seen.log)})` : ''}`;
	if (last.decision === 'pass') return { ok: true, detail };
	const why = last.decision === 'fail-long-press' ? 'the simulator delivered a long press both times' : last.decision === 'fail-sim-stall' ? simStall(last.seen.log) : `${last.seen.caret ? 'a caret' : `a SELECTION "${last.seen.picked}"`}${last.seen.inAim ? '' : ' outside the block'}${last.seen.focused ? '' : ', editor not focused'}${overBudget(last.hold)}`;
	return { ok: false, detail: `${detail}; ${why}` };
}

/** Why a tap is delivered again (tap-guard.mjs `pressSelected`): where Safari put the selection, so the job log shows it. */
function redeliverWhy(log) {
	const ends = (log?.events || []).filter((e) => e.type === 'selectionchange' && (e.collapsed === false || e.inEditor === false));
	const last = ends.at(-1);
	return last ? `Safari acted on a long press: ${last.collapsed ? 'a caret' : `"${String(last.text).trim()}"`} in ${last.target}${last.inEditor === false ? ', outside every editor' : ''}` : 'Safari acted on a long press';
}

/** A failed tap the guard reads as a stall (tap-guard.mjs `fail-sim-stall`): the hold, the lag, the click. It names no culprit. */
function simStall(log) {
	return `a STALLED tap (still a failure): held ${tapHold(log)} ms with the page's touch listeners ${tapLag(log)} ms late, and ${tapClicked(log) ? 'a' : 'NO'} click after the lift; the simulator or a long task on the page held it up`;
}

/** Said beside a failed tap held past the tap budget, so the report names a long press instead of passing for a tap's result. */
function overBudget(hold) {
	return hold !== null && hold >= LONG_PRESS_MS ? `; held ${hold} ms, over the ${LONG_PRESS_MS} ms tap budget, so Safari may have read a long press` : '';
}

/**
 * The first-visit Compose probe (compose-probe.js) on a fresh page with nothing stored, with a tap runner: the probe is
 * started without waiting for it, and each tap it asks for (`__latticeTapRequest`) is delivered over WebDriver actions by
 * `probeTap` and answered through `__latticeTapDone`, until the probe's result is in.
 */
async function composeProbePage(id) {
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
	// A FIRST VISIT, as the probe says: no settings AND no stored deck. It used to clear only the settings and open whatever deck
	// the probe before it had saved, so a panes probe that timed out left it studio-probe.js's one-slide deck and a different
	// probe (iPad run 44850293408, F7 in flaky-tests.md). probe.selftest.mjs gives each probe a fresh context, so it already
	// ran this probe on the first-visit deck.
	await wd('POST', `/session/${id}/execute/sync`, { script: "try { for (const k of Object.keys(localStorage)) if (k.startsWith('lattice-studio-')) localStorage.removeItem(k); } catch {}", args: [] });
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/studio/` });
	const probe = withEditorHelper(fs.readFileSync(path.join(here, 'compose-probe.js'), 'utf8'));
	await wd('POST', `/session/${id}/execute/sync`, {
		script: `${probe}\nwindow.__latticeTapBridge = true; window.__latticeTapRequest = null; window.__composeResult = null;\nlatticeComposeProbe().then((r) => { window.__composeResult = r; }, (e) => { window.__composeResult = { ok: false, error: String(e), steps: [] }; });\nreturn true;`,
		args: [],
	});
	for (;;) {
		// One wait per message from the probe, bounded by the session's script timeout (360 s), as the probe's single call was.
		const next = await wd('POST', `/session/${id}/execute/async`, {
			args: [],
			script: `const done = arguments[arguments.length - 1];
				const look = () => {
					const req = window.__latticeTapRequest;
					if (window.__composeResult) done({ result: window.__composeResult });
					else if (req && !req.taken) { req.taken = true; done({ tap: { x: req.x, y: req.y, what: req.what } }); }
					else setTimeout(look, 100);
				};
				look();`,
		});
		if (next.result) return next.result;
		const verdict = await probeTap(id, next.tap);
		await wd('POST', `/session/${id}/execute/sync`, { script: 'window.__latticeTapDone(arguments[0]); return true;', args: [verdict] });
	}
}

/** The WebDriver round trip for a no-op script, the baseline the tap's gesture time is read against (median of three). */
async function wdRoundTrip(id) {
	const times = [];
	for (let i = 0; i < 3; i++) {
		const t = Date.now();
		await wd('POST', `/session/${id}/execute/sync`, { script: 'return 1;', args: [] });
		times.push(Date.now() - t);
	}
	return times.sort((a, b) => a - b)[1];
}

/**
 * The icon grid on the phone (icon-grid-probe.js, #2578 P2): from the Markdown source pane, then from the Preview pane, open the
 * grid through Menu → Search / commands → Insert an icon…, pick the first icon with a real WebDriver touch tap (the clipboard
 * write needs a user gesture), and read what the pick did: the span in the editor, or the copied toast. A screenshot of each
 * result goes in the artifacts, so a person sees the toast.
 */
async function iconGridProbe(id) {
	const source = withEditorHelper(fs.readFileSync(path.join(here, 'icon-grid-probe.js'), 'utf8'));
	const call = (expr) => wd('POST', `/session/${id}/execute/async`, { script: `${source}\nconst done = arguments[arguments.length - 1];\n${expr}.then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`, args: [] });
	const steps = [];
	let first = true;
	for (const where of ['source', 'preview']) {
		if (first) {
			await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
			await wd('POST', `/session/${id}/execute/sync`, { script: fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8'), args: [] });
			await wd('POST', `/session/${id}/url`, { url: `${BASE}/studio/` });
			first = false;
		}
		const open = await call(`latticeIconGridOpen(${JSON.stringify(where)})`);
		steps.push(...(open.steps || []));
		if (!open.ok) return { ok: false, steps, error: `${where}: ${open.error}`, ua: open.ua, width: open.width };
		await wd('DELETE', `/session/${id}/actions`).catch(() => {});
		// NO HOLD between down and up: a hold can read as a long press on a slow simulator (composeTouchTap).
		await wd('POST', `/session/${id}/actions`, {
			actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x: open.x, y: open.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }],
		});
		await wd('DELETE', `/session/${id}/actions`).catch(() => {});
		const check = await call(`latticeIconGridCheck(${JSON.stringify(where)}, ${JSON.stringify(open.name)}, ${Number(open.before) || 0})`);
		steps.push(...(check.steps || []));
		try {
			const png = await wd('GET', `/session/${id}/screenshot`);
			fs.writeFileSync(path.join(OUT, `${PROBE}-${LABEL}-icon-grid-${where}.png`), Buffer.from(png, 'base64'));
		} catch (e) {
			console.log(`${LABEL}: no screenshot of the icon grid's ${where} pick (${e.message})`);
		}
		if (!check.ok) return { ok: false, steps, error: `${where}: ${check.error}` };
	}
	return { ok: true, steps };
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
			p.scrollIntoView({ block: 'center', behavior: 'instant' });
			return { text: p.textContent.slice(0, 40), vv: visualViewport ? visualViewport.height : innerHeight };`);
		if (!target) return { ok: false, steps, error: 'no Compose paragraph to tap' };
		// WHERE TO TAP, once the paragraph holds still. A slow simulator (runs 43522383932, 18.5 s and 6.8 s gestures) was
		// still scrolling or settling the page when the point was read, so the tap landed beside the paragraph: nothing was
		// selected, the editor never took the focus, and the caret stayed where it was. The point is read after the box has
		// stayed put for five frames (a signal, not a sleep), and only when the paragraph is the element under it.
		const aimAt = () => wd('POST', `/session/${id}/execute/async`, {
			args: [],
			script: `const done = arguments[arguments.length - 1];
				const t0 = performance.now();
				let last = '';
				let still = 0;
				const look = () => {
					const p = [...document.querySelectorAll('#studio-pane-editor .cs-host .ProseMirror > .cs-slide p')].filter((p) => p.textContent.trim().length > 8)[window.__touchIndex];
					const r = p.getBoundingClientRect();
					const x = Math.round(r.left + Math.min(r.width / 2, 40));
					const y = Math.round(r.top + r.height / 2);
					const key = x + ',' + y;
					still = key === last ? still + 1 : 0;
					last = key;
					const under = document.elementFromPoint(x, y);
					const hit = !!(under && p.contains(under));
					if ((still >= 5 && hit) || performance.now() - t0 > 10000) done({ x, y, still, hit, under: under ? under.tagName + '.' + under.className : 'none' });
					else requestAnimationFrame(look);
				};
				look();`,
		});
		let at = await aimAt();
		if (!at.hit) return { ok: false, steps, error: `the paragraph never held still under its tap point: at ${at.x},${at.y} the page shows ${at.under} (still for ${at.still} frames)` };
		// ONE DELIVERY: the touch, then what the page saw of it. WHAT THE PAGE SEES is a capture-phase log of every touch, pointer
		// and mouse event (time, clientX/clientY, target) and of each selectionchange and contextmenu, read back beside the point
		// WebDriver was sent. Its hold (touchstart to touchend) is logged on every delivery (followups.d/3223-p1).
		const rtt = await wdRoundTrip(id);
		const deliver = async (n, forcedHold = 0) => {
			await run('document.activeElement?.blur?.(); getSelection()?.removeAllRanges();');
			await run(tapLogInstall());
			await wd('DELETE', `/session/${id}/actions`).catch(() => {});
			// NO HOLD between down and up. A tap has none, and the simulator can stretch a hold: with an 80 ms pause here, a slow
			// iPad simulator (run 43266767594, the one whose session had already timed out once) read the tap as a long press and
			// selected the word under the finger, so the paragraph held a range, not a caret, and correctly got no caret-line mark.
			const tapMs = await touchAt(id, at, forcedHold);
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
						if ((inP && caret && focused && marked) || performance.now() - t0 > 4000) done({ inP, caret, picked: sel ? String(sel).slice(0, 40) : '', focused, marked, vv: visualViewport ? visualViewport.height : innerHeight, active: document.activeElement && document.activeElement.className, where: node ? (node.nodeType === 3 ? node.parentElement : node)?.tagName + ' "' + String(node.textContent).slice(0, 30) + '"' : 'nothing', log: window.__tapLog || null });
						else requestAnimationFrame(read);
					};
					read();`,
			});
			const hold = tapHold(seen.log);
			const selected = pressSelected(seen.log);
			const landed = summarizeTapLog(seen.log);
			console.log(`${LABEL}: compose tap delivery ${n}: sent ${at.x},${at.y}; gesture ${tapMs} ms (WebDriver round trip ${rtt} ms); hold the page saw ${hold ?? 'none'} ms${selected ? (hold !== null && hold >= LONG_PRESS_MS ? ', which Safari answered as a long press' : ', a selection that left the editor (a short hold, so not a long press)') : ''}; page saw ${landed}; result ${seen.caret ? 'caret' : `SELECTED "${seen.picked}"`} in ${seen.where}`);
			return { seen, tapMs, hold, selected, landed, at: { x: at.x, y: at.y } };
		};
		// THE PRECONDITION, NOT A RETRY (tap-guard.mjs; the flaky-test coordinator's approval, 2026-11-16). A gesture the page saw
		// held for LONG_PRESS_MS or more was a long press, not the tap this step tests, and is delivered once more after the
		// multi-tap window (a second tap inside it is a double tap, which selects a word: a duration by its nature). A short tap
		// that misses the caret fails at once.
		const tries = [await deliver(1)];
		let decision = tapVerdict({ caret: tries[0].seen.inP && tries[0].seen.caret, hold: tries[0].hold, selected: tries[0].selected, delivery: 1, lag: tapLag(tries[0].seen.log) });
		if (decision === 'redeliver') {
			console.log(`${LABEL}: compose tap RE-DELIVERED: held ${tries[0].hold} ms, ${redeliverWhy(tries[0].seen.log)}`);
			await new Promise((r) => setTimeout(r, 1000));
			// AIM AGAIN. A long press selects, and iOS can scroll the editor to show that selection, so the first point can sit
			// on another block by now: on job 137066156788 the re-sent tap at the same point landed in H2 "Probe slide two",
			// above the paragraph (followups.d/3385-p2-ios-empty-deck-tap-focus.md). Read the paragraph's point again, held
			// still five frames as before.
			const again = await aimAt();
			if (again.hit) at = again;
			else console.log(`${LABEL}: compose tap re-aim found no still point (${again.under} at ${again.x},${again.y}); re-sending at ${at.x},${at.y}`);
			tries.push(await deliver(2));
			decision = tapVerdict({ caret: tries[1].seen.inP && tries[1].seen.caret, hold: tries[1].hold, selected: tries[1].selected, delivery: 2, lag: tapLag(tries[1].seen.log) });
		}
		const { seen, tapMs } = tries.at(-1);
		const holds = tries.map((t) => `${t.hold ?? 'no touch'} ms`).join(', then ');
		const why =
			decision === 'fail-long-press'
				? `, but the simulator delivered a long press, not a tap, on both deliveries (holds ${holds}; iOS reads ${LONG_PRESS_MS} ms or more as a long press)`
				: decision === 'fail-sim-stall'
					? `; ${simStall(tries.at(-1).seen.log)}`
					: `${seen.caret ? '' : `, but it SELECTED "${seen.picked}"`}${seen.inP ? '' : `; the selection sits in ${seen.where}`}${overBudget(tries.at(-1).hold)}`;
		step('a touch tap puts the caret in the tapped paragraph', decision === 'pass', `"${target.text}" at ${at.x},${at.y} (held still ${at.still} frames), gesture ${tapMs} ms, hold ${holds}${tries.length > 1 ? ` (the first was a long press, so the tap was delivered again: ${redeliverWhy(tries[0].seen.log)})` : ''}${decision === 'pass' ? '' : why}`);
		step('the editor has the focus after the tap', seen.focused, `active: ${seen.active}`);
		step('the tapped paragraph carries the caret-line mark', seen.marked);
		step('the software keyboard (detail only)', true, seen.vv < target.vv - 100 ? `up: viewport ${target.vv} to ${seen.vv}` : `not shown: viewport ${target.vv} to ${seen.vv}`);
		step('what the page saw of the tap (detail only)', true, tries.map((t, i) => `delivery ${i + 1}: sent ${t.at.x},${t.at.y}; ${t.landed}`).join(' || '));
		// A POSITIVE CONTROL for the guard, after the verdict and deciding nothing: one long press made on purpose (a 500 ms hold,
		// which the simulator stretches further), then the re-delivery the guard asks for. It shows, on the real simulator, that
		// the page's log reads a long press as one and that the tap delivered after it puts the caret back. It costs 9 to 14 s
		// a device (dispatch 43804038465), and its own try: a WebDriver error inside it is recorded here, never a red job.
		try {
			await new Promise((r) => setTimeout(r, 1000));
			const forced = await deliver('control-1', 500);
			const forcedCall = tapVerdict({ caret: forced.seen.inP && forced.seen.caret, hold: forced.hold, selected: forced.selected, delivery: 1 });
			let recovered = null;
			let stale = null;
			let moved = 0;
			if (forcedCall === 'redeliver') {
				await new Promise((r) => setTimeout(r, 1000));
				// THE RE-AIM'S FAILING ARM, made on purpose (the checker on #3444). A long press's selection can scroll the editor
				// so the first point sits on another block (job 137066156788), but no run produces that on demand. So scroll the
				// editor's scroller by 100 px, tap once at the OLD point (it should miss the paragraph), then aim again and tap
				// (it should put the caret). Detail only: both outcomes are recorded, neither decides the job.
				moved = await run(`const p = [...document.querySelectorAll('#studio-pane-editor .cs-host .ProseMirror > .cs-slide p')].filter((p) => p.textContent.trim().length > 8)[window.__touchIndex];
					let el = p && p.parentElement;
					while (el && !(el.scrollHeight > el.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
					if (!el) return 0;
					const before = el.scrollTop;
					el.scrollTop = before + 100;
					if (el.scrollTop === before) el.scrollTop = before - 100;
					return el.scrollTop - before;`);
				if (moved) stale = await deliver('control-stale');
				// Aim again, as the guarded tap above does.
				const again = await aimAt();
				if (again.hit) at = again;
				else console.log(`${LABEL}: control re-aim found no still point (${again.under} at ${again.x},${again.y}); re-sending at ${at.x},${at.y}`);
				recovered = await deliver('control-2');
			}
			// Each of `pressSelected`'s two clauses on its own, so the release-jump clause (#3241) has a real-simulator artifact even
			// when the word clause catches the press first, plus where the selection sat after the lift (the checker on #3368).
			const flog = forced.seen.log;
			const lifted = (flog?.events || []).filter((e) => e.type === 'selectionchange').at(-1);
			const clauses = `word clause ${pressSelectedWord(flog) ? 'yes' : 'no'}, release-jump clause ${pressMovedOut(flog) ? 'yes' : 'no'}, last selection inEditor ${lifted ? String(lifted.inEditor) : 'none'}`;
			step('the long-press guard: a forced long press, then its re-delivery (detail only)', true, `forced hold ${forced.hold ?? 'no touch'} ms -> ${forcedCall} (${clauses})${stale ? `; editor scrolled ${moved} px, then a tap at the old point ${stale.at.x},${stale.at.y} -> ${stale.seen.inP && stale.seen.caret ? 'caret in the paragraph (the scroll did not move it off the point)' : `missed the paragraph: the touch landed on ${(stale.seen.log?.events || []).find((e) => e.type === 'pointerdown' || e.type === 'touchstart')?.target ?? 'nothing the page saw'} and left ${stale.seen.caret ? 'a caret' : `a selection ("${stale.seen.picked}")`} in ${stale.seen.where}`}` : forcedCall === 'redeliver' ? '; the editor would not scroll, so no stale-point arm' : ''}${recovered ? `; re-aimed to ${recovered.at.x},${recovered.at.y}, re-delivered hold ${recovered.hold ?? 'no touch'} ms -> ${recovered.seen.inP && recovered.seen.caret ? 'caret in the paragraph' : `no caret (SELECTED "${recovered.seen.picked}" in ${recovered.seen.where})`}` : ''}`);
		} catch (e) {
			step('the long-press guard: a forced long press, then its re-delivery (detail only)', true, `not run: ${String(e.message || e).slice(0, 200)}`);
		}
		return { ok: steps.every((x) => x.pass), steps };
	} catch (e) {
		return { ok: false, steps, error: String(e.message || e) };
	}
}

/**
 * The player chart suite (PROBE=player-charts, player-charts.mjs): chart detail cards in two exported HTML players, which
 * run.sh exports with the real CLI and serves at STUDIO_URL. The taps are WebDriver touches with no hold between down and
 * up (composeTouchTap says why), and each returns how long the gesture took, so a tap read as a long press names itself.
 */
async function runPlayerChartsProbe(id) {
	return runPlayerCharts({
		players: { deck: `${BASE}/chart-detail-reveal.html`, hostile: `${BASE}/hostile.html` },
		go: (url) => wd('POST', `/session/${id}/url`, { url }),
		call: (expr) =>
			wd('POST', `/session/${id}/execute/async`, {
				args: [],
				script: `${PLAYER_CHARTS_SOURCE}\nconst done = arguments[arguments.length - 1];\nPromise.resolve().then(() => ${expr}).then(done, (e) => done({ ok: false, error: String(e) }));`,
			}),
		tap: async (x, y) => {
			await wd('DELETE', `/session/${id}/actions`).catch(() => {});
			const t0 = Date.now();
			await wd('POST', `/session/${id}/actions`, {
				actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x, y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }],
			});
			const ms = Date.now() - t0;
			await wd('DELETE', `/session/${id}/actions`).catch(() => {});
			return ms;
		},
		swipe: async (x1, y1, x2, y2) => {
			await wd('DELETE', `/session/${id}/actions`).catch(() => {});
			await wd('POST', `/session/${id}/actions`, {
				actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x: x1, y: y1 }, { type: 'pointerDown', button: 0 }, { type: 'pointerMove', duration: 250, x: x2, y: y2 }, { type: 'pointerUp', button: 0 }] }],
			});
			await wd('DELETE', `/session/${id}/actions`).catch(() => {});
		},
	});
}

/**
 * THE EMPTY DECK'S CANVAS TAP (empty-deck-probe.js), on the Compose page the tap above left: the page empties the deck and
 * names a still point on the start grid's own background, WebDriver sends one touch there, and the page reads the result:
 * the editor has the focus, a caret sits in the empty line, and the grid is still up. Then the page puts the deck back in Source, so
 * the icon grid probe after this sees the deck it expects. The long-press precondition is composeTouchTap's (tap-guard.mjs).
 */
async function emptyDeckTap(id) {
	const probe = withEditorHelper(fs.readFileSync(path.join(here, 'empty-deck-probe.js'), 'utf8'));
	const page = (call) => wd('POST', `/session/${id}/execute/async`, { args: [], script: `${probe}\nconst done = arguments[arguments.length - 1];\n(${call}).then(done, (e) => done({ error: String(e) }));` });
	const steps = [];
	const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail: String(detail) });
	let saved = null;
	try {
		const prep = await page('latticeEmptyDeckPrep()');
		if (prep.error) return { ok: false, steps, error: `emptying the deck: ${prep.error}` };
		saved = prep.saved;
		step('the start grid shows on the emptied deck, with a still point on its background', prep.hit, `${prep.x},${prep.y} under ${prep.under}, still ${prep.still} frames`);
		step('the editor does not have the focus before the tap', !prep.focusedBefore);
		if (prep.hit) {
			const deliver = async (n) => {
				await wd('POST', `/session/${id}/execute/sync`, { script: tapLogInstall(), args: [] });
				await wd('DELETE', `/session/${id}/actions`).catch(() => {});
				// NO HOLD between down and up, for composeTouchTap's reason: a simulator can stretch a hold into a long press.
				await wd('POST', `/session/${id}/actions`, {
					actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x: prep.x, y: prep.y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }],
				});
				await wd('DELETE', `/session/${id}/actions`).catch(() => {});
				const seen = await page('latticeEmptyDeckRead()');
				const hold = tapHold(seen.log);
				console.log(`${LABEL}: empty deck tap delivery ${n}: sent ${prep.x},${prep.y}; hold ${hold ?? 'none'} ms; page saw ${summarizeTapLog(seen.log)}`);
				return { seen, hold, selected: pressSelected(seen.log) };
			};
			const tries = [await deliver(1)];
			let decision = tapVerdict({ caret: tries[0].seen.focused && tries[0].seen.inLine && tries[0].seen.caret, hold: tries[0].hold, selected: tries[0].selected, delivery: 1, lag: tapLag(tries[0].seen.log) });
			if (decision === 'redeliver') {
				console.log(`${LABEL}: empty deck tap RE-DELIVERED: held ${tries[0].hold} ms, ${redeliverWhy(tries[0].seen.log)}`);
				await new Promise((r) => setTimeout(r, 1000));
				tries.push(await deliver(2));
				decision = tapVerdict({ caret: tries[1].seen.focused && tries[1].seen.inLine && tries[1].seen.caret, hold: tries[1].hold, selected: tries[1].selected, delivery: 2, lag: tapLag(tries[1].seen.log) });
			}
			const { seen } = tries.at(-1);
			const holds = tries.map((t) => `${t.hold ?? 'no touch'} ms`).join(', then ');
			step('a tap on the canvas gives the editor the focus', seen.focused, `active: ${seen.active}; hold ${holds}${decision === 'fail-long-press' ? ` (a long press on both deliveries; iOS reads ${LONG_PRESS_MS} ms or more as one)` : decision === 'fail-sim-stall' ? `; ${simStall(seen.log)}` : ''}`);
			step('a caret, not a range, sits in the empty line', seen.inLine && seen.caret, `in ${seen.where}`);
			step('the start grid stays until something is typed', seen.shown);
			step('the software keyboard (detail only)', true, seen.vv < prep.vv - 100 ? `up: viewport ${prep.vv} to ${seen.vv}` : `not shown: viewport ${prep.vv} to ${seen.vv}`);
		}
	} catch (e) {
		step('the empty deck tap ran', false, String(e.message || e).slice(0, 300));
	}
	// Always put the deck back, pass or fail: the probes after this one read it.
	if (saved !== null) {
		const back = await page(`latticeEmptyDeckRestore(${JSON.stringify(saved)})`).catch((e) => ({ error: String(e.message || e) }));
		step('the saved deck is back in Source', back === true, back === true ? `${saved.length} characters` : back?.error);
	}
	return { ok: steps.length > 0 && steps.every((x) => x.pass), steps };
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
 * The Present keep-alive probe (PROBE=present-keepalive, PR #3333): what keeps a playing deck playing on an iPhone, in
 * real Mobile Safari. Present opens on the Studio's own deck and must hold a screen wake lock; Fullscreen, which iPhone
 * Safari cannot grant, turns on the immersive layout and its chrome fades; a REAL WebDriver touch tap on the slide brings
 * the chrome back; Play puts the captions on the slide with a moving highlight; Next while playing plays the next slide
 * on its own with the lock still held; closing stops the narration. The verdict is present-keepalive-probe.js
 * `latticeKeepaliveChecks`: states reached, never durations (HARD RULE #32).
 */
async function runPresentKeepaliveProbe(id) {
	const source = fs.readFileSync(path.join(here, 'present-keepalive-probe.js'), 'utf8');
	const call = async (expr) => {
		const r = await wd('POST', `/session/${id}/execute/async`, { script: `${source}\nconst done = arguments[arguments.length - 1];\nPromise.resolve().then(() => ${expr}).then(done, (e) => done({ error: String(e) }));`, args: [] });
		if (r?.error) throw new Error(`${expr}: ${r.error}`);
		return r;
	};
	const touchTap = (x, y) => wd('POST', `/session/${id}/actions`, { actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: [{ type: 'pointerMove', duration: 0, x, y }, { type: 'pointerDown', button: 0 }, { type: 'pointerUp', button: 0 }] }] }).then(() => wd('DELETE', `/session/${id}/actions`).catch(() => {}));
	// WebDriver's ELEMENT click: a real user gesture to Safari (it grants activation, so the wake lock), with no finger hold
	// for a slow simulator to stretch into a long press. Scripted touches did exactly that on three of four macOS runs
	// (holds of 406 to 25318 ms). The element comes back from a sync script as a WebDriver reference, as focus-sync does.
	const elementClick = async (expr) => {
		const el = await wd('POST', `/session/${id}/execute/sync`, { script: `${source}\nreturn ${expr};`, args: [] });
		const ref = el?.['element-6066-11e4-a52e-4f735466cecf'] ?? (el ? Object.values(el)[0] : null);
		if (!ref) throw new Error(`no element for ${expr}`);
		await wd('POST', `/session/${id}/element/${ref}/click`, {});
	};
	const r = {};
	let error = '';
	try {
		await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
		await wd('POST', `/session/${id}/execute/sync`, { script: fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8'), args: [] });
		await wd('POST', `/session/${id}/url`, { url: `${BASE}/studio/` });
		await call('latticeKeepaliveArmErrors()');
		// Present opens from a REAL touch: WebKit grants the wake lock only inside a user gesture.
		// A slow simulator can stretch a WebDriver tap into a long press, which iOS never turns into a click (tap-guard.mjs,
		// followups.d/3223-p1). Read the hold the page saw; a long press is delivered again ONCE, the shape tap-guard uses.
		await call('latticeKeepalivePresentAt()');
		const holds = [];
		let opened = false;
		await call('latticeKeepaliveArmTap()');
		await elementClick('latticeKeepaliveHelpers().presentButton()');
		// A slow simulator can take well past 8 s to open Present from a click (run 44774104460: Safari took 175 s to launch).
		// Wait for the state with a wide bound, and never touch the button's spot once Present is up: the dialog covers it.
		const clicked = await call('latticeKeepaliveOpened(30000)');
		opened = clicked.open;
		holds.push(opened ? 'an element click' : `an element click that opened nothing (the page saw: ${(clicked.log?.events || []).map((e) => e.type).join(' ') || 'no event'})`);
		for (let attempt = 0; attempt < 2 && !opened; attempt++) {
			// Measured again each time: the element click scrolls the button into view, so an earlier position is stale.
			const at = await call('latticeKeepalivePresentAt()');
			await call('latticeKeepaliveArmTap()');
			await touchTap(at.x, at.y);
			const o = await call('latticeKeepaliveOpened(8000)');
			const hold = tapHold(o.log);
			holds.push(hold === null ? 'a touch the page never saw' : `a touch held ${hold} ms`);
			opened = o.open;
			if (hold !== null && hold < LONG_PRESS_MS) break;
		}
		r.taps = holds.join(', then ');
		r.open = await call('latticeKeepaliveOpen()');
		r.immersive = await call('latticeKeepaliveImmersive()');
		// A real finger: a WebDriver touch at the slide, as the owner taps it, re-delivered ONCE if iOS read it as a long press
		// (no click follows a long press, so the tap rule never sees it): the same guard as the Present tap above.
		const slideHolds = [];
		await call('latticeKeepaliveArmTap()');
		await elementClick('latticeKeepaliveHelpers().backdrop()');
		r.shown = await call('latticeKeepaliveShown()');
		slideHolds.push(r.shown.shown ? 'an element click' : 'an element click that showed nothing');
		for (let attempt = 0; attempt < 2 && !r.shown.shown; attempt++) {
			await call('latticeKeepaliveArmTap()');
			await touchTap(r.immersive.x, r.immersive.y);
			r.shown = await call('latticeKeepaliveShown()');
			const hold = tapHold(await call('({ events: (window.__kaTap || { events: [] }).events })'));
			slideHolds.push(hold === null ? 'a touch the page never saw' : `a touch held ${hold} ms`);
			if (hold !== null && hold < LONG_PRESS_MS) break;
		}
		r.slideTaps = slideHolds.join(', then ');
		r.wakeAfterTap = await call('latticeKeepaliveWake()');
		r.play = await call('latticeKeepalivePlay()');
		r.next = await call('latticeKeepaliveNext()');
		r.close = await call('latticeKeepaliveClose()');
		r.voiceOn = await call('latticeKeepaliveVoiceOn()');
	} catch (e) {
		error = String(e.message || e).slice(0, 300);
	}
	// The verdict runs in Node from the same source the page ran (its functions touch no DOM at definition).
	const sandbox = {};
	vm.createContext(sandbox);
	vm.runInContext(source, sandbox);
	const steps = sandbox.latticeKeepaliveChecks(r, { realSafari: true });
	if (error) steps.push({ name: 'the probe ran to the end', pass: false, detail: error });
	console.log(`${LABEL}: present keep-alive: ${steps.map((s) => `${s.pass ? 'ok' : 'FAIL'} ${s.name}${s.detail ? ` (${s.detail})` : ''}`).join(' | ')}`);
	const failed = steps.filter((s) => !s.pass);
	return { ok: failed.length === 0, error: failed.map((s) => s.name).join('; ') || undefined, ua: r.open?.ua, width: r.open?.width, steps };
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
		// Seeded on the server's blank page, not the landing page: the landing page's slide previews fetch faces (8 at the
		// iPad's width), and on the warm port the Studio then read those from the cache, so the server never saw them and the
		// warm arm could not prove the Studio warmed all 31 itself (#3095). `since` is stamped before the first page of this
		// origin, so the probe can check that nothing before the Studio fetched a face.
		const since = Date.now();
		await wd('POST', `/session/${id}/url`, { url: `${origin}/__probe/blank` });
		await wd('POST', `/session/${id}/execute/sync`, { script: fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8'), args: [] });
		await wd('POST', `/session/${id}/url`, { url: `${origin}/studio/` });
		last = await wd('POST', `/session/${id}/execute/async`, {
			script: `${source}\nconst done = arguments[arguments.length - 1];\nlatticeFontCacheProbe(${JSON.stringify(arm)}, ${since}).then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
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
		if (second?.error) throw new Error(second.error);
		if (!second) throw new Error('no slide after the first can be both tapped (its line on screen) and centered by the preview on this device');
		const TARGETS = [1, second];
		console.log(`${LABEL}: tapping slide 1 and slide ${second} alternately`);
		/** The slide tap `i` aims at. The preview can still change height after the pick, and a slide it can no longer
		 *  center fails every tap for the page's geometry, not the sync's: pick again, and say so in the log. */
		const aim = async (i) => {
			if (i % 2 === 0) return 1;
			if (!(await call(`lsCenterable(${TARGETS[1]})`))) {
				const next = await call('lsTarget()');
				if (next?.error) throw new Error(next.error);
				if (!next) throw new Error(`slide ${TARGETS[1]} can no longer be centered and no other slide can: ${await call(`lsFrame(${TARGETS[1]})`)}`);
				console.log(`${LABEL}: the preview changed height, so slide ${TARGETS[1]} can no longer be centered: tapping slide ${next} instead`);
				TARGETS[1] = next;
			}
			return TARGETS[1];
		};
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
		for (let i = 0; i < 4; i++) quiet.push(await tap(`quiet tap ${i + 1}`, await aim(i)));
		const q = verdict(quiet);
		result.steps.push({ name: 'four taps on a quiet page', pass: q.ok, detail: `${q.uncentered} left the slide uncentered, ${q.jumps} moved the editor; landed by ${[...methods].join(', ')}` });
		if (q.uncentered) {
			// Say what the page looked like once, with the first slide that did not center.
			const miss = quiet.findIndex((x) => x.centered === false);
			result.steps.push({ name: 'a slide that did not center', pass: false, detail: `${await call(`lsState(${quiet[miss].slide})`)} frame: ${await call(`lsFrame(${quiet[miss].slide})`)}` });
		}
		await call(`lsBurn(${burn})`);
		for (let i = 0; i < TAPS; i++) rows.push(await tap(`tap ${i + 1}`, await aim(i)));
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
	const { createJpegEncoder } = await import('@laticent/lastra');
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
