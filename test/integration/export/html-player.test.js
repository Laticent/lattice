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
			// The dual-mode block is NOT the deck stylesheet and can be larger than it (it
			// repeats the token body once per scheme scope). Selecting the deck CSS by size
			// alone silently picked it up instead, and this assertion then measured the wrong
			// block. Both non-deck blocks are excluded by id.
			if (/lattice-dual-mode/.test(b[1])) continue;
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

// Mermaid reaches the shipped file as a SELF-STYLED svg with native <text> labels.
// The player sanitizes its slide DOM, and that sanitizer bars the two things a Mermaid
// svg leans on: the `<style>` mermaid injects into it, and `<foreignObject>` — which is
// where EVERY node/edge/cluster label lives. Unbaked, the diagram shipped as shapes and
// arrows with no words at all, on every deck, on both export hosts. So the assertion
// that matters is not "an svg is present" but "the label TEXT is present, and no
// foreignObject is left for the sanitizer to take."
describe('html-player export — Mermaid labels survive the sanitizer', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const DECK = path.join(ROOT, 'examples', 'mermaid-diagram-surface.md');
	const TIMEOUT = 180000;
	let doc;
	test.before(() => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-mermaid-player-'));
		const out = path.join(dir, 'deck.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, DECK, out, '--quiet', '--player'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		doc = new JSDOM(fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8')).window.document;
	}, { timeout: TIMEOUT });

	test('every diagram label is native SVG text, not a stripped foreignObject', () => {
		const svgs = [...doc.querySelectorAll('.mermaid-svg svg, .mermaid svg')];
		assert.ok(svgs.length >= 1, 'the deck ships rendered diagram SVGs');
		for (const svg of svgs) {
			assert.equal(svg.querySelectorAll('foreignObject').length, 0, 'no foreignObject survives into the player');
			assert.ok(svg.querySelectorAll('text').length > 0, 'the diagram carries <text> labels');
		}
		// The deck's own words, not just "some text node exists".
		const text = svgs.map((s) => s.textContent.replace(/\s+/g, ' ')).join(' ');
		assert.match(text, /Read the deck/, 'a node label from the deck source is readable in the shipped svg');
		assert.match(text, /Resolve the band/);
	});

	test('the diagram is self-styled — it does not depend on the <style> the sanitizer removes', () => {
		const svg = doc.querySelector('.mermaid-svg svg, .mermaid svg');
		assert.equal(svg.querySelectorAll('style').length, 0, "mermaid's own <style> does not survive (it never could)");
		const painted = [...svg.querySelectorAll('path, rect, polygon')].filter((el) => /(?:^|;)\s*(?:fill|stroke):/.test(el.getAttribute('style') || ''));
		assert.ok(painted.length > 0, 'paint is inlined on the shapes, so losing the <style> costs nothing');
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
			// The active slide's FRAME wrapper is what present toggles visible (the section
			// inside keeps its own JS-driven transform:scale) — see player-core.mjs .lp-frame.
			const s = document.querySelector('.lp-frame.lp-active section[data-lattice-slide]');
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

// #1577 — a deck's OWN canvas survives the export, ON EVERY PR.
//
// The player hardcoded 1280×720, so any deck declaring a non-default `size:` exported laid out
// for its real canvas and then crushed into an HD box: ~3× oversized, unreadable. It survived
// from the player's first release across ~80 committed decks because it was INVISIBLE — the
// same run's PDF was correct, so nothing and nobody looked at the webpage.
//
// This cell exists because the fix's own real-surface proof lives in `tools/verify-player-input.mjs`,
// which is on-demand and gates nothing. A change whose entire lesson is "the defect survived
// because nothing automatically looked" must not leave its proof somewhere nothing automatically
// runs. The block above already spawns the real CLI and drives Chromium on every PR — it just
// did it against a DEFAULT-size deck, the one deck in the space that could never catch this.
//
// Mutation-checked: deleting `width: slideW, height: slideH` from the CLI host passes the entire
// unit suite AND the rest of this file. This is the cell that fails.
describe('html-player export — a declared `size:` reaches the player (#1577)', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	// A portrait deck: small, committed, and a canvas that differs from HD on BOTH axes.
	const DECK = path.join(ROOT, 'examples', 'social-portrait.md');
	const TIMEOUT = 120000;
	let html;
	test.before(() => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-canvas-'));
		const out = path.join(dir, 'deck.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, DECK, out, '--quiet', '--player'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
	}, { timeout: TIMEOUT });

	test('the exported player sizes its slides to the DECK canvas, not to 1280×720', () => {
		// social-portrait.md declares `size: portrait` → 1080×1350.
		assert.match(html, /section\[data-lattice-slide\]\{width:1080px!important;height:1350px!important/, 'the present rule carries the deck canvas');
		assert.match(html, /slideW:1080,slideH:1350/, 'and so does the fit math the script runs');
		// The HD literal must not survive anywhere that sizes a slide. Scoped to the sizing
		// shape on purpose: `720px` legitimately appears elsewhere (the caption band's measure).
		assert.doesNotMatch(html, /width:1280px!important/, 'no HD canvas rule survives for a portrait deck');
		assert.doesNotMatch(html, /slideW:1280/, 'no HD divisor survives either');
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

	test('--strip-notes scrubs a MULTI-LINE note in a CRLF (Windows) deck, end to end', { timeout: TIMEOUT }, () => {
		// A CRLF source + a multi-line note leaked because the strip set was \n-normalized.
		// Author the deck with real \r\n endings.
		//
		// WHAT THIS TEST NOW PROVES, AND WHAT IT NO LONGER DOES. The CLI normalizes at its file
		// read, so the CRLF authored here never reaches `stripNotesFromSource` — this asserts the
		// BOUNDARY holds end to end, which is worth keeping, but it can no longer catch a
		// regression in the kernel's own `\r` handling. That discriminating assertion lives in
		// `test/unit/authoring/notes-core.test.js`, which hands the kernel raw CRLF directly —
		// the path `share-export.ts` still takes on byte-faithful Studio source.
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

// The caption channel strips SEPARATELY from notes (`--strip-captions`), and the two flags
// are orthogonal. This pins the HARD RULE #23 "verified on the real .vtt" claim with a
// committed artifact: caption text gone from the .vtt AND the envelope source, notes retained
// (the fallback), and both flags together → a silent track.
describe('html-player export — captions + --strip-captions (orthogonal to --strip-notes)', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const { parseEnvelope } = require(path.join(ROOT, 'lib', 'core', 'lattice-doc.js'));
	const TIMEOUT = 120000;
	// Single distinctive tokens survive the .vtt's word-by-word cue split.
	const DECK = [
		'---', 'theme: indaco', 'captions:', '  1: FRONTCAP the front-matter caption', '---', '',
		'# One', '', '<!-- NOTEONE the first note -->', '', 'Body A.', '',
		'---', '', '# Two', '', '<!-- caption: INLINECAP the inline caption -->', '<!-- NOTETWO the second note -->', '', 'Body B.', '',
	].join('\n');

	function render(flags) {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-caps-'));
		const out = path.join(dir, 'deck.pdf');
		fs.writeFileSync(path.join(dir, 'deck.md'), DECK);
		const r = spawnSync(process.execPath, [EMULATOR, path.join(dir, 'deck.md'), out, '--quiet', '--player', '--captions', ...flags], { cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT });
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		const vttPath = out.replace(/\.pdf$/, '.vtt');
		return {
			vtt: fs.existsSync(vttPath) ? fs.readFileSync(vttPath, 'utf8') : '',
			source: parseEnvelope(fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8')).source,
		};
	}

	test('by DEFAULT (--captions) the caption text narrates and rides in the source', { timeout: TIMEOUT }, () => {
		const { vtt, source } = render([]);
		assert.ok(vtt.includes('FRONTCAP'), 'the front-matter caption narrates into the .vtt');
		assert.ok(vtt.includes('INLINECAP'), 'the inline caption narrates into the .vtt');
		assert.ok(source.includes('FRONTCAP') && source.includes('INLINECAP'), 'both captions ride in the envelope source');
	});

	test('--strip-captions scrubs caption text from the .vtt AND the source, but KEEPS the notes (the fallback)', { timeout: TIMEOUT }, () => {
		const { vtt, source } = render(['--strip-captions']);
		// caption text gone from both surfaces
		assert.equal(vtt.includes('FRONTCAP'), false, 'front-matter caption gone from the .vtt');
		assert.equal(vtt.includes('INLINECAP'), false, 'inline caption gone from the .vtt');
		assert.equal(source.includes('FRONTCAP'), false, 'front-matter caption gone from the source');
		assert.equal(source.includes('INLINECAP'), false, 'inline caption gone from the source');
		// the slides fall back to their notes — which are NOT stripped (orthogonality)
		assert.ok(vtt.includes('NOTEONE'), 'slide 1 falls back to its note in the .vtt');
		assert.ok(vtt.includes('NOTETWO'), 'slide 2 falls back to its note in the .vtt');
		assert.ok(source.includes('NOTEONE') && source.includes('NOTETWO'), 'the notes still ride in the source (only captions were stripped)');
	});

	test('--strip-captions --strip-notes → a fully silent track (no caption or note narration)', { timeout: TIMEOUT }, () => {
		const { vtt, source } = render(['--strip-captions', '--strip-notes']);
		for (const tok of ['FRONTCAP', 'INLINECAP', 'NOTEONE', 'NOTETWO']) {
			assert.equal(vtt.includes(tok), false, `no ${tok} in the fully-stripped .vtt`);
			assert.equal(source.includes(tok), false, `no ${tok} in the fully-stripped source`);
		}
	});
});

// The baked diagram must FOLLOW the player's light/dark toggle rather than freeze at its
// export scheme. This is the only gate on `flattenSvgStyles`'s scheme handling: the function
// is browser-only, so a unit test cannot reach it, and reverting the whole feature previously
// left all 5995 unit tests green. It renders the real deck through the real emulator and
// inspects the shipped bytes.
describe('html-player export — a baked diagram follows the toggle', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const DECK = path.join(ROOT, 'examples', 'mermaid-diagram-surface.md');
	const TIMEOUT = 180000;
	let html;
	test.before(() => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-diagram-follow-'));
		const out = path.join(dir, 'deck.pdf');
		const r = spawnSync(process.execPath, [EMULATOR, DECK, out, '--quiet', '--player'], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		html = fs.readFileSync(out.replace(/\.pdf$/, '.html'), 'utf8');
	}, { timeout: TIMEOUT });

	test('the diagram is baked at all — labels as native text, no foreignObject', () => {
		// The guard for everything below: if the bake silently fell back, the assertions about
		// token emission would pass vacuously on markup that has no labels in it.
		assert.ok((html.match(/<text/g) || []).length > 20, 'the diagram ships its labels as SVG text');
		assert.equal((html.match(/<foreignObject/g) || []).length, 0, 'and no foreignObject survives the sanitizer');
	});

	test('scheme-varying paint rides as a TOKEN, so it re-themes with the viewer', () => {
		// Frozen literals here are what produced connector strokes at 1.09:1 on a dark canvas
		// (arrowheads re-themed through an !important rule, the lines did not) and container
		// labels at 1.34:1 (ink followed, the slab under it did not).
		assert.ok(html.includes('stroke:var(--diagram-line)'), 'connector strokes follow the scheme');
		assert.ok(html.includes('fill:var(--c-container)'), 'container surfaces follow the scheme');
		assert.ok(html.includes('fill:var(--c-on-container)'), 'and so does the ink sitting on them');
	});

	test('a label the author did NOT color is not marked as author-owned', () => {
		// This deck contains no `classDef … color:` anywhere, so every `lp-own-ink` marker on it
		// is a false positive — and a marked span opts out of re-theming permanently.
		assert.equal(fs.readFileSync(DECK, 'utf8').includes('classDef'), false, 'guard: the deck really does set no author color');
		const marked = (html.match(/<tspan[^>]*lp-own-ink/g) || []).length;
		assert.equal(marked, 0, 'no label is frozen out of the theme on a deck that chose no colors');
	});
});

// The label HALO — the rect `foreignObjectToText` writes under the words — is the one paint
// that used to leave the bake as a raw literal, and it is the one directly beneath the ink.
// Mermaid paints an edge label's halo from the slide canvas, so an exported player froze it
// at the export scheme while the ink above kept following the theme rule: 1.09:1 measured on
// `seven-steps-problem-to-code` and 1.06:1 on `deck-class-register` after a toggle (#1635).
//
// Driven as a SYNTHETIC page rather than a deck render: both branches have to be pinned —
// including the author-background one, which no deck this repo ships produces — and the pair
// is the whole contract (ink and surface move together, or neither does). `flattenSvgStyles`
// is browser-only, so this injects it exactly as the CLI does, via `toString()`.
describe('html-player export — a baked label halo follows, or its ink freezes with it', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const TIMEOUT = 120000;
	let out;
	test.before(async () => {
		const { flattenSvgStyles } = require(path.join(ROOT, 'lib/components/chart/_chart-family/standalone-svg.js'));
		const puppeteer = require('puppeteer');
		const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
		try {
			const page = await browser.newPage();
			// `--bg` and `--text-heading` VARY by scheme, so they enter the derived follow-set;
			// `--frozen-brand` does not, so a paint equal to it must ship as a literal.
			await page.setContent(`<!doctype html><html><head><style>
				:root { color-scheme: light dark;
					--bg: light-dark(#FFFFFF, #101014);
					--text-heading: light-dark(#101014, #FFFFFF);
					--frozen-brand: #123456; }
				body { margin: 0; background: var(--bg); color: var(--text-heading); }
				.lbl { font: 14px/1.2 sans-serif; color: var(--text-heading); }
			</style></head><body>
			<svg id="s" width="400" height="200" viewBox="0 0 400 200">
				<g class="label"><foreignObject x="0" y="0" width="200" height="40">
					<div class="lbl" style="background:var(--bg)">themed halo</div>
				</foreignObject></g>
				<g class="label"><foreignObject x="0" y="60" width="200" height="40">
					<div class="lbl" style="background:var(--frozen-brand)">author halo</div>
				</foreignObject></g>
			</svg></body></html>`);
			await page.evaluate(`window.__flatten = ${flattenSvgStyles.toString()};`);
			out = await page.evaluate(() => {
				const svg = document.getElementById('s');
				const baked = window.__flatten(svg, window, { foreignObjectLabels: 'text' });
				return [...baked.querySelectorAll('g.label')].map((g) => ({
					rect: g.querySelector('rect')?.getAttribute('style') || '',
					span: g.querySelector('tspan')?.getAttribute('style') || '',
					marked: !!g.querySelector('tspan.lp-own-ink'),
					text: g.textContent.trim(),
				}));
			});
		} finally {
			await browser.close();
		}
	}, { timeout: TIMEOUT });

	test('a halo painted from a scheme token rides as that token, and its ink keeps following', () => {
		const themed = out.find((l) => l.text === 'themed halo');
		assert.ok(themed, 'guard: the themed label was baked at all');
		assert.match(themed.rect, /fill:var\(--bg\)/, 'the halo follows the toggle');
		assert.match(themed.span, /fill:var\(--text-heading\)/, 'and so does the ink on it');
		assert.equal(themed.marked, false, 'nothing is opted out of the theme');
	});

	test("a halo the author painted freezes — and takes its ink with it", () => {
		// The failure mode this pairing exists to prevent: a frozen surface under an ink that
		// still follows `.label tspan{fill:var(--text-heading)!important}` GUARANTEES divergence
		// on the toggle. Freezing the surface alone was measured as strictly worse than the bug.
		const own = out.find((l) => l.text === 'author halo');
		assert.ok(own, 'guard: the author-halo label was baked at all');
		assert.match(own.rect, /fill:rgb\(18, ?52, ?86\)/, 'the halo keeps the color the author chose');
		assert.doesNotMatch(own.span, /var\(/, 'so the ink is frozen to its bake-time literal');
		assert.equal(own.marked, true, 'and marked lp-own-ink, which takes the theme rule off it');
	});
});
