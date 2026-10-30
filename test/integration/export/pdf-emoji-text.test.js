/**
 * Integration: an emoji in a CLI PDF is real text, and so are the words beside it.
 *
 * The deck's emoji font (Noto Color Emoji) is COLR v1, which a PDF cannot embed. The shared PDF writer used to
 * send any element holding an emoji to the slide's photo whole: the paragraph could not be selected, searched or
 * read aloud, and was soft when zoomed. It now draws each emoji as a glyph of a Type 3 font whose procedure
 * paints the emoji's picture and whose ToUnicode map gives back the emoji (read-slide.mjs emojiArt,
 * write-pdf.mjs embedEmoji), the way Chrome's own print does; the words beside it stay ordinary text.
 *
 * The oracles: the text layer holds every emoji and its neighbors (pdftotext), the page carries a Type 3 font
 * (pdffonts), and the report leaves no text in the photo.
 * FALSIFIABLE: without the emoji glyphs, the paragraph is back in the photo and `pdftotext` finds none of it.
 * Needs Chromium and poppler.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');

// A plain pictograph, a ZWJ sequence, a flag, a keycap, one in a pill, one in a heading, and a © the text
// font draws itself (it must stay ordinary text, not a picture).
const CLUSTERS = ['🚀', '👩‍💻', '🇨🇦', '1️⃣'];
const DECK = ['---', 'theme: indaco', '---', '', '## Launch day 🎉', '',
	`Ship ${CLUSTERS[0]} now, with ${CLUSTERS[1]} Ana in ${CLUSTERS[2]} Canada, step ${CLUSTERS[3]} first.`, '',
	'A pill `{Rocket 🚀}` and a mark © Acme.', ''].join('\n');

describe('pdf-emoji-text', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-emoji-'));
	fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
	const pdf = path.join(dir, 'deck.pdf'), report = path.join(dir, 'report.json');
	const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), pdf], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, LATTICE_PDF_REPORT: report } });
	after(() => fs.rmSync(dir, { recursive: true, force: true }));

	test('the CLI renders the deck and draws its emoji as glyphs, leaving no text in the photo', () => {
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const rep = JSON.parse(fs.readFileSync(report, 'utf8'));
		assert.deepEqual(rep.refusedText, {}, 'some text was left in the photo');
		assert.equal(rep.emoji, 6, 'six emoji drawn as glyphs (the heading, four in the paragraph, one in the pill)');
	});

	test('the text layer holds every emoji and the words beside it', () => {
		const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
		// Every emoji and its neighbors. Not their order: poppler sizes a picture glyph by its padded bounds, as it does
		// Chrome's own emoji, so a tall emoji can sort a line early or late in the extracted text.
		for (const c of [...CLUSTERS, '🎉']) assert.ok(text.includes(c), `the text layer lost ${c}: ${text}`);
		for (const w of ['Launch day', 'Ship', 'Ana in', 'Canada', 'Rocket', '© Acme']) assert.ok(text.includes(w), `the text layer lost "${w}": ${text}`);
	});

	test('the emoji are glyphs of a Type 3 font', () => {
		assert.match(execFileSync('pdffonts', [pdf], { encoding: 'utf8' }), /Type 3/);
	});
});

// The checker's two findings (2026-10-30): a symbol's picture carries its ink, so its color is part of the cache key;
// and `capitalize` reaches the first letter even after a leading emoji.
describe('pdf-emoji-text: ink and case', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-emoji-ink-'));
	const deck = ['---', 'theme: indaco', '---', '', '## Ink', '',
		'<p><span style="color:#c00000">☀︎</span> red <span style="color:#00a000">☀︎</span> green</p>', '',
		'<p style="text-transform:capitalize">🚀launch day</p>', ''].join('\n');
	fs.writeFileSync(path.join(dir, 'deck.md'), deck);
	const pdf = path.join(dir, 'deck.pdf');
	const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), pdf], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
	after(() => fs.rmSync(dir, { recursive: true, force: true }));

	test('each symbol keeps its own color', () => {
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
		const pageW = Number(xml.match(/<page width="([\d.]+)"/)[1]);
		const box = (t) => xml.match(new RegExp(`<word xMin="([\\d.]+)" yMin="([\\d.]+)" xMax="([\\d.]+)" yMax="([\\d.]+)">${t}</word>`)).slice(1, 5).map(Number);
		execFileSync('pdftoppm', ['-r', '192', '-f', '1', '-l', '1', pdf, path.join(dir, 'p')]);
		const file = fs.readdirSync(dir).find((n) => n.startsWith('p') && n.endsWith('.ppm'));
		const buf = fs.readFileSync(path.join(dir, file));
		const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
		const w = Number(head[1]), px = buf.subarray(head[0].length), k = w / pageW;
		// The dominant hue left of each word: count reddish and greenish pixels.
		const hue = (word) => {
			const [x0, y0, , y1] = box(word);
			let red = 0, green = 0;
			for (let y = Math.round(y0 * k); y < Math.round(y1 * k); y++) for (let x = Math.round((x0 - (y1 - y0)) * k); x < Math.round((x0 - 1) * k); x++) {
				const i = (y * w + x) * 3;
				if (px[i] > 150 && px[i + 1] < 90) red++;
				if (px[i + 1] > 120 && px[i] < 90) green++;
			}
			return { red, green };
		};
		const a = hue('red'), b = hue('green');
		assert.ok(a.red > a.green, `the first symbol is not red: ${JSON.stringify(a)}`);
		assert.ok(b.green > b.red, `the second symbol is not green: ${JSON.stringify(b)}`);
	});

	test('capitalize reaches the first letter after a leading emoji', () => {
		const text = execFileSync('pdftotext', [pdf, '-'], { encoding: 'utf8' });
		assert.match(text, /Launch Day/, text);
	});
});
