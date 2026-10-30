/**
 * Integration: an avatar's tile and ring, a sparkline's line and end dot, and a masked mark (the recommended
 * card's spark) are drawn as vectors in a CLI PDF, not photographed.
 *
 * The shared PDF writer drew their SVG parts already (an avatar's face, a spark's bars), but the tile behind a
 * face, a sparkline's end dot (a positioned span, read as covering the line, which then stayed in the photo too)
 * and every `--shape-*` mask stayed in the 1x photo, soft beside the crisp parts. read-slide.mjs now reads each
 * (`tileOf`, `dotOf`, `maskedMarkOf`) and `hideDrawn` takes it out of the photo.
 *
 * The oracle is the PHOTO, as in pdf-check-vectors: beside each element's word, the photo carries no ink and the
 * page does. FALSIFIABLE: without those readers, each element is back in the photo. Needs Chromium and poppler.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');

const DECK = ['---', 'theme: indaco', '---', '',
	'## Avatars', '', 'Alpha `!{Ada Okafor}` Bravo `!{Ben Liu, lg}` Charlie `!{Cy Diaz, rounded, border=c3}` Delta', '',
	'---', '', '## Sparks', '', 'Echo `~{0.8 0.9 1.1 1.2 1.4 1.5 1.7 1.9, end}` Foxtrot `~{1.9/1.6, bullet}` Golf', '',
	'---', '', '<!-- _class: verdict-grid -->', '', '## Cards', '', '- Option one', '  - [x] Residency', '  - Fine.', '- Option Hotel', '  - [x] Residency', '  - Better.', ''].join('\n');

function readPnm(file) {
	const buf = fs.readFileSync(file);
	const head = buf.toString('latin1', 0, 64).match(/^P([56])\s+(\d+)\s+(\d+)\s+(\d+)\s/);
	return { w: Number(head[2]), h: Number(head[3]), ch: head[1] === '6' ? 3 : 1, px: buf.subarray(head[0].length) };
}
const lum = (img, x, y) => {
	const i = (y * img.w + x) * img.ch;
	return img.ch === 1 ? img.px[i] : (img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3;
};
function inked(img, x0, y0, x1, y1) {
	const bg = lum(img, x0, y0);
	let n = 0;
	for (let y = Math.max(0, y0); y <= Math.min(img.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(img.w - 1, x1); x++) if (Math.abs(lum(img, x, y) - bg) > 24) n++;
	return n;
}

describe('pdf-small-drawings', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-small-'));
	const md = path.join(dir, 'deck.md'), pdf = path.join(dir, 'deck.pdf'), report = path.join(dir, 'report.json');
	fs.writeFileSync(md, DECK);
	const r = spawnSync(process.execPath, [EMULATOR, md, pdf], { cwd: ROOT, encoding: 'utf8', timeout: 180000, env: { ...process.env, LATTICE_PDF_REPORT: report } });
	after(() => fs.rmSync(dir, { recursive: true, force: true }));

	test('the CLI renders the deck and refuses no tile, dot or mark', () => {
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const refused = Object.keys(JSON.parse(fs.readFileSync(report, 'utf8')).refusedShapes || {}).filter((k) => /^(tile|dot|mark)-/.test(k) || k === 'covered');
		assert.deepEqual(refused, []);
	});

	test('beside its word, each drawing is off the photo and on the page', () => {
		const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
		const pages = xml.split('<page ').slice(1);
		execFileSync('pdfimages', [pdf, path.join(dir, 'img')]);
		const list = execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/));
		execFileSync('pdftoppm', ['-gray', '-r', '96', pdf, path.join(dir, 'p')]);
		const files = fs.readdirSync(dir);
		const word = (pg, t) => {
			const m = pg.match(new RegExp(`<word xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="([\\d.]+)">${t}</word>`));
			assert.ok(m, `no word ${t}`);
			return m.slice(1, 5).map(Number);
		};
		// [page, the word just before the drawing, the band's height in line heights, where it starts and ends after the
		// word]. A spark's band sits inside its box: the box's fill stays in the photo, its line and dot do not.
		const cases = [[0, 'Alpha', 1.3, 0.35, 1.3], [0, 'Bravo', 2.2, 0.35, 1.3], [0, 'Charlie', 1.3, 0.35, 1.3], [1, 'Echo', 0.6, 0.6, 1.6], [1, 'Foxtrot', 0.6, 0.6, 1.6]];
		for (const [i, t, k, a, b] of cases) {
			const pg = pages[i];
			const pageW = Number(pg.match(/width="([\d.]+)"/)[1]);
			const n = list.findIndex((row) => Number(row[0]) === i + 1);
			const photo = readPnm(path.join(dir, files.find((f) => f.startsWith(`img-${String(n).padStart(3, '0')}`))));
			const page = readPnm(path.join(dir, files.find((f) => new RegExp(`^p-0*${i + 1}\\.pgm$`).test(f))));
			const [, y0, x1, y1] = word(pg, t);
			const h = y1 - y0, mid = (y0 + y1) / 2;
			const at = (img) => {
				const s = img.w / pageW;
				return inked(img, Math.round((x1 + a * h) * s), Math.round((mid - (k * h) / 2) * s), Math.round((x1 + b * h) * s), Math.round((mid + (k * h) / 2) * s));
			};
			assert.equal(at(photo), 0, `page ${i + 1}: the photo still carries the drawing after "${t}"`);
			assert.ok(at(page) > 0, `page ${i + 1}: the page lost the drawing after "${t}"`);
		}
		// The recommended card's spark: the card's top right corner, level with its title.
		const pg = pages[2];
		const pageW = Number(pg.match(/width="([\d.]+)"/)[1]);
		const n = list.findIndex((row) => Number(row[0]) === 3);
		const photo = readPnm(path.join(dir, files.find((f) => f.startsWith(`img-${String(n).padStart(3, '0')}`))));
		const page = readPnm(path.join(dir, files.find((f) => /^p-0*3\.pgm$/.test(f))));
		const [, y0, , y1] = word(pg, 'Hotel');
		const band = (img) => { const s = img.w / pageW; return inked(img, Math.round((pageW - 86) * s), Math.round((y0 - 16) * s), Math.round((pageW - 52) * s), Math.round((y1 + 4) * s)); };
		assert.equal(band(photo), 0, 'the photo still carries the recommended card\'s spark');
		assert.ok(band(page) > 0, 'the page lost the recommended card\'s spark');
	});
});
