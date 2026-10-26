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
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const TIMEOUT = 240000;
const have = (cmd) => spawnSync('which', [cmd]).status === 0;
const skip =
	!have('pdftoppm') || !fs.existsSync(path.join(ROOT, 'dist', 'lattice-pdf-compose-min.js'))
		? 'needs pdftoppm and a built dist/'
		: false;

function slide(placement) {
	return [
		'---\ntheme: indaco\n---',
		`<!-- _class: collage bleed spectrum-edge-${placement} -->\n\n## Hand-lasted\n\n![](sample:photo-wide.svg)\n![](sample:photo-wide.svg)\n![](sample:photo-wide.svg)\n`,
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
		for (const p of ['off', 'left', 'right', 'bottom']) fs.writeFileSync(path.join(dir, `${p}.md`), slide(p));
		const base = ppm(dir, 'off');
		const probe = {
			left: (g) => g.at(1, g.h >> 1),
			right: (g) => g.at(g.w - 2, g.h >> 1),
			bottom: (g) => g.at(g.w >> 1, g.h - 2),
		};
		for (const p of ['left', 'right', 'bottom']) {
			const g = ppm(dir, p);
			assert.deepEqual([g.w, g.h], [base.w, base.h], `${p}: page size changed`);
			assert.notDeepEqual(probe[p](g), probe[p](base), `${p}: the edge pixels match the bar-off render, so the bar is missing`);
		}
	});
});
