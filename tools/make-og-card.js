#!/usr/bin/env node
/**
 * Rasterize the site's social card (og:image) into docs/public/og/lattice.png.
 *
 * It is the image a link preview shows when someone shares a lattice.style URL (#3207).
 *
 * WHY A RASTER. Link unfurlers (Slack, LinkedIn, X, iMessage, Discord) mostly refuse SVG and
 * some refuse WebP, so the card is a PNG at the 1200×630 size every one of them accepts.
 *
 * WHAT IS ON IT. Nothing invented: the brand lockup (design/logo/lattice-lockup.svg), the
 * landing page's own promise, and three slides the real engine rendered — the showcase rasters
 * docs/scripts/rasterize-showcase.mjs commits under docs/public/showcase/ — so the card shows the
 * product rather than a picture of one. The light variant throughout: a link preview sits on a
 * chat or feed surface we do not control, and the cream card reads on both a light and a dark one.
 *
 * Committed, like the PWA icons; re-run after a change to the lockup, the promise or the
 * showcase slides it uses:
 *
 *   node tools/make-og-card.js
 *
 * Chromium resolution mirrors tools/screenshot.js: CHROME_PATH env wins, then the puppeteer
 * cache. --no-sandbox because the sandbox container runs as root.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('./lib/resolve-chrome');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'public', 'og', 'lattice.png');
const LOCKUP = path.join(ROOT, 'design', 'logo', 'lattice-lockup.svg');
const FONTS = path.join(ROOT, 'docs', 'src', 'playground', 'fonts');
const SHOWCASE = path.join(ROOT, 'docs', 'public', 'showcase');

// The brand surfaces the mark's halos are cut from (tools/make-pwa-icons.js), and the site's
// light-mode ink: fixed, not themeable, because this is one image for every palette.
const CREAM = '#FAF7F2';
const INK = '#1F1A14';
const MUTED = '#5C5247';
const RULE = '#E6DED2';

// The three slides, BACK to front (later paints on top). A statement, a number and a chart:
// three of the things a boardroom deck is made of, each drawn by the engine. The chart is in
// front and whole; the two behind show their headings.
const SLIDES = ['quote', 'kpi', 'bar'];

const WIDTH = 1200;
const HEIGHT = 630;

const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;

function html() {
	const font = (name, file, weight, style = 'normal') =>
		`@font-face{font-family:'${name}';src:url(${dataUrl(path.join(FONTS, file), 'font/woff2')}) format('woff2');font-weight:${weight};font-style:${style}}`;
	const slides = SLIDES.map((s, i) => `<img class="s s${i}" src="${dataUrl(path.join(SHOWCASE, `${s}.light.webp`), 'image/webp')}" alt="">`).join('');
	const lockup = fs.readFileSync(LOCKUP, 'utf8').replace('<svg ', '<svg class="lockup" ');
	return `<!doctype html><html><head><meta charset="utf-8"><style>
${font('Playfair Display', 'playfair-display-700.woff2', 700)}
${font('Outfit', 'outfit-400.woff2', 400)}
${font('Outfit', 'outfit-500.woff2', 500)}
*{box-sizing:border-box}
html,body{margin:0;width:${WIDTH}px;height:${HEIGHT}px;background:${CREAM};overflow:hidden}
.card{position:relative;width:100%;height:100%;display:grid;grid-template-columns:560px 1fr}
.copy{padding:64px 0 56px 72px;display:flex;flex-direction:column;gap:22px}
.lockup{height:44px;width:auto;display:block;align-self:flex-start}
h1{font:700 54px/1.06 'Playfair Display',serif;color:${INK};letter-spacing:-0.01em;margin:auto 0 0}
p{font:400 23px/1.4 'Outfit',sans-serif;color:${MUTED};margin:0;max-width:30ch}
.url{font:500 19px/1 'Outfit',sans-serif;color:${INK};letter-spacing:0.02em;padding-top:18px;border-top:1px solid ${RULE};margin-top:8px}
.stack{position:relative}
.s{position:absolute;width:560px;height:auto;border-radius:10px;box-shadow:0 1px 2px rgba(31,26,20,.10),0 14px 36px rgba(31,26,20,.16)}
.s0{left:150px;top:40px}
.s1{left:104px;top:164px}
.s2{left:58px;top:288px}
</style></head><body><div class="card">
<div class="copy">${lockup}<h1>Markdown in.<br>Boardroom-ready decks out.</h1><p>Pick a layout per slide; Lattice renders the PDF, PPTX or HTML deck in one palette, with no design work.</p><div class="url">lattice.style</div></div>
<div class="stack">${slides}</div>
</div></body></html>`;
}

async function main() {
	fs.mkdirSync(path.dirname(OUT), { recursive: true });
	const browser = await puppeteer.launch({
		executablePath: resolveChrome(),
		headless: true,
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});
	try {
		const page = await browser.newPage();
		await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
		await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
		await page.setContent(html(), { waitUntil: 'load' });
		await page.evaluate(() => document.fonts.ready);
		await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
	} finally {
		await browser.close();
	}
	console.log(`og card → ${path.relative(ROOT, OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
