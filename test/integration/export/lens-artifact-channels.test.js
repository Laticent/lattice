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
function deck({ extraFm = '', style = '', notes = false, captions = false, inlineCaptions = false, splitFirst = false, quoteView = null } = {}) {
	// `splitFirst` gives slide 1 a SECOND HEADING, which the default split mode cuts on — so the deck
	// renders more pages than it has slides, on top of the holes. That is the crossing no fixture
	// reached until it was measured by hand, and it is where the authored / rendered-section / page
	// index spaces all differ at once.
	const raw = Array.from({ length: 5 }, (_, i) =>
		`\n<!-- _class: content -->\n${inlineCaptions ? `<!-- caption: INLINE for slide ${i + 1}. -->\n` : ''}\n# Slide ${i + 1}\n\nBody of slide ${i + 1}.\n${splitFirst && i === 0 ? `\n## Second heading of slide 1\n\nMore of slide 1.\n` : ''}${quoteView && i === 0 ? `\n\`\`\`md\n<!-- _lens: ${quoteView} -->\n\`\`\`\n` : ''}${notes ? `\n<!-- NOTE FOR SLIDE ${i + 1} -->\n` : ''}`,
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

	test('and a PRINT-ONLY un-hiding is refused too — the PDF is rendered in print media', { timeout: TIMEOUT }, () => {
		// The arm above measures screen media, which is what the first version of this check did — and
		// `page.pdf()` renders in PRINT. So one line walked straight through it: `brief — 3 of 5 slides
		// ship`, exit 0, and a FIVE-page PDF blank at positions 2 and 4, verbatim the disclosure the
		// check had just been written to close. `@media print` is ordinary authoring in this engine
		// (`lib/base/base.finish.css` flips its own slots under it), not an exotic attack.
		const style = '<style>\n@media print { section.lens-hole { display: block !important } }\n</style>\n\n';
		const { r, out } = run(deck({ style }), 'printhole.pdf', ['--quiet', '--lens', 'brief']);
		assert.notEqual(r.status, 0, 'a print-only un-hiding is a refusal');
		assert.match(r.stderr, /renders as a page/);
		assert.match(r.stderr, /Slides 2, 4/);
		assert.ok(!fs.existsSync(out), 'no PDF');
		assert.ok(!fs.existsSync(out.replace(/\.pdf$/, '.html')), 'and no sidecar left behind');
	});

	test('and a PRINT-ONLY rule hiding a KEPT slide is refused — the mirror of the same gap', { timeout: TIMEOUT }, () => {
		const style = '<style>\n@media print { section[data-authored-slide="2"] { display: none !important } }\n</style>\n\n';
		const { r, out } = run(deck({ style }), 'printvanish.pdf', ['--quiet', '--lens', 'brief']);
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /renders no page/);
		assert.ok(!fs.existsSync(out));
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

	test('and an INLINE `<!-- caption: -->` reaches it too — the other half of the same channel', { timeout: TIMEOUT }, () => {
		// The sixth authored-vs-shipped pairing bug, found by the red team after the front-matter half
		// above was fixed. `slideCaptions` is extracted from the AUTHORED slide array and
		// `mergeNarration` reads `captions[i]` at the PAGE index, so the two spaces differ by every
		// hole in front of a slide. Measured: page 1 got slide 1's caption, page 2 fell back to
		// generated speech, and page 3 spoke SLIDE 3'S caption over SLIDE 5 — verbatim the
		// misnarration table `pruneCaptions` exists to prevent, still live through the other channel.
		// Both channels now go through one authored -> page join, which is the point.
		const { r, dir } = run(deck({ inlineCaptions: true }), 'inline.pdf', ['--quiet', '--lens', 'brief', '--captions']);
		assert.equal(r.status, 0, r.stderr);
		const parts = fs.readdirSync(dir).filter((f) => /^inline\.\d+\.vtt$/.test(f)).sort();
		assert.equal(parts.length, 3, 'three shipped slides, three parts');
		for (const [i, authored] of [1, 3, 5].entries()) {
			const vtt = fs.readFileSync(path.join(dir, parts[i]), 'utf8').replace(/<\d\d:\d\d:\d\d\.\d{3}>/g, '');
			assert.match(vtt, new RegExp(`INLINE for slide ${authored}`), `part ${i + 1} narrates authored slide ${authored}`);
		}
		// And no withheld slide's caption is anywhere in the sidecars — the misbinding did not only
		// misplace a caption, it PUBLISHED one the view withheld.
		const all = parts.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n') + fs.readFileSync(path.join(dir, 'inline.vtt'), 'utf8');
		for (const away of [2, 4]) assert.doesNotMatch(all, new RegExp(`INLINE for slide ${away}`), `slide ${away}'s caption is withheld`);
	});

	test('and it survives a SPLIT crossed with the projection — three index spaces at once', { timeout: TIMEOUT }, () => {
		// The crossing every earlier round assumed and none reached: slide 1 carries a second heading,
		// so the default split mode cuts it in two, and the view withholds slides 2 and 4. Now the
		// AUTHORED slides (5), the RENDERED sections (6 — five slots plus one continuation) and the
		// PAGES (4) are three different index spaces, and `captions` is indexed by the middle one while
		// `mergeNarration` reads the last. Measured by hand on this exact shape, both wrong answers:
		// reading it as page-indexed spoke slide 3's caption over slide 5, and reading it as
		// authored-indexed looked two captions up at HOLE positions and dropped them.
		const { r, dir } = run(deck({ inlineCaptions: true, splitFirst: true }), 'split.pdf', ['--quiet', '--lens', 'brief', '--captions']);
		assert.equal(r.status, 0, r.stderr);
		const parts = fs.readdirSync(dir).filter((f) => /^split\.\d+\.vtt$/.test(f)).sort();
		assert.equal(parts.length, 4, 'four pages: slide 1 in two, then slides 3 and 5');
		const say = parts.map((f) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/<\d\d:\d\d:\d\d\.\d{3}>/g, ''));
		// Both pages of slide 1 speak slide 1's caption — a caption is written for a SLIDE, and this is
		// the rule the front-matter channel already applies to a split.
		assert.match(say[0], /INLINE for slide 1\./);
		assert.match(say[1], /INLINE for slide 1\./);
		assert.match(say[2], /INLINE for slide 3\./, 'page 3 is authored slide 3, not slide 5');
		assert.match(say[3], /INLINE for slide 5\./, 'and page 4 is slide 5, whose caption is not lost');
		for (const away of [2, 4]) {
			assert.ok(!say.join('\n').includes(`INLINE for slide ${away}.`), `slide ${away}'s caption is withheld`);
		}
	});

	test('a QUOTED view id is COACHED, not refused — and the sender is told what prints', { timeout: TIMEOUT }, () => {
		// `renderedDirectiveBodies` says it asks "what a READER is shown", and reads only the two comment
		// token kinds. A reader is also shown a ```` ```md ```` fence: a deck documenting lens tagging
		// printed `<!-- _lens: board-only -->` — naming a view the export does not carry — on the face of
		// the recipient's PDF, silently.
		//
		// It WARNS rather than refusing, and that split is the point. Every other placement is a
		// directive the author cannot see rendered; this is prose they wrote and can read on their own
		// slide, the deck that hits it is usually one TEACHING reader views, and `lens-export.test.js`
		// already pins that such a deck must export with its example intact. HARD RULE #29: we coach.
		const away = run(deck({ quoteView: 'board-only' }), 'quoted.pdf', ['--quiet', '--lens', 'brief']);
		assert.equal(away.r.status, 0, away.r.stderr);
		assert.ok(fs.existsSync(away.out), 'the teaching deck still exports');
		assert.match(away.r.stderr, /QUOTES the view id 'board-only'/, 'and the sender is told, under --quiet');
		// Quoting a view this export DOES carry is not a disclosure and says nothing.
		const own = run(deck({ quoteView: 'brief' }), 'quotedown.pdf', ['--quiet', '--lens', 'brief']);
		assert.equal(own.r.status, 0, own.r.stderr);
		assert.doesNotMatch(own.r.stderr, /QUOTES the view id/);
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
 * Columns are the authored slides each rule lands on: in the whole deck, in the whole deck RESTRICTED
 * to the ones this view keeps (what the projection can be held to), in the projection, and in a
 * MUTANT built by deleting the hole sections from the file the export actually wrote — "the
 * projection stopped holding position", which is the failure this design is against. The mutant
 * column is what makes the row evidence: without it a row can agree without ever being able to
 * disagree, and two of the seven below were doing exactly that.
 *
 *   CHANNEL                            full          kept      proj      no-holes   verdict
 *   nth-of-type(6)                     [6]           [6]       [6]       []         preserved
 *   nth-child(8)                       [8]           [8]       [8]       []         preserved
 *   last-of-type                       [8]           [8]       [8]       [8]        preserved, BLIND
 *   nth-last-of-type(3)                [6]           [6]       [6]       [4]        preserved
 *   nth-of-type(2n)                    [2,4,6,8]     [4,6,8]   [4,6,8]   [4,8]      preserved
 *   nth-of-type(3) + section           [4]           [4]       [4]       [8]        preserved
 *   nth-of-type(3) ~ section           [4,5,6,7,8]   [4,6,8]   [4,6,8]   [8]        preserved
 *   nth-child(3 of .kpi)               [6]           [6]       []        []         BREAKS
 *   has(blockquote) + section          [4,6]         [4,6]     []        []         BREAKS
 *   not(:has(blockquote)) + section    [2,3,5,7,8]   [8]       [4,6,8]   [4,6,8]    BREAKS (gains)
 *   counter() in generated content     1..8          —         1..4      —          MOVES
 *   visible page number                —             —         —         —          moves by design
 *   withheld body / note / caption     —             —         —         —          hidden, every format
 *   deck length, withheld positions    —             —         —         —          disclosed in the plain
 *                                                                                   `.html` + projected SOURCE;
 *                                                                                   hidden in PDF/PPTX/PNG/player
 *
 * THE THREE `BREAKS` ROWS ARE THE FAMILY THE FIRST SEVEN HID, and they are the reason "positional CSS
 * is safe" was the wrong sentence. A hole keeps the withheld slide's SLOT and carries nothing else —
 * not its class list, not a byte of its content — so counting slots holds and asking a QUESTION ABOUT
 * a slot does not. The last of them is the dangerous direction: `:not(:has(…)) + section` styles three
 * kept slides here that it styled none of in the whole deck, so a rule that HID something in the deck
 * the sender previewed can UNHIDE it in the file they send. None of this is closable by trying harder —
 * the only hole that could answer these the way the withheld slide did is one carrying that slide's
 * classes and content, which is the disclosure the projection exists to prevent.
 *
 * `last-of-type` is marked BLIND rather than dropped: it really is preserved, and it also cannot tell
 * the difference (slide 8 is kept and stays last with or without the holes). It stays because a reader
 * of this table will reach for it, and it says out loud that it proves nothing.
 *
 * The `MOVES` row and the last row are the design's stated costs: a counter numbers boxes, and a hole
 * says a slide was here and nothing else.
 */
describe('what a projection lets a recipient observe', { skip }, () => {
	// 8 slides, `brief` keeps 1/4/6/8 (0-based 0,3,5,7) so holes fall before, between AND after the
	// kept slides — a shape where an off-by-one in any direction shows up.
	const KEPT_1BASED = [1, 4, 6, 8];
	// `discriminates` says whether the row can TELL THE DIFFERENCE — whether its answer would change
	// if holes stopped holding position. Two of the seven original rows could not, and were being
	// counted as evidence anyway: `last-of-type` lands on slide 8 whether or not the holes are there
	// (slide 8 is kept and stays last either way), and `nth-of-type(1) ~ section` matched every slide
	// but the first, which the restrict-to-kept filter then reduced to exactly the kept set on both
	// sides. A row that cannot fail is documentation, not measurement, so it says so.
	const CHANNELS = [
		{ css: 'section:nth-of-type(6) h1  { color: rgb(255,0,0) }', prop: 'color', hit: 'rgb(255, 0, 0)', name: 'nth-of-type(6)', discriminates: true },
		{ css: 'section:nth-child(8) h1 { outline-color: rgb(0,255,0) }', prop: 'outlineColor', hit: 'rgb(0, 255, 0)', name: 'nth-child(8)', discriminates: true },
		{ css: 'section:last-of-type h1 { text-decoration-color: rgb(0,0,255) }', prop: 'textDecorationColor', hit: 'rgb(0, 0, 255)', name: 'last-of-type', discriminates: false },
		{ css: 'section:nth-last-of-type(3) h1 { border-top-color: rgb(255,0,255) }', prop: 'borderTopColor', hit: 'rgb(255, 0, 255)', name: 'nth-last-of-type(3)', discriminates: true },
		{ css: 'section:nth-of-type(2n) h1 { column-rule-color: rgb(0,255,255) }', prop: 'columnRuleColor', hit: 'rgb(0, 255, 255)', name: 'nth-of-type(2n)', discriminates: true },
		{ css: 'section:nth-of-type(3) + section h1 { background-color: rgb(128,0,0) }', prop: 'backgroundColor', hit: 'rgb(128, 0, 0)', name: 'adjacent sibling +', discriminates: true },
		{ css: 'section:nth-of-type(3) ~ section h1 { caret-color: rgb(0,128,0) }', prop: 'caretColor', hit: 'rgb(0, 128, 0)', name: 'general sibling ~', discriminates: true },
	];

	// THE FAMILIES THAT DO NOT HOLD, measured the same way and asserted to BREAK. A hole keeps the
	// withheld slide's SLOT and carries nothing else — not its class list, not a byte of its content —
	// so a selector that counts slots holds and a selector that asks a QUESTION ABOUT the slot does
	// not. This is not closable by trying harder: the only hole that could answer these the way the
	// withheld slide did is one carrying that slide's classes and content, which is the disclosure the
	// projection exists to prevent (a class name is author text — `_class: acquisition-terms` names
	// the thing). So the boundary is pinned in the direction it really runs, and if one of these ever
	// starts holding, the warning the CLI prints is wrong and this file says so.
	const BREAKS = [
		{ css: 'section:nth-child(3 of .kpi) h1 { text-emphasis-color: rgb(9,9,9) }', prop: 'textEmphasisColor', hit: 'rgb(9, 9, 9)', name: 'nth-child(3 of .kpi)' },
		{ css: 'section:has(blockquote) + section h1 { border-bottom-color: rgb(7,7,7) }', prop: 'borderBottomColor', hit: 'rgb(7, 7, 7)', name: 'has(blockquote) + section' },
		{ css: 'section:not(:has(blockquote)) + section h1 { border-left-color: rgb(5,5,5) }', prop: 'borderLeftColor', hit: 'rgb(5, 5, 5)', name: 'not(:has(blockquote)) + section' },
	];
	const ALL = [...CHANNELS, ...BREAKS];

	function channelDeck() {
		const style = `<style>\n${ALL.map((c) => c.css).join('\n')}\nsection { counter-increment: sl }\nsection h1::after { content: " [n" counter(sl) "]" }\n</style>\n`;
		// Slides 2, 3, 6 and 8 carry `kpi`; slides 3 and 5 carry a blockquote. Both sets straddle the
		// kept/withheld line, which is what makes the three BREAKS rows fire rather than sit vacuous.
		const KPI = new Set([2, 3, 6, 8]);
		const QUOTE = new Set([3, 5]);
		const raw = Array.from({ length: 8 }, (_, i) => `\n<!-- _class: content${KPI.has(i + 1) ? ' kpi' : ''} -->\n\n# Slide ${i + 1}\n\n${QUOTE.has(i + 1) ? `> Quoted on slide ${i + 1}.\n\n` : ''}Body of slide ${i + 1}.\n`);
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
					}), ALL.map((c) => c.prop));
				await page.close();
				return rows;
			};
			// THE THIRD DOCUMENT IS WHAT GIVES THE ROWS TEETH. Comparing the projection against the
			// full deck shows a row AGREEING; it cannot show that the row would have noticed
			// disagreement. So a mutant is built by deleting the hole sections from the very file the
			// export wrote — "the projection stopped holding position", the failure this whole design
			// is against — and every row that claims to discriminate has to answer differently there.
			// Without this, two of the seven rows were certifying nothing and no one could tell.
			const mutantPath = brief.out.replace(/\.html$/, '.mutant.html');
			fs.writeFileSync(mutantPath, fs.readFileSync(brief.out, 'utf8').replace(/<section\b[^>]*>[\s\S]*?<\/section>/g,
				(sec) => (isHoleOpenTag(/^<section\b[^>]*>/.exec(sec)[0]) ? '' : sec)));
			const a = await read(full.out);
			const b = await read(brief.out);
			const m = await read(mutantPath);
			const lands = (rows, c) => rows.filter((r) => !r.hole && r[c.prop] === c.hit).map((r) => r.at);
			for (const c of CHANNELS) {
				// Restrict the full deck's answer to the slides the view KEEPS: that is what the
				// projection can be held to. Anything else would demand the view show a slide it withheld.
				const want = lands(a, c).filter((n) => KEPT_1BASED.includes(n));
				assert.deepEqual(lands(b, c), want, `${c.name} lands on the same authored slide(s) in both renders`);
				if (c.discriminates) {
					assert.notDeepEqual(lands(m, c), want, `${c.name} would have NOTICED the holes going away`);
				}
			}
			for (const c of BREAKS) {
				// Asserted to break, in the direction measured. A row that quietly started holding would
				// mean the hole had begun carrying something about the withheld slide, which is a leak.
				const want = lands(a, c).filter((n) => KEPT_1BASED.includes(n));
				assert.notDeepEqual(lands(b, c), want, `${c.name} does NOT survive the projection — it reads the withheld slide, and the hole is empty`);
			}
			// And the guard against a vacuous pass: every rule must have hit something in the full deck.
			for (const c of ALL) assert.ok(lands(a, c).length > 0, `${c.name} matched at least one slide in the full deck`);
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
