/**
 * Integration: an icon draws as a glyph of the Lattice Icons font by default, and every CLI format carries it
 * (engineering/decisions/2026-11-01-icon-font.md § 3.4).
 *
 *   PDF   the font is embedded, an inline icon copies as its label (a pill's icon as nothing), and the glyphs land where
 *         `icon: svg` draws the <svg>: the same ink in the same place.
 *   system  under `fonts: system-emoji` no file carries the font and the page shows the <svg>: pixel for pixel the
 *         `icon: svg` page.
 *   PPTX / ODP  each icon is a native outline shape and no icon font travels; under `--no-icon-shapes` each icon is a text
 *         run in "Lattice Icons", and the face is embedded. An icon's arcs become cubics that stay on the arc.
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

	// Office files go where no export can follow (Google Slides, iPhone Preview), and those apps ignore embedded fonts: they
	// draw our icon code points as boxes or another font's pictures. So by default each icon is a native outline shape
	// (lib/core/office-icons.js), and the font is the export's opt-in (`--no-icon-shapes`).
	test('an editable PowerPoint and ODP draw each icon as a native outline shape by default, and carry no icon font', async () => {
		const pptx = await JSZip.loadAsync(fs.readFileSync(render('shapes', [], 'shapes.pptx', ['--editable'])));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		const geoms = slide.match(/<a:custGeom>/g) || [];
		assert.equal(geoms.length, 3, 'one shape per icon: database, the bucket pill\'s icon, lock');
		assert.doesNotMatch(slide, /Lattice Icons/, 'no icon run');
		assert.equal((slide.match(/<a:ln[^>]* cap="rnd"[^>]*>/g) || []).length >= 3, true, 'round stroke ends, as the <svg> draws them');
		const pres = await pptx.file('ppt/presentation.xml').async('string');
		assert.doesNotMatch(pres, /Lattice Icons/, 'the face is not embedded');
		const odp = await JSZip.loadAsync(fs.readFileSync(render('shapes', [], 'shapes.odp', ['--editable'])));
		const content = await odp.file('content.xml').async('string');
		assert.equal((content.match(/<draw:custom-shape\b/g) || []).length, 3, 'three outline shapes in the ODP');
		assert.doesNotMatch(content + (await odp.file('styles.xml').async('string')), /Lattice Icons/);
	});

	// The database icon's top is an ellipse (center 12,6, radii 8 and 3, in the 24-unit grid) written as two arcs. Each
	// cubic the reader makes of an arc must stay on that ellipse: with the two control points swapped, the first cubic's
	// midpoint landed at 0.17 of the way from the curve (and the icon drew as a pinched loop).
	test('an icon\'s arcs become cubics that stay on the arc', async () => {
		const pptx = await JSZip.loadAsync(fs.readFileSync(path.join(dir, 'shapes.pptx')));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		// The database icon is the shape whose path starts at its box's left edge a sixth of the way down (4,6 in 4..20 x 3..21).
		const geom = (slide.match(/<a:custGeom>[\s\S]*?<\/a:custGeom>/g) || []).find((g) => {
			const [, gw, gh] = g.match(/<a:path w="(\d+)" h="(\d+)"/).map(Number);
			const [, x, y] = g.match(/<a:moveTo><a:pt x="(-?\d+)" y="(-?\d+)"/).map(Number);
			return x === 0 && Math.abs(gw / gh - 16 / 18) < 0.01 && Math.abs(y / gh - 1 / 6) < 0.01;
		});
		assert.ok(geom, 'the database icon is a shape');
		const [, w, h] = geom.match(/<a:path w="(\d+)" h="(\d+)"/).map(Number);
		const cmds = [...geom.matchAll(/<a:(moveTo|lnTo|cubicBezTo)>([\s\S]*?)<\/a:\1>/g)].map(([, k, body]) => [k, [...body.matchAll(/x="(-?\d+)" y="(-?\d+)"/g)].map((m) => [Number(m[1]), Number(m[2])])]);
		// The drawing's box in icon units: x 4..20, y 3..21 (the cylinder's top and bottom ellipses).
		const toIcon = ([x, y]) => [4 + (x / w) * 16, 3 + (y / h) * 18];
		let at = cmds[0][1][0];
		const off = [];
		for (const [k, pts] of cmds.slice(1, 5)) {
			assert.equal(k, 'cubicBezTo', 'the top ellipse is four cubics');
			const [p1, p2, p3] = pts;
			const mid = [0, 1].map((d) => (at[d] + 3 * p1[d] + 3 * p2[d] + p3[d]) / 8);
			const [X, Y] = toIcon(mid);
			off.push(Math.abs(((X - 12) / 8) ** 2 + ((Y - 6) / 3) ** 2 - 1));
			at = p3;
		}
		assert.ok(Math.max(...off) < 0.03, `cubic midpoints off the ellipse by ${off.map((o) => o.toFixed(3)).join(', ')}`);
	});

	// Each shape must land where the page draws the icon: the browser's own box for the <svg>'s paths (getBBox under the
	// screen transform), in slide px, against the shape's frame in the file. A wrong content box (the tile's padding, the
	// pill's padding-right) or a wrong fit (a pill's `slice`) moves or resizes the shape and fails here.
	test('each icon shape lands on the box the page draws the icon in', async () => {
		render('place', [], 'place.pptx', ['--editable', '--keep-html']);
		const pptx = await JSZip.loadAsync(fs.readFileSync(path.join(dir, 'place.pptx')));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		const slideCx = Number((await pptx.file('ppt/presentation.xml').async('string')).match(/<p:sldSz cx="(\d+)"/)[1]);
		const frames = [...slide.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => m[0]).filter((sp) => sp.includes('<a:custGeom>')).map((sp) => {
			const [, x, y] = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"/).map(Number);
			const [, w, h] = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"/).map(Number);
			return { x, y, w, h };
		});
		const page = await browser.newPage();
		await page.goto(`file://${path.join(dir, 'place.html')}`);
		const boxes = await page.evaluate(() => {
			const sec = document.querySelector('section[data-lattice-slide]');
			sec.classList.add('icon-svg');
			const s = sec.getBoundingClientRect();
			const scale = s.width / sec.offsetWidth;
			return [...sec.querySelectorAll('.lat-icon-svg, .lat-pill-icon')].map((svg) => {
				let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
				for (const p of svg.querySelectorAll('path')) {
					const b = p.getBBox();
					const m = p.getScreenCTM();
					for (const [px, py] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
						const q = new DOMPoint(px, py).matrixTransform(m);
						x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
					}
				}
				return { x: (x0 - s.left) / scale, y: (y0 - s.top) / scale, w: (x1 - x0) / scale, h: (y1 - y0) / scale, width: sec.offsetWidth };
			});
		});
		await page.close();
		assert.equal(boxes.length, 3);
		const emu = slideCx / boxes[0].width;
		for (const b of boxes) {
			const near = frames.find((f) => Math.abs(f.x / emu - b.x) < 0.5 && Math.abs(f.y / emu - b.y) < 0.5 && Math.abs(f.w / emu - b.w) < 0.5 && Math.abs(f.h / emu - b.h) < 0.5);
			assert.ok(near, `no shape at ${JSON.stringify(b)}; shapes: ${JSON.stringify(frames.map((f) => ({ x: f.x / emu, y: f.y / emu, w: f.w / emu, h: f.h / emu })))}`);
		}
	});

	// The bug the owner hit on an iPhone: the room an icon takes in a sentence was held by a stretched 2 px space, and
	// an app that does not honor character spacing exactly slid the next word under the icon. Now the sentence is split
	// at the icon into text boxes where the browser put each piece (reader.ts, SPLIT AT ROOM), so no text box spans an
	// icon and no stretched spacer is left to misread. A piece's box ends at its text (it would otherwise grow over the
	// icon after it and take its clicks).
	test('no text box spans an icon shape, and no stretched spacer holds an icon\'s room', async () => {
		const pptx = await JSZip.loadAsync(fs.readFileSync(path.join(dir, 'shapes.pptx')));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		const rect = (sp) => {
			const [, x, y] = sp.match(/<a:off x="(-?\d+)" y="(-?\d+)"/).map(Number);
			const [, w, h] = sp.match(/<a:ext cx="(\d+)" cy="(\d+)"/).map(Number);
			return { x, y, w, h };
		};
		const sps = [...slide.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => m[0]);
		const icons = sps.filter((sp) => sp.includes('<a:custGeom>')).map(rect);
		const texts = sps.filter((sp) => /<a:t>[^<]*\w/.test(sp) && !sp.includes('<a:custGeom>')).map((sp) => ({ ...rect(sp), text: [...sp.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('') }));
		const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
		for (const t of texts) for (const ic of icons) assert.ok(!over(t, ic), `"${t.text}" spans an icon`);
		assert.ok(texts.some((t) => t.text.trim() === 'Storage'), 'the sentence is split at the icon');
		assert.doesNotMatch(slide, /<a:rPr [^>]*sz="150"[^>]*spc="\d{3,}"/, 'a 1.5 pt spacer stretched by character spacing');
	});

	// A heading split at its icon stays the slide's title: the FIRST piece takes the role (PowerPoint's outline and its
	// accessibility check read the title placeholder), and only one piece does.
	test('a heading with an inline icon keeps its title placeholder, once', async () => {
		const pptx = await JSZip.loadAsync(fs.readFileSync(render('title', [], 'title.pptx', ['--editable'], ['## Storage `^{database}` costs less', '', 'Body.', ''])));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		assert.equal((slide.match(/<p:ph type="title"/g) || []).length, 1, 'one title placeholder');
		assert.match(slide.match(/<p:sp>(?:(?!<\/p:sp>)[\s\S])*?<p:ph type="title"[\s\S]*?<\/p:sp>/)[0], /<a:t>Storage<\/a:t>/, 'the title is the first piece');
	});

	// Apple's Office importer (iPhone Preview, macOS Quick Look) draws custom geometry inside a group as a speck at the
	// group's corner; the same shape at the slide's top level draws right (tools/office-quicklook.mjs, run 41562260174).
	// So an icon is written after its card's group, never in it, and the card stays a group.
	test('no icon shape sits inside a group, and its card is still a group', async () => {
		const pptx = await JSZip.loadAsync(fs.readFileSync(render('cards', [], 'cards.pptx', ['--editable'], ['<!-- _class: cards-grid -->', '', '## Cards', '', '- Gateway `{icon=gateway, c2}`', '  - Hands out the URL.', '- Store `{icon=bucket, c4}`', '  - Keeps each file.', ''])));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		let depth = 0;
		let grouped = 0;
		for (const [tok] of slide.matchAll(/<p:grpSp>|<\/p:grpSp>|<a:custGeom>/g)) {
			if (tok === '<p:grpSp>') depth++;
			else if (tok === '</p:grpSp>') depth--;
			else if (depth > 0) grouped++;
		}
		assert.ok((slide.match(/<a:custGeom>/g) || []).length >= 2, 'the icons are shapes');
		assert.equal(grouped, 0, 'an icon shape sits inside a group');
		assert.ok(slide.includes('<p:grpSp>'), 'the cards are still groups');
	});

	test('`--no-icon-shapes` keeps each icon a run in the embedded Lattice Icons face, for desktop PowerPoint and LibreOffice', async () => {
		const glyphs = ['database', 'bucket', 'lock'].map((n) => String.fromCodePoint(Number.parseInt(ICON_CODEPOINTS[n], 16)));
		const pptx = await JSZip.loadAsync(fs.readFileSync(render('font', [], 'font.pptx', ['--editable', '--no-icon-shapes'])));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		for (const g of glyphs) assert.ok(slide.includes(`<a:t>${g}</a:t>`), `no run for U+${g.codePointAt(0).toString(16)}`);
		assert.match(slide, /typeface="Lattice Icons/);
		assert.doesNotMatch(slide, /<a:custGeom>/, 'no icon shape beside the glyph');
		const pres = await pptx.file('ppt/presentation.xml').async('string');
		assert.match(pres, /<p:font typeface="Lattice Icons/, 'the face is in the embedded font list');
		const odp = await JSZip.loadAsync(fs.readFileSync(render('font', [], 'font.odp', ['--editable', '--no-icon-shapes'])));
		const content = await odp.file('content.xml').async('string');
		for (const g of glyphs) assert.ok(content.includes(g), `the ODP lost U+${g.codePointAt(0).toString(16)}`);
		const styles = await odp.file('styles.xml').async('string');
		assert.match(content + styles, /Lattice Icons/);
		assert.ok(Object.keys(odp.files).some((n) => /^Fonts\//.test(n)), 'the ODP embeds its faces');
	});

	test('an icon\'s label travels as its shape\'s description, in the .pptx and the .odp', async () => {
		const body = ['## Labels', '', 'Hosts `^{server, label="Primary & backup DB"}` here.', ''];
		const pptx = await JSZip.loadAsync(fs.readFileSync(render('label', [], 'label.pptx', ['--editable'], body)));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		const mark = slide.match(/<p:cNvPr id="\d+" name="[^"]*Mark [^"]*"[^>]*>/);
		assert.ok(mark, 'the icon is a shape');
		assert.match(mark[0], /descr="Primary &amp; backup DB"/, `no description: ${mark[0]}`);
		assert.doesNotMatch(slide, /calco-descr-/, 'the tag is gone from the name');
		const odp = await JSZip.loadAsync(fs.readFileSync(render('label', [], 'label.odp', ['--editable'], body)));
		assert.match(await odp.file('content.xml').async('string'), /<svg:desc>Primary &amp; backup DB<\/svg:desc>/);
	});

	test('`--no-icon-shapes` under `icon: svg` still gives shapes: the page shows the drawing, not the glyph', async () => {
		const pptx = await JSZip.loadAsync(fs.readFileSync(render('svg-noshapes', ['icon: svg'], 'svg.pptx', ['--editable', '--no-icon-shapes'])));
		const slide = await pptx.file('ppt/slides/slide1.xml').async('string');
		assert.doesNotMatch(slide, /typeface="Lattice Icons/);
		assert.ok((slide.match(/<a:custGeom>/g) || []).length >= 2, 'the icons are shapes');
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
