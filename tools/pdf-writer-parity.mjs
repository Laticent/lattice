#!/usr/bin/env node
// PDF writer parity — the shared writer (lib/core/pdf-compose) against Chrome's printer.
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
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { pixelDiff, montageTriptych } = require('./pixel-check.js');
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
		const p = spawn(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), src, out, '--quiet', ...extra], { cwd: ROOT, env: { ...process.env, ...env } });
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
		render(src, mine, [], { LATTICE_PDF_REPORT: rep }),
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
	return { name, ms: Date.now() - t0, pages, report, bytes: { writer: fs.statSync(mine).size, chrome: fs.statSync(chrome).size } };
}

/**
 * The screen oracle: the CLI's .html sidecar, each slide on its export face, screenshotted by
 * Chrome at 1x and packed one image per page. That is exactly what a person sees.
 */
async function screenOracle(html, outPdf) {
	const { default: puppeteer } = await import('puppeteer');
	const { PDFDocument } = await import('pdf-lib');
	const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox'] });
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
		const r = await one(src);
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
	worst: allPages.slice(0, 25).map((p) => ({ deck: p.deck, page: p.page, pct: +(p.frac * 100).toFixed(2), note: p.note, montage: p.montage && path.relative(ROOT, p.montage) })),
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, worst: summary.worst.slice(0, 10) }, null, 2));
