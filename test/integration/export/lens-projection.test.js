/**
 * Integration: `--lens` projects the REAL artifact, and refuses rather than
 * falling back. #1853.
 *
 * This is the real-surface half (HARD RULE #23). `test/unit/core/lens-export.test.js`
 * pins the kernel — it can show that the projected SOURCE renders the right number of
 * `<section>` elements. It cannot show what the recipient actually receives, and the
 * whole value of the feature is in the received file: the page count of a PDF someone
 * emails, and the absence of a withheld slide from every channel of a shared `.html`.
 * So these drive the real CLI and read the real artifacts with `pdfinfo`.
 *
 * THE ORACLE IS LENTE, NOT A LITERAL. The expected page count is `lensSlides(...).length`
 * computed here from the library, so the assertion says "the artifact has exactly the pages
 * the reader path says this view projects" rather than "the artifact has 4 pages". A
 * hard-coded 4 would pass just as well if the projection silently kept the wrong three
 * slides and split one.
 *
 * THE FIXTURE IS GENERATED, NOT COMMITTED, and that is deliberate. A view's `approved:`
 * hash covers its resolved membership AND its member slide bodies, so a committed fixture
 * de-approves itself the moment anyone touches a word of it — the suite would then fail
 * with `drifted` on an unrelated edit, which is a false alarm dressed as a real one.
 * Building the deck through `applyTag` + `approvalHash` also means the fixture is
 * approved the way the Studio approves one, rather than by a hash pasted into a file.
 */

const test = require('node:test');
const { describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const { pageCount } = require('../../helpers/pdf');
const { applyTag, approvalHash, emitRegistry, lensSlides, parseLensRegistry } = require('@workwel/lente');
const { frontMatterBlockOf, splitSlideChunks } = require('../../../lib/core/slide-boundaries.mjs');

describe('--lens: the projected export', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const TIMEOUT = 240000;

	// The text of a slide that is in NO view but `full` — absence of THIS from a projected
	// artifact is the claim the whole feature rests on.
	const WITHHELD = 'WITHHELDSLIDETOKEN';
	const VIEWS = [
		{ id: 'brief', label: 'Brief', base: 'none', kind: 'rung' },
		{ id: 'ask', label: 'The ask', base: 'none' },
	];
	const MEMBERSHIP = { brief: [0, 2, 5], ask: [3] };

	/** An eight-slide deck, tagged and genuinely approved. Slides 1, 4, 6 and 7 are withheld. */
	function buildDeck() {
		let slides = Array.from({ length: 8 }, (_, i) =>
			`\n<!-- _class: content -->\n\n# Slide ${i + 1}\n\n${MEMBERSHIP.brief.includes(i) || MEMBERSHIP.ask.includes(i) ? `Body of slide ${i + 1}.` : WITHHELD}\n`,
		);
		for (const v of VIEWS) {
			const mem = new Set(MEMBERSHIP[v.id]);
			slides = slides.map((s, i) => applyTag(s, v.id, mem.has(i), v.base));
		}
		const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
		const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(slides, bare, l.id) })), default: 'full' };
		return `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${slides.join('\n---\n')}`;
	}

	function setup() {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-lens-'));
		const deck = path.join(dir, 'deck.md');
		fs.writeFileSync(deck, buildDeck());
		return { dir, deck };
	}

	function run(deck, out, args) {
		return spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', ...args], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
	}

	test('a PDF has exactly the pages the view projects', { timeout: TIMEOUT }, () => {
		const { dir, deck } = setup();
		const src = fs.readFileSync(deck, 'utf8');
		// The oracle: what the READER PATH says this view shows, from the library itself,
		// over the ENGINE's own slide split. Both halves have to be borrowed rather than
		// re-derived — a hand-rolled `/^---$/m` here counted the front matter's own fences
		// as slides and made this assertion off by one.
		const chunks = splitSlideChunks(src.slice(frontMatterBlockOf(src).length)).chunks;
		const expected = lensSlides(chunks, parseLensRegistry(src), 'brief').length;

		const out = path.join(dir, 'brief.pdf');
		const r = run(deck, out, ['--lens', 'brief']);
		assert.equal(r.status, 0, r.stderr);
		assert.equal(pageCount(out), MEMBERSHIP.brief.length);
		assert.equal(pageCount(out), expected, 'the artifact carries exactly `lensSlides(...).length` pages');
	});

	test('`--lens full` renders the same page count as no flag at all', { timeout: TIMEOUT }, () => {
		const { dir, deck } = setup();
		const plain = path.join(dir, 'plain.pdf');
		const full = path.join(dir, 'full.pdf');
		assert.equal(run(deck, plain, []).status, 0);
		assert.equal(run(deck, full, ['--lens', 'full']).status, 0);
		assert.equal(pageCount(plain), 8);
		assert.equal(pageCount(full), pageCount(plain));
	});

	test('a withheld slide reaches the recipient through NO channel of a projected player', { timeout: TIMEOUT }, () => {
		const { dir, deck } = setup();
		const out = path.join(dir, 'brief.html');
		assert.equal(run(deck, out, ['--player', '--lens', 'brief']).status, 0);
		const html = fs.readFileSync(out, 'utf8');
		// Four channels carry a slide out of a player: the <section> DOM, the article
		// outline, the article body, and the base64 `application/lattice+json` envelope.
		// Scanning the RAW file covers the first three; the envelope is decoded because
		// base64 hides the token from a plain substring scan — which is exactly why it was
		// the channel a DOM-only reading of "the recipient can read the source" missed.
		assert.ok(!html.includes(WITHHELD), 'withheld text in the markup channels');
		const b64 = /id="lattice-doc"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/.exec(html);
		assert.ok(b64, 'the player envelope is present');
		const envelope = Buffer.from(b64[1], 'base64').toString('utf8');
		assert.ok(!envelope.includes(WITHHELD), 'withheld text in the re-importable envelope');
	});

	test('`--lens-source full` re-admits the whole deck to the envelope, by explicit request', { timeout: TIMEOUT }, () => {
		const { dir, deck } = setup();
		const out = path.join(dir, 'brief-full.html');
		assert.equal(run(deck, out, ['--player', '--lens', 'brief', '--lens-source', 'full']).status, 0);
		const html = fs.readFileSync(out, 'utf8');
		const envelope = Buffer.from(/id="lattice-doc"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/.exec(html)[1], 'base64').toString('utf8');
		assert.ok(envelope.includes(WITHHELD), 'the author asked for a lossless round trip and got one');
		assert.ok(!html.replace(envelope, '').includes(WITHHELD), 'the DOM is still projected — only the envelope is full');
	});

	describe('fails closed', () => {
		test('an unavailable view exits non-zero, names the reason, and writes nothing', { timeout: TIMEOUT }, () => {
			const { dir, deck } = setup();
			const out = path.join(dir, 'nope.pdf');
			const r = run(deck, out, ['--lens', 'no-such-view']);
			assert.equal(r.status, 1);
			assert.match(r.stderr, /unavailable \(unknown\)/);
			assert.ok(!fs.existsSync(out), 'no PDF');
			assert.ok(!fs.existsSync(out.replace(/\.pdf$/, '.html')), 'and no HTML sidecar either');
		});

		test('a drifted view refuses rather than shipping a stale projection', { timeout: TIMEOUT }, () => {
			const { dir, deck } = setup();
			// Edit a MEMBER slide after approval. The digest covers member bodies, so the view
			// de-approves itself — the artifact must not be built from a membership no human
			// has looked at since it changed.
			fs.writeFileSync(deck, fs.readFileSync(deck, 'utf8').replace('Body of slide 1.', 'Body of slide 1, revised.'));
			const r = run(deck, path.join(dir, 'drift.pdf'), ['--lens', 'brief']);
			assert.equal(r.status, 1);
			assert.match(r.stderr, /unavailable \(drifted\)/);
		});

		test('several views need a carrier — a PDF refuses instead of shipping the union', { timeout: TIMEOUT }, () => {
			const { dir, deck } = setup();
			const r = run(deck, path.join(dir, 'two.pdf'), ['--lens', 'brief,ask']);
			assert.equal(r.status, 1);
			assert.match(r.stderr, /one linear sequence/);
		});
	});
});
