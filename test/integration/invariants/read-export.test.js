/**
 * `--read` emits the deck's PROSE INSTEAD OF the slide stack, and moves no raster bytes.
 *
 * WHY "INSTEAD OF" IS THE DESIGN, not a preference. Reader-mode text extractors —
 * Readability, which Firefox's Reader View and its shake-to-summarize run on, and the
 * reading modes Safari and Chrome ship — read a document and keep what they find in it.
 * A page carrying BOTH a visible slide stack and a visible article therefore feeds them
 * the deck TWICE: measured 2123 extracted words for a 1080-word deck, every sentence
 * duplicated, which also halves the deck that fits under Firefox's 3000-word cap. Hiding
 * one copy from the reader while leaving it for the extractor is cloaking and is not on
 * the table. So a document gets ONE copy of the deck, and this flag makes it the prose
 * one: 1040 words, single copy, on the same deck.
 *
 * WHY THE RASTER ARM IS HERE. The article is appended AFTER rasterization, the same
 * placement `--fluid` uses, precisely so the PDF/PPTX/PNG are rendered from the clean
 * pre-article document. That ordering is invisible in the source — move the injection a
 * few hundred lines earlier and everything below still passes while every exported PDF
 * silently grows a wall of prose pages. The md5 comparison is the only thing that would
 * notice, so it is worth the second render.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../helpers/render');

// Small on purpose — this asserts document SHAPE, which holds at any slide count, and
// the file pays for two PDF renders already. The prose is real sentences because the
// projection skips empty slides and a deck of bare headings would let a broken
// projection pass by producing nothing to compare.
const DECK_SOURCE = `---
theme: indaco
---

# The invisible half

Most of what makes a thing good is hidden from the person who buys it.

---

## What a welt actually does

A welt is a strip of leather joining the upper to the outsole. It turns the sole into a
part a cobbler can swap without touching the rest of the shoe, which is why repair pays.

---

## Two things to start on Monday

- Separate the parts that wear from the parts that last
- Make the join a standard, not a weld
`;

// A sentence that appears exactly once in the deck. Counting it in the extracted text is
// how duplication is detected — a word count alone cannot tell "more content" from "the
// same content twice".
const PROBE = 'A welt is a strip of leather joining the upper to the outsole';

function render(dir, out, extraArgs = []) {
	const src = path.join(dir, 'deck.md');
	if (!fs.existsSync(src)) fs.writeFileSync(src, DECK_SOURCE);
	const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), src, out, 'indaco', ...extraArgs, '-q'], {
		cwd: ROOT, encoding: 'utf8', timeout: 900000,
	});
	assert.equal(res.status, 0, `render failed (${extraArgs.join(' ') || 'plain'}):\n${res.stderr}`);
	return out;
}

describe('--read — the deck as prose, and nothing else moves', () => {
	let dir;
	before(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-'));
	});
	after(() => {
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	});

	test('the .html carries the article and NOT the slide stack', { timeout: 900000 }, () => {
		const out = render(dir, path.join(dir, 'read.html'), ['--read']);
		const html = fs.readFileSync(out, 'utf8');

		assert.match(html, /<article id="lat-read"/, 'expected the reading article');
		// The slide stack is REPLACED, not hidden and not appended. This is the assertion the
		// duplication finding above bought: if the sections come back, every summary of this
		// file is built from two copies of the deck.
		assert.doesNotMatch(html, /<section[^>]*data-lattice-slide/, 'the slide stack must be gone, not hidden beside the article');
		// A skip link aimed at the <main id="deck"> that no longer exists is a dead anchor.
		// Matched on the ELEMENT, not the class name: the stylesheet still carries a
		// `.lat-skip-link` rule, which is inert once nothing wears the class.
		assert.doesNotMatch(html, /<a class="lat-skip-link"/, 'the skip-to-slides link must go with the slides');
		// The deck's own words survived the projection.
		assert.ok(html.includes('cobbler'), 'expected the deck prose in the article');
	});

	test('the deck appears exactly once in the document text', { timeout: 900000 }, () => {
		const out = path.join(dir, 'read.html');
		const html = fs.readFileSync(out, 'utf8');
		const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
		let n = 0;
		for (let i = text.indexOf(PROBE); i !== -1; i = text.indexOf(PROBE, i + 1)) n++;
		assert.equal(n, 1, `the deck's text must appear once, not ${n} times — a second copy double-feeds every summarizer`);
	});

  // REGRESSION, found by an independent checker, not by this file. The swap used to be a
  // regex over the document and then a replacement of the `main#deck` NODE, and both
  // mis-handled the same input: the engine passes an author's RAW HTML through unescaped,
  // so a slide that merely WRITES the characters of a closing main tag ends that element
  // where it sits — for the regex, and for the parser, which then hangs the remaining
  // slides outside `#deck` as siblings. Either way a whole slide survived the swap with
  // its text in the document TWICE, which is the one thing this flag exists to prevent.
  // The fixture is deliberately the hostile case; the original fixture below could never
  // have caught it.
  test('an author writing a closing main tag cannot leave a slide behind', { timeout: 900000 }, () => {
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-main-'));
    try {
      fs.writeFileSync(
        path.join(dir2, 'deck.md'),
        '---\ntheme: indaco\n---\n\n# Teaching the landmark\n\n' +
          '<p>Every page closes its landmark with </main> before the scripts run, and the skip link ' +
          'above it has to point somewhere that still exists.</p>\n\n---\n\n## Two things to start\n\n' +
          '- Separate the parts that wear from the parts that last\n' +
          '  - Make the join a standard, not a weld, so the sole can be replaced on its own.\n',
      );
      const out = render(dir2, path.join(dir2, 'read.html'), ['--read']);
      const html = fs.readFileSync(out, 'utf8');
      assert.doesNotMatch(html, /<section[^>]*data-lattice-slide/, 'no slide may survive the swap, however the document parsed');
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const probe = 'Separate the parts that wear';
      let n = 0;
      for (let i = text.indexOf(probe); i !== -1; i = text.indexOf(probe, i + 1)) n++;
      assert.equal(n, 1, `the deck's text must appear once, not ${n} times`);
    } finally {
      fs.rmSync(dir2, { recursive: true, force: true });
    }
  });

  // REGRESSION, same review. `--read` used to REASSIGN the module's `cleanDocHtml` to the
  // article document, and the caption projection reads that same string afterwards to find
  // `section[data-lattice-slide]`. The article has none by design, so `--read --captions`
  // silently wrote ZERO .vtt files and blamed the deck ("nothing to narrate") rather than
  // the flag. The two features are orthogonal and must compose.
  test('--read still writes the caption sidecars', { timeout: 900000 }, () => {
    const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-cap-'));
    try {
      fs.writeFileSync(path.join(dir3, 'deck.md'), DECK_SOURCE);
      render(dir3, path.join(dir3, 'read.html'), ['--read', '--captions']);
      const vtts = fs.readdirSync(dir3).filter((f) => f.endsWith('.vtt'));
      assert.ok(vtts.length > 0, '--read --captions must still narrate the slides; got no .vtt at all');
    } finally {
      fs.rmSync(dir3, { recursive: true, force: true });
    }
  });

	test('--read does not move a single byte of the PDF', { timeout: 900000 }, () => {
		const plain = render(dir, path.join(dir, 'plain.pdf'));
		const withRead = render(dir, path.join(dir, 'read.pdf'), ['--read']);
		const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
		assert.equal(
			sha(plain), sha(withRead),
			'--read must run AFTER rasterization; identical PDFs are what proves the article never reached the raster',
		);
		// …and the sidecar beside the PDF really did become the article, so the equality above
		// is not passing because the flag did nothing at all.
		const sidecar = fs.readFileSync(path.join(dir, 'read.html'), 'utf8');
		assert.match(sidecar, /<article id="lat-read"/, 'the --read sidecar should be the article');
	});
});
