/**
 * The office probe (run.sh, PROBE=office): each one-slide editable .pptx that tools/office-quicklook.mjs cut, shown by
 * QLProbe (QLProbe.swift), a test app that hands one file to Apple's Quick Look viewer, the component the Files app's
 * Preview uses, and captured from the DEVICE's screen (`simctl io screenshot`).
 *
 * Not Safari: iOS Safari asks "Do you want to download …? View / Download" for a .pptx, even served inline, and waits
 * for a tap; its WebDriver tab is not the tab on screen either. The probe's first runner runs captured blank pages,
 * start pages and that prompt. So a slide passes only when its OWN background (the dominant color of the same cut's
 * Quick Look render, made earlier in this job) covers a real share of the screen, and no prompt gray does.
 *
 *   SIM_UDID=<udid> SIM_LABEL=iPhone OFFICE_INDEX=<index.json> APP_DIR=<QLProbe.app> ARTIFACT_DIR=<dir> node office-capture.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const UDID = process.env.SIM_UDID;
const LABEL = process.env.SIM_LABEL || 'iPhone';
const BUNDLE = 'com.laticent.qlprobe';
const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const OUT = process.env.ARTIFACT_DIR || 'ios-safari-artifacts';
const index = JSON.parse(fs.readFileSync(process.env.OFFICE_INDEX, 'utf8'));
const dir = path.join(OUT, 'office');
fs.mkdirSync(dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Show one file (a path inside the app's own sandbox, or none) in QLProbe and capture the screen once it has drawn. */
async function capture(file, out, wait) {
	simctl('launch', '--terminate-running-process', UDID, BUNDLE, file);
	await sleep(wait);
	simctl('io', UDID, 'screenshot', out);
	return PNG.sync.read(fs.readFileSync(out));
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

// The app installed, and every cut copied into its Documents, where the app may read it.
simctl('install', UDID, process.env.APP_DIR);
const docs = path.join(simctl('get_app_container', UDID, BUNDLE, 'data'), 'Documents');
fs.mkdirSync(docs, { recursive: true });
const root = path.dirname(process.env.OFFICE_INDEX);
const inApp = (f) => path.join(docs, `${f.deck}-slide-${String(f.slide).padStart(2, '0')}.pptx`);
for (const f of index) fs.copyFileSync(path.join(root, f.path), inApp(f));
// The baseline: the viewer with nothing to show. Twice, so a first launch's settling is not in it.
await capture('none', path.join(dir, `${LABEL}-baseline-0.png`), 6000);
const baseline = await capture('none', path.join(dir, `${LABEL}-baseline.png`), 4000);
const steps = [];
for (const f of index) {
	const name = `${f.deck} slide ${f.slide}`;
	const file = path.join(dir, `${LABEL}-${f.deck}-slide-${String(f.slide).padStart(2, '0')}.png`);
	try {
		const shot = await capture(inApp(f), file, 6000);
		const { share, colors } = changed(shot, baseline);
		// The slide's own background is on screen: the dominant color of the same cut's Quick Look render (made by
		// tools/office-quicklook.mjs earlier in this job) covers a real share of the screen. A download prompt (a dimmed
		// gray screen) or an empty page holds no slide's cream or navy; for a near-white slide, the dim gray is ruled out.
		const ref = path.join(root, f.path.replace(/\.pptx$/, '.png'));
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
