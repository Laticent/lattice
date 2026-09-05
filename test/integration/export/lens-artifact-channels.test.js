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
const { isHoleOpenTag } = require('../../../lib/core/lens-export.mjs');
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

	test('an UN-HIDDEN hole is refused — the check reads the layout, not the class', { timeout: TIMEOUT }, () => {
		// The attack the engine rule cannot lose to and cannot win: two lines of author CSS on a slide
		// the view KEEPS. `!important` in author origin outranks an `!important` engine rule, so
		// `base.lens-hole.css` is beaten by the cascade and no engine rule could beat it back.
		// `holeDrift` is silent because the class is all still there — the marker is intact, the
		// PROPERTY is gone. Measured before the visibility check existed: `brief` on this deck exported
		// a FIVE-page PDF, blank at positions 2 and 4, exit 0, one line under "3 of 5 slides ship" —
		// the deck's real length and the exact withheld slots, from a deck that never names one.
		const style = '<style>\nsection.lens-hole { display: block !important }\n</style>\n\n';
		const { r, out } = run(deck({ style }), 'unhide.pdf', ['--quiet', '--lens', 'brief']);
		assert.notEqual(r.status, 0, 'an un-hidden hole is a refusal');
		assert.match(r.stderr, /renders as a page/, 'and the message says what is wrong with the LAYOUT');
		assert.match(r.stderr, /Slides 2, 4/, 'naming the withheld slots that took space');
		assert.ok(!fs.existsSync(out), 'no PDF');
		// The sidecar is written pre-navigation, so this refusal is the first that has to take a file
		// back. "Nothing was exported" has to be true.
		assert.ok(!fs.existsSync(out.replace(/\.pdf$/, '.html')), 'and the HTML sidecar was removed, not left behind');
	});

	test('and a KEPT slide the deck hides is refused under a view — the page it promised is missing', { timeout: TIMEOUT }, () => {
		// The other direction. Under a reader view the run has just printed how many slides ship, so an
		// artifact with fewer pages than that is the projection's own contract broken. With no `--lens`
		// this warns instead: hiding a slide with CSS is something a deck could always do, and this
		// change is not the place to start refusing it — but the count line must not lie about it.
		const style = '<style>\nsection[data-authored-slide="2"] { display: none !important }\n</style>\n\n';
		const { r, out } = run(deck({ style }), 'vanish.pdf', ['--quiet', '--lens', 'brief']);
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /renders no page/);
		assert.ok(!fs.existsSync(out));

		const loose = run(deck({ style }), 'vanish-noview.pdf', []);
		assert.equal(loose.r.status, 0, 'with no reader view it is a warning, not a refusal');
		assert.match(loose.r.stderr, /⚠ slide 3 renders no page/, 'and the warning is un-gated and names the slide');
		assert.ok(fs.existsSync(loose.out), 'the export still happens');
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
			// Strip the VTT CUE TIMING TAGS specifically — `<00:00:00.410>`, which Cadenza interleaves
			// between words — not "anything in angle brackets". A general one-pass tag stripper is the
			// incomplete-multi-character-sanitization shape CodeQL has already caught twice in this PR,
			// and being in a test is a reason it cannot cause harm, not a reason to write it. Naming
			// the thing actually in the file is also a better test: a real `<` in a caption would now
			// have to survive the assertion rather than being silently swallowed.
			const vtt = fs.readFileSync(path.join(dir, parts[i]), 'utf8').replace(/<\d\d:\d\d:\d\d\.\d{3}>/g, '');
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

/**
 * THE OBSERVATION CHANNELS — the set `O` of what a recipient can learn about the slides a view
 * withheld. This is the arm that exists because we never wrote `O` down.
 *
 * Position-holding projection is TOMBSTONING: keep the slot, blank the content, so the structure a
 * CSS engine can count stays invariant. That closes a channel by CONSTRUCTION rather than by
 * detection — but only the channels the invariant actually covers, and we had never enumerated
 * them. We closed sibling position, shipped, and were then ambushed by CSS counters, which live on
 * the BOX tree and therefore do not see a `display:none` element at all. Two channels found one at
 * a time is not a bound; it is a sample.
 *
 * So the channels are listed and MEASURED here, and a change in any of them fails this file. The
 * verdicts below were produced by exporting an 8-slide deck twice — whole, and under a view keeping
 * slides 1/4/6/8 — and reading the result rather than reasoning about it:
 *
 *   CHANNEL                              VERDICT     mechanism
 *   nth-of-type(6)                       preserved   structural: counts hidden elements
 *   nth-child(8)                         preserved   structural
 *   last-of-type                         preserved   structural
 *   nth-last-of-type(3)                  preserved   structural, counting from the end
 *   nth-of-type(2n)                      preserved   structural, an+b form
 *   nth-of-type(3) + section             preserved   adjacent sibling combinator
 *   nth-of-type(1) ~ section             preserved   general sibling combinator
 *   counter() in generated content       MOVES       box tree: a hidden box does not increment
 *   visible page number                 moves        by design — a view renumbers what it ships
 *   withheld body / note / caption text  hidden      on every format
 *   deck length, withheld positions      disclosed   in the plain `.html` and the projected SOURCE
 *                                        hidden      in PDF / PPTX / PNG / the player's frames
 *
 * The two `MOVES` rows are the honest residue and the reason the author-CSS warning still exists.
 * The last row is the design's stated cost: a hole says a slide was here, and nothing else.
 */
describe('what a projection lets a recipient observe', { skip }, () => {
	// 8 slides, `brief` keeps 1/4/6/8 (0-based 0,3,5,7) so holes fall before, between AND after the
	// kept slides — a shape where an off-by-one in any direction shows up.
	const KEPT_1BASED = [1, 4, 6, 8];
	const CHANNELS = [
		{ css: 'section:nth-of-type(6) h1  { color: rgb(255,0,0) }', prop: 'color', hit: 'rgb(255, 0, 0)', name: 'nth-of-type(6)' },
		{ css: 'section:nth-child(8) h1 { outline-color: rgb(0,255,0) }', prop: 'outlineColor', hit: 'rgb(0, 255, 0)', name: 'nth-child(8)' },
		{ css: 'section:last-of-type h1 { text-decoration-color: rgb(0,0,255) }', prop: 'textDecorationColor', hit: 'rgb(0, 0, 255)', name: 'last-of-type' },
		{ css: 'section:nth-last-of-type(3) h1 { border-top-color: rgb(255,0,255) }', prop: 'borderTopColor', hit: 'rgb(255, 0, 255)', name: 'nth-last-of-type(3)' },
		{ css: 'section:nth-of-type(2n) h1 { column-rule-color: rgb(0,255,255) }', prop: 'columnRuleColor', hit: 'rgb(0, 255, 255)', name: 'nth-of-type(2n)' },
		{ css: 'section:nth-of-type(3) + section h1 { background-color: rgb(128,0,0) }', prop: 'backgroundColor', hit: 'rgb(128, 0, 0)', name: 'adjacent sibling +' },
		{ css: 'section:nth-of-type(1) ~ section h1 { caret-color: rgb(0,128,0) }', prop: 'caretColor', hit: 'rgb(0, 128, 0)', name: 'general sibling ~' },
	];

	function channelDeck() {
		const style = `<style>\n${CHANNELS.map((c) => c.css).join('\n')}\nsection { counter-increment: sl }\nsection h1::after { content: " [n" counter(sl) "]" }\n</style>\n`;
		const raw = Array.from({ length: 8 }, (_, i) => `\n<!-- _class: content -->\n\n# Slide ${i + 1}\n\nBody of slide ${i + 1}.\n`);
		const mem = new Set(KEPT_1BASED.map((n) => n - 1));
		const body = style + raw.map((s, i) => applyTag(s, 'brief', mem.has(i), 'none')).join('\n---\n') + '\n';
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, { id: 'brief', label: 'Brief', base: 'none' }], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(splitSlideChunks(body).chunks, bare, l.id) })), default: 'full' };
		let head = `---\nmarp: true\ntheme: indaco\npaginate: true\n${emitRegistry(reg)}`;
		if (!head.endsWith('\n')) head += '\n';
		return `${head}---\n${body}`;
	}

	test('every SELECTOR channel lands on the same authored slide in a projection as in the whole deck', { timeout: TIMEOUT }, async () => {
		const src = channelDeck();
		const full = run(src, 'full.html', ['--quiet']);
		assert.equal(full.r.status, 0, full.r.stderr);
		const brief = run(src, 'brief.html', ['--quiet', '--lens', 'brief']);
		assert.equal(brief.r.status, 0, brief.r.stderr);

		const browser = await require('puppeteer').launch({ executablePath: CHROME, args: ['--no-sandbox'] });
		try {
			const read = async (file) => {
				const page = await browser.newPage();
				await page.goto(`file://${file}`);
				const rows = await page.evaluate((props) =>
					[...document.querySelectorAll('section[data-lattice-slide]')].map((s) => {
						const h = s.querySelector('h1');
						const cs = h && getComputedStyle(h);
						const o = { at: Number(s.getAttribute('data-authored-slide')) + 1, hole: s.classList.contains('lens-hole') };
						for (const p of props) o[p] = cs ? cs[p] : '';
						return o;
					}), CHANNELS.map((c) => c.prop));
				await page.close();
				return rows;
			};
			const a = await read(full.out);
			const b = await read(brief.out);
			const lands = (rows, c) => rows.filter((r) => !r.hole && r[c.prop] === c.hit).map((r) => r.at);
			for (const c of CHANNELS) {
				// Restrict the full deck's answer to the slides the view KEEPS: that is what the
				// projection can be held to. Anything else would demand the view show a slide it withheld.
				const want = lands(a, c).filter((n) => KEPT_1BASED.includes(n));
				assert.deepEqual(lands(b, c), want, `${c.name} lands on the same authored slide(s) in both renders`);
			}
			// And the guard against a vacuous pass: the rules must actually have hit something.
			assert.ok(CHANNELS.every((c) => lands(a, c).length > 0), 'every channel rule matched at least one slide in the full deck');
		} finally {
			await browser.close();
		}
	});

	test('a CSS COUNTER is the channel holes do NOT close, and it is measured rather than assumed', { timeout: TIMEOUT }, () => {
		// `nth-of-type` is structural and counts a `display:none` element. A counter lives on the BOX
		// tree, and a hidden element generates no box, so it does not increment. If this test ever
		// starts passing as "preserved", the author-CSS warning is telling authors the wrong thing and
		// must be rewritten — that is why the ASSERTION IS THAT IT MOVES.
		const src = channelDeck();
		const { execFileSync } = require('node:child_process');
		const readCounters = (pdf) => {
			let text = '';
			try { text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }); } catch { return null; }
			return [...text.matchAll(/Slide (\d+) \[n(\d+)\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
		};
		const full = run(src, 'full.pdf', ['--quiet']);
		assert.equal(full.r.status, 0, full.r.stderr);
		const brief = run(src, 'brief.pdf', ['--quiet', '--lens', 'brief']);
		assert.equal(brief.r.status, 0, brief.r.stderr);
		const a = readCounters(full.out);
		const b = readCounters(brief.out);
		if (!a || !b) return; // no pdftotext on this machine
		assert.deepEqual(a, [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 7], [8, 8]], 'the whole deck numbers itself 1..8');
		assert.deepEqual(b, [[1, 1], [4, 2], [6, 3], [8, 4]], 'and the projection renumbers: slide 4 reads n2, slide 6 reads n3, slide 8 reads n4');
	});

	test('the artifact discloses the withheld POSITIONS only where the design says it does', { timeout: TIMEOUT }, async () => {
		const src = channelDeck();
		const html = run(src, 'shape.html', ['--quiet', '--lens', 'brief']);
		assert.equal(html.r.status, 0, html.r.stderr);
		const doc = fs.readFileSync(html.out, 'utf8');
		const secs = [...doc.matchAll(/<section\b[^>]*data-authored-slide="(\d+)"[^>]*>/g)];
		// The KERNEL predicate, not a seventh spelling of it. The one this replaced was the unanchored
		// `\blens-hole\b`, added by the same commit that centralized the predicate to abolish it.
		const holes = secs.filter((m) => isHoleOpenTag(m[0])).map((m) => Number(m[1]) + 1);
		// The plain `.html` keeps the holes — its sections are siblings, so `nth-of-type` is live there
		// and the slot has to stay. The cost is stated rather than hidden: length and positions.
		assert.equal(secs.length, 8, 'the plain .html carries every authored slot, so deck length is recoverable');
		assert.deepEqual(holes, [2, 3, 5, 7], 'and so are the withheld positions');
		// What it must NEVER carry is the content.
		for (const away of [2, 3, 5, 7]) assert.ok(!doc.includes(`Body of slide ${away}.`), `slide ${away}'s body is not in the .html`);

		// The PDF is the opposite: it pays nothing. Neither length nor positions survive.
		const pdf = run(src, 'shape.pdf', ['--quiet', '--lens', 'brief']);
		assert.equal(pdf.r.status, 0, pdf.r.stderr);
		const d = await require('pdf-lib').PDFDocument.load(fs.readFileSync(pdf.out));
		assert.equal(d.getPageCount(), 4, 'the PDF has one page per SHIPPED slide — the deck length does not survive');
	});
});
