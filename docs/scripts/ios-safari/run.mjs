/**
 * Drive Mobile Safari in ONE booted iOS Simulator through safaridriver and run a probe there: studio-probe.js in the real
 * Studio (PROBE=studio, the default), photo-probe.js in the real Studio (PROBE=photo), or jpeg-probe.js, the shared JPEG encoder against
 * Safari's own (PROBE=jpeg), or focus-sync-probe.js, real taps on the Playground's editor under a busy page
 * (PROBE=focus-sync).
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
					alwaysMatch: { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': UDID },
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
	if (platform !== 'ios') throw new Error(`the session is not iOS (platformName ${caps.platformName}): refusing a macOS fallback`);
	console.log(`${LABEL}: session on ${caps.platformName} ${caps.platformVersion || ''}, Safari ${caps.browserVersion || '?'}`);
	await wd('POST', `/session/${id}/timeouts`, { script: 240000, pageLoad: 180000 });
	const result = PROBE === 'jpeg' ? await runJpegProbe(id) : PROBE === 'focus-sync' ? await runFocusSyncProbe(id) : PROBE === 'photo' ? await runPhotoProbe(id) : await runStudioProbe(id);
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

/** Load a fresh Studio (settings seeded on its own origin first) and run one page-side probe in it. */
async function studioPage(id, file, fn) {
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
	await wd('POST', `/session/${id}/execute/sync`, { script: fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8'), args: [] });
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/studio/` });
	const probe = fs.readFileSync(path.join(here, file), 'utf8');
	return wd('POST', `/session/${id}/execute/async`, {
		script: `${probe}\nconst done = arguments[arguments.length - 1];\n${fn}().then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
		args: [],
	});
}

/**
 * The Studio suite (PROBE=studio): the preview payload probe, studio-probe.js. The photo suite (PROBE=photo): the photo verdict
 * probe, photo-probe.js. Each is its own platform suite with its own paths, so a sanitizer change does not pay for the photo
 * check and a Coach change does run it; together they used to make one job that ran out of its 30 minutes on a slow runner.
 */
async function runStudioProbe(id) {
	return studioPage(id, 'studio-probe.js', 'latticeStudioProbe');
}
async function runPhotoProbe(id) {
	return studioPage(id, 'photo-probe.js', 'latticePhotoProbe');
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
