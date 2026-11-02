/**
 * Integration: an icon draws as a glyph of the Lattice Icons font by default, and every CLI format carries it
 * (engineering/decisions/2026-11-01-icon-font.md § 3.4).
 *
 *   PDF   the font is embedded, an inline icon copies as its label (a pill's icon as nothing), and the glyphs land where
 *         `icon: svg` draws the <svg>: the same ink in the same place.
 *   system  under `fonts: system-emoji` no file carries the font and the page shows the <svg>: pixel for pixel the
 *         `icon: svg` page.
 *   PPTX / ODP  each icon is a text run in "Lattice Icons", and the face is embedded.
 *   HTML  the player carries the faces cut to the deck's icons; under `system` the page and the player show each
 *         <svg>, and under `icon: svg` neither carries the font.
 *   hidden  no `display:none` <svg> is drawn into the PDF (they once printed at the page's top-left corner).
 *
 * FALSIFIABLE: with the glyph hidden (the default `svg`), no format embeds the font and the copy text loses its labels.
 * Needs Chromium and poppler.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');
const JSZip = require('jszip');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const { ICON_CODEPOINTS } = require(path.join(ROOT, 'lib', 'fonts', 'icon-faces.js'));

const BODY = ['## Icons', '', 'Storage `^{database, c3}` and `{S3, icon=bucket, c4}` and `{icon=lock}` done.', ''];
const deck = (extra, body = BODY) => ['---', 'theme: indaco', ...extra, '---', '', ...body].join('\n');

describe('icon-font-exports', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-icon-font-'));
	let browser;
	before(async () => { browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] }); });
	after(async () => { await browser?.close(); fs.rmSync(dir, { recursive: true, force: true }); });
	const render = (name, extra, out, args = [], body = BODY) => {
		const md = path.join(dir, `${name}.md`);
		fs.writeFileSync(md, deck(extra, body));
		const r = spawnSync(process.execPath, [EMULATOR, md, path.join(dir, out), ...args], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
		assert.equal(r.status, 0, `${out}: ${r.stderr}`);
		return path.join(dir, out);
	};
	const fontsOf = (pdf) => execFileSync('pdffonts', [pdf], { encoding: 'utf8' });
	/** The page as gray pixels at 2x, via poppler. */
	const pixels = (pdf, stem) => {
		execFileSync('pdftoppm', ['-gray', '-r', '144', pdf, path.join(dir, stem)]);
		const file = fs.readdirSync(dir).find((f) => f.startsWith(`${stem}-`) && f.endsWith('.pgm'));
		const buf = fs.readFileSync(path.join(dir, file));
		const head = buf.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
		return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
	};
	/** Ink (darkness from white, summed) and its center, over the whole page. */
	const ink = (img) => {
		let n = 0, sx = 0, sy = 0;
		for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
			const v = 255 - img.px[y * img.w + x];
			n += v; sx += v * x; sy += v * y;
		}
		return { n, cx: sx / n, cy: sy / n };
	};

	const fontPdf = render('font', [], 'font.pdf');
	const svgPdf = render('svg', ['icon: svg'], 'svg.pdf');
	const systemPdf = render('system', ['fonts: system-emoji'], 'system.pdf');

	test('the PDF embeds the icon font and copies each icon as what a screen reader says', () => {
		assert.match(fontsOf(fontPdf), /LatticeIcons/);
		assert.doesNotMatch(fontsOf(svgPdf), /LatticeIcons/, '`icon: svg` carries no icon font');
		const text = execFileSync('pdftotext', ['-raw', fontPdf, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
		assert.match(text, /Storage database and S3 and lock done\./, 'the inline icon and the icon-only pill copy as their labels; the labeled pill\'s icon copies as nothing');
		assert.doesNotMatch(text, /[-]/, 'no private-use character reaches the copy text');
	});

	test('the glyphs land where `icon: svg` draws the <svg>: the same ink in the same place', () => {
		const a = ink(pixels(svgPdf, 'svg'));
		const b = ink(pixels(fontPdf, 'font'));
		assert.ok(Math.abs(b.n / a.n - 1) < 0.02, `ink ${(100 * b.n / a.n).toFixed(1)}% of the svg page`);
		// 144 dpi on a 960 pt page: 1 slide px is 1.5 device px.
		assert.ok(Math.hypot(b.cx - a.cx, b.cy - a.cy) < 0.75, `the ink's center moved ${Math.hypot(b.cx - a.cx, b.cy - a.cy).toFixed(2)} device px`);
	});

	test('no glyph is left in the photo under the text: the photo is the `icon: svg` photo, whose icons are vectors', () => {
		// Each PDF's one picture is its background photo; a glyph the writer drew as text AND left in the photo would show
		// in the font PDF's photo only (a pill's `::before` once stayed there, drawn twice).
		const photo = (pdf, stem) => {
			execFileSync('pdfimages', [pdf, path.join(dir, stem)]);
			const file = fs.readdirSync(dir).find((f) => f.startsWith(`${stem}-`) && /\.(ppm|pgm)$/.test(f));
			const buf = fs.readFileSync(path.join(dir, file));
			const head = buf.toString('latin1', 0, 64).match(/^P([56])\s+(\d+)\s+(\d+)\s+(\d+)\s/);
			return { ch: head[1] === '6' ? 3 : 1, w: Number(head[2]), h: Number(head[3]), px: buf.subarray(head[0].length) };
		};
		const a = photo(svgPdf, 'svgphoto'), b = photo(fontPdf, 'fontphoto');
		assert.deepEqual([b.w, b.h], [a.w, a.h]);
		let off = 0;
		for (let i = 0; i < a.px.length; i += a.ch) if (Math.abs(a.px[i] - b.px[i]) > 40) off++;
		assert.ok(off < 20, `${off} photo pixels differ: a glyph is in the photo`);
	});

	test('no hidden <svg> is drawn: a bare icon\'s page is pixel for pixel its `icon: svg` page, the top-left corner included', () => {
		// Each icon's <svg> is `display:none` while its glyph shows. The reader once drew those shapes anyway, under the
		// identity matrix, so every icon also printed at the page's top-left corner: a bare one in ink.
		const body = ['## Storage `^{database}` overview', '', ...BODY.slice(2)];
		const a = pixels(render('bare-svg', ['icon: bare svg'], 'bare-svg.pdf', [], body), 'baresvg');
		const b = pixels(render('bare-font', ['icon: bare'], 'bare-font.pdf', [], body), 'barefont');
		let corner = 0;
		for (let y = 0; y < 120; y++) for (let x = 0; x < 120; x++) if (Math.abs(a.px[y * a.w + x] - b.px[y * b.w + x]) > 24) corner++;
		assert.equal(corner, 0, `${corner} pixels in the top-left corner differ: a hidden icon was drawn there`);
		const ia = ink(a), ib = ink(b);
		assert.ok(Math.abs(ib.n / ia.n - 1) < 0.02, `ink ${(100 * ib.n / ia.n).toFixed(1)}% of the svg page`);
	});

	test('under `fonts: system-emoji` no icon font travels and the page is the `icon: svg` page', () => {
		assert.doesNotMatch(fontsOf(systemPdf), /LatticeIcons/);
		const a = pixels(svgPdf, 'svg2');
		const b = pixels(systemPdf, 'sys');
		let off = 0;
		for (let i = 0; i < a.px.length; i++) if (Math.abs(a.px[i] - b.px[i]) > 24) off++;
		assert.ok(off / a.px.length < 0.0005, `${off} pixels differ from the svg page`);
	});

	test('an editable PowerPoint and ODP hold each icon as a run in the embedded Lattice Icons face', async () => {
		const glyphs = ['database', 'bucket', 'lock'].map((n) => String.fromCodePoint(Number.parseInt(ICON_CODEPOINTS[n], 16)));
		const pptx = await JSZip.loadAsync(fs.readFileSync(render('font', [], 'font.pptx', ['--editable'])));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		for (const g of glyphs) assert.ok(slide.includes(`<a:t>${g}</a:t>`), `no run for U+${g.codePointAt(0).toString(16)}`);
		assert.match(slide, /typeface="Lattice Icons/);
		const pres = await pptx.file('ppt/presentation.xml').async('string');
		assert.match(pres, /<p:font typeface="Lattice Icons/, 'the face is in the embedded font list');
		const odp = await JSZip.loadAsync(fs.readFileSync(render('font', [], 'font.odp', ['--editable'])));
		const content = await odp.file('content.xml').async('string');
		for (const g of glyphs) assert.ok(content.includes(g), `the ODP lost U+${g.codePointAt(0).toString(16)}`);
		const styles = await odp.file('styles.xml').async('string');
		assert.match(content + styles, /Lattice Icons/);
		assert.ok(Object.keys(odp.files).some((n) => /^Fonts\//.test(n)), 'the ODP embeds its faces');
	});

	test('the HTML player carries the icon faces cut to the deck\'s icons', () => {
		const html = fs.readFileSync(render('font', [], 'font.html', ['--player']), 'utf8');
		const faces = [...html.matchAll(/@font-face\{font-family:'Lattice Icons'[^}]*base64,([A-Za-z0-9+/=]+)/g)];
		assert.ok(faces.length > 0, 'no Lattice Icons face in the player');
		for (const f of faces) assert.ok(f[1].length * 0.75 < 4000, `a face is ${Math.round(f[1].length * 0.75)} bytes: not cut to the deck's icons`);
	});

	test('the HTML player and page show each icon\'s <svg> under `fonts: system-emoji`, and carry no icon font under `icon: svg`', async () => {
		// The player writes an <html> of its own, so the switch must ride on the slides: an attribute on the page's root was
		// lost there, and the player drew the glyph in no font at all.
		const shown = async (file) => {
			const page = await browser.newPage();
			await page.goto(`file://${file}`, { waitUntil: 'load' });
			const r = await page.evaluate(() => {
				const on = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length).length;
				return { svg: on('section .lat-icon-svg, section .lat-pill-icon'), glyph: on('section [data-glyph]'), all: document.querySelectorAll('section .lat-icon, section .lat-pill-icon').length };
			});
			await page.close();
			return r;
		};
		for (const args of [['--player'], []]) {
			const file = render('system', ['fonts: system-emoji'], `system${args.length ? '-player' : ''}.html`, args);
			const html = fs.readFileSync(file, 'utf8');
			assert.doesNotMatch(html, /font-family:\s*'?Lattice Icons'?[^}]*base64/, `${args[0] || '.html'}: an icon face travelled under system`);
			const r = await shown(file);
			assert.ok(r.all > 0, 'no icon on the page');
			assert.equal(r.glyph, 0, `${args[0] || '.html'}: ${r.glyph} glyphs shown with no font to draw them`);
			assert.ok(r.svg >= 3, `${args[0] || '.html'}: only ${r.svg} icon <svg> shown`);
		}
		const svgHtml = fs.readFileSync(render('svg', ['icon: svg'], 'svg.html', ['--player']), 'utf8');
		assert.doesNotMatch(svgHtml, /font-family:\s*'?Lattice Icons'?[^}]*base64/, '`icon: svg` draws no glyph, so it carries no icon font');
	});
});
