/**
 * The office probe (run.sh, PROBE=office): each one-slide editable .pptx that tools/office-quicklook.mjs cut, opened in
 * the simulator's own Safari the way a tapped link opens it (`simctl openurl`), which previews an Office file with the
 * same importer as Preview in the Files app, and captured from the DEVICE's screen (`simctl io screenshot`).
 *
 * No WebDriver: its automation tab is not the tab on screen, and its page screenshot does not see the layer Safari
 * draws an Office preview in (the first two runs captured 35 blank pages, then 35 empty start pages, and called them
 * passes). So the check is against a BASELINE: a blank page served the same way and captured first. A slide passes only
 * where its capture differs from the baseline over a real share of the screen.
 *
 *   SIM_UDID=<udid> SIM_LABEL=iPhone OFFICE_INDEX=<index.json> BASE=http://localhost:4321 ARTIFACT_DIR=<dir> node office-capture.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const UDID = process.env.SIM_UDID;
const LABEL = process.env.SIM_LABEL || 'iPhone';
const BASE = process.env.BASE || 'http://localhost:4321';
const OUT = process.env.ARTIFACT_DIR || 'ios-safari-artifacts';
const index = JSON.parse(fs.readFileSync(process.env.OFFICE_INDEX, 'utf8'));
const dir = path.join(OUT, 'office');
fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open a URL in the device's Safari, retrying while a freshly booted device is not yet taking URLs (`simctl openurl`
 * exited 60 straight after boot on the first run), and capture the screen once it has had time to draw. */
async function capture(url, file, wait) {
	for (let attempt = 1; ; attempt++) {
		try {
			execFileSync('xcrun', ['simctl', 'openurl', UDID, url], { stdio: ['ignore', 'ignore', 'pipe'] });
			break;
		} catch (e) {
			const why = `${e.status}: ${String(e.stderr || '').trim().slice(0, 300)}`;
			if (attempt >= 5) throw new Error(`simctl openurl ${url} failed 5 times (${why})`);
			console.log(`${LABEL}: openurl attempt ${attempt} failed (${why}); trying again in 10 s`);
			await sleep(10000);
		}
	}
	await sleep(wait);
	execFileSync('xcrun', ['simctl', 'io', UDID, 'screenshot', file], { stdio: 'ignore' });
	return PNG.sync.read(fs.readFileSync(file));
}

/** The share of pixels (every 4th) that differ clearly from the baseline capture. */
function changed(a, b) {
	if (a.width !== b.width || a.height !== b.height) return 1;
	let n = 0;
	for (let i = 0; i < a.data.length; i += 16) {
		if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 60) n++;
	}
	return n / ((a.width * a.height) / 4);
}

// Safari launched first, as the other suites launch it, so the first URL has an app to land in.
execFileSync('xcrun', ['simctl', 'launch', UDID, 'com.apple.mobilesafari'], { stdio: 'ignore' });
await sleep(8000);
// Twice: the first open of Safari may show a first-run tip, which the second capture has dismissed or kept alike.
await capture(`${BASE}/blank.html`, path.join(dir, `${LABEL}-baseline-0.png`), 6000);
const baseline = await capture(`${BASE}/blank.html`, path.join(dir, `${LABEL}-baseline.png`), 4000);
const steps = [];
for (const f of index) {
	const name = `${f.deck} slide ${f.slide}`;
	const file = path.join(dir, `${LABEL}-${f.deck}-slide-${String(f.slide).padStart(2, '0')}.png`);
	try {
		const shot = await capture(`${BASE}/${f.path}`, file, 6000);
		const share = changed(shot, baseline);
		steps.push({ name, pass: share > 0.05, detail: `${(share * 100).toFixed(1)}% of the screen differs from a blank page` });
	} catch (e) {
		steps.push({ name, pass: false, detail: String(e.message).slice(0, 200) });
	}
}
const failed = steps.filter((s) => !s.pass);
const result = { ok: steps.length > 0 && !failed.length, error: failed.length ? `${failed.length} of ${steps.length} slides showed no slide` : undefined, steps, width: baseline.width, session: { label: LABEL } };
fs.writeFileSync(path.join(OUT, `office-${LABEL}.json`), `${JSON.stringify(result, null, 2)}\n`);
console.log(`${LABEL}: ${result.ok ? 'PASS' : `FAIL (${result.error})`}`);
for (const s of steps) console.log(`  ${s.pass ? 'ok  ' : 'FAIL'} ${s.name} (${s.detail})`);
process.exit(result.ok ? 0 : 1);
