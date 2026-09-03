/**
 * Integration: the CHANNELS a reader-view projection has to keep aligned, driven through the real
 * CLI and a real browser. #2053.
 *
 * WHY THIS FILE EXISTS. Position-holding projection keeps every authored slot in the shipped deck
 * and hides the withheld ones, so the deck the artifact is built from is AUTHORED-length while every
 * artifact is SHIPPED-length. An adversarial trio found five separate consumers that still paired
 * the two by position, and every one of them was green under lint, 8246 unit tests, `build:check`
 * and the existing integration tier — because each defect lives in the gap between the rendered
 * document and the file that ships, which no unit test crosses (HARD RULE #23).
 *
 * Each test below is one of those defects, expressed as the property it violated:
 *   1. `lens-hole` was forgeable from author markup with no `--lens` anywhere: the PDF dropped the
 *      slide while its text shipped in the `.html` and the envelope.
 *   2. Speaker notes: PPTX bound slide 3's note to the slide showing slide 5; the PDF dropped every
 *      annotation while reporting it had written them.
 *   3. Captions: slide 3's caption was spoken over a hole, slide 5's over slide 3.
 *   4. The claim itself — positional SELECTORS survive a projection and CSS COUNTERS do not, which
 *      is the whole reason the author-CSS warning still exists.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { applyTag, approvalHash, emitRegistry } = require('@workwel/lente');
const { splitSlideChunks } = require('../../../lib/core/slide-boundaries.mjs');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const CHROME = resolveChrome();
const skip = skipWithoutChrome(CHROME);
const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const TIMEOUT = 240000;

/** A 5-slide deck whose `brief` view keeps 1, 3 and 5 — so two holes fall between kept slides. */
function deck({ extraFm = '', style = '', notes = false, captions = false } = {}) {
	const raw = Array.from({ length: 5 }, (_, i) =>
		`\n<!-- _class: content -->\n\n# Slide ${i + 1}\n\nBody of slide ${i + 1}.\n${notes ? `\n<!-- NOTE FOR SLIDE ${i + 1} -->\n` : ''}`,
	);
	const mem = new Set([0, 2, 4]);
	const tagged = raw.map((s, i) => applyTag(s, 'brief', mem.has(i), 'none'));
	const body = style + tagged.join('\n---\n') + '\n';
	const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, { id: 'brief', label: 'Brief', base: 'none' }], default: 'full' };
	const reg = {
		lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(splitSlideChunks(body).chunks, bare, l.id) })),
		default: 'full',
	};
	let head = `---\nmarp: true\ntheme: indaco\n${extraFm}`;
	if (captions) for (let i = 1; i <= 5; i++) head += `${i === 1 ? 'captions:\n' : ''}  ${i}: CAPTION for slide ${i}.\n`;
	head += emitRegistry(reg);
	if (!head.endsWith('\n')) head += '\n';
	return `${head}---\n${body}`;
}

function run(src, outName, args) {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-channels-'));
	const md = path.join(dir, 'deck.md');
	fs.writeFileSync(md, src);
	const out = path.join(dir, outName);
	const r = spawnSync(process.execPath, [EMULATOR, md, out, ...args], { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
	return { r, out, dir };
}

describe('a projected export keeps its per-slide channels aligned', { skip }, () => {
	test('a hole an author forged is refused, with no reader view in play at all', { timeout: TIMEOUT }, () => {
		// Nothing can reserve a markdown class, so it is checked against the projection instead:
		// with no `--lens`, the expected hole set is empty and any hole is drift. Before `holeDrift`
		// this exported a 2-page PDF from a 3-slide deck while the swallowed slide's text shipped in
		// the `.html` written by the same command.
		const src = [
			'---', 'marp: true', 'theme: indaco', '---', '',
			'<!-- _class: content -->', '', '# Slide A', '', 'Opening.', '',
			'---', '', '<!-- _class: lens-hole -->', '', '# HIDDEN', '', 'CONFIDENTIAL body.', '',
			'---', '', '<!-- _class: content -->', '', '# Slide C', '', 'Middle.', '',
		].join('\n');
		const { r, out } = run(src, 'forge.pdf', ['--quiet']);
		assert.notEqual(r.status, 0, 'a forged hole is a refusal');
		assert.match(r.stderr, /lens-hole/, 'and the message names the class the deck set');
		assert.ok(!fs.existsSync(out), 'nothing was written');
	});

	test('the RUNNING `class:` form is refused too — it holes every slide after it', { timeout: TIMEOUT }, () => {
		// The deck-scope directive applies from its slide onward, so one comment swallowed two slides
		// and a 3-slide deck exported as a ONE-page PDF, silently, exit 0.
		const src = [
			'---', 'marp: true', 'theme: indaco', '---', '',
			'# Slide A', '', 'Opening.', '',
			'---', '', '<!-- class: lens-hole -->', '', '# HIDDEN', '', 'CONFIDENTIAL body.', '',
			'---', '', '# Slide C', '', 'Middle.', '',
		].join('\n');
		const { r, out } = run(src, 'global.pdf', ['--quiet']);
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /Slides 2, 3/, 'and it names every slide the running directive holed');
		assert.ok(!fs.existsSync(out), 'nothing was written');
	});

	test('speaker notes reach the slide they were written for, in the PDF and the PPTX', { timeout: TIMEOUT }, async () => {
		const { r, out, dir } = run(deck({ notes: true }), 'notes.pdf', ['--quiet', '--lens', 'brief', '--notes']);
		assert.equal(r.status, 0, r.stderr);
		// The PDF: one annotation per page. `embedNotesInPdf` guards on a length match and the hole
		// broke it, so it dropped EVERY annotation — while the CLI printed "3 slides with speaker
		// notes" one line below its own warning that it had not written any.
		const { PDFDocument, PDFName } = require('pdf-lib');
		const doc = await PDFDocument.load(fs.readFileSync(out));
		assert.equal(doc.getPageCount(), 3);
		for (const [i, pg] of doc.getPages().entries()) {
			const annots = pg.node.get(PDFName.of('Annots'));
			assert.ok(annots && annots.size() === 1, `page ${i + 1} carries its note annotation`);
		}
		// The sidecar numbers the slides of the ARTIFACT, not the authored deck: it read
		// `# Slide 1 / 3 / 5` beside a three-page PDF, which spells out the withheld positions.
		const sidecar = fs.readFileSync(path.join(dir, 'notes.notes.txt'), 'utf8');
		assert.match(sidecar, /# Slide 1[\s\S]*NOTE FOR SLIDE 1[\s\S]*# Slide 2[\s\S]*NOTE FOR SLIDE 3[\s\S]*# Slide 3[\s\S]*NOTE FOR SLIDE 5/);
		assert.ok(!/# Slide 5/.test(sidecar), 'no authored number survives into a three-slide sidecar');

		// The PPTX bound the note for slide 3 to the exported slide SHOWING slide 5, left slide 3's
		// own note empty, and dropped slide 5's — a private note under the wrong slide.
		const p = run(deck({ notes: true }), 'notes.pptx', ['--quiet', '--lens', 'brief']);
		assert.equal(p.r.status, 0, p.r.stderr);
		const zip = await require('jszip').loadAsync(fs.readFileSync(p.out));
		for (const [i, authored] of [1, 3, 5].entries()) {
			const xml = await zip.file(`ppt/notesSlides/notesSlide${i + 1}.xml`).async('string');
			assert.match(xml, new RegExp(`NOTE FOR SLIDE ${authored}`), `PPTX slide ${i + 1} carries authored slide ${authored}'s note`);
		}
	});

	test('a caption reaches the slide it was written for', { timeout: TIMEOUT }, () => {
		// `pruneCaptions` renumbered survivors to their rank among the kept, which was right while the
		// projection deleted slides. With holes it became a shift by the number of preceding holes:
		// slide 3's caption was spoken over a hole and slide 5's over slide 3. The keys stay AUTHORED
		// now (so the envelope's source re-imports against the deck it describes) and the
		// authored -> shipped-page join happens once, where the split remap already lived.
		const { r, dir } = run(deck({ captions: true }), 'cap.pdf', ['--quiet', '--lens', 'brief', '--captions']);
		assert.equal(r.status, 0, r.stderr);
		const parts = fs.readdirSync(dir).filter((f) => /^cap\.\d+\.vtt$/.test(f)).sort();
		assert.deepEqual(parts, ['cap.01.vtt', 'cap.02.vtt', 'cap.03.vtt'], 'three shipped slides, three parts, no gap');
		for (const [i, authored] of [1, 3, 5].entries()) {
			const vtt = fs.readFileSync(path.join(dir, parts[i]), 'utf8').replace(/<[^>]*>/g, '');
			assert.match(vtt, new RegExp(`CAPTION for slide ${authored}`), `part ${i + 1} narrates authored slide ${authored}`);
		}
	});

	test('a positional SELECTOR holds across the projection and a CSS COUNTER does not', { timeout: TIMEOUT }, async () => {
		// The claim this whole design rests on, and its one measured exception. `nth-of-type` is a
		// STRUCTURAL selector, so it counts the hidden hole and lands on the slide the author aimed
		// at. A counter lives on the BOX tree, and a hidden element generates no box — so it skips.
		// The author-CSS warning names the second and explicitly clears the first; if this test ever
		// flips, that warning is telling authors the wrong thing.
		const style = '<style>\nsection { counter-increment: sl; }\nsection h1::after { content: " #" counter(sl); }\nsection:nth-of-type(5) h1 { color: rgb(255, 0, 0); }\n</style>\n';
		const full = run(deck({ style }), 'full.html', ['--quiet']);
		assert.equal(full.r.status, 0, full.r.stderr);
		const brief = run(deck({ style }), 'brief.html', ['--quiet', '--lens', 'brief']);
		assert.equal(brief.r.status, 0, brief.r.stderr);

		const browser = await require('puppeteer').launch({ executablePath: CHROME, args: ['--no-sandbox'] });
		try {
			const read = async (file) => {
				const page = await browser.newPage();
				await page.goto(`file://${file}`);
				const out = await page.evaluate(() =>
					[...document.querySelectorAll('section[data-lattice-slide]')]
						.filter((s) => !s.classList.contains('lens-hole'))
						.map((s) => ({ at: s.getAttribute('data-authored-slide'), color: getComputedStyle(s.querySelector('h1')).color })));
				await page.close();
				return out;
			};
			const a = await read(full.out);
			const b = await read(brief.out);
			// Authored slide 4 (0-based) is the fifth section in BOTH documents, because the two
			// withheld slides in front of it kept their slots. It is red in both.
			assert.equal(a.find((x) => x.at === '4').color, 'rgb(255, 0, 0)', 'the rule lands on authored slide 5 in the full deck');
			assert.equal(b.find((x) => x.at === '4').color, 'rgb(255, 0, 0)', 'and on the SAME slide in the projection');
			for (const x of b) {
				if (x.at !== '4') assert.notEqual(x.color, 'rgb(255, 0, 0)', `authored slide ${Number(x.at) + 1} did not inherit the rule`);
			}
		} finally {
			await browser.close();
		}
	});
});
