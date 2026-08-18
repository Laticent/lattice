/**
 * Integration: HARD RULE #22, stylesheet channel, on the CLI EXPORT path.
 *
 * A `<style>` element's content is HTML RAWTEXT — it ends at the first `</style`, from
 * inside a well-formed CSS comment or string just the same, and everything after it is
 * parsed as MARKUP. The emulator's page scaffold embeds two caller-supplied stylesheets
 * in one `<style>`: the `--css` layout sheet and the deck's own front-matter `style:`
 * block. Before the guard, a `</style>` in either one truncated the element in the
 * EMITTED `.html` — dropping the rest of the engine's layout rules — and turned the
 * remainder into live markup, so a `<link rel=stylesheet href=…>` fired a cross-origin
 * request the moment a recipient opened the file, and was baked into every copy of a
 * `--player` export.
 *
 * These render the REAL CLI (HARD RULE #23: the surface, not a stand-in) and assert on
 * the shipped bytes. The front-matter form is the reachable one — it needs nothing but a
 * shared markdown deck. Slow tier (spawns Chromium).
 *
 * engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md §8.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

describe('a `</style>` in caller CSS cannot break out of the exported document', () => {
	const ROOT = path.join(__dirname, '..', '..', '..');
	const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
	const TIMEOUT = 180000;

	// The payload closes the element and then asks for a cross-origin stylesheet — the
	// shape #1718's red team drove to a real fetch. It sits inside a WELL-FORMED CSS
	// comment on purpose: the comment is precisely what does not matter.
	const PAYLOAD =
		'</style><link rel="stylesheet" href="https://evil.example/beacon.css"><span id="lat-sink-sentinel">X</span>';
	// A SECOND payload, in a `content:` STRING rather than a comment — and the distinction is
	// load-bearing, not thoroughness. The `--player` path runs the CSS through css-tree
	// (prunePlayerCss) and puts it back in a fresh `<style>`, and css-tree DELETES comments
	// while NORMALIZING `<\/style` in a string straight back to `</style`:
	//     IN  section::after{content:"<\/style>"}   OUT  section::after{content:"</style>"}
	// So a comment-only fixture can never reach the prune re-wrap, and the guards there look
	// deletable-with-everything-green. This one reaches it. Found by the inversion pass.
	const STRING_PAYLOAD = '</style><link rel=\'stylesheet\' href=\'https://evil.example/beacon2.css\'>';
	const DECK = `---\nmarp: true\ntheme: indaco\nstyle: |\n  /* deck note ${PAYLOAD} */\n  section { --sink-probe: 1; }\n  section::before { content: "${STRING_PAYLOAD}"; }\n---\n\n# Style sink probe\n\nThe deck's own \`style:\` block rides in the page's \`<style>\` element.\n`;
	const HOSTILE_CSS = `@import 'lattice';\n\n/* theme note ${PAYLOAD} */\n\nsection { --sink-probe: 1; }\nsection::before { content: "${STRING_PAYLOAD}"; }\n`;

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-sink-'));
	const deckFile = path.join(dir, 'deck.md');
	const cssFile = path.join(dir, 'hostile.css');
	fs.writeFileSync(deckFile, DECK);
	fs.writeFileSync(cssFile, HOSTILE_CSS);
	// Each render leaves a ~1 MB `.html` behind; without this the suite grows os.tmpdir()
	// by several MB per run and never gives it back.
	after(() => fs.rmSync(dir, { recursive: true, force: true }));

	/**
	 * Render to `.html` (a real browser render; only the PDF encode is skipped).
	 *
	 * `quiet` is a parameter rather than always-on because the `--player` arm needs the
	 * emulator's own progress line as EVIDENCE THAT THE PRUNE RAN — see that arm.
	 */
	const render = (name, extra = [], { quiet = true } = {}) => {
		const out = path.join(dir, name);
		const r = spawnSync(process.execPath, [EMULATOR, deckFile, out, ...(quiet ? ['--quiet'] : []), ...extra], {
			cwd: ROOT, encoding: 'utf8', env: { ...process.env }, timeout: TIMEOUT,
		});
		assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
		return { html: fs.readFileSync(out, 'utf8'), stdout: `${r.stdout}${r.stderr}` };
	};

	/**
	 * The invariant, asserted on the PARSED document rather than on the source text: a
	 * text-only check ("no `</style` outside a closer") is satisfiable by a build that
	 * mangles the CSS, and the parse is what the breakout is about anyway.
	 */
	function assertNoBreakout(html, label) {
		const doc = new JSDOM(html).window.document;
		assert.equal(
			doc.querySelectorAll('link[href*="evil.example"]').length, 0,
			`${label}: the payload's <link> became a real element — the <style> was terminated`,
		);
		assert.equal(
			doc.querySelectorAll('#lat-sink-sentinel').length, 0,
			`${label}: the payload's <span> became a real element`,
		);
		// The TRUNCATION detector, and the sharper of the two: the caller's own declaration
		// sits immediately AFTER the payload in the sheet, so if the element ended early it
		// is no longer inside any <style> — it is markup. This same arm fails if the fix is
		// ever "strip the CSS" rather than "escape the terminator", so it pins both
		// directions at once.
		const styles = [...doc.querySelectorAll('style')].map((s) => s.textContent).join('\n');
		assert.match(styles, /--sink-probe:\s*1/, `${label}: the caller's own rule after the payload is not inside a <style> — the element was terminated (or the CSS was censored)`);
	}

	test('the deck\'s front-matter `style:` block', { timeout: TIMEOUT }, () => {
		const { html } = render('fm.html');
		assertNoBreakout(html, 'front-matter style:');
		// The guard NEUTRALIZES rather than censors: the payload's text is still there,
		// readable, with a backslash between the two characters the tokenizer pairs.
		assert.match(html, /<\\\/style><link rel="stylesheet" href="https:\/\/evil\.example/,
			'the terminator must be escaped in place, with the author\'s text otherwise intact');
	});

	test('the `--css` layout sheet', { timeout: TIMEOUT }, () => {
		const { html } = render('css.html', ['--css', cssFile]);
		assertNoBreakout(html, '--css sheet');
		assert.match(html, /<\\\/style>/, 'the terminator must be escaped in the layout sheet too');
	});

	test('the `--player` self-contained export carries no beacon', { timeout: TIMEOUT }, () => {
		// The player is the artifact with a real author→recipient split: pre-guard the
		// assembler HARVESTED the injected <link> out of the parsed document and shipped it
		// in every copy, while the deck's own CSS after the payload was silently dropped.
		// DELIBERATELY no `--css`: the player's CSS prune only engages when the target block
		// is >= 50 KB (lattice-emulator.js, `bases = target.css.length >= 50000 ? … : []`), so
		// the tiny hostile sheet skips it entirely and the prune re-wrap is never reached.
		// With the real `dist/lattice.css` the prune runs (~41/3216 rules kept), the CSS makes
		// the css-tree round trip that normalizes `<\/style` back to `</style`, and the re-wrap
		// guard is the only thing that re-escapes it. Rendering this arm with `--css` is how a
		// first cut left both prune guards deletable with everything green.
		const { html, stdout } = render('player.html', ['--player'], { quiet: false });
		// PROVE THE PRUNE RAN. Without this the arm is silently vacuous the moment the prune
		// bails: every assertion below is also satisfied by the UPSTREAM guard alone, because
		// `minifyCss` drops the comment payload whether or not css-tree runs. The prune has two
		// bail-outs — a target under 50 KB (why this arm renders without `--css`) and a failed
		// computed-style gate, which any future CSS change could trip. Measured: with the guard
		// deleted AND the prune forced to bail, all three arms passed green.
		assert.match(stdout, /pruned unused CSS:\s*\d+\/\d+ rules kept/,
			`the CSS prune did not run, so this arm tested nothing about the re-wrap. stdout:\n${stdout}`);
		assertNoBreakout(html, '--player export');
		// The comment-borne payload is gone entirely — css-tree and minifyCss both drop
		// comments — so `evil.example` may survive ONLY as the string-borne one, escaped.
		const beacons = html.match(/evil\.example\/beacon(2?)\.css/g) || [];
		assert.deepEqual([...new Set(beacons)], ['evil.example/beacon2.css'],
			`the comment payload must be dropped and only the string one survive; got ${beacons.join(', ')}`);
		assert.match(html, /<\\\/style><link rel='stylesheet' href='https:\/\/evil\.example\/beacon2\.css'>/,
			'the string-borne terminator must still be escaped AFTER the prune — css-tree normalizes `<\\/style` back to `</style`, so the re-wrap owns this');
	});
});
