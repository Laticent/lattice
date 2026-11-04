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
 * Files of three slides in a row (index entries with `slides`) are shown too, in each variant the tool wrote, for a
 * person to compare: Quick Look runs out of process (QLHostRemoteView), so the app cannot scroll a whole deck.
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

/**
 * Show one file (a path inside the app's own sandbox, or none) in QLProbe and capture the screen once the preview has
 * SETTLED: two captures 3 s apart that match. A fixed wait caught slides mid-load ("Loading…", the slide still faded in)
 * on the first app run; the spinner animates, so a settled screen is a finished one. At most `budget` ms.
 */
async function capture(file, out, budget) {
	simctl('launch', '--terminate-running-process', UDID, BUNDLE, file);
	await sleep(3000);
	simctl('io', UDID, 'screenshot', out);
	let last = PNG.sync.read(fs.readFileSync(out));
	for (let waited = 3000; waited < budget; waited += 3000) {
		await sleep(3000);
		simctl('io', UDID, 'screenshot', out);
		const now = PNG.sync.read(fs.readFileSync(out));
		if (changed(now, last).share < 0.002) return { img: now, settled: true };
		last = now;
	}
	// Never still within the budget: a preview still loading is not a slide, so the caller fails it.
	return { img: last, settled: false };
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

/** The most common color of an image (4 bits a channel, every 4th pixel), as the bin's middle; with `ink`, the most
 * common one that is not near white. */
function dominant(img, ink = false) {
	const counts = new Map();
	for (let i = 0; i < img.data.length; i += 16) {
		if (ink && img.data[i] > 220 && img.data[i + 1] > 220 && img.data[i + 2] > 220) continue;
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
const stem = (f) => (f.slides ? `${f.deck}-${f.variant}-slides-${f.slides.join('-')}` : `${f.deck}-slide-${String(f.slide).padStart(2, '0')}`);
const inApp = (f) => path.join(docs, `${stem(f)}.pptx`);
for (const f of index) fs.copyFileSync(path.join(root, f.path), inApp(f));
// The baseline: the viewer with nothing to show. Twice, so a first launch's settling is not in it.
await capture('none', path.join(dir, `${LABEL}-baseline-0.png`), 15000);
const baseline = (await capture('none', path.join(dir, `${LABEL}-baseline.png`), 15000)).img;
const steps = [];
// Runs of three slides, each variant tools/office-quicklook.mjs wrote: evidence of what the viewer draws on a slide after
// other slides (the owner's iPhone drew shapes from earlier slides onto later ones). Each capture is kept for a person
// to compare across variants; a run passes on a settled screen.
for (const f of index.filter((x) => x.slides)) {
	const name = `${f.deck} ${f.variant} slides ${f.slides.join(', ')}`;
	try {
		// Twice: the first runs drew the carried-over shapes differently from one opening of the same file to the next.
		let settledAll = true;
		for (const take of ['a', 'b']) settledAll = (await capture(inApp(f), path.join(dir, `${LABEL}-${stem(f)}-${take}.png`), 30000)).settled && settledAll;
		steps.push({ name, pass: settledAll, detail: settledAll ? 'settled, twice' : 'never settled' });
	} catch (e) {
		steps.push({ name, pass: false, detail: String(e.message).slice(0, 200) });
	}
}
for (const f of index.filter((x) => !x.slides)) {
	const name = `${f.deck} slide ${f.slide}`;
	const file = path.join(dir, `${LABEL}-${f.deck}-slide-${String(f.slide).padStart(2, '0')}.png`);
	try {
		const { img: shot, settled } = await capture(inApp(f), file, 30000);
		const { share, colors } = changed(shot, baseline);
		// The slide's own background is on screen: the dominant color of the same cut's Quick Look render (made by
		// tools/office-quicklook.mjs earlier in this job) covers a real share of the screen. A download prompt (a dimmed
		// gray screen) or an empty page holds no slide's cream or navy; for a near-white slide, the dim gray is ruled out.
		const ref = path.join(root, f.path.replace(/\.pptx$/, '.png'));
		const bg = fs.existsSync(ref) ? dominant(PNG.sync.read(fs.readFileSync(ref))) : null;
		const cover = bg ? near(shot, bg) : 0;
		const dim = near(shot, [153, 153, 153]);
		// A near-white slide's background tells it from nothing, so the test there is its strongest OTHER color (its
		// ink: the text, a tile, a rule), which an empty or still-loading viewer does not hold.
		const white = bg?.every((v) => v > 235);
		const ink = white && fs.existsSync(ref) ? dominant(PNG.sync.read(fs.readFileSync(ref)), true) : null;
		const inkCover = ink ? near(shot, ink) : 0;
		// No reference render means nothing to test the capture against: that slide fails rather than passing on share alone.
		const pass = settled && bg !== null && share > 0.05 && colors >= 24 && dim < 0.3 && (white ? inkCover > 0.0005 : cover > 0.08);
		steps.push({ name, pass, detail: `${settled ? 'settled' : 'never settled'}; ${(share * 100).toFixed(1)}% differs from a blank page in ${colors} colors; slide background ${bg ? `rgb(${bg.join(',')})` : 'unknown'} covers ${(cover * 100).toFixed(1)}%${ink ? `, its ink rgb(${ink.join(',')}) ${(inkCover * 100).toFixed(2)}%` : ''}, prompt gray ${(dim * 100).toFixed(1)}%` });
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
