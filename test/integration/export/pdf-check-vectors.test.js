/**
 * Integration: every check in a CLI PDF is drawn as vectors, not photographed.
 *
 * The shared PDF writer (lib/core/pdf-compose) draws text, images and chart shapes as vectors and
 * photographs the rest at 1x. A check is a box-shadow disc with a masked mark, so it used to land
 * in that photo: a 13-pixel picture, soft at any zoom and in print (followups.d 2978-p1).
 * `readSlide` now draws each disc, its rings and its mark as paths, and `hideDrawn` takes them out
 * of the photo.
 *
 * The oracle is the PHOTO, as in pdf-inline-chip: beside each check's own word, the photo must
 * carry no ink (the check left it) and the page must (the check was drawn). The decks hold every
 * answer in every `checks-*` style, in each container a check is drawn in: running text, a pill,
 * a checklist row (whose disc is the row's ::before), and an obligation-matrix cell, plain (a
 * disc whose label is clipped out of view) and as pills. Light and dark.
 *
 * Two refusals are pinned too, from the checker's review: a check under a scale stays in the photo
 * (a pseudo-element's CSS offsets would be read against a scaled screen rect, and the mark printed
 * small and off its disc), and a positioned pseudo-element whose shadow paints over a border keeps
 * that border in the photo (its box does not reach the border; its ink does).
 *
 * FALSIFIABLE: with the check pass in read-slide.mjs removed, every disc is back in the photo and
 * the band beside its word is inked there. Needs Chromium and poppler (pdftotext, pdftoppm,
 * pdfimages).
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');

const STYLES = ['', 'checks-ringed', 'checks-bold', 'checks-outline', 'checks-tonal'];
const ANSWERS = [['x', 'pass'], ['-', 'partly'], ['!', 'fail'], ['?', 'unknown'], [' ', 'todo'], ['/', 'na']];
const WORDS = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'];

/** One slide per container and style; each check sits just left of a word of its own. */
function deck(dark) {
	const slides = [];
	STYLES.forEach((style, i) => {
		const slide = (cls, body) => slides.push([`<!-- _class: ${[cls, style].filter(Boolean).join(' ')} -->`, '', ...body].join('\n'));
		const row = `| One | ${ANSWERS.map(([m]) => `[${m}]`).join(' | ')} |`;
		const table = ['| Rule | A | B | C | D | E | F |', '| --- | :-: | :-: | :-: | :-: | :-: | :-: |', row];
		slide('checklist', [`## Rows ${i}`, '', ...ANSWERS.map(([m], k) => `- [${m}] ${WORDS[k]}Row${i}`)]);
		slide('', [`## Inline ${i}`, '',
			// Three to a line, so no check ends a line with its word wrapped onto the next.
			ANSWERS.slice(0, 3).map(([m], k) => `\`[${m}]\` ${WORDS[k]}In${i}`).join(' · '), '',
			ANSWERS.slice(3).map(([m], k) => `\`[${m}]\` ${WORDS[k + 3]}In${i}`).join(' · '), '',
			ANSWERS.map(([, a], k) => `\`@check{${a}, label=${WORDS[k]}Pill${i}}\``).join(' ')]);
		slide('obligation-matrix pills', [`## Pills ${i}`, '', ...table]);
		slide('obligation-matrix', [`## Cells ${i}`, '', ...table]);
	});
	return ['---', 'theme: indaco', ...(dark ? ['class: dark'] : []), '---', '', slides.join('\n\n---\n\n'), ''].join('\n');
}

/** A binary PNM (P5 gray / P6 color) as { w, h, ch, px }. */
function readPnm(file) {
	const buf = fs.readFileSync(file);
	const head = buf.toString('latin1', 0, 64).match(/^P([56])\s+(\d+)\s+(\d+)\s+(\d+)\s/);
	return { w: Number(head[2]), h: Number(head[3]), ch: head[1] === '6' ? 3 : 1, px: buf.subarray(head[0].length) };
}
const lum = (img, x, y) => {
	const i = (y * img.w + x) * img.ch;
	return img.ch === 1 ? img.px[i] : (img.px[i] + img.px[i + 1] + img.px[i + 2]) / 3;
};
/** How many pixels in a box (in image px) differ from the box's top-left corner by > 24. */
function inked(img, x0, y0, x1, y1) {
	const bg = lum(img, x0, y0);
	let n = 0;
	for (let y = Math.max(0, y0); y <= Math.min(img.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(img.w - 1, x1); x++) if (Math.abs(lum(img, x, y) - bg) > 24) n++;
	return n;
}
const WORD = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g;

for (const mode of ['light', 'dark']) {
	describe(`pdf-check-vectors (${mode})`, () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), `lattice-checks-${mode}-`));
		const md = path.join(dir, 'deck.md'), pdf = path.join(dir, 'deck.pdf'), report = path.join(dir, 'report.json');
		fs.writeFileSync(md, deck(mode === 'dark'));
		const r = spawnSync(process.execPath, [EMULATOR, md, pdf], { cwd: ROOT, encoding: 'utf8', timeout: 240000, env: { ...process.env, LATTICE_PDF_REPORT: report } });
		after(() => fs.rmSync(dir, { recursive: true, force: true }));

		test('the CLI renders the deck and keeps no check in the photo', () => {
			assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
			const refused = Object.keys(JSON.parse(fs.readFileSync(report, 'utf8')).refusedShapes || {}).filter((k) => k.startsWith('check-'));
			assert.deepEqual(refused, [], 'a check was left in the photo');
		});

		test('beside its word, each check is off the photo and on the page', () => {
			const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
			const pages = xml.split('<page ').slice(1);
			execFileSync('pdfimages', [pdf, path.join(dir, 'img')]);
			const list = execFileSync('pdfimages', ['-list', pdf], { encoding: 'utf8' }).split('\n').slice(2).filter(Boolean).map((l) => l.trim().split(/\s+/));
			execFileSync('pdftoppm', ['-gray', '-r', '96', pdf, path.join(dir, 'p')]);
			const files = fs.readdirSync(dir);
			let checked = 0;
			pages.forEach((pg, i) => {
				const pageW = Number(pg.match(/width="([\d.]+)"/)[1]);
				const words = [...pg.matchAll(WORD)].map((m) => ({ t: m[5], box: m.slice(1, 5).map(Number) }));
				// The page's photo is its first image (the writer draws it before anything else).
				const n = list.findIndex((row) => Number(row[0]) === i + 1);
				const photo = readPnm(path.join(dir, files.find((f) => f.startsWith(`img-${String(n).padStart(3, '0')}`))));
				const page = readPnm(path.join(dir, files.find((f) => new RegExp(`^p-0*${i + 1}\\.pgm$`).test(f))));
				const at = (img, x0, y0, x1, y1) => {
					const k = img.w / pageW;
					return inked(img, Math.round(x0 * k), Math.round(y0 * k), Math.round(x1 * k), Math.round(y1 * k));
				};
				for (const { t, box: [x0, y0, x1, y1] } of words) {
					let band;
					// A check's word: the check sits within 1.6 line heights to its left.
					if (/^[A-Z][a-z]+(Row|In|Pill)\d$/.test(t)) band = [x0 - 1.6 * (y1 - y0), y0 - 0.1 * (y1 - y0), x0 - 2, y1 + 0.1 * (y1 - y0)];
					// A matrix row's label: its cells run from just past it to the slide's right margin.
					else if (t === 'One') band = [x1 + 40, y0, pageW - 60, y1];
					else continue;
					assert.equal(at(photo, ...band), 0, `page ${i + 1}: the photo still carries the check by "${t}"`);
					assert.ok(at(page, ...band) > 0, `page ${i + 1}: the page lost the check by "${t}"`);
					checked++;
				}
			});
			// 5 styles x (6 rows + 6 inline + 6 pills + 2 matrix rows).
			assert.equal(checked, STYLES.length * 20, 'every check was found beside its word');
		});
	});
}

describe('pdf-check-vectors (what stays in the photo)', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-checks-refused-'));
	after(() => fs.rmSync(dir, { recursive: true, force: true }));
	const render = (name, body) => {
		const md = path.join(dir, `${name}.md`), report = path.join(dir, `${name}.json`);
		fs.writeFileSync(md, ['---', 'theme: indaco', '---', '', body, ''].join('\n'));
		const r = spawnSync(process.execPath, [EMULATOR, md, path.join(dir, `${name}.pdf`)], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, LATTICE_PDF_REPORT: report } });
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		return JSON.parse(fs.readFileSync(report, 'utf8')).refusedShapes || {};
	};

	test('a check under a scale is refused, not drawn off its disc', () => {
		const refused = render('scaled', ['## Scaled check', '', '<div style="transform:scale(3);transform-origin:0 0;width:300px">', '', 'Alpha `[x]` Bravo `[!]` Charlie', '', '</div>'].join('\n'));
		assert.equal(refused['check-scale'], 2);
	});

	test("a pseudo-element's shadow over a border keeps the border in the photo", () => {
		const refused = render('shadow', ['<style>',
			'.probe { position:relative; border:6px solid #2255cc; width:300px; height:120px; padding:20px; }',
			".probe::before { content:''; position:absolute; left:14px; top:30px; width:20px; height:20px; background:#e01010; box-shadow:0 0 0 18px #e01010; }",
			'</style>', '', '## Shadow over border', '', '<div class="probe">Text</div>'].join('\n'));
		assert.equal(refused['border-covered'], 1);
	});
});
