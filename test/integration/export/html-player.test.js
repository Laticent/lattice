/**
 * Integration: the `--player` self-contained HTML export. Renders a real
 * state-chart deck (dynamic components that draw their SVG in the BROWSER at load)
 * and asserts the shipped `.html` is a portable, offline, secure player:
 *   - dynamic components are BAKED to static SVG (§A2b) — the state-chart edges the
 *     browser drew are captured, not shipped as a dead script that leaves it blank;
 *   - zero `file://` references (fully self-contained / offline);
 *   - exactly ONE executable <script> (the player), under a sha256-pinned CSP;
 *   - the verbatim source rides in the lattice-doc envelope (lossless re-import).
 * Slow tier (spawns Chromium to render + inflate).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

describe('html-player export (--player)', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const DECK = path.join(ROOT, 'examples', 'state-chart.md');
	const TIMEOUT = 120000;

	let html;
	test.before(() => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-player-'));
		const out = path.join(dir, 'deck.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, DECK, out, '--quiet', '--player'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
	}, { timeout: TIMEOUT });

	test('state-chart figures are baked to static SVG (browser-drawn edges captured)', () => {
		const doc = new JSDOM(html).window.document;
		const figs = [...doc.querySelectorAll('.state-chart-figure')];
		assert.ok(figs.length >= 1, 'the deck has state-chart figures');
		const baked = figs.filter((f) => (f.querySelector('svg')?.querySelectorAll('path, line, polygon, rect').length || 0) > 0);
		assert.ok(baked.length >= figs.length - 1, `most state-charts baked (${baked.length}/${figs.length}); a script-stripped player would bake 0`);
	});

	test('the file is fully self-contained — zero file:// references', () => {
		assert.doesNotMatch(html, /file:\/\//, 'no file:// asset survives in the shipped player');
	});

	test('exactly one executable script, under a sha256-pinned CSP', () => {
		const exec = html.match(/<script(?![^>]*type="application\/lattice\+json")[^>]*>/gi) || [];
		assert.equal(exec.length, 1, 'only the single hashed player script executes (dynamic-component scripts stripped)');
		assert.match(html, /<meta http-equiv="Content-Security-Policy"[^>]*script-src 'sha256-/);
		assert.match(html, /default-src 'none'/);
	});

	test('the verbatim source envelope round-trips losslessly', () => {
		const { parseEnvelope } = require(path.join(ROOT, 'lib', 'core', 'lattice-doc.js'));
		const source = fs.readFileSync(DECK, 'utf8');
		assert.equal(parseEnvelope(html).source, source, 'the embedded source is byte-identical to the deck');
	});

	// P6 — used-selector CSS prune. This asserts the REAL end-to-end result: the
	// emulator matched selectors in Chromium, pruned, and its computed-style GATE
	// passed (a gate failure ships the FULL ~452 KB block, so a shrunk block IS the
	// gate's pass certificate — pruned CSS that renders identically).
	test('the inlined lattice CSS is pruned to the used selectors (gate passed)', () => {
		const blocks = [...html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)];
		let css = '';
		for (const b of blocks) {
			if (/lattice-embedded-fonts/.test(b[1])) continue;
			if (b[2].length > css.length) css = b[2];
		}
		const fullMin = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.min.css'), 'utf8');
		assert.ok(css.length > 3000, 'the deck still ships a real stylesheet');
		assert.ok(
			css.length < fullMin.length * 0.7,
			`pruned CSS (${css.length}) is well under the full contract (${fullMin.length}) — prune applied + gate passed`,
		);
		// Essentials survive: the token :root in the pruned block, and the embedded
		// @font-face faces (which live in the un-pruned #lattice-embedded-fonts block).
		assert.match(css, /:root\{/, 'the token :root block survives (all --tokens kept)');
		assert.match(html, /id="lattice-embedded-fonts"[^>]*>[\s\S]*?@font-face/, 'the CSS prune leaves the embedded font faces in place');
		assert.equal((css.match(/\/\*/g) || []).length, 0, 'still comment-free (minify held)');
	});

	// P6 — used-family FONT prune. A non-sketch deck must NOT ship the sketch hand
	// faces (Caveat / Shantell). The state-chart deck uses no sketch finish.
	test('a non-sketch deck drops the unused sketch font faces', () => {
		const fontBlock = (html.match(/id="lattice-embedded-fonts"[^>]*>([\s\S]*?)<\/style>/) || [])[1] || '';
		const faces = (fontBlock.match(/@font-face/g) || []).length;
		assert.ok(faces > 0 && faces < 17, `pruned to the used faces (${faces}/17), sketch pair dropped`);
		assert.doesNotMatch(fontBlock, /font-family:\s*['"]?Caveat/i, 'Caveat (sketch display) is not shipped');
		assert.doesNotMatch(fontBlock, /font-family:\s*['"]?Shantell/i, 'Shantell (sketch body) is not shipped');
	});
});

// The user contract, on the REAL surface: a deck that USES the sketch finish must
// keep its hand fonts. Renders examples/sketch.md and asserts Caveat + Shantell ship.
describe('html-player export — honors sketch fonts', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const DECK = path.join(ROOT, 'examples', 'sketch.md');
	const TIMEOUT = 120000;
	let html;
	test.before(() => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-sketch-'));
		const out = path.join(dir, 'deck.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, DECK, out, '--quiet', '--player'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
	}, { timeout: TIMEOUT });

	test('the sketch hand faces (Caveat + Shantell) are kept', () => {
		const fontBlock = (html.match(/id="lattice-embedded-fonts"[^>]*>([\s\S]*?)<\/style>/) || [])[1] || '';
		assert.match(fontBlock, /font-family:\s*['"]?Caveat/i, 'Caveat (sketch display) IS shipped for a sketch deck');
		assert.match(fontBlock, /font-family:\s*['"]?Shantell/i, 'Shantell (sketch body) IS shipped for a sketch deck');
	});
});

// P3c — Present geometry on the REAL surface. String-presence tests can't catch a
// clipped/off-screen slide (the box-sizing regression + the pre-existing mobile
// horizontal off-screen both hid behind "the CSS shipped"). Drive the actual player
// in Chromium and assert the active present slide sits WITHIN the stage at desktop
// AND mobile widths.
describe('html-player export — Present fits the viewport (P3c)', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const DECK = path.join(ROOT, 'examples', 'html-player.md');
	const TIMEOUT = 120000;
	let file;
	let puppeteer;
	let browser;
	test.before(async () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-geom-'));
		const out = path.join(dir, 'deck.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, DECK, out, '--quiet', '--player'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		file = require('node:url').pathToFileURL(out.replace(/\.pdf$/, '.html')).href;
		puppeteer = require('puppeteer');
		browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
	}, { timeout: TIMEOUT });
	test.after(async () => {
		if (browser) await browser.close();
	});

	async function activeSlideRect(w, h) {
		const page = await browser.newPage();
		await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 800, hasTouch: w < 800 });
		await page.goto(file, { waitUntil: 'networkidle0' });
		await new Promise((r) => setTimeout(r, 400)); // let the fit timeouts settle
		const rect = await page.evaluate(() => {
			const s = document.querySelector('section.lp-active');
			const r = s.getBoundingClientRect();
			return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, iw: window.innerWidth, ih: window.innerHeight };
		});
		await page.close();
		return rect;
	}

	test('the present slide is on-screen horizontally at desktop AND mobile widths', async () => {
		for (const [w, h] of [[1280, 800], [390, 844]]) {
			const r = await activeSlideRect(w, h);
			// A ~1px scale-rounding bleed is fine; a whole slide off-screen (the mobile bug) is not.
			assert.ok(r.left >= -1 && r.right <= r.iw + 1, `[${w}×${h}] slide is within the viewport horizontally (left ${r.left.toFixed(0)}, right ${r.right.toFixed(0)} of ${r.iw})`);
			assert.ok(r.top >= 47, `[${w}×${h}] slide sits below the 48px bar (top ${r.top.toFixed(0)})`);
		}
	}, { timeout: TIMEOUT });
});

// P3d — speaker notes: default-in, with a --strip-notes privacy export that must
// scrub the note text from EVERY baked copy (the DOM aside AND the envelope source).
// The grep test is the whole point: a stripped file that leaks note text is a bug.
describe('html-player export — speaker notes + --strip-notes (P3d)', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const { parseEnvelope } = require(path.join(ROOT, 'lib', 'core', 'lattice-doc.js'));
	const TIMEOUT = 120000;
	const NOTE_A = 'Pause here and make firm eye contact.';
	const NOTE_B = 'Land the Q3 revenue figure before moving on.';
	const DECK = ['---', 'theme: indaco', '---', '', '# One', '', `<!-- ${NOTE_A} -->`, '', 'Body A.', '', '---', '', '# Two', '', `<!-- ${NOTE_B} -->`, '', 'Body B.', ''].join('\n');

	function renderPlayer(strip) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-notes-'));
		const deck = path.join(dir, 'deck.md');
		fs.writeFileSync(deck, DECK);
		const out = path.join(dir, 'deck.pdf');
		const args = [EMULATOR, deck, out, '--quiet', '--player'];
		if (strip) args.push('--strip-notes');
		const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		return fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
	}

	test('by DEFAULT the notes ride: aside in the DOM + text in the envelope source', { timeout: TIMEOUT }, () => {
		const html = renderPlayer(false);
		assert.match(html, /<aside class="lattice-notes"[^>]*>[^<]*Pause here/, 'the note aside is baked in');
		assert.equal(parseEnvelope(html).source.includes(NOTE_A), true, 'the note rides in the envelope source');
	});

	test('--strip-notes scrubs the note text from EVERY baked copy (the privacy grep)', { timeout: TIMEOUT }, () => {
		const html = renderPlayer(true);
		// The note text must appear NOWHERE in the shipped bytes — not the DOM, not the
		// base64 envelope (decode it), not anywhere.
		for (const note of [NOTE_A, NOTE_B]) {
			assert.equal(html.includes(note), false, `stripped player must not contain the note text: "${note}"`);
		}
		assert.doesNotMatch(html, /<aside class="lattice-notes"/, 'no note aside survives the strip');
		const src = parseEnvelope(html).source;
		assert.equal(src.includes(NOTE_A) || src.includes(NOTE_B), false, 'the envelope source is scrubbed of notes');
		// But the strip is surgical: the deck body + structure survive (still re-imports).
		assert.match(src, /# One/, 'the deck body is intact — a stripped file still re-imports (without notes)');
	});

	test('--strip-notes scrubs a note that itself contains a blank line (no shatter-leak)', { timeout: TIMEOUT }, () => {
		// Regression: a SINGLE note comment with an internal blank line must not survive
		// (the joined-then-split note-body recovery used to shatter and miss it).
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-blank-'));
		const deck = path.join(dir, 'd.md');
		fs.writeFileSync(deck, ['# S', '', '<!-- First line.', '', 'Second line. LEAKMARK -->', '', 'Body.'].join('\n'));
		const out = path.join(dir, 'd.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', '--player', '--strip-notes'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
		assert.equal(html.includes('LEAKMARK'), false, 'the blank-line note is gone from the DOM/bytes');
		assert.equal(parseEnvelope(html).source.includes('LEAKMARK'), false, 'and from the decoded envelope source');
	});

	test('--strip-notes scrubs a MULTI-LINE note in a CRLF (Windows) deck (no newline-mismatch leak)', { timeout: TIMEOUT }, () => {
		// The checker's blocker: a CRLF source + a multi-line note leaked because the
		// strip set was \n-normalized. Author the deck with real \r\n endings.
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-crlf-'));
		const deck = path.join(dir, 'd.md');
		fs.writeFileSync(deck, ['# S', '', '<!-- Pause here.', 'Then CRLFLEAK ask the room. -->', '', 'Body.'].join('\r\n'));
		const out = path.join(dir, 'd.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, deck, out, '--quiet', '--player', '--strip-notes'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
		assert.equal(html.includes('CRLFLEAK'), false, 'CRLF multi-line note gone from the bytes');
		assert.equal(parseEnvelope(html).source.includes('CRLFLEAK'), false, 'and from the decoded envelope source');
	});
});
