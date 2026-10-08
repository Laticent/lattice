#!/usr/bin/env node
// PDF writer parity — the shared writer (lib/core/pdf-compose) against the screen, with a thin-line sweep.
//
// Renders each deck through the CLI with the shared writer (the default), then compares it,
// page by page, with an ORACLE. `--oracle screen` (the default) is what the slide looks like:
// Chrome's own screenshot of each slide on its export face, the face the writer photographs.
// `--oracle chrome` is Chrome's printer (`--chrome-pdf`), which is NOT ground truth — it drops
// fill-opacity on gradient-filled SVG shapes and draws a spotlight's hard print-face arc, so
// it flags pages where the writer is right. Both are rasterized and pixel-diffed with the
// regression gate's comparator (tools/pixel-check.js pixelDiff), and reports, worst first:
// how much of each page differs, and what the writer left in the photo and why
// (LATTICE_PDF_REPORT). Montages of the worst pages go to the output directory for a
// human to look at: a percentage says WHERE to look, never whether it is right.
//
// A percentage cannot see a THIN-LINE defect: a 1px line running to the page edge moves
// under 1% of a page, and a whole slide blanked below a broken operator ranked nowhere. So
// each page also gets `run`, the longest line of differing pixels along any row or column
// at the screen's own scale (96 dpi). A pixel counts only if its color falls outside the
// range of its 3x3 neighbors on the other side AND the ink in that neighborhood differs: a
// sub-pixel shift, or a line drawn crisper than the 1x screenshot, does not count; a line
// present on one side only does. `summary.thin` lists the longest runs, worst first.
// engineering/decisions/2026-09-27-studio-export-one-engine.md (the thin-line sweep).
// engineering/decisions/2026-09-27-studio-export-one-engine.md.
//
// On-demand, like the regression gate — never a CI step: two Chrome renders per deck.
//
// Usage:
//   node tools/pdf-writer-parity.mjs --galleries            # every lib/components/**/*.gallery.md
//   node tools/pdf-writer-parity.mjs deck.md other.md       # named decks
//     --jobs N        parallel decks (default 4)
//     --fuzz P        per-channel tolerance (default 8%, text anti-aliasing differs by writer)
//     --montages N    worst pages to montage (default 40)
//     --out DIR       default .scratch/pdf-writer-parity
//     --oracle screen|chrome   what to compare against (default screen)
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { pixelDiff, montageTriptych } = require('./pixel-check.js');
const { PNG } = require('pngjs');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const JOBS = Number(opt('--jobs', 4));
const FUZZ = opt('--fuzz', '8%');
const MONTAGES = Number(opt('--montages', 40));
const OUT = path.resolve(ROOT, opt('--out', '.scratch/pdf-writer-parity'));
const ORACLE = opt('--oracle', 'screen');
const flagsWithValue = new Set(['--jobs', '--fuzz', '--montages', '--out', '--oracle']);
let decks = argv.filter((a, i) => !a.startsWith('--') && !flagsWithValue.has(argv[i - 1]));
if (argv.includes('--galleries')) {
	const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.gallery.md') ? [path.join(d, e.name)] : []));
	decks = decks.concat(walk(path.join(ROOT, 'lib', 'components')));
}
if (!decks.length) {
	console.error('usage: node tools/pdf-writer-parity.mjs [--galleries] [deck.md …]');
	process.exit(2);
}
fs.mkdirSync(OUT, { recursive: true });

function render(src, out, extra, env = {}) {
	return new Promise((resolve) => {
		const p = spawn(process.execPath, [path.join(ROOT, 'lattice.js'), src, out, '--quiet', ...extra], { cwd: ROOT, env: { ...process.env, ...env } });
		let err = '';
		p.stderr.on('data', (d) => { err += d; });
		p.on('close', (code) => resolve({ code, err }));
	});
}

async function one(src) {
	const name = path.relative(ROOT, src).replace(/[/\\]/g, '__').replace(/\.md$/, '');
	const mine = path.join(OUT, `${name}.writer.pdf`), chrome = path.join(OUT, `${name}.chrome.pdf`), rep = path.join(OUT, `${name}.report.json`);
	const t0 = Date.now();
	const [a, b] = await Promise.all([
		// `--keep-html` only for the screen oracle, which reads the sidecar; it is deleted
		// on success by default (P1).
		render(src, mine, ORACLE === 'screen' ? ['--keep-html'] : [], { LATTICE_PDF_REPORT: rep }),
		ORACLE === 'chrome' ? render(src, chrome, ['--chrome-pdf']) : Promise.resolve({ code: 0 }),
	]);
	if (a.code || b.code || !fs.existsSync(rep)) return { name, error: (a.err || b.err || 'the shared writer did not run (fell back to Chrome)').split('\n')[0] };
	if (ORACLE === 'screen') await screenOracle(mine.replace(/\.pdf$/, '.html'), chrome);
	const diff = pixelDiff(chrome, mine, `parity-${name}`, { fuzz: FUZZ });
	const pages = [];
	for (let i = 1; i <= diff.pages; i++) {
		const d = diff.perPage.find((p) => p.page === i);
		pages.push({ page: i, frac: d ? (d.pixels < 0 ? 1 : d.pixels / d.total) : 0, ...(d?.note ? { note: d.note } : {}), d });
	}
	const report = JSON.parse(fs.readFileSync(rep, 'utf8'));
	for (const t of thinRuns(chrome, mine, name)) { const p = pages.find((q) => q.page === t.page); if (p) Object.assign(p, t); }
	return { name, ms: Date.now() - t0, pages, report, bytes: { writer: fs.statSync(mine).size, chrome: fs.statSync(chrome).size } };
}

/** Per page: the longest run of differing pixels along a row or column, and where it is. */
function thinRuns(oraclePdf, writerPdf, name) {
	const T = 48;
	const tmp = fs.mkdtempSync(path.join(OUT, `.thin-${name.slice(-40)}-`));
	try {
		for (const [tag, pdf] of [['a', oraclePdf], ['b', writerPdf]]) spawnSync('pdftoppm', ['-r', '96', '-png', pdf, path.join(tmp, tag)]);
		const num = (f) => Number(f.match(/-(\d+)\.png$/)[1]);
		const out = [];
		for (const fa of fs.readdirSync(tmp).filter((f) => f.startsWith('a-'))) {
			const fb = fa.replace(/^a-/, 'b-');
			if (!fs.existsSync(path.join(tmp, fb))) continue;
			const A = PNG.sync.read(fs.readFileSync(path.join(tmp, fa))), B = PNG.sync.read(fs.readFileSync(path.join(tmp, fb)));
			if (A.width !== B.width || A.height !== B.height) continue;
			const { width: w, height: h } = A;
			const far = (P, Q, x, y) => {
				for (let c = 0; c < 3; c++) {
					let lo = 255, hi = 0;
					for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
						const xx = x + dx, yy = y + dy;
						if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
						const v = Q.data[(yy * w + xx) * 4 + c];
						if (v < lo) lo = v;
						if (v > hi) hi = v;
					}
					const v = P.data[(y * w + x) * 4 + c];
					if (v < lo - T || v > hi + T) return true;
				}
				return false;
			};
			const ink = (P, x, y, c) => {
				let v = 0;
				for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) v += 255 - P.data[(Math.min(h - 1, Math.max(0, y + dy)) * w + Math.min(w - 1, Math.max(0, x + dx))) * 4 + c];
				return v;
			};
			const bad = new Uint8Array(w * h);
			for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
				bad[y * w + x] = (far(A, B, x, y) || far(B, A, x, y)) && [0, 1, 2].some((c) => Math.abs(ink(A, x, y, c) - ink(B, x, y, c)) > 2 * T) ? 1 : 0;
			}
			let run = 0, where = '';
			for (let y = 0; y < h; y++) { let r = 0; for (let x = 0; x < w; x++) { r = bad[y * w + x] ? r + 1 : 0; if (r > run) { run = r; where = `row y=${y} x<=${x}`; } } }
			for (let x = 0; x < w; x++) { let r = 0; for (let y = 0; y < h; y++) { r = bad[y * w + x] ? r + 1 : 0; if (r > run) { run = r; where = `col x=${x} y<=${y}`; } } }
			out.push({ page: num(fa), run, where });
		}
		return out;
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

/**
 * The screen oracle: the CLI's .html sidecar, each slide on its export face, screenshotted by
 * Chrome at 1x and packed one image per page. That is exactly what a person sees.
 */
async function screenOracle(html, outPdf) {
	const { default: puppeteer } = await import('puppeteer');
	const { PDFDocument } = await import('pdf-lib');
	// A launch that waits out Puppeteer's 30 s default is slow, not broken: while the writer's own
	// renders hold the other Chromes, a cold start passed it and aborted a 330-deck run at deck 5.
	const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'], timeout: 120_000 });
	try {
		const page = await browser.newPage();
		await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
		const size = await page.evaluate(() => { const r = document.querySelector('section[data-lattice-slide]').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
		await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1 });
		const doc = await PDFDocument.create();
		for (const h of await page.$$('section[data-lattice-slide]')) {
			await h.evaluate((el) => { el.classList.add('lattice-exporting'); window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top); });
			const png = await h.screenshot({ type: 'png', captureBeyondViewport: false });
			const img = await doc.embedPng(png);
			doc.addPage([size.w * 0.75, size.h * 0.75]).drawImage(img, { x: 0, y: 0, width: size.w * 0.75, height: size.h * 0.75 });
		}
		fs.writeFileSync(outPdf, await doc.save());
	} finally {
		await browser.close();
	}
}

const results = [];
let next = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
	while (next < decks.length) {
		const src = decks[next++];
		// One deck's failure is that deck's ERROR row, never the whole run: an escaped rejection
		// here used to reject Promise.all and throw away every result so far.
		const r = await one(src).catch((e) => ({ name: path.relative(ROOT, src).replace(/[/\\]/g, '__').replace(/\.md$/, ''), error: String(e?.message || e).split('\n')[0] }));
		results.push(r);
		const worst = r.pages ? Math.max(0, ...r.pages.map((p) => p.frac)) : null;
		console.log(`${String(results.length).padStart(3)}/${decks.length} ${r.name}${r.error ? `  ERROR ${r.error}` : `  worst page ${(worst * 100).toFixed(2)}%  ${(r.bytes.writer / 1024).toFixed(0)} KB vs ${(r.bytes.chrome / 1024).toFixed(0)} KB`}`);
	}
}));

// Worst pages first; montage the top ones.
const allPages = results.flatMap((r) => (r.pages || []).map((p) => ({ deck: r.name, ...p })));
allPages.sort((x, y) => y.frac - x.frac);
const montageDir = path.join(OUT, 'montages');
fs.mkdirSync(montageDir, { recursive: true });
for (const p of allPages.slice(0, MONTAGES)) {
	if (!p.d || p.frac === 0) continue;
	p.montage = montageTriptych(p.d, path.join(montageDir, `${p.deck}.p${String(p.page).padStart(3, '0')}.png`), { title: `${p.deck} p${p.page} — ${ORACLE} | writer | diff` });
}
const refused = {};
for (const r of results) for (const bag of ['refusedText', 'refusedShapes', 'refusedImages']) for (const [k, v] of Object.entries(r.report?.[bag] || {})) refused[`${bag}.${k}`] = (refused[`${bag}.${k}`] || 0) + v;
const sum = (f) => results.reduce((a, r) => a + (r.bytes ? f(r) : 0), 0);
const summary = {
	oracle: ORACLE,
	decks: results.length,
	errors: results.filter((r) => r.error).map((r) => ({ deck: r.name, error: r.error })),
	pages: allPages.length,
	pagesOver: { '0.5%': allPages.filter((p) => p.frac > 0.005).length, '2%': allPages.filter((p) => p.frac > 0.02).length, '5%': allPages.filter((p) => p.frac > 0.05).length },
	bytes: { writer: sum((r) => r.bytes.writer), chrome: sum((r) => r.bytes.chrome) },
	drawn: { words: sum((r) => r.report.words), shapes: sum((r) => r.report.shapes), images: sum((r) => r.report.images), links: sum((r) => r.report.links) },
	leftInPhoto: refused,
	// The thin-line sweep: the longest runs, which a percentage ranking cannot surface.
	thin: [...allPages].filter((p) => p.run).sort((x, y) => y.run - x.run).slice(0, 40).map((p) => ({ deck: p.deck, page: p.page, run: p.run, where: p.where })),
	worst: allPages.slice(0, 25).map((p) => ({ deck: p.deck, page: p.page, pct: +(p.frac * 100).toFixed(2), note: p.note, montage: p.montage && path.relative(ROOT, p.montage) })),
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, worst: summary.worst.slice(0, 10), thin: summary.thin.slice(0, 10) }, null, 2));
