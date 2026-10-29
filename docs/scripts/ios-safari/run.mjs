/**
 * Drive Mobile Safari in ONE booted iOS Simulator through safaridriver and run a probe there: studio-probe.js and then
 * photo-probe.js in the real Studio (PROBE=studio, the default), jpeg-probe.js, the shared JPEG encoder against
 * Safari's own (PROBE=jpeg), or undo-probe.js, the Filo undo checks across a reload (PROBE=undo). SIM_UDID=mac drives
 * the Mac's own Safari instead (the undo probe's desktop half: the WebKit undo command, and a real ⌘Z key).
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

const MAC = UDID === 'mac';
const session = await wd('POST', '/session', {
	capabilities: {
		alwaysMatch: MAC ? { browserName: 'Safari', platformName: 'mac' } : { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': UDID },
	},
});
const id = session.sessionId;
const caps = session.capabilities || {};
let ok = false;
try {
	const platform = String(caps.platformName || '').toLowerCase();
	if (!MAC && platform !== 'ios') throw new Error(`the session is not iOS (platformName ${caps.platformName}): refusing a macOS fallback`);
	if (MAC && platform !== 'mac') throw new Error(`the session is not macOS Safari (platformName ${caps.platformName})`);
	console.log(`${LABEL}: session on ${caps.platformName} ${caps.platformVersion || ''}, Safari ${caps.browserVersion || '?'}`);
	await wd('POST', `/session/${id}/timeouts`, { script: 240000, pageLoad: 180000 });
	const result = PROBE === 'jpeg' ? await runJpegProbe(id) : PROBE === 'undo' ? await runUndoProbe(id) : await runStudioProbe(id);
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
 * The undo probe (undo-probe.js): the edit half in a fresh Studio, a real reload through WebDriver, then the after-reload
 * half. On the Mac it then presses a real ⌘Z (a WebDriver key action, which Safari delivers as a keydown) if the text is
 * still unchanged, since a Mac's keyboard needs no on-screen button.
 */
async function runUndoProbe(id) {
	const source = fs.readFileSync(path.join(here, 'undo-probe.js'), 'utf8');
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
		if (!pass) {
			ok = false;
			error = [error, 'the ⌘Z key did not undo after the reload'].filter(Boolean).join('; ');
		}
	}
	return { ok, error, ua: second.ua ?? first.ua, width: first.width, steps };
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
