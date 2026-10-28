/**
 * Integration: the full-bleed spectrum bar survives the vector PDF composer.
 *
 * A bleed frame draws its bar as `<i class="slide-bar">` strips over the art (lib/core/slide-bar.js).
 * The PDF composer lifts photos as images and used to paint them over the strip, so the bar vanished
 * on a `collage bleed` slide in the PDF only (lib/core/pdf-compose/read-slide.mjs `paintedAbove`).
 * Pinned on the real export: rasterize page 1 with each bar placement and with the bar off, and
 * require the edge pixels of the placed bar to differ from the photo that fills the same pixels
 * when the bar is off.
 *
 * Slow tier: five CLI PDF exports. Skips when pdftoppm, Chromium or the built composer is missing.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const zlib = require('zlib');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const TIMEOUT = 240000;
const have = (cmd) => spawnSync('which', [cmd]).status === 0;
const skip =
	!have('pdftoppm') || !fs.existsSync(path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js'))
		? 'needs pdftoppm and a built dist/'
		: false;

/** A noisy w x h RGB PNG: noise keeps the encoder from collapsing it to a flat fill the composer would not lift. */
function png(w, h, base) {
	const raw = Buffer.alloc((w * 3 + 1) * h);
	let seed = 7;
	for (let y = 0; y < h; y++) {
		raw[y * (w * 3 + 1)] = 0;
		for (let x = 0; x < w * 3; x++) {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			raw[y * (w * 3 + 1) + 1 + x] = (base[x % 3] + (seed >> 16)) & 0xff;
		}
	}
	const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
	const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
	const chunk = (type, data) => {
		const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
		const body = Buffer.concat([Buffer.from(type), data]);
		const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
		return Buffer.concat([len, body, sum]);
	};
	const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
	return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

function slide(placement) {
	return [
		'---\ntheme: indaco\n---',
		`<!-- _class: collage bleed spectrum-edge-${placement} -->\n\n## Hand-lasted\n\n![](a.png)\n![](b.png)\n`,
	].join('\n\n---\n\n');
}

function ppm(dir, name) {
	const pdf = path.join(dir, `${name}.pdf`);
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), path.join(dir, `${name}.md`), pdf, '--quiet'], {
		cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT,
	});
	assert.equal(r.status, 0, `export failed: ${r.stderr}`);
	const pre = path.join(dir, name);
	const x = spawnSync('pdftoppm', ['-r', '100', '-f', '1', '-l', '1', '-singlefile', pdf, pre]);
	assert.equal(x.status, 0, 'pdftoppm failed');
	const buf = fs.readFileSync(`${pre}.ppm`);
	const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.subarray(0, 40).toString('latin1'));
	assert.ok(m, 'unreadable ppm');
	const w = +m[1], h = +m[2], off = buf.length - w * h * 3;
	return { w, h, at: (x0, y0) => [...buf.subarray(off + (y0 * w + x0) * 3, off + (y0 * w + x0) * 3 + 3)] };
}

describe('export: the full-bleed bar reaches the PDF', { skip }, () => {
	test('a collage bleed slide shows its bar on each edge, over the photos', { timeout: TIMEOUT * 4 }, () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-bar-pdf-'));
		fs.writeFileSync(path.join(dir, 'a.png'), png(900, 600, [200, 80, 60]));
		fs.writeFileSync(path.join(dir, 'b.png'), png(900, 600, [40, 120, 200]));
		for (const p of ['off', 'left', 'right', 'bottom']) fs.writeFileSync(path.join(dir, `${p}.md`), slide(p));
		const base = ppm(dir, 'off');
		// The photos stay embedded at their own resolution under every placement: the bar clips the lifted
		// picture instead of folding it back into the page raster.
		const embedded = (name) => spawnSync('pdfimages', ['-list', path.join(dir, `${name}.pdf`)], { encoding: 'utf8' }).stdout
			.split('\n').slice(2).filter((l) => /\s900\s+600\s/.test(l)).length;
		const want = embedded('off');
		assert.equal(want, 2, 'the bar-off render embeds both photos at 900x600');
		const probe = {
			left: (g) => g.at(1, g.h >> 1),
			right: (g) => g.at(g.w - 2, g.h >> 1),
			bottom: (g) => g.at(g.w >> 1, g.h - 2),
		};
		for (const p of ['left', 'right', 'bottom']) {
			const g = ppm(dir, p);
			assert.deepEqual([g.w, g.h], [base.w, base.h], `${p}: page size changed`);
			assert.equal(embedded(p), want, `${p}: the photos stay embedded at their own resolution`);
			assert.notDeepEqual(probe[p](g), probe[p](base), `${p}: the edge pixels match the bar-off render, so the bar is missing`);
		}
	});

	test('a claimed chart\'s masthead rule does not cross the bar', { timeout: TIMEOUT }, () => {
		// The page photo holds the bar, and the writer draws the masthead hairline as a vector over the photo. The
		// bar is drawn after every vector, as the browser paints it, so no gray row shows inside the bar.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-bar-pdf-hair-'));
		fs.writeFileSync(path.join(dir, 'deck.md'), [
			'---\ntheme: indaco\nspectrum-edge: left\nheader: HEADER\npaginate: true\n---',
			'<!-- _class: bar claim-bleed -->\n\n## Which category is biggest.\n\n- First `120`\n- Second `80`\n- Third `40`\n',
		].join('\n\n---\n\n'));
		const g = ppm(dir, 'deck');
		let gray = 0;
		for (let y = 0; y < g.h; y++) {
			const [r, gg, b] = g.at(1, y);
			if (Math.abs(r - gg) < 12 && Math.abs(gg - b) < 12) gray++;
		}
		assert.equal(gray, 0, `${gray} gray/white rows inside the left bar (a vector rule is painting over it)`);
	});
});
