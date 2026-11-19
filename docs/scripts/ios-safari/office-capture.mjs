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
 * Files of three slides in a row (index entries with `slides`) are shown too, for a person to compare with the PDF
 * (iPhone Preview draws one slide's shapes on another; the icon-font decision note § 3.6): Quick Look runs out of process (QLHostRemoteView), so the app cannot scroll a whole deck.
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
 * With `blank` (the empty viewer's capture), a screen still matching it is NOT settled: Quick Look can sit on an empty
 * white page for longer than 3 s before it draws a .pptx, and two identical blank captures read as a finished slide
 * (run 43285290891, inline-icons slide 5: "settled", 0.4% different from the blank page, the export itself correct).
 */
async function capture(file, out, budget, blank = null) {
	simctl('launch', '--terminate-running-process', UDID, BUNDLE, file);
	await sleep(3000);
	simctl('io', UDID, 'screenshot', out);
	let last = PNG.sync.read(fs.readFileSync(out));
	for (let waited = 3000; waited < budget; waited += 3000) {
		await sleep(3000);
		simctl('io', UDID, 'screenshot', out);
		const now = PNG.sync.read(fs.readFileSync(out));
		if (changed(now, last).share < 0.002 && !(blank && changed(now, blank).share <= 0.05)) return { img: now, settled: true };
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

/**
 * BLEED SCORE (measurement, scratch branch). A run's capture holds its slides stacked down the screen. Each slide is
 * found by sliding its own reference (Quick Look's render of that slide ALONE, which never shows another slide's
 * shapes) down a coarse grid of the capture, and scored as the share of grid cells that differ clearly from it at the
 * best fit. Position 1 never bleeds (the decision note's record), so its score is the noise floor (fonts, scale);
 * a higher score at positions 2 and 3 is shapes that do not belong, or are missing.
 */
const GRID = 6; // capture pixels per grid cell
function grid(img, k) {
	const w = Math.floor(img.width / k);
	const h = Math.floor(img.height / k);
	const g = new Float32Array(w * h * 3);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			let r = 0, gg = 0, b = 0, n = 0;
			for (let yy = y * k; yy < (y + 1) * k; yy += 2)
				for (let xx = x * k; xx < (x + 1) * k; xx += 2) {
					const i = (yy * img.width + xx) * 4;
					r += img.data[i]; gg += img.data[i + 1]; b += img.data[i + 2]; n++;
				}
			const o = (y * w + x) * 3;
			g[o] = r / n; g[o + 1] = gg / n; g[o + 2] = b / n;
		}
	return { w, h, g };
}
/** A reference image resampled to `w` x `h` cells (box average). */
function resample(img, w, h) {
	const g = new Float32Array(w * h * 3);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const x0 = Math.floor((x * img.width) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
			const y0 = Math.floor((y * img.height) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
			let r = 0, gg = 0, b = 0, n = 0;
			for (let yy = y0; yy < y1; yy += 2)
				for (let xx = x0; xx < x1; xx += 2) {
					const i = (yy * img.width + xx) * 4;
					r += img.data[i]; gg += img.data[i + 1]; b += img.data[i + 2]; n++;
				}
			const o = (y * w + x) * 3;
			g[o] = r / n; g[o + 1] = gg / n; g[o + 2] = b / n;
		}
	return g;
}
/** The columns the slides occupy: those that differ from the screen's left edge (the viewer's margin, bars included)
 * in most rows. */
function band(c) {
	const cols = [];
	for (let x = 0; x < c.w; x++) {
		let differ = 0;
		for (let y = 0; y < c.h; y++) {
			const a = (y * c.w + x) * 3;
			const e = (y * c.w) * 3;
			if (Math.abs(c.g[a] - c.g[e]) + Math.abs(c.g[a + 1] - c.g[e + 1]) + Math.abs(c.g[a + 2] - c.g[e + 2]) > 30) differ++;
		}
		if (differ / c.h > 0.4) cols.push(x);
	}
	return cols.length ? [cols[0], cols[cols.length - 1] + 1] : [0, c.w];
}
/** Score one capture of a run against its slides' references: per position, { y, share } or null if unplaced. */
function bleedScores(shot, refs) {
	const c = grid(shot, GRID);
	const [x0, x1] = band(c);
	const w = x1 - x0;
	const out = [];
	let from = 0;
	for (const ref of refs) {
		if (!ref) {
			out.push(null);
			continue;
		}
		const h = Math.round((w * ref.height) / ref.width);
		const r = resample(ref, w, h);
		let best = null;
		// Each slide below the last one placed; the last may run off the screen, so up to half of it may be missing.
		for (let y = from; y + Math.ceil(h / 2) <= c.h; y++) {
			const rows = Math.min(h, c.h - y);
			let mad = 0, bad = 0, n = 0;
			for (let yy = 0; yy < rows; yy += 1)
				for (let xx = 0; xx < w; xx++) {
					const a = ((y + yy) * c.w + x0 + xx) * 3;
					const o = (yy * w + xx) * 3;
					const d = Math.abs(c.g[a] - r[o]) + Math.abs(c.g[a + 1] - r[o + 1]) + Math.abs(c.g[a + 2] - r[o + 2]);
					mad += d; n++;
					if (d > 90) bad++;
				}
			const fit = mad / n;
			if (!best || fit < best.fit) best = { y, fit, share: bad / n, rows };
		}
		if (!best) {
			out.push(null);
			continue;
		}
		// A full-resolution copy of the slide with GRID px to spare above and below, for cropDiff to align to the pixel.
		const px0 = x0 * GRID, hw = w * GRID;
		const py0 = Math.max(0, best.y * GRID - GRID), py1 = Math.min(shot.height, (best.y + best.rows) * GRID + GRID);
		const hh = py1 - py0;
		const crop = new Uint8Array(hw * hh * 3);
		for (let yy = 0; yy < hh; yy++)
			for (let xx = 0; xx < hw; xx++) {
				const i = ((py0 + yy) * shot.width + px0 + xx) * 4;
				const o = (yy * hw + xx) * 3;
				crop[o] = shot.data[i]; crop[o + 1] = shot.data[i + 1]; crop[o + 2] = shot.data[i + 2];
			}
		out.push({ y: best.y * GRID, share: best.share, seen: best.rows / h, crop, hw, hh, top: best.y * GRID - py0 });
		from = best.y + Math.floor(h * 0.9);
	}
	return out;
}
/** Two crops of the same slide from the same device, aligned to the pixel (within GRID px up or down): the
 * share of 3x3 cells that differ, and the worst tenth of the slide's height. */
function cropDiff(a, b) {
	if (!a || !b || a.hw !== b.hw) return null;
	const C = GRID; // screen px per cell side
	const cols = Math.floor(a.hw / C);
	const rows = Math.floor((Math.min(a.hh - a.top, b.hh - b.top) - GRID) / C);
	if (rows < 10) return null;
	const cell = (m, top, cy, cx) => {
		let r = 0, g = 0, bl = 0, n = 0;
		for (let y = 0; y < C; y += 2)
			for (let x = 0; x < C; x += 2) {
				const yy = top + cy * C + y;
				if (yy < 0 || yy >= m.hh) continue;
				const o = (yy * m.hw + cx * C + x) * 3;
				r += m.crop[o]; g += m.crop[o + 1]; bl += m.crop[o + 2]; n++;
			}
		return n ? [r / n, g / n, bl / n] : [0, 0, 0];
	};
	let best = null;
	for (let off = -GRID; off <= GRID; off++) {
		let bad = 0, n = 0;
		const strips = new Array(10).fill(0), stripN = new Array(10).fill(0);
		for (let cy = 0; cy < rows; cy++)
			for (let cx = 0; cx < cols; cx++) {
				const p = cell(a, a.top + off, cy, cx), q = cell(b, b.top, cy, cx);
				const d = Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
				const k = Math.min(9, Math.floor((cy * 10) / rows));
				stripN[k]++;
				n++;
				if (d > 40) {
					bad++;
					strips[k]++;
				}
			}
		const r = { share: bad / n, worstStrip: Math.max(...strips.map((v, i) => (stripN[i] ? v / stripN[i] : 0))) };
		if (!best || r.share < best.share) best = r;
	}
	return best;
}
const REPEAT = Math.max(1, Number(process.env.OFFICE_REPEAT) || 1);
const scores = [];

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
// Runs of three slides that tools/office-quicklook.mjs cut: evidence of what the viewer draws on a slide after
// other slides (the owner's iPhone drew shapes from earlier slides onto later ones). Each capture is kept for a person
// to compare with the PDF; a run passes on a settled screen.
for (const f of index.filter((x) => x.slides)) {
	const refs = (f.refs || []).map((p) => (p && fs.existsSync(path.join(root, p)) ? PNG.sync.read(fs.readFileSync(path.join(root, p))) : null));
	for (let open = 1; open <= REPEAT; open++) {
		const name = `${f.deck} ${f.variant} slides ${f.slides.join(', ')}${REPEAT > 1 ? ` open ${open}` : ''}`;
		try {
			const { img, settled } = await capture(inApp(f), path.join(dir, `${LABEL}-${stem(f)}${REPEAT > 1 ? `-o${open}` : ''}.png`), 30000, baseline);
			let detail = settled ? 'settled' : 'never settled';
			if (settled && refs.some(Boolean)) {
				const sc = bleedScores(img, refs);
				scores.push({ deck: f.deck, variant: f.variant, slides: f.slides, open, sc });
				detail += `; bleed ${sc.map((v, i) => `${f.slides[i]}@${i + 1}=${v ? `${(v.share * 100).toFixed(1)}%${v.seen < 1 ? `(${Math.round(v.seen * 100)}% seen)` : ''}` : 'n/a'}`).join(' ')}`;
			}
			steps.push({ name, pass: settled, detail });
		} catch (e) {
			steps.push({ name, pass: false, detail: String(e.message).slice(0, 200) });
		}
	}
}
// Against the iPhone itself: each slide at position 2 or 3 compared with the same slide at position 1 of the run that
// starts with it, same variant (position 1 never shows another slide's shapes). Same device, fonts and scale, so the
// noise is the device's own (measured as position 1 against position 1 across openings).
const firstOf = new Map();
for (const s of scores) if (s.sc[0]?.crop) {
	const k = `${s.deck}|${s.variant}|${s.slides[0]}`;
	if (!firstOf.has(k)) firstOf.set(k, s.sc[0]);
}
const vsPhone = [];
for (const s of scores)
	s.sc.forEach((v, i) => {
		const ref = firstOf.get(`${s.deck}|${s.variant}|${s.slides[i]}`);
		if (!v?.crop || !ref || (i === 0 && ref === v)) return;
		const d = cropDiff(v, ref);
		if (d) vsPhone.push({ deck: s.deck, variant: s.variant, slide: s.slides[i], pos: i + 1, open: s.open, ...d });
	});
for (const r of vsPhone) if (r.pos > 1 && r.worstStrip > 0.08) console.log(`  STRAY? ${r.deck} ${r.variant} slide ${r.slide} at position ${r.pos} open ${r.open}: ${(r.share * 100).toFixed(1)}% of cells differ from its own first-position capture, worst tenth ${(r.worstStrip * 100).toFixed(0)}%`);
for (const key of [...new Set(vsPhone.map((r) => `${r.deck}|${r.variant}`))]) {
	const rows = vsPhone.filter((r) => `${r.deck}|${r.variant}` === key);
	const f = (p) => rows.filter((r) => r.pos === p);
	const fmt = (a) => (a.length ? `mean ${((a.reduce((x, r) => x + r.share, 0) / a.length) * 100).toFixed(2)}% worst-tenth max ${(Math.max(...a.map((r) => r.worstStrip)) * 100).toFixed(0)}% (n=${a.length}, flagged ${a.filter((r) => r.worstStrip > 0.08).length})` : 'n/a');
	console.log(`BLEED-vs-iPhone ${key.replace('|', ' ')}: noise pos1 ${fmt(f(1))} · pos2 ${fmt(f(2))} · pos3 ${fmt(f(3))}`);
}
for (const s of scores) for (const v of s.sc) if (v) delete v.crop;
// Summary: per deck and variant, the mean score at each position across every run and opening, and the worst cell.
for (const key of [...new Set(scores.map((s) => `${s.deck}|${s.variant}`))]) {
	const rows = scores.filter((s) => `${s.deck}|${s.variant}` === key);
	const at = [0, 1, 2].map((i) => rows.map((r) => r.sc[i]).filter((v) => v && v.seen >= 0.9).map((v) => v.share));
	const mean = (a) => (a.length ? (a.reduce((x, y) => x + y, 0) / a.length) * 100 : NaN);
	const max = (a) => (a.length ? Math.max(...a) * 100 : NaN);
	console.log(`BLEED ${key.replace('|', ' ')}: pos1 mean ${mean(at[0]).toFixed(1)}% max ${max(at[0]).toFixed(1)}% · pos2 mean ${mean(at[1]).toFixed(1)}% max ${max(at[1]).toFixed(1)}% · pos3 mean ${mean(at[2]).toFixed(1)}% max ${max(at[2]).toFixed(1)}% (n=${at.map((a) => a.length).join('/')})`);
}
fs.writeFileSync(path.join(OUT, `bleed-${LABEL}.json`), `${JSON.stringify(scores, null, 2)}\n`);
for (const f of index.filter((x) => !x.slides)) {
	const name = `${f.deck} slide ${f.slide}`;
	const file = path.join(dir, `${LABEL}-${f.deck}-slide-${String(f.slide).padStart(2, '0')}.png`);
	try {
		const { img: shot, settled } = await capture(inApp(f), file, 30000, baseline);
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
