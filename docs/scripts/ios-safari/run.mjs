/**
 * Drive Mobile Safari in ONE booted iOS Simulator through safaridriver and run a probe there: studio-probe.js and then
 * photo-probe.js in the real Studio (PROBE=studio, the default), or jpeg-probe.js, the shared JPEG encoder against
 * Safari's own (PROBE=jpeg), or focus-sync-probe.js, real taps on the Playground's editor under a busy page
 * (PROBE=focus-sync).
 * Plain WebDriver over fetch: no client library, so nothing new to install on the macOS runner.
 *
 *   SIM_UDID=<udid> SIM_LABEL=iPad [PROBE=jpeg] node scripts/ios-safari/run.mjs
 *
 * Env: WEBDRIVER_URL (safaridriver, default http://localhost:4444), STUDIO_URL (the served docs build, default
 * http://localhost:4321), ARTIFACT_DIR (where the screenshot and result JSON go). Exits 1 when the probe fails or
 * the session is not really iOS (a silent fallback to macOS Safari must never read as a pass).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLIDES, seedScript, TAPS, TARGETS, verdict } from './focus-sync-deck.mjs';

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

/**
 * safaridriver sometimes cannot reach a freshly booted simulator ("The host application never became ready", "timed out
 * while connecting to a Safari instance"): seen on the studio suite's iPhone and the focus-sync suite's iPad on hosted
 * runners, both before any probe code ran. Retry the session a bounded number of times; any other error is real.
 */
async function createSession() {
	for (let attempt = 1; ; attempt++) {
		try {
			return await wd('POST', '/session', {
				capabilities: {
					alwaysMatch: { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': UDID },
				},
			});
		} catch (e) {
			if (attempt >= 3 || !/session not created/.test(String(e.message))) throw e;
			console.log(`${LABEL}: session not created (attempt ${attempt} of 3): ${String(e.message).slice(0, 200)}; trying again in 20 s`);
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
	const result = PROBE === 'jpeg' ? await runJpegProbe(id) : PROBE === 'focus-sync' ? await runFocusSyncProbe(id) : await runStudioProbe(id);
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
 * The Studio suite: the preview payload probe (studio-probe.js), then the photo verdict probe (photo-probe.js), each on a
 * fresh page. One result: every step, each named for its probe, and a pass only when both pass.
 */
async function runStudioProbe(id) {
	const preview = await studioPage(id, 'studio-probe.js', 'latticeStudioProbe');
	const photo = await studioPage(id, 'photo-probe.js', 'latticePhotoProbe');
	return {
		ok: !!preview.ok && !!photo.ok,
		error: [preview.error && `preview: ${preview.error}`, photo.error && `photo: ${photo.error}`].filter(Boolean).join('; ') || undefined,
		ua: photo.ua ?? preview.ua,
		width: photo.width ?? preview.width,
		steps: [...(preview.steps || []).map((s) => ({ ...s, name: `preview · ${s.name}` })), ...(photo.steps || []).map((s) => ({ ...s, name: `photo · ${s.name}` }))],
	};
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
		const rows = [];
		const methods = new Set();
		/** One tap on the line of `slide`: an element click first, then a touch tap by coordinates if the caret did not land. */
		const tap = async (label, slide) => {
			const before = await wd('POST', `/session/${id}/execute/sync`, { script: `${probe}\nreturn lsBefore();`, args: [] });
			await call('lsEvents()');
			const line = await wd('POST', `/session/${id}/execute/sync`, { script: `${probe}\nreturn lsFind(${slide});`, args: [] });
			const ref = line['element-6066-11e4-a52e-4f735466cecf'] ?? Object.values(line)[0];
			await wd('POST', `/session/${id}/element/${ref}/click`, {});
			let method = 'element click';
			if (!(await call(`lsCaret(${slide}, 3000)`))) {
				const at = await call(`lsCenter(${slide})`);
				await wd('POST', `/session/${id}/actions`, {
					actions: [
						{
							type: 'pointer',
							id: 'finger',
							parameters: { pointerType: 'touch' },
							actions: [
								{ type: 'pointerMove', duration: 0, x: at.x, y: at.y },
								{ type: 'pointerDown', button: 0 },
								{ type: 'pause', duration: 80 },
								{ type: 'pointerUp', button: 0 },
							],
						},
					],
				});
				method = 'touch actions';
				if (!(await call(`lsCaret(${slide}, 5000)`))) {
					const state = await call(`lsState(${slide})`);
					throw new Error(`${label} on slide ${slide}: neither an element click nor a touch tap placed the caret; page: ${state}`);
				}
			}
			methods.add(method);
			const row = await call(`lsAfter(${slide}, ${before})`);
			if (row?.error) throw new Error(`${label} on slide ${slide}: ${row.error}`);
			return row;
		};
		// Four taps on a quiet page first: they tell a tap that never lands (the harness) from one the burner starves.
		for (let i = 0; i < 4; i++) await tap(`quiet tap ${i + 1}`, TARGETS[i % TARGETS.length]);
		result.steps.push({ name: 'four taps on a quiet page placed the caret and centered the slide', pass: true, detail: [...methods].join(', ') });
		await call(`lsBurn(${burn})`);
		for (let i = 0; i < TAPS; i++) rows.push(await tap(`tap ${i + 1}`, TARGETS[i % TARGETS.length]));
		const v = verdict(rows);
		result.steps.push({ name: `${v.taps} taps leave the editor alone (burner ${burn} ms)`, pass: v.ok, detail: `${v.jumps} moved it, worst ${Math.round(v.worst)} px` });
		result.rows = rows;
		result.ok = v.ok;
		if (!v.ok) result.error = `${v.jumps} of ${v.taps} taps moved the editor, worst ${Math.round(v.worst)} px`;
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
