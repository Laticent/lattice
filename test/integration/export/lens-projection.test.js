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
	// `ask` OVERLAPS `brief` on slide 0 deliberately. With disjoint memberships no kept
	// `brief` slide ever carried an `ask` tag, so the "or on any slide's tag" half of the
	// fifth-channel assertion below certified nothing — disabling `pruneTags` entirely left
	// it green. One shared slide is what makes the tag prune observable from the artifact.
	const MEMBERSHIP = { brief: [0, 2, 5], ask: [0, 3] };

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

	test('a withheld VIEW is not named either — the fifth channel', { timeout: TIMEOUT }, () => {
		// The four channels above carry a withheld SLIDE. The registry carries a withheld
		// VIEW, and it is the channel that stayed open longest: a `--lens brief` export
		// withheld every `ask` slide and then, in the envelope's own front matter, named
		// `ask`, printed its human label ("The ask" — prose an author writes, and it can be
		// "Board only — restructuring"), published its approval digest, and marked on every
		// kept slide whether it was a member. Nothing about that survives the reduction.
		const { dir, deck } = setup();
		const out = path.join(dir, 'brief-only.html');
		assert.equal(run(deck, out, ['--player', '--lens', 'brief']).status, 0);
		const html = fs.readFileSync(out, 'utf8');
		const envelope = Buffer.from(/id="lattice-doc"[^>]*>([A-Za-z0-9+/=\s]+)<\/script>/.exec(html)[1], 'base64').toString('utf8');
		assert.ok(envelope.includes('brief'), 'sanity: the view that WAS exported is still declared');
		assert.ok(!envelope.includes('The ask'), 'the withheld view’s label');
		assert.ok(!/\bask\b/.test(envelope), 'the withheld view’s id, in the registry or on any slide’s tag');
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

	/**
	 * CSS THAT SELECTS A SLIDE BY POSITION — the one mechanism a comparison of renders cannot see,
	 * driven on the real CLI because that is the only place it exists. The kernel half is arithmetic and
	 * unit-tested; what these assert is the part no unit test can reach: that a browser is actually
	 * consulted, that it is consulted only when it can find something, and that it refuses.
	 */
	describe('a rule that counts to a slide', () => {
		/**
		 * The same eight-slide deck, with one author `<style>` on slide 0 — built styled and THEN
		 * approved. Injecting the CSS into a finished deck rewrites a slide body the digest was taken
		 * over, so every view reads as `drifted` and the test certifies the wrong refusal. That trap has
		 * caught this file's fixtures before; the digest has to be computed over the final slides.
		 */
		function deckStyled(css) {
			let slides = Array.from({ length: 8 }, (_, i) =>
				`\n<!-- _class: content -->\n\n${i === 0 ? `<style>\n${css}\n</style>\n\n` : ''}# Slide ${i + 1}\n\n${MEMBERSHIP.brief.includes(i) || MEMBERSHIP.ask.includes(i) ? `Body of slide ${i + 1}.` : WITHHELD}\n`,
			);
			for (const v of VIEWS) {
				const mem = new Set(MEMBERSHIP[v.id]);
				slides = slides.map((sl, i) => applyTag(sl, v.id, mem.has(i), v.base));
			}
			const bare = { lenses: [{ id: 'full', label: 'Full', base: 'all' }, ...VIEWS], default: 'full' };
			const reg = { lenses: bare.lenses.map((l) => (l.id === 'full' ? l : { ...l, approved: approvalHash(slides, bare, l.id) })), default: 'full' };
			return `---\nmarp: true\ntheme: indaco\n${emitRegistry(reg)}\n---\n${slides.join('\n---\n')}`;
		}

		test('refuses when a rule lands on a different slide once the deck is shorter', { timeout: TIMEOUT }, () => {
			// `brief` keeps 0, 2 and 5, so the third slide of the projection is authored slide 5 — not
			// authored slide 2, which is what `:nth-of-type(3)` picked in the deck as written.
			const { dir, deck } = setup();
			fs.writeFileSync(deck, deckStyled('section:nth-of-type(3) p { display: none }'));
			const r = run(deck, path.join(dir, 'out.html'), ['--lens', 'brief']);
			assert.notEqual(r.status, 0, 'a rule that changes which slide it hides must refuse');
			assert.match(r.stderr, /positional-css/);
			// It names the SLIDE and the visible difference, not the rule. The check parses no CSS — that is
			// what makes it immune to nesting, `@scope`, `<link>` and the rest — so it cannot name a selector,
			// and the version that tried reported the renumbered expectation as "the deck you wrote", which
			// was a falsehood. What an author can act on is which slide changed and what changed on it.
			assert.match(r.stderr, /Slide 3 of your deck shows/, 'it names the slide that changed');
			assert.match(r.stderr, /SECRET|Body of slide/, 'and shows what the reader will see instead');
			assert.equal(fs.existsSync(path.join(dir, 'out.html')), false, 'and writes nothing');
			fs.rmSync(dir, { recursive: true, force: true });
		});

		test('and does NOT refuse a rule tied to a class, which travels with its slide', { timeout: TIMEOUT }, () => {
			// The remedy the refusal recommends, asserted rather than asserted-about.
			const { dir, deck } = setup();
			fs.writeFileSync(deck, deckStyled('section.content .quiet { display: none }'));
			const r = run(deck, path.join(dir, 'out.html'), ['--lens', 'brief']);
			assert.equal(r.status, 0, r.stderr);
			assert.ok(fs.existsSync(path.join(dir, 'out.html')));
			fs.rmSync(dir, { recursive: true, force: true });
		});

		test('nor ordinary CSS that counts things INSIDE a slide', { timeout: TIMEOUT }, () => {
			// The scanner this replaced refused all three of these. `* + *` and `li:nth-child(2)` are
			// among the most common rules in any stylesheet, and neither can select a slide by position.
			const { dir, deck } = setup();
			fs.writeFileSync(deck, deckStyled('li:nth-child(2) { color: red }\n* + * { margin-top: 0 }\np:not(:last-child) { margin-bottom: 1rem }'));
			const r = run(deck, path.join(dir, 'out.html'), ['--lens', 'brief']);
			assert.equal(r.status, 0, r.stderr);
			fs.rmSync(dir, { recursive: true, force: true });
		});

		test('`--lens full` skips the check entirely — an identity keeps every slide in place', { timeout: TIMEOUT }, () => {
			// Not a nicety: `full` is the identity this kernel promises is byte-identical to no flag at
			// all, and it was paying for two extra renders that could not disagree about anything.
			const { dir, deck } = setup();
			fs.writeFileSync(deck, deckStyled('section:nth-of-type(3) p { display: none }'));
			const started = Date.now();
			const r = run(deck, path.join(dir, 'out.html'), ['--lens', 'full']);
			assert.equal(r.status, 0, r.stderr);
			assert.ok(Date.now() - started < 60000, 'the identity must not pay for the browser');
			fs.rmSync(dir, { recursive: true, force: true });
		});

		test('a deck with no CSS of its own still ships — the check runs on every reducing projection', { timeout: TIMEOUT }, () => {
			// It is deliberately NOT gated on the deck appearing to carry CSS. That gate was tried and it
			// skipped two of the six known bypasses outright: a `<link rel=stylesheet>` and a `<style>` inside
			// an inlined SVG both put author CSS in the document without leaving a trace in the markdown. So
			// the check pays for two renders on every reducing projection, and this asserts what that costs on
			// a deck with no CSS at all: nothing.
			const { dir, deck } = setup();
			const r = run(deck, path.join(dir, 'out.html'), ['--lens', 'brief']);
			assert.equal(r.status, 0, r.stderr);
			assert.ok(fs.existsSync(path.join(dir, 'out.html')));
			fs.rmSync(dir, { recursive: true, force: true });
		});

		test('and CSS NESTING is caught — the spelling that defeated the design this replaced', { timeout: TIMEOUT }, () => {
			// `section { &:nth-of-type(3) … }` is the rule an author is most likely to actually write, and
			// asking the browser which slides each rule SELECTS walked straight past it: a nested rule hangs
			// off its parent's `cssRules` with no `selectorText` of its own, so the enumeration never saw it.
			// Comparing what a reader SEES cannot be evaded by a spelling, because it reads no spelling.
			const { dir, deck } = setup();
			fs.writeFileSync(deck, deckStyled('section { &:nth-of-type(3) p { display: none } }'));
			const r = run(deck, path.join(dir, 'out.html'), ['--lens', 'brief']);
			assert.notEqual(r.status, 0, 'a nested positional rule must refuse too');
			assert.match(r.stderr, /positional-css/);
			assert.equal(fs.existsSync(path.join(dir, 'out.html')), false, 'and writes nothing');
			fs.rmSync(dir, { recursive: true, force: true });
		});
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
