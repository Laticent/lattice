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
