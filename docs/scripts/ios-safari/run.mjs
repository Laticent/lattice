/**
 * Drive Mobile Safari in ONE booted iOS Simulator through safaridriver and run a probe there: studio-probe.js in the
 * real Studio (PROBE=studio, the default), or jpeg-probe.js, the shared JPEG encoder against Safari's own (PROBE=jpeg).
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

const session = await wd('POST', '/session', {
	capabilities: {
		alwaysMatch: { browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': UDID },
	},
});
const id = session.sessionId;
const caps = session.capabilities || {};
let ok = false;
try {
	const platform = String(caps.platformName || '').toLowerCase();
	if (platform !== 'ios') throw new Error(`the session is not iOS (platformName ${caps.platformName}): refusing a macOS fallback`);
	console.log(`${LABEL}: session on ${caps.platformName} ${caps.platformVersion || ''}, Safari ${caps.browserVersion || '?'}`);
	await wd('POST', `/session/${id}/timeouts`, { script: 240000, pageLoad: 180000 });
	const result = PROBE === 'jpeg' ? await runJpegProbe(id) : await runStudioProbe(id);
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

async function runStudioProbe(id) {
	// Seed the Studio's settings on its own origin, then load the Studio.
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/` });
	await wd('POST', `/session/${id}/execute/sync`, { script: fs.readFileSync(path.join(here, 'seed-settings.js'), 'utf8'), args: [] });
	await wd('POST', `/session/${id}/url`, { url: `${BASE}/studio/` });
	const probe = fs.readFileSync(path.join(here, 'studio-probe.js'), 'utf8');
	return wd('POST', `/session/${id}/execute/async`, {
		script: `${probe}\nconst done = arguments[arguments.length - 1];\nlatticeStudioProbe().then(done, (e) => done({ ok: false, error: String(e), steps: [] }));`,
		args: [],
	});
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
