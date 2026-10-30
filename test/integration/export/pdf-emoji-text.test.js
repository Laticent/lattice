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
 * (pdffonts), and the emoji is off the photo and on the page beside its word (as pdf-inline-chip does).
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
