/**
 * The grain banding suite (PROBE=grain-banding): does real Apple Safari draw a finish's dark glow as flat bands, and does
 * the screen grain (lib/base/base.finish.css § SCREEN GRAIN) break them up? run.sh exports examples/finish-screen-grain.md
 * to an HTML player twice, as shipped (`grain.html`) and with the grain switched off (`plain.html`), and serves both; run.mjs
 * opens each in Safari (the iPad and iPhone iOS Simulators, and the runner's own macOS Safari), photographs the first
 * slide (a dark `finish-nimbus` title) with WebDriver's element screenshot, and hands the PNG here.
 *
 * The measure is the one the decision note uses (engineering/decisions/2026-11-21-screen-grain.md §1): along rows in the
 * glow, the length of each run of one exact color. A band is a long run; dithering or grain makes runs short. Lengths are
 * reported in device pixels and in CSS pixels (divided by the device pixel ratio), and the gate reads CSS pixels, so a
 * 3x phone and a 2x Mac are held to the same bar. Measured in Linux WebKit at 2x: 6/30 px (median/p90) without the grain,
 * 1/2 px with it; that is 3/15 and 0.5/1 CSS px.
 *
 * THE GATE: with the grain, the p90 run in the glow is at most GRAIN_MAX_P90_CSS. The grain-off arm is REPORTED, not
 * gated: it says whether Apple's Safari bands at all (if it already dithers, the grain only adds its faint texture).
 * Pure functions, so test/unit/tools/grain-banding.test.js can show the measure on synthetic pictures.
 */

/** CSS pixels the p90 flat run in the glow may reach with the grain on. Linux WebKit measures 1; a band is 15. */
export const GRAIN_MAX_P90_CSS = 4;

/**
 * The glow regions of the slide, as fractions of the screenshot: two full-width strips, above and below the title
 * slide's centered words (about 38% to 62% of the height) and clear of the footer's hairline (88%). Words break runs, so
 * a strip that crossed them would read a band as shorter than it is.
 */
export const GLOW_REGIONS = [
	{ x0: 0.04, x1: 0.96, y0: 0.08, y1: 0.34 },
	{ x0: 0.04, x1: 0.96, y0: 0.66, y1: 0.86 },
];

/**
 * Flat runs along rows of `img` ({ width, height, data } RGBA, as pngjs reads it) inside `regions`, every `rowStep` rows.
 * @returns {{ median: number, p90: number, medianCss: number, p90Css: number, mean: number, runs: number }}
 */
export function flatRuns(img, dpr = 1, regions = GLOW_REGIONS, rowStep = 8) {
	const runs = [];
	let sum = 0, n = 0;
	for (const region of regions) {
	const x0 = Math.floor(img.width * region.x0), x1 = Math.floor(img.width * region.x1);
	const y0 = Math.floor(img.height * region.y0), y1 = Math.floor(img.height * region.y1);
	for (let y = y0; y < y1; y += rowStep) {
		let len = 0, prev = -1;
		for (let x = x0; x < x1; x++) {
			const i = (y * img.width + x) * 4;
			const v = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
			sum += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
			n++;
			if (v === prev) len++;
			else {
				if (prev >= 0) runs.push(len);
				len = 1;
			}
			prev = v;
		}
		if (len) runs.push(len);
	}
	}
	runs.sort((a, b) => a - b);
	const at = (q) => (runs.length ? runs[Math.min(runs.length - 1, Math.floor(runs.length * q))] : 0);
	const median = at(0.5), p90 = at(0.9);
	return { median, p90, medianCss: median / dpr, p90Css: p90 / dpr, mean: n ? sum / n : 0, runs: runs.length };
}

/**
 * The probe: for each player (grain, then plain), open it, read the device pixel ratio, photograph the first finish slide
 * and measure it. `decode(base64Png)` returns the pngjs image; the callers pass WebDriver calls in, so this file needs none.
 * @param {{ players: { grain: string, plain: string }, go: (url: string) => Promise<void>, info: () => Promise<{ dpr: number, width: number, ua: string }>,
 *           shot: () => Promise<string>, decode: (b64: string) => { width: number, height: number, data: Uint8Array }, save?: (name: string, b64: string) => void }} io
 */
export async function runGrainBanding(io) {
	const steps = [];
	const step = (name, pass, detail = '') => steps.push({ name, pass: !!pass, detail: String(detail) });
	const measures = {};
	let width = 0, ua = '';
	try {
		for (const arm of ['grain', 'plain']) {
			await io.go(io.players[arm]);
			const meta = await io.info();
			width = meta.width;
			ua = meta.ua;
			const b64 = await io.shot();
			io.save?.(`grain-banding-${arm}`, b64);
			const img = io.decode(b64);
			const m = flatRuns(img, meta.dpr);
			measures[arm] = { ...m, dpr: meta.dpr, shot: `${img.width}x${img.height}` };
			step(`${arm} · the slide was photographed`, img.width > 100 && img.height > 50, `${img.width}x${img.height} at ${meta.dpr}x, ${m.runs} runs`);
		}
		const g = measures.grain, p = measures.plain;
		step(
			`with the grain, the glow's p90 flat run is at most ${GRAIN_MAX_P90_CSS} CSS px`,
			g.p90Css <= GRAIN_MAX_P90_CSS,
			`grain ${g.median}/${g.p90} px (${g.medianCss.toFixed(1)}/${g.p90Css.toFixed(1)} CSS px)`,
		);
		// Reported, not gated: whether this Safari bands without the grain, and how far the grain moves the mean color.
		step(
			`reported · without the grain: ${p.median}/${p.p90} px (${p.medianCss.toFixed(1)}/${p.p90Css.toFixed(1)} CSS px); mean shift ${(g.mean - p.mean).toFixed(2)} levels`,
			true,
		);
		return { ok: steps.every((s) => s.pass), steps, measures, width, ua };
	} catch (e) {
		return { ok: false, steps, measures, width, ua, error: String(e.message || e) };
	}
}
