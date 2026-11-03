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

/**
 * How a capture differs from the baseline: the share of pixels (every 4th) that differ clearly, and how many distinct
 * colors (4 bits a channel) those pixels hold. A slide is many colors; a dimmed screen under a download prompt is a few
 * (the probe's first runner run counted that prompt as 70% "drawn").
 */
function changed(a, b) {
	if (a.width !== b.width || a.height !== b.height) return { share: 1, colors: 0 };
	let n = 0;
	const colors = new Set();
	for (let i = 0; i < a.data.length; i += 16) {
		if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 60) {
			n++;
			colors.add(((a.data[i] >> 4) << 8) | ((a.data[i + 1] >> 4) << 4) | (a.data[i + 2] >> 4));
		}
	}
	return { share: n / ((a.width * a.height) / 4), colors: colors.size };
}

/** The most common color of an image (4 bits a channel, every 4th pixel), as the bin's middle. */
function dominant(img) {
	const counts = new Map();
	for (let i = 0; i < img.data.length; i += 16) {
		const k = ((img.data[i] >> 4) << 8) | ((img.data[i + 1] >> 4) << 4) | (img.data[i + 2] >> 4);
		counts.set(k, (counts.get(k) || 0) + 1);
	}
	const top = [...counts].sort((x, y) => y[1] - x[1])[0][0];
	return [((top >> 8) & 15) * 16 + 8, ((top >> 4) & 15) * 16 + 8, (top & 15) * 16 + 8];
}

/** The share of an image's pixels (every 4th) within a small distance of a color. */
function near(img, [r, g, b]) {
	let n = 0;
	for (let i = 0; i < img.data.length; i += 16) if (Math.abs(img.data[i] - r) + Math.abs(img.data[i + 1] - g) + Math.abs(img.data[i + 2] - b) < 30) n++;
	return n / ((img.width * img.height) / 4);
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
		const { share, colors } = changed(shot, baseline);
		// The slide's own background is on screen: the dominant color of the same cut's Quick Look render (made by
		// tools/office-quicklook.mjs earlier in this job) covers a real share of the screen. A download prompt (a dimmed
		// gray screen) or an empty page holds no slide's cream or navy; for a near-white slide, the dim gray is ruled out.
		const ref = path.join(path.dirname(process.env.OFFICE_INDEX), f.path.replace(/\.pptx$/, '.png'));
		const bg = fs.existsSync(ref) ? dominant(PNG.sync.read(fs.readFileSync(ref))) : null;
		const cover = bg ? near(shot, bg) : 0;
		const dim = near(shot, [153, 153, 153]);
		const white = bg?.every((v) => v > 235);
		const pass = share > 0.05 && colors >= 24 && dim < 0.3 && (bg === null || white || cover > 0.08);
		steps.push({ name, pass, detail: `${(share * 100).toFixed(1)}% differs from a blank page in ${colors} colors; slide background ${bg ? `rgb(${bg.join(',')})` : 'unknown'} covers ${(cover * 100).toFixed(1)}%, prompt gray ${(dim * 100).toFixed(1)}%` });
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
