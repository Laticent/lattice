/**
 * `--read` emits the deck's PROSE INSTEAD OF the slide stack, and moves no raster bytes
 * in ANY of the three raster formats.
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
 * silently grows a wall of prose pages. The checksum comparison is the only thing that would
 * notice, so it is worth the second render — and the claim covers the .pptx and the .png set
 * as well, so each of those gets its own arm rather than riding on the PDF's.
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

	// A PHONE only lays a page out at its own width when the page says so. The slide render
	// --read starts from has no viewport meta, and without one iOS Safari and Android Chrome
	// lay the article out at 980px and zoom the whole page out (measured in WebKit on an
	// iPhone 15 Pro profile: a 345px figure became 932px). Desktop Chromium at a 390px window
	// ignores the tag, so no screenshot at that width could ever catch its absence.
	test('the article carries exactly one device-width viewport meta', { timeout: 900000 }, () => {
		const html = fs.readFileSync(path.join(dir, 'read.html'), 'utf8');
		const tags = html.match(/<meta name="viewport"[^>]*>/g) || [];
		assert.equal(tags.length, 1, `expected one viewport meta, found ${tags.length}`);
		assert.match(tags[0], /content="width=device-width,initial-scale=1"/);
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

  // REGRESSION, found by a SECOND independent checker pass over this feature as landed.
  // The first pass's fix — "key on the SLIDES rather than on their container" — was right
  // about the closing-main-tag deck above and re-opened a different door with the same
  // shape: `section[data-lattice-slide]` unscoped ALSO matches a section an AUTHOR wrote in
  // their own markdown, which the engine passes through unescaped and the parser nests
  // inside the real slide. It was then projected TWICE — once inside its parent slide's
  // prose, once as a phantom slide of its own, with a phantom table-of-contents row and
  // every later slide's number shifted. The repo already knew this hazard: `measureOverflow`
  // scopes for it ~950 lines earlier in the emulator.
  test('a section an author wrote themselves is not mistaken for a slide', { timeout: 900000 }, () => {
    const dir4 = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-nest-'));
    try {
      fs.writeFileSync(
        path.join(dir4, 'deck.md'),
        '---\ntheme: indaco\n---\n\n# How a slide is marked up\n\n' +
          'Every rendered slide carries a data attribute so the player transport can find it again.\n\n' +
          '<section data-lattice-slide="99"><p>NESTEDPROBE the example markup an author might paste ' +
          'into a deck that teaches what the engine emits.</p></section>\n\n---\n\n' +
          '## Two things to start\n\n- Separate the parts that wear from the parts that last\n',
      );
      const out = render(dir4, path.join(dir4, 'read.html'), ['--read']);
      const html = fs.readFileSync(out, 'utf8');
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      let n = 0;
      for (let i = text.indexOf('NESTEDPROBE'); i !== -1; i = text.indexOf('NESTEDPROBE', i + 1)) n++;
      assert.equal(n, 1, `the author's own section must be projected once as part of its slide, not ${n} times`);
      // The deck has TWO slides. A third `lp-sec-` id means the nested section was counted
      // as a slide of its own — which also mints a table-of-contents row pointing at a
      // heading the deck never wrote, and renumbers every slide after it.
      const ids = html.match(/id="lp-sec-\d+"/g) || [];
      assert.equal(ids.length, 2, `expected one article section per real slide; got ${ids.length}: ${ids.join(', ')}`);
    } finally {
      fs.rmSync(dir4, { recursive: true, force: true });
    }
  });

  // REGRESSION, found by a checker over the FIRST fix for the arm above. That fix scoped the
  // query to the string `#deck > section[data-lattice-slide], body > …` — and a CSS id
  // selector matches ANY element carrying that id, so a deck teaching the export shell by
  // pasting the whole scaffold still minted a phantom slide, one wrapper deeper. The fixture
  // is the scaffold, because that is what a deck documenting the exporter actually writes.
  test('a pasted export scaffold does not mint a second deck', { timeout: 900000 }, () => {
    const dir8 = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-scaffold-'));
    try {
      fs.writeFileSync(
        path.join(dir8, 'deck.md'),
        '---\ntheme: indaco\n---\n\n# How the export scaffold looks\n\n' +
          '<main id="deck" tabindex="-1"><section data-lattice-slide="1"><p>SCAFFOLDPROBE this is ' +
          'the shape the exporter writes around your slides.</p></section></main>\n\n---\n\n' +
          '## Two things to start\n\n- Separate the parts that wear from the parts that last\n',
      );
      const out = render(dir8, path.join(dir8, 'read.html'), ['--read']);
      const html = fs.readFileSync(out, 'utf8');
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      let n = 0;
      for (let i = text.indexOf('SCAFFOLDPROBE'); i !== -1; i = text.indexOf('SCAFFOLDPROBE', i + 1)) n++;
      assert.equal(n, 1, `the pasted scaffold must be projected once as part of its slide, not ${n} times`);
      const ids = html.match(/id="lp-sec-\d+"/g) || [];
      assert.equal(ids.length, 2, `expected one article section per real slide; got ${ids.length}`);
    } finally {
      fs.rmSync(dir8, { recursive: true, force: true });
    }
  });

  // REGRESSION, same pass. The article's `<main>` was inserted as a sibling of the first
  // SLIDE — i.e. INSIDE `main#deck` — and the "drop the container if it is left empty"
  // branch below it then asked `deck.textContent`, which by that point held the whole
  // article. So the drop could never fire and every `--read` document shipped a `<main>`
  // inside a `<main>`: three axe landmark violations against zero for the same deck
  // exported plain. The article now REPLACES the container. `axe-a11y.test.js` gates the
  // whole rule set on this shell; this arm pins the specific structure, because a landmark
  // count is the thing a future refactor would quietly change.
  test('the article replaces the slide container rather than nesting inside it', { timeout: 900000 }, () => {
    const out = render(dir, path.join(dir, 'read.html'), ['--read']);
    // PARSED, not pattern-matched. The reading sheet's own comments discuss `<main>` in
    // prose, so a regex over the file counts three landmarks in a document that has one —
    // which is how the first cut of this arm failed against correct output.
    const { JSDOM } = require('jsdom');
    const doc = new JSDOM(fs.readFileSync(out, 'utf8')).window.document;
    const mains = [...doc.querySelectorAll('main')];
    assert.equal(mains.length, 1, `a document gets ONE main landmark; got ${mains.length}: ${mains.map((m) => m.id || '(no id)').join(', ')}`);
    assert.equal(mains[0].id, 'lat-read-main', 'the surviving main should be the reading article, not the empty slide container');
    assert.equal(doc.querySelector('main#deck'), null, 'the slide container must go with the slides it no longer holds');
    assert.ok(doc.querySelector('main#lat-read-main > article#lat-read'), 'the article should still be inside the reading main');
  });

  // REGRESSION, found by a second independent checker pass over this feature as landed.
  // `--read` projects its article from the slide DOM, and a Mermaid diagram carries EVERY
  // node label in a `<foreignObject>` — HTML smuggled into the SVG namespace — which
  // `buildReadingArticleDocument`'s own sanitizer removes. So the article shipped the
  // flowchart as empty coloured boxes with arrows and no words at all. `--player` never had
  // it because the player branch BAKES the diagram first, flattening each label to a native
  // `<text>`; that bake was gated on `PLAYER` alone and now runs for `--read` too.
  //
  // Measured before the fix on this fixture: 0 occurrences of a node's label in the article,
  // against 2 in the player for the same deck.
  test('a diagram reaches the article as a drawing with its labels, not as empty boxes', { timeout: 900000 }, async () => {
    const dir5 = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-mer-'));
    try {
      fs.writeFileSync(
        path.join(dir5, 'deck.md'),
        '---\ntheme: indaco\n---\n\n# Diagram deck\n\n' +
          'A short lede so the page carries some prose of its own before the diagram arrives.\n\n' +
          '---\n\n<!-- _class: diagram -->\n\n## How a deck becomes a PDF\n\n' +
          '```mermaid\ngraph LR\n  A[Markdown source] --> B[Engine render]\n  B --> C[Rasterize]\n```\n',
      );
      const out = render(dir5, path.join(dir5, 'read.html'), ['--read']);
      const { JSDOM } = require('jsdom');
      const article = new JSDOM(fs.readFileSync(out, 'utf8')).window.document.querySelector('#lat-read');
      assert.ok(article, 'expected the reading article');
      const labels = [...article.querySelectorAll('text')].map((t) => t.textContent.trim()).filter(Boolean);
      // The label text is the assertion. An SVG alone would also be satisfied by the empty
      // boxes this arm exists to catch.
      for (const want of ['Markdown source', 'Engine render', 'Rasterize']) {
        assert.ok(labels.some((l) => l.includes(want)), `the diagram must carry its "${want}" label; got ${JSON.stringify(labels)}`);
      }
      // NO `foreignObject === 0` ARM. It reads like the detector for this and is not one: the
      // article's sanitizer removes `<foreignObject>` either way, so the count is 0 on the
      // broken code too and the assertion could never fail. Measured on main, which has the
      // defect: 0 foreignObject, 0 `<text>`. The LABELS above are the whole test.
      assert.ok(labels.length >= 3, `expected the diagram's own labels, got ${labels.length} text nodes`);
      // THE FLOOR, on real mmdc output rather than a hand-written svg: a 3-node LR chart is
      // well past 2:1, so its figure must carry the kernel's inline size, a 12/14 floor and a
      // tab stop. If mmdc ever stops writing a viewBox, this is the arm that notices.
      const svg = article.querySelector('svg[aria-roledescription]');
      const fig = svg.closest('figure');
      assert.ok(fig.classList.contains('lp-diagram'), `the diagram's figure must be tagged; got class="${fig.className}"`);
      assert.equal(fig.getAttribute('tabindex'), '0', 'a wide floored figure scrolls, so it must take focus');
      const vbW = Number(svg.getAttribute('viewBox').trim().split(/[\s,]+/)[2]);
      const minW = parseFloat(fig.style.getPropertyValue('--lp-fig-min-w'));
      assert.ok(Math.abs(minW - (vbW * 12) / 14) < 0.1, `floor ${minW}px should be 12/14 of the ${vbW}px viewBox`);
    } finally {
      fs.rmSync(dir5, { recursive: true, force: true });
    }
  });

  // REGRESSION, from the same checker pass. `--fluid` and `--read` ask for opposite
  // documents and the write is an `else if` chain, so one loses — silently. Only the
  // `--player` clash warned; `--read --fluid` produced a fluid viewer with no article in it
  // and said nothing, and the READ arm's own "Never silent: the operator asked for an
  // article" comment was unreachable in that composition. The sharper half was that a
  // deck's `fluid: true` beat a `--read` typed on the command line — a file default
  // overriding what the operator just asked for.
  test('an explicit --read beats a deck that sets fluid, and neither clash is silent', { timeout: 900000 }, () => {
    const dir6 = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-fluid-'));
    try {
      // (a) BOTH ON THE COMMAND LINE — fluid keeps winning, which is the chain's order, but
      // the operator is told the article is not in the file.
      fs.writeFileSync(path.join(dir6, 'deck.md'), DECK_SOURCE);
      const bothFlags = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), path.join(dir6, 'deck.md'), path.join(dir6, 'both.html'), 'indaco', '--read', '--fluid'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      assert.equal(bothFlags.status, 0, bothFlags.stderr);
      assert.match(`${bothFlags.stdout}${bothFlags.stderr}`, /--fluid and --read both set/, 'the losing flag must not be silent');
      assert.doesNotMatch(fs.readFileSync(path.join(dir6, 'both.html'), 'utf8'), /id="lat-read"/, 'fluid wins when both are flags');

      // (b) THE DECK SAYS FLUID, THE OPERATOR SAYS READ — the explicit flag wins.
      fs.writeFileSync(path.join(dir6, 'fm.md'), DECK_SOURCE.replace('theme: indaco', 'theme: indaco\nfluid: true'));
      const deckKey = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), path.join(dir6, 'fm.md'), path.join(dir6, 'fm.html'), 'indaco', '--read'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      assert.equal(deckKey.status, 0, deckKey.stderr);
      assert.match(fs.readFileSync(path.join(dir6, 'fm.html'), 'utf8'), /id="lat-read"/, "a deck's fluid: must not override an explicit --read");
      // Pin the MESSAGE too, not just the winner. "Say which one won" is half of what this
      // change is for, and without this the warning could be reworded or deleted and the arm
      // would stay green.
      assert.match(`${deckKey.stdout}${deckKey.stderr}`, /--read was asked for explicitly/, 'the winning flag must say why it won');

      // (c) BOTH FROM THE DECK, no flags at all — fluid still wins, and the warning must name
      // the KEYS rather than flags the operator never typed.
      fs.writeFileSync(path.join(dir6, 'both.md'), DECK_SOURCE.replace('theme: indaco', 'theme: indaco\nfluid: true\nread: true'));
      const bothKeys = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), path.join(dir6, 'both.md'), path.join(dir6, 'bothkeys.html'), 'indaco'], { cwd: ROOT, encoding: 'utf8', timeout: 900000 });
      assert.equal(bothKeys.status, 0, bothKeys.stderr);
      const said = `${bothKeys.stdout}${bothKeys.stderr}`;
      assert.match(said, /this deck sets both `fluid: true` and `read: true`/, 'name the keys, not flags that were never typed');
      assert.doesNotMatch(said, /--fluid and --read both set/, 'an author greps their invocation for a flag that is not there');
    } finally {
      fs.rmSync(dir6, { recursive: true, force: true });
    }
  });

  // REGRESSION, same pass. A deck declaring `color-mode: dark` handed its reader a WHITE
  // page. The engine carries dark as a `dark` CLASS on the slide SECTION and every rule for
  // it is section-scoped, so once `--read` removes the sections nothing carries the scheme
  // and the palette's `light-dark()` tokens all resolve to their light branch. The player
  // does not have this — it derives the deck's scheme for its own shell — so the same deck
  // read dark there and white here.
  test('a --read export honors the deck color-mode', { timeout: 900000 }, () => {
    const dir7 = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-mode-'));
    try {
      fs.writeFileSync(path.join(dir7, 'deck.md'), DECK_SOURCE.replace('theme: indaco', 'theme: indaco\ncolor-mode: dark'));
      const out = render(dir7, path.join(dir7, 'read.html'), ['--read']);
      const { JSDOM } = require('jsdom');
      const doc = new JSDOM(fs.readFileSync(out, 'utf8')).window.document;
      assert.match(
        doc.documentElement.getAttribute('style') || '', /color-scheme:\s*dark/,
        "a dark deck's reading article must carry the scheme, or every light-dark() token resolves light",
      );
      // `system` DEFERS to the reader's OS, which is exactly what `.color-system` sets on the
      // section. It was missing from the first cut and is not an "unknown value" — it is a
      // first-class shipped register, and without it a `color-mode: system` deck read light in
      // the article while the player read dark on a dark-mode machine, which is the divergence
      // this whole arm exists to close.
      const dir7s = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-mode-system-'));
      try {
        fs.writeFileSync(path.join(dir7s, 'deck.md'), DECK_SOURCE.replace('theme: indaco', 'theme: indaco\ncolor-mode: system'));
        const sys = render(dir7s, path.join(dir7s, 'read.html'), ['--read']);
        const sdoc = new JSDOM(fs.readFileSync(sys, 'utf8')).window.document;
        assert.match(sdoc.documentElement.getAttribute('style') || '', /color-scheme:\s*light dark/, 'system defers the side to the reader');
      } finally {
        fs.rmSync(dir7s, { recursive: true, force: true });
      }

      // `print` is a CANVAS treatment, not a scheme, and `color-scheme` has no print branch.
      // A handout is a light canvas, so it maps to light — written explicitly rather than
      // left to the default, so an undeclared print deck cannot start reading dark if the
      // shell ever adopts `color-scheme: light dark`.
      const dir7c = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-mode-print-'));
      try {
        fs.writeFileSync(path.join(dir7c, 'deck.md'), DECK_SOURCE.replace('theme: indaco', 'theme: indaco\ncolor-mode: print'));
        const printed = render(dir7c, path.join(dir7c, 'read.html'), ['--read']);
        const cdoc = new JSDOM(fs.readFileSync(printed, 'utf8')).window.document;
        assert.match(cdoc.documentElement.getAttribute('style') || '', /color-scheme:\s*light/, 'a print deck reads as a light canvas');
      } finally {
        fs.rmSync(dir7c, { recursive: true, force: true });
      }

      // `inherited` is the one register whose correct behavior is to write NOTHING: with the
      // sections gone there is nothing between the article and the theme's `:root` to inherit
      // from, so the root is left to the theme (the map's comment in lattice-emulator.js).
      // Pinned because a wrong write here looks deliberate — `inherited: 'inherit'` or
      // `inherited: 'light dark'` added to the map would each read as a considered choice.
      const dir7i = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-mode-inherited-'));
      try {
        fs.writeFileSync(path.join(dir7i, 'deck.md'), DECK_SOURCE.replace('theme: indaco', 'theme: indaco\ncolor-mode: inherited'));
        const inherited = render(dir7i, path.join(dir7i, 'read.html'), ['--read']);
        const idoc = new JSDOM(fs.readFileSync(inherited, 'utf8')).window.document;
        assert.doesNotMatch(idoc.documentElement.getAttribute('style') || '', /color-scheme/, 'an inherited deck leaves the root to the theme');
      } finally {
        fs.rmSync(dir7i, { recursive: true, force: true });
      }

      // And a deck that says nothing is left alone rather than pinned to a scheme it never
      // asked for. A SECOND DIRECTORY, because `render` always reads `<dir>/deck.md` — the
      // first cut of this arm wrote a `plain.md` the helper ignored, so it re-rendered the
      // dark deck and failed against correct output.
      const dir7b = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-mode-plain-'));
      try {
        const plain = render(dir7b, path.join(dir7b, 'read.html'), ['--read']);
        const pdoc = new JSDOM(fs.readFileSync(plain, 'utf8')).window.document;
        assert.doesNotMatch(pdoc.documentElement.getAttribute('style') || '', /color-scheme/, 'an undeclared deck keeps the document default');
      } finally {
        fs.rmSync(dir7b, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(dir7, { recursive: true, force: true });
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

	// THE CLAIM WAS WIDER THAN THE TEST. The decision note and `--help` both say the
	// PDF/PPTX/PNG are rendered from the clean pre-article document; only the PDF arm above
	// pinned it. Move the injection earlier and the PDF arm fails while a .pptx quietly grows
	// a wall of prose slides, which is the same defect in a format nobody is watching.
	//
	// Both arms render into SEPARATE DIRECTORIES under the SAME basename, unlike the PDF arm.
	// That is not tidiness: `.pptx` writes the output filename into `docProps/core.xml` as
	// `dc:title`, so rendering `plain.pptx` beside `read.pptx` makes the two differ for a
	// reason that has nothing to do with the flag.
	//
	// WHAT THESE TWO CANNOT SEE, measured rather than assumed. The PDF prints the whole page,
	// so merely APPENDING the article to the live document before the raster moves its bytes.
	// These two rasterize per SLIDE — one screenshot per `section[data-lattice-slide]` — so an
	// appended article is invisible to them and only a mutation that touches the SLIDES turns
	// them red. Both mutations were run: appending the article ahead of the raster fails the
	// PDF arm alone, and performing the real SWAP there (delete the sections, insert the
	// article — what `--read` actually does, just early) fails all three. The swap is the
	// regression these exist for, so they earn their place; the narrower one is the PDF arm's.

	test('--read does not move a single byte of the PNG set', { timeout: 900000 }, () => {
		const a = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-png-a-'));
		const b = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-png-b-'));
		try {
			render(a, path.join(a, 'deck.png'));
			render(b, path.join(b, 'deck.png'), ['--read']);
			// THE FLAG DID SOMETHING. Byte-identity alone stays green if `--read` silently became
			// a no-op for raster targets, which is the one way this arm could pass while the
			// feature was broken. The PDF arm already guards this; these two did not.
			assert.match(
				fs.readFileSync(path.join(b, 'deck.html'), 'utf8'), /<article id="lat-read"/,
				'the --read run must actually have produced the article, or equality proves nothing',
			);
			const pngs = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.png')).sort();
			const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
			// A .png render emits one numbered file per slide, so an empty set would make every
			// comparison below vacuously true.
			assert.ok(pngs(a).length >= 2, `expected one PNG per slide, got ${pngs(a).length}`);
			assert.deepEqual(pngs(b), pngs(a), '--read must not add, drop or renumber a slide image');
			for (const name of pngs(a)) {
				assert.equal(
					sha(path.join(b, name)), sha(path.join(a, name)),
					`${name} moved under --read; the article reached the rasterizer`,
				);
			}
		} finally {
			fs.rmSync(a, { recursive: true, force: true });
			fs.rmSync(b, { recursive: true, force: true });
		}
	});

	test('--read does not move a single byte of the PPTX payload', { timeout: 900000 }, async () => {
		const a = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-pptx-a-'));
		const b = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-read-pptx-b-'));
		try {
			render(a, path.join(a, 'deck.pptx'));
			render(b, path.join(b, 'deck.pptx'), ['--read']);
			const JSZip = require('jszip');
			const entries = async (f) => {
				const zip = await JSZip.loadAsync(fs.readFileSync(f));
				const out = new Map();
				for (const name of Object.keys(zip.files)) {
					if (zip.files[name].dir) continue;
					out.set(name, crypto.createHash('sha256').update(await zip.files[name].async('nodebuffer')).digest('hex'));
				}
				return out;
			};
			assert.match(
				fs.readFileSync(path.join(b, 'deck.html'), 'utf8'), /<article id="lat-read"/,
				'the --read run must actually have produced the article, or equality proves nothing',
			);
			const [ea, eb] = [await entries(path.join(a, 'deck.pptx')), await entries(path.join(b, 'deck.pptx'))];
			assert.ok(ea.size > 0, 'the .pptx should hold entries');
			assert.deepEqual([...eb.keys()].sort(), [...ea.keys()].sort(), '--read must not add or drop a .pptx part');
			// `docProps/core.xml` is the one part two SEPARATE RUNS can never match: it stamps
			// `dcterms:created` / `dcterms:modified` with the wall clock. It is compared below with
			// those two blanked rather than skipped, so a flag that DID reach the metadata — a
			// changed title, a changed author — still fails here.
			for (const [name, hash] of ea) {
				if (name === 'docProps/core.xml') continue;
				assert.equal(eb.get(name), hash, `${name} moved under --read; the article reached the rasterizer`);
			}
			const core = async (f) => {
				const zip = await JSZip.loadAsync(fs.readFileSync(f));
				return (await zip.files['docProps/core.xml'].async('string'))
					.replace(/(<dcterms:(?:created|modified)[^>]*>)[^<]*/g, '$1');
			};
			assert.equal(
				await core(path.join(b, 'deck.pptx')), await core(path.join(a, 'deck.pptx')),
				'--read must not change the .pptx metadata either, timestamps aside',
			);
		} finally {
			fs.rmSync(a, { recursive: true, force: true });
			fs.rmSync(b, { recursive: true, force: true });
		}
	});
});
