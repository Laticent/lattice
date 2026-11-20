#!/usr/bin/env node
/**
 * tools/pdfkit-check/check.mjs — does Apple's PDFKit draw an exported finish PDF the way the screen shows it?
 *
 * Why: the shared PDF writer draws a finish's backdrop (engineering/decisions/2026-11-20-backdrop-gradient-fidelity.md):
 * the glows as a quarter-resolution picture scaled with /Interpolate, fades as a flat image under an image soft mask,
 * textures as paths. Poppler, MuPDF, Ghostscript and PDFium were measured on Linux; PDFKit, the renderer behind Preview
 * and the iPhone's PDF viewer (where the owner reads exports), cannot run there. A PDFKit that ignored /Interpolate would
 * draw the glow in 4 px blocks (a level apart at most, see below); one that dropped the soft mask would paint a solid box. This is the
 * `pdf-pdfkit` platform suite (.github/platform-suites.json), on a macOS runner.
 *
 * What it does, for each deck (default: examples/backdrop-vector-export.md):
 *   1. exports the PDF with the CLI, and the HTML, and screenshots each slide in Chrome at 1280x720 (the screen);
 *   2. draws each PDF page through PDFKit (render.swift, compiled with swiftc) at the same size;
 *   3. per slide: the worst 32 px tile's difference from the screen (metrics.mjs `worstTile`: a dropped soft mask or a
 *      missing fade puts one region far off while the slide's mean barely moves), and, reported only, the share of large
 *      steps in a glow patch at 3x. A glow changes by under a level every 4 px, so a viewer that ignored /Interpolate would
 *      draw stairs of a level at most: invisible, and not something a gate can tell from rounding.
 *   4. reported only, to tell a fault in the drawing from one in how PDFKit shows any picture: where the worst tile is, with
 *      both colors there and the slide's mean signed difference per channel (a color-management shift moves every tile the
 *      same way; a dropped mask moves one region); and a CONTROL arm, the same deck with the backdrop refused (a zero blur on
 *      `.backdrop`, which `readBackdrop` refuses as `backdrop-effect` and which paints the same), so the writer photographs
 *      it whole as it did before the backdrop was drawn.
 * It fails when any tile is more than MAX_TILE levels from the screen (the drawn arm only). Evidence goes to
 * platform-suite-artifacts/pdf-pdfkit/: each page as PDFKit drew it, the screen, and report.json.
 *
 * Elsewhere (Linux) it draws the pages with poppler instead (`pdftoppm`), so the comparison itself is testable, and says
 * so: a pass there is not a PDFKit pass.
 *
 * Usage: node tools/pdfkit-check/check.mjs [deck.md ...]
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { blockiness, worstTile, worstTileAt } from './metrics.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const OUT = path.join(ROOT, 'platform-suite-artifacts', 'pdf-pdfkit');
/** Levels the worst 32 px tile of a slide may differ from the screen, by its mean color (metrics.mjs `worstTile`). */
const MAX_TILE = Number(process.env.PDFKIT_MAX_TILE || 12);
const W = 1280, H = 720;

const decks = process.argv.slice(2).length ? process.argv.slice(2) : ['examples/backdrop-vector-export.md'];
const mac = process.platform === 'darwin';
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfkit-'));

let renderer = null;
if (mac) {
	renderer = path.join(tmp, 'render');
	execFileSync('swiftc', ['-O', path.join(ROOT, 'tools', 'pdfkit-check', 'render.swift'), '-o', renderer], { stdio: 'inherit' });
} else {
	console.log('pdfkit-check: not macOS, so pages are drawn with poppler (pdftoppm). This checks the comparison, not PDFKit.');
}

/** Draw every page of `pdf` into `dir` as page-NN.png at `ppp` pixels per point. */
function drawPages(pdf, dir, ppp) {
	fs.mkdirSync(dir, { recursive: true });
	if (renderer) execFileSync(renderer, [pdf, dir, String(ppp)], { stdio: 'inherit' });
	else {
		execFileSync('pdftoppm', ['-r', String(ppp * 72), '-png', pdf, path.join(dir, 'p')]);
		for (const f of fs.readdirSync(dir)) {
			const m = f.match(/^p-0*(\d+)\.png$/);
			if (m) fs.renameSync(path.join(dir, f), path.join(dir, `page-${String(m[1]).padStart(2, '0')}.png`));
		}
	}
	return fs.readdirSync(dir).filter((f) => /^page-\d+\.png$/.test(f)).sort().map((f) => path.join(dir, f));
}

const readPng = (file) => PNG.sync.read(fs.readFileSync(file));

const report = { renderer: mac ? 'pdfkit' : 'poppler', maxTile: MAX_TILE, decks: [] };
let failed = 0;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
try {
	for (const deck of decks) {
		const slug = path.basename(deck, '.md');
		const dir = path.join(OUT, slug);
		fs.mkdirSync(dir, { recursive: true });
		const pdf = path.join(tmp, `${slug}.pdf`), html = path.join(tmp, `${slug}.html`);
		execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), deck, pdf, '--quiet'], { cwd: ROOT, stdio: 'inherit' });
		execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), deck, html, '--quiet'], { cwd: ROOT, stdio: 'inherit' });
		fs.copyFileSync(pdf, path.join(dir, `${slug}.pdf`));
		// The control: the same deck, its backdrop photographed whole (refused by a zero blur, which paints the same).
		const control = path.join(path.dirname(path.join(ROOT, deck)), `.${slug}-photo-control.md`), controlPdf = path.join(tmp, `${slug}-photo.pdf`);
		fs.writeFileSync(control, `${fs.readFileSync(path.join(ROOT, deck), 'utf8')}\n\n<style>\nsection > .backdrop { backdrop-filter: blur(0px); }\n</style>\n`);
		try {
			execFileSync(process.execPath, [path.join(ROOT, 'lattice.js'), control, controlPdf, '--quiet'], { cwd: ROOT, stdio: 'inherit' });
		} finally {
			fs.unlinkSync(control);
		}
		fs.copyFileSync(controlPdf, path.join(dir, `${slug}-photo.pdf`));
		// The screen: each slide of the HTML export, as Chrome paints it.
		const page = await browser.newPage();
		await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
		await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
		await page.evaluate(() => document.fonts.ready);
		const sections = await page.$$('section');
		const pages = drawPages(pdf, path.join(dir, 'pdf'), W / (fs.existsSync(pdf) ? pageWidthPt(pdf) : 960));
		const photos = drawPages(controlPdf, path.join(dir, 'pdf-photo'), W / pageWidthPt(controlPdf));
		const zoom = drawPages(pdf, path.join(dir, 'pdf-3x'), (3 * W) / pageWidthPt(pdf));
		const rows = [];
		const rgb = (c) => c.map((v) => Math.round(v)).join(',');
		for (let i = 0; i < pages.length; i++) {
			const shot = path.join(dir, `screen-${String(i + 1).padStart(2, '0')}.png`);
			await sections[i].scrollIntoView();
			await sections[i].screenshot({ path: shot });
			const screen = readPng(shot), drawn = readPng(pages[i]);
			const tile = worstTile(drawn, screen);
			const at = worstTileAt(drawn, screen);
			const photo = photos[i] ? worstTileAt(readPng(photos[i]), screen) : null;
			// Reported, not gated: the share of steps over a level in a glow patch at 3x (see metrics.mjs).
			const z = readPng(zoom[i]);
			const steps = blockiness(z, Math.floor(z.width * 0.55), Math.floor(z.height * 0.62), Math.floor(z.width * 0.4), Math.floor(z.height * 0.3));
			const ok = tile <= MAX_TILE;
			if (!ok) failed++;
			rows.push({ slide: i + 1, worstTile: Math.round(tile * 100) / 100, bigSteps: Math.round(steps * 1000) / 1000, ok, at, photo });
			console.log(`${ok ? 'ok  ' : 'FAIL'} ${slug} slide ${i + 1}: worst ${32}px tile ${tile.toFixed(2)} levels from the screen; steps over a level in the glow ${(steps * 100).toFixed(1)}%`);
			console.log(`       drawn: worst tile at ${at.x},${at.y} pdf ${rgb(at.a)} screen ${rgb(at.b)}; slide mean signed diff ${at.meanDiff.map((v) => v.toFixed(2)).join(',')}`);
			if (photo) console.log(`       photo control: worst tile ${photo.worst.toFixed(2)} at ${photo.x},${photo.y} pdf ${rgb(photo.a)} screen ${rgb(photo.b)}; slide mean signed diff ${photo.meanDiff.map((v) => v.toFixed(2)).join(',')}`);
		}
		await page.close();
		report.decks.push({ deck, slides: rows });
	}
} finally {
	await browser.close();
}
fs.writeFileSync(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
if (failed) {
	console.error(`pdfkit-check: ${failed} slide(s) drawn unlike the screen by ${report.renderer}; pictures in platform-suite-artifacts/pdf-pdfkit/.`);
	process.exit(1);
}
console.log(`pdfkit-check: every slide's worst tile within ${MAX_TILE} levels of the screen, drawn by ${report.renderer}.`);

/** The first page's width in points, read from the PDF's MediaBox. */
function pageWidthPt(file) {
	const m = fs.readFileSync(file, 'latin1').match(/\/MediaBox\s*\[\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)/);
	return m ? Number(m[1]) : 960;
}
