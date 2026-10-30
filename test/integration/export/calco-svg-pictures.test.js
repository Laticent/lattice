/**
 * Integration: a picture that is one inline SVG (an icon, an avatar's face, a spark) is also written as SVG in an
 * editable PowerPoint and ODP, beside its PNG.
 *
 * Calco cropped every picture as a PNG at the capture's scale: a 16 px icon was 32 x 34 pixels, soft as soon as a
 * slide was projected or zoomed. The reader now writes the drawing as SVG too (reader.ts `svgOf`: plain shapes under
 * their screen transform folded into slide px, computed colors as SVG 1.1 colors, the clips the browser drew it
 * under, a spark's end dot), `placePictures` cuts it to the crop's box (`svgInBox`), and the writers store it the way
 * each format stores an SVG: an `asvg:svgBlip` extension on the PNG's blip in a .pptx (`addSvgPictures`), the SVG
 * before the PNG in a frame of an .odp. The PNG stays, the fallback for a reader without SVG.
 *
 * The oracle is the PNG itself: drawn by Chrome at the PNG's size, each SVG must ink as much as it (within 15%) in the
 * same place (within a slide pixel), so the SVG is the same picture and not merely an SVG. FALSIFIABLE: without svgOf no picture carries an SVG; with the old color handling a
 * spark's `color(srgb …)` wash drew black. Needs Chromium.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');

const DECK = ['---', 'theme: indaco', '---', '',
	'## Icons', '', 'Storage `{S3, icon=bucket, c4}` and `{Primary, icon=database, tag}`.', '',
	'---', '', '## Avatars', '', 'Our sponsor `!{Ada Okafor}` with `!{Ben Liu, lg}` and `!{Cy Diaz, rounded}`.', '',
	'---', '', '## Sparks', '', 'Revenue `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` against `~{1.9/1.6, bullet}`.', ''].join('\n');

// A deck author's own inline SVG, at the edges svgOf must get right or refuse (the checker's findings on 42c46b9): a fade
// set on an ancestor, a shape in a hidden group, geometry set in CSS, a share of the viewport, a character XML forbids.
const EDGES = ['---', 'theme: indaco', '---', '', '## Raw', '',
	'<span style="opacity:0.4;display:inline-block"><svg width="40" height="40" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="red"/></svg></span>', '',
	'<svg width="40" height="40" viewBox="0 0 10 10"><rect x="1" y="1" width="4" height="4" fill="blue"/><g style="display:none"><rect x="5" y="5" width="4" height="4" fill="#ff00ff"/></g></svg>', '',
	'<svg width="40" height="40" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" style="r:2" fill="blue"/></svg>', '',
	'<svg width="40" height="40" viewBox="0 0 10 10" style="overflow:visible"><rect x="2" y="2" width="50%" height="50%" fill="blue"/></svg>', '',
	'<svg width="40" height="40" viewBox="0 0 10 10"><path d="M1 1L9 1L9 9&#1;Z" fill="green"/></svg>', ''].join('\n');

describe('calco-svg-pictures', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-calco-svg-'));
	const md = path.join(dir, 'deck.md');
	fs.writeFileSync(md, DECK);
	const run = (out) => spawnSync(process.execPath, [EMULATOR, md, path.join(dir, out), '--editable'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
	fs.writeFileSync(path.join(dir, 'edges.md'), EDGES);
	const edges = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'edges.md'), path.join(dir, 'edges.pptx'), '--editable'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
	const pptx = run('deck.pptx');
	const odp = run('deck.odp');
	let browser;
	before(async () => { browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] }); });
	after(async () => { await browser?.close(); fs.rmSync(dir, { recursive: true, force: true }); });

	/**
	 * How an SVG drawn at its PNG's size compares with the PNG, both over white: the ratio of their ink (darkness summed
	 * over the pixels, so a black wash or a lost clip shows) and how far apart their ink's centers are, in slide px. Not
	 * a pixel-by-pixel difference: the PNG is cropped at whole device pixels while its position is reported unrounded,
	 * so it sits up to half a slide pixel off its true place, which a thin icon's edges turn into a large mean.
	 */
	async function compare(png, svg) {
		const page = await browser.newPage();
		try {
			return await page.evaluate(async (pngB64, svgText) => {
				const load = (src) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = src; });
				const a = await load(`data:image/png;base64,${pngB64}`);
				const b = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`);
				const W = a.width, H = a.height;
				const stat = (im) => {
					const c = document.createElement('canvas'); c.width = W; c.height = H;
					const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H); x.drawImage(im, 0, 0, W, H);
					const d = x.getImageData(0, 0, W, H).data;
					let ink = 0, sx = 0, sy = 0;
					for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) { const k = (y * W + i) * 4; const v = (765 - d[k] - d[k + 1] - d[k + 2]) / 765; ink += v; sx += v * i; sy += v * y; }
					return { ink, cx: sx / ink, cy: sy / ink };
				};
				const A = stat(a), B = stat(b);
				const perPx = W / Number(svgText.match(/width="([\d.]+)"/)[1]);
				return { ratio: B.ink / A.ink, off: Math.hypot(A.cx - B.cx, A.cy - B.cy) / perPx };
			}, Buffer.from(png).toString('base64'), svg);
		} finally {
			await page.close();
		}
	}
	const same = (name, c) => {
		assert.ok(c.ratio > 0.85 && c.ratio < 1.15, `${name} inks ${(c.ratio * 100).toFixed(0)}% of its PNG`);
		assert.ok(c.off < 1, `${name} sits ${c.off.toFixed(2)} slide px from its PNG`);
	};

	test('the .pptx stores each drawing as an SVG beside its PNG, and each SVG draws the PNG', async () => {
		assert.equal(pptx.status, 0, `emulator failed: ${pptx.stderr}`);
		const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, 'deck.pptx')));
		let pairs = 0;
		for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
			const xml = await zip.file(name).async('string');
			const rels = await zip.file(name.replace('slides/', 'slides/_rels/').replace(/\.xml$/, '.xml.rels')).async('string');
			const target = (id) => rels.match(new RegExp(`Id="${id}"[^>]*Target="\\.\\./media/([^"]+)"`))?.[1];
			for (const m of xml.matchAll(/<a:blip r:embed="([^"]+)"><a:extLst><a:ext uri="\{96DAC541-7B7A-43D3-8B79-37D633B846F1\}"><asvg:svgBlip [^>]*r:embed="([^"]+)"/g)) {
				const png = await zip.file(`ppt/media/${target(m[1])}`).async('uint8array');
				const svg = await zip.file(`ppt/media/${target(m[2])}`).async('string');
				assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" /);
				assert.doesNotMatch(svg, /color\(|oklch|oklab|var\(/, 'an SVG holds a color an office reader cannot read');
				same(target(m[2]), await compare(png, svg));
				pairs++;
			}
		}
		// Two icons, three avatars, two sparks.
		assert.equal(pairs, 7);
		assert.match(await zip.file('[Content_Types].xml').async('string'), /Extension="svg" ContentType="image\/svg\+xml"/);
	});

	test("an author's SVG keeps its ancestors' fade, drops a hidden group and resolves a viewport share; a character XML forbids keeps the PNG alone", async () => {
		assert.equal(edges.status, 0, `emulator failed: ${edges.stderr}`);
		const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, 'edges.pptx')));
		const xml = await zip.file('ppt/slides/slide1.xml').async('string');
		const rels = await zip.file('ppt/slides/_rels/slide1.xml.rels').async('string');
		const target = (id) => rels.match(new RegExp(`Id="${id}"[^>]*Target="\\.\\./media/([^"]+)"`))?.[1];
		assert.equal((xml.match(/<p:pic>/g) || []).length, 5, 'five pictures');
		assert.doesNotMatch(xml, /calco-svg-/, 'a tag left in a name');
		const svgs = [...xml.matchAll(/<a:blip r:embed="([^"]+)"><a:extLst><a:ext uri="[^"]+"><asvg:svgBlip [^>]*r:embed="([^"]+)"/g)];
		// The fade, the hidden group, the CSS radius and the 50% rect (as the browser resolved it: 5 units, not 50% of
		// the crop); not the &#1; path.
		assert.equal(svgs.length, 4);
		for (const [, pngId, svgId] of svgs) {
			const svg = await zip.file(`ppt/media/${target(svgId)}`).async('string');
			assert.doesNotMatch(svg, /#ff00ff/i, 'a shape in a display:none group was written');
			same(target(svgId), await compare(await zip.file(`ppt/media/${target(pngId)}`).async('uint8array'), svg));
		}
	});

	test('the .odp puts each SVG before its PNG in one frame, and lists it in the manifest', async () => {
		assert.equal(odp.status, 0, `emulator failed: ${odp.stderr}`);
		const zip = await JSZip.loadAsync(fs.readFileSync(path.join(dir, 'deck.odp')));
		const content = await zip.file('content.xml').async('string');
		const frames = [...content.matchAll(/<draw:image xlink:href="(Pictures\/[^"]+\.svg)"[^>]*\/><draw:image xlink:href="(Pictures\/[^"]+\.png)"/g)];
		assert.equal(frames.length, 7);
		const manifest = await zip.file('META-INF/manifest.xml').async('string');
		for (const [, svgPath, pngPath] of frames) {
			assert.match(manifest, new RegExp(`full-path="${svgPath}" manifest:media-type="image/svg\\+xml"`));
			same(svgPath, await compare(await zip.file(pngPath).async('uint8array'), await zip.file(svgPath).async('string')));
		}
	});
});
