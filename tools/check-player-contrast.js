#!/usr/bin/env node
/**
 * check-player-contrast — WCAG AA audit of an EXPORTED HTML PLAYER, in BOTH of its
 * scheme states, with every backdrop sampled from RENDERED PIXELS.
 *
 * Complements `tools/check-slide-contrast.js` rather than duplicating it (HARD RULE
 * #15) — and it reuses that file's `PROBE` verbatim, so the two can never disagree
 * about which runs exist, what ink they carry, or which AA threshold applies. What
 * this adds is three things that one structurally cannot do:
 *
 *   1. THE SURFACE. It drives the real `--player` export — the single HTML file a
 *      recipient actually opens — not the deck's plain render. The player ships its
 *      own dual-mode stylesheet, its own chrome, and a CSS prune; none of that is
 *      present in the render `check-slide-contrast` reads.
 *   2. BOTH SCHEMES. It scores the deck as exported AND after clicking `#lp-mode`.
 *      That split is the point: an "as exported" failure is in the PDF too (a deck
 *      or theme defect), while an "after the toggle" failure exists only in the
 *      player (a scheme defect, and one no static check can reach).
 *   3. PIXELS, NOT ANCESTORS. `check-slide-contrast` resolves a backdrop by climbing
 *      the ancestor chain through transparent paints — exact for flat fills, and
 *      openly documented as noise over a gradient or a photograph. This one makes
 *      every glyph transparent, screenshots the slide, and reads the pixels the
 *      glyphs were sitting on. A gradient, an image, a translucent overlay and a
 *      z-ordered rail all resolve correctly because they are simply *there*.
 *
 * Both tools should exist. This one is slower by orders of magnitude (a browser, a
 * screenshot per slide per scheme) and cannot be a per-PR gate; that one is fast
 * enough to gate invariants, which it does.
 *
 * WHAT IS EXCLUDED. The muted-chrome tier — running header, footer, pagination — is
 * WCAG-exempt by palette contract, and `check-slide-contrast.js` says so in its own
 * header ("the 'muted chrome' tier (footer, pagination) is WCAG-exempt by palette
 * contract and will always report"). `PROBE` resolves `--text-muted` and `--border`
 * per section and marks those runs `exempt`; they are reported in their own bucket
 * here, never counted as failures. Nothing else is excluded.
 *
 * KNOWN LIMITATIONS, inherited and added:
 *   · a pseudo-element has no rect in CSS, so its row keeps the MODELLED backdrop
 *     (`rectIsOwner`) — a sample taken from the owner's box may land beside the
 *     pseudo rather than under it, and a wrong number is worse than a modelled one;
 *   · an occluded run is still scored, exactly as in `check-slide-contrast` — with
 *     one improvement: because the sample is taken from pixels, a run painted under
 *     an opaque sibling now reads against that sibling rather than against whatever
 *     the ancestor chain claimed;
 *   · text over a gradient gets its ratio from the MODAL sampled color, with the
 *     worst sampled color reported beside it, because one number cannot describe a
 *     ramp honestly.
 *
 * Usage:
 *   node tools/check-player-contrast.js examples/a11y.md examples/gallery-jargon.md
 *   node tools/check-player-contrast.js --json out.json examples/*.md
 *   node tools/check-player-contrast.js already-exported-player.html
 *
 * A `.md` is exported with `--player` into a temp dir first; a `.html` is opened as
 * given. Exits non-zero if any non-exempt run falls below its AA threshold in either
 * scheme. ON-DEMAND, not a blocking gate — see `engineering/workflow.md`.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { PNG } = require('pngjs');
const { PROBE } = require('./check-slide-contrast.js');

const ROOT = path.join(__dirname, '..');

/** WCAG relative luminance / contrast, on 0–255 sRGB triples. */
const srgb = (c) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
/** Source-over one translucent paint onto an opaque one. */
const over = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const ratio = (a, b) => {
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
};

/** Export a deck to a player if given markdown; pass a `.html` through untouched. */
function playerFor(input) {
	if (input.endsWith('.html')) return path.resolve(input);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-player-contrast-'));
	const out = path.join(dir, `${path.basename(input, '.md')}.pdf`);
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), input, out, '--quiet', '--player'], {
		cwd: ROOT,
		encoding: 'utf8',
		env: { ...process.env },
		timeout: 600000,
	});
	if (r.status !== 0) throw new Error(`export failed for ${input}: ${r.stderr || r.stdout}`);
	return out.replace(/\.pdf$/, '.html');
}

/**
 * Make every glyph in the document paint nothing, so a screenshot shows only what the
 * text was sitting ON.
 *
 * `color` alone is not enough. SVG text is painted by `fill`, the engine draws label
 * halos and chart ink through `stroke`, and `-webkit-text-fill-color` outranks `color`
 * where it is set. `text-shadow` has to go too or a blurred copy of the glyph tints the
 * very pixels being sampled. Applied to `::before`/`::after` as well, since this engine
 * puts real content there.
 */
const HIDE_INK = `*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;
	text-shadow:none!important;fill:transparent!important;stroke:transparent!important;caret-color:transparent!important}`;

/**
 * Sample a run's backdrop from a decoded screenshot.
 *
 * A GRID, not a center pixel. An inline run's box can extend past the paint behind it
 * (a `<code>` chip inside a paragraph, a label straddling a panel edge), and a center
 * sample would then report the neighbor's fill with full confidence. Sampling a spread
 * and taking the MODE gives the color the glyphs mostly sit on; the extremes are kept
 * so a gradient can be reported as a gradient instead of averaged into a number that
 * describes no pixel on screen.
 */
function sampleBackdrop(png, rect, dpr) {
	const at = (x, y) => {
		const px = Math.round(x * dpr);
		const py = Math.round(y * dpr);
		if (px < 0 || py < 0 || px >= png.width || py >= png.height) return null;
		const i = (png.width * py + px) << 2;
		return [png.data[i], png.data[i + 1], png.data[i + 2]];
	};
	const counts = new Map();
	const seen = [];
	const COLS = 6;
	const ROWS = 4;
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			// Inset by half a cell so the grid never lands on the box's own boundary, where a
			// one-pixel border would masquerade as the backdrop.
			const x = rect.x + (rect.w * (c + 0.5)) / COLS;
			const y = rect.y + (rect.h * (r + 0.5)) / ROWS;
			const px = at(x, y);
			if (!px) continue;
			seen.push(px);
			const key = px.join(',');
			counts.set(key, (counts.get(key) || 0) + 1);
		}
	}
	if (!seen.length) return null;
	const [modeKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
	const mode = modeKey.split(',').map(Number);
	return { mode, distinct: counts.size, samples: seen };
}

/** One scheme state of one player: every run, re-scored against sampled pixels. */
async function auditState(page, label) {
	const meta = await page.evaluate(() => ({
		slides: document.querySelectorAll('.lp-frame').length,
		dpr: window.devicePixelRatio,
	}));
	if (!meta.slides) throw new Error('no .lp-frame in the document — is this an exported player?');
	const rows = [];
	for (let i = 0; i < meta.slides; i++) {
		// Present view shows ONE frame; the rest are display:none, so PROBE skips them and
		// the screenshot contains exactly the slide being scored, at its full canvas size.
		await page.evaluate((n) => {
			const frames = [...document.querySelectorAll('.lp-frame')];
			for (let k = 0; k < frames.length; k++) frames[k].classList.toggle('lp-active', k === n);
			window.scrollTo(0, 0);
		}, i);
		await new Promise((r) => setTimeout(r, 120));
		const slideRows = (await page.evaluate(PROBE)).filter((row) => row.rect && row.rect.w > 0 && row.rect.h > 0);
		if (!slideRows.length) continue;
		const handle = await page.addStyleTag({ content: HIDE_INK });
		await new Promise((r) => setTimeout(r, 60));
		const shot = await page.screenshot({ type: 'png' });
		await page.evaluate((el) => el.remove(), handle);
		// puppeteer 23 hands back a Uint8Array, not a Buffer, and pngjs reads with Buffer methods.
		const png = PNG.sync.read(Buffer.from(shot));
		for (const row of slideRows) {
			if (row.rectIsOwner) {
				rows.push({ ...row, state: label, sampled: false });
				continue;
			}
			const bg = sampleBackdrop(png, row.rect, meta.dpr);
			if (!bg) {
				rows.push({ ...row, state: label, sampled: false });
				continue;
			}
			// COMPOSITE THE INK OVER THE SAMPLED PIXEL, never over the modelled one. `PROBE`
			// hands back `fg` already flattened against the backdrop IT resolved, which is right
			// for that tool and wrong here: scoring an ink composited over backdrop A against
			// backdrop B describes no pixel on screen. It is not an edge case — the whole
			// `--on-*-secondary` / `-ghost` / `-watermark` ramp is `color-mix(… N%, transparent)`,
			// and that ramp is exactly what inks a panel's chrome.
			const fg = row.ink ? over(row.ink.rgb, bg.mode, row.ink.a) : row.fg;
			const worst = bg.samples.reduce(
				(lo, px) => Math.min(lo, ratio(row.ink ? over(row.ink.rgb, px, row.ink.a) : row.fg, px)),
				Number.POSITIVE_INFINITY,
			);
			rows.push({
				...row,
				state: label,
				sampled: true,
				fg,
				bg: bg.mode,
				r: +ratio(fg, bg.mode).toFixed(2),
				worst: +worst.toFixed(2),
				gradient: bg.distinct > 2,
			});
		}
	}
	return rows;
}

async function auditPlayer(browser, file) {
	const page = await browser.newPage();
	// A deliberate LIGHT system preference, so a `system` export is scored in a known
	// state rather than in whatever the host machine happens to prefer.
	await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
	await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
	await page.goto(`file://${path.resolve(file)}`, { waitUntil: 'networkidle0' });
	await new Promise((r) => setTimeout(r, 400));
	const asExported = await auditState(page, 'as exported');
	const toggled = await page.evaluate(() => {
		const btn = document.getElementById('lp-mode');
		if (!btn) return null;
		btn.click();
		return document.documentElement.getAttribute('data-lp-scheme');
	});
	let after = [];
	if (toggled) {
		await new Promise((r) => setTimeout(r, 300));
		after = await auditState(page, `after the toggle (${toggled})`);
	}
	await page.close();
	return [...asExported, ...after];
}

function report(name, rows) {
	const failing = rows.filter((x) => !x.exempt && x.r < x.need);
	const exempt = rows.filter((x) => x.exempt && x.r < x.need);
	const byState = new Map();
	for (const row of failing) {
		if (!byState.has(row.state)) byState.set(row.state, []);
		byState.get(row.state).push(row);
	}
	const head = `${name} — ${rows.length} runs · ${failing.length} below AA${exempt.length ? ` (+${exempt.length} muted-chrome, exempt)` : ''}`;
	console.log(`\n${'='.repeat(90)}\n${head}\n${'='.repeat(90)}`);
	for (const [state, list] of byState) {
		console.log(`\n  ── ${state} ── ${list.length} below AA`);
		for (const b of list.sort((p, q) => p.r - q.r)) {
			const flags = [b.gradient ? `gradient, worst ${b.worst}:1` : '', b.sampled ? '' : 'modelled backdrop', b.imgBackdrop ? 'image backdrop' : '']
				.filter(Boolean)
				.join(', ');
			console.log(
				`   p${String(b.page).padStart(2)} ${(b.cls || '').padEnd(26).slice(0, 26)} ${b.tag.padEnd(12)}` +
					` ${b.r.toFixed(2)}:1 (need ${b.need})  rgb(${b.fg}) on rgb(${b.bg})${flags ? `  [${flags}]` : ''}\n        "${b.text}"`,
			);
		}
	}
	return failing;
}

async function main() {
	const argv = process.argv.slice(2);
	let jsonOut = null;
	const inputs = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--json') jsonOut = argv[++i];
		else inputs.push(argv[i]);
	}
	if (!inputs.length) {
		console.error('usage: node tools/check-player-contrast.js [--json out.json] <deck.md|player.html> ...');
		process.exit(2);
	}
	const browser = await puppeteer.launch({
		executablePath: process.env.CHROME_PATH,
		args: ['--no-sandbox', '--font-render-hinting=none'],
	});
	const all = [];
	let failed = 0;
	try {
		for (const input of inputs) {
			let file;
			try {
				file = playerFor(input);
			} catch (err) {
				console.error(`\n!! ${input}: ${err.message}`);
				failed += 1;
				continue;
			}
			const rows = await auditPlayer(browser, file);
			const bad = report(path.basename(input), rows);
			failed += bad.length;
			all.push({ deck: path.basename(input), rows });
		}
	} finally {
		await browser.close();
	}
	if (jsonOut) fs.writeFileSync(jsonOut, `${JSON.stringify(all, null, '\t')}\n`);
	console.log(`\n${'='.repeat(90)}\n${all.reduce((n, d) => n + d.rows.length, 0)} runs across ${all.length} deck(s) · ${failed} below AA\n`);
	process.exit(failed ? 1 : 0);
}

module.exports = { sampleBackdrop, ratio, over, HIDE_INK };

if (require.main === module) main();
