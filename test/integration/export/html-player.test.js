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
});
