/**
 * THE GUARD CENSUS — HARD RULE #22, stylesheet channel.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS A CENSUS RATHER THAN A BEHAVIORAL TEST.
 *
 * `sanitizeStyleText` is called at a handful of sites across the export surface. Some of
 * those calls are killed by a real behavioral test (delete the call, a test goes red);
 * several are NOT, and the governing note says so plainly rather than pretending otherwise
 * (`engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md` §9.5). The unkilled ones
 * are the look-diagram scratch page (it needs a mermaid `look:` deck no fixture has), the
 * player's base64 font re-wrap, and `player-core.mjs`'s three re-serialization points.
 *
 * "No test kills it" is a real hazard here and not a theoretical one:
 *
 *   - The three gates that enforce #22 are all TEXT MATCHERS over a file or an element body.
 *     Deleting one call in a file that still calls the guard elsewhere produces ZERO gate
 *     errors — measured, twice, by two independent reviewers.
 *   - This very PR called two of these sites "depth" and was WRONG about one of them: css-tree
 *     normalizes `<\/style` back into a live terminator, so the prune re-wrap turned out to be
 *     a second real breakout. A judgment that a guard is unnecessary has a bad track record on
 *     exactly this code.
 *   - One "depth" argument rests on a THIRD-PARTY behavioral contract — DOMPurify dropping a
 *     `style=` attribute whose value carries the terminator, which closes the
 *     `hoistInlineLightDark` path upstream of `player-core.mjs`. `package.json` pins DOMPurify
 *     with a caret and the repo auto-merges semver-minor dependency bumps without a human
 *     reading the diff. So that assumption can change overnight, unattended, against a suite
 *     that stays green with all three of those guards removed.
 *
 * So this file pins the guard COUNT per file, by value. It cannot tell you a guard is in the
 * right place — that is what the behavioral tests do — but it makes "a guard quietly
 * disappeared" impossible to land silently, which is the failure mode the gates cannot see.
 * Adding or removing a sink is then a deliberate edit here, with a reason, in review.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');

/**
 * file → { guards, why }
 *
 * `guards` — how many `sanitizeStyleText(` CALL sites the file has (comments and the import
 *            line excluded; see `countGuards`).
 * `why`    — what those calls are, and which `<style>` in the file deliberately has none, so
 *            an unguarded sink is a stated decision rather than an oversight.
 */
const CENSUS = {
	'lattice-emulator.js': {
		guards: 4,
		why:
			'page scaffold, look-diagram scratch page, and both --player prune re-wraps are guarded. ' +
			'The fifth is embeddedFontsStyle() — a fixed face manifest from lib/fonts/text-faces.js plus ' +
			'base64, neither of which can contain `<`.',
	},
	'lib/export/player-core.mjs': {
		guards: 3,
		why:
			'the KaTeX block, the deck block rebuilt after themeDualMode+minifyCss, and the dual-mode ' +
			'block. The fourth is playerCss(), this file\'s own chrome, interpolating only canvas numbers.',
	},
	'docs/src/components/studio/player-prune-browser.ts': {
		guards: 2,
		why: 'both post-prune re-wraps — css-tree undoes the escape, so these own the terminator outright.',
	},
	'docs/src/components/studio/share-export.ts': {
		guards: 3,
		why: 'the self-contained doc (fonts + composed sheet) and the finish block spliced into shared markdown.',
	},
	'docs/src/components/studio/export/deck-export.js': {
		guards: 1,
		why: 'embedThemeInMarkdown — a saved library theme spliced into markdown handed to a recipient.',
	},
	'lib/layout/bridge.js': {
		guards: 1,
		why: 'componentBlock — model-authored component CSS spliced into markdown handed to a recipient.',
	},
	'docs/src/playground/deck-preview.js': {
		guards: 2,
		why:
			'the Playground preview builder: the font-face <style> and the composed theme block. ' +
			'TWO sinks in one file, which is exactly the shape `checkPreviewHtmlSinks` cannot pin — ' +
			'it is file-scoped, so either call could be deleted and the gate would still certify it.',
	},
	'docs/src/playground/snapshot-cache.js': {
		guards: 3,
		why:
			'both captures and the storage boundary, mirroring the html channel in the same file. ' +
			'The CSSOM TWIN of the css-tree re-wrap: `rule.cssText` normalizes `<\\/style` back into a ' +
			'live terminator (measured in Chromium 131), so the snapshot owes the guard at the ' +
			're-serialization however the preview document upstream was assembled. Neither a preview ' +
			'builder nor a document assembler, so NEITHER text-matching gate can see this file — the ' +
			'census is the only pin it has.',
	},
	'docs/src/components/studio/present/presenter-window.js': {
		guards: 1,
		why:
			'buildStageDoc — the dual-screen presenter / rehearsal stage embeds the deck\'s composed CSS. ' +
			'A #1718 preview builder rather than an export path, censused here because the anti-vacuity ' +
			'arm below found it and a census that skipped it would not describe the surface it claims to.',
	},
};

/**
 * `sanitizeStyleText(` CALL sites, with comments and the import/require line removed first.
 *
 * Stripping comments is not cosmetic here: the gates that enforce #22 are text matchers over
 * a whole file or a whole element body, and a mention inside a comment satisfies them — a
 * measured evasion. A census that counted comment mentions would inherit the same blind spot
 * it exists to cover for.
 */
function countGuards(src) {
	const code = src
		.replace(/\/\*[\s\S]*?\*\//g, '')          // block comments
		.replace(/^\s*\/\/.*$/gm, '')                // line comments
		.replace(/^\s*(?:import|const)\b[^\n]*sanitize-style-text[^\n]*$/gm, ''); // the import itself
	return (code.match(/sanitizeStyleText\s*\(/g) || []).length;
}

for (const [rel, expected] of Object.entries(CENSUS)) {
	test(`${rel} — guard census (HARD RULE #22)`, () => {
		const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
		assert.equal(
			countGuards(src),
			expected.guards,
			`${rel} has ${countGuards(src)} sanitizeStyleText call sites, the census says ${expected.guards}. ` +
				`If you REMOVED one: a </style> in caller CSS ends the element and the remainder is parsed as ` +
				`markup — in an export that is a beacon in every copy the recipient opens. If you ADDED a sink: ` +
				`update this census with the reason. Never "fix" this by editing the number alone.\n` +
				`Census reason for this file: ${expected.why}`,
		);
	});
}

test('the census covers every file that calls the guard outside docs/src preview builders', () => {
	// Anti-vacuity: if a new export-surface file starts calling sanitizeStyleText and is not in
	// the census, the census stops describing the surface it claims to describe.
	// `docs/src/playground` joined these roots with the CSSOM twin (snapshot-cache.js): the
	// snapshot's css crosses localStorage and is replayed into the TOP docs document, and the
	// file is invisible to all three text-matching gates (it is not a preview builder and it
	// assembles no document), so the census is its only durable pin.
	const roots = ['lattice-emulator.js', 'lib/export', 'lib/layout', 'docs/src/components/studio', 'docs/src/playground'];
	const found = [];
	const walk = (abs) => {
		if (!fs.existsSync(abs)) return;
		if (fs.statSync(abs).isFile()) return void check(abs);
		for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
			if (e.name === 'node_modules' || e.name === 'dist') continue;
			const p = path.join(abs, e.name);
			if (e.isDirectory()) walk(p);
			// `*.generated.js` / `*.generated.mjs` are BUNDLER OUTPUT (esbuild inlines lib/core/sanitize-style-text.mjs
			// into several of them). A count there tracks a build step rather than a decision, and
			// churns on every re-bundle — the census is about call sites someone chose to write.
			else if (/\.generated\.[cm]?js$/.test(e.name)) continue;
			else if (/\.(?:js|ts|tsx|mjs|cjs)$/.test(e.name)) check(p);
		}
	};
	const check = (p) => {
		const rel = path.relative(ROOT, p).split(path.sep).join('/');
		if (/\.test\.(?:ts|js)$/.test(rel)) return;
		if (/sanitizeStyleText\s*\(/.test(fs.readFileSync(p, 'utf8'))) found.push(rel);
	};
	for (const r of roots) walk(path.join(ROOT, r));
	const uncensused = found.filter((f) => !CENSUS[f]);
	assert.deepEqual(
		uncensused,
		[],
		`these files guard a stylesheet sink but are not in the census — add them with their reason: ${uncensused.join(', ')}`,
	);
});

/**
 * THE THIRD-PARTY ASSUMPTION the census cannot pin by counting.
 *
 * `player-core.mjs`'s three guards are called "depth" in the governing note (§9.3) on the
 * strength of one measured fact: the only route that survives an HTML parse with a live
 * terminator intact is `hoistInlineLightDark`, which lifts an inline `style=` ATTRIBUTE (not
 * RAWTEXT, so a `</style>` in it is preserved) into the dual-mode block — and DOMPurify drops
 * that attribute outright when its value carries the payload, one layer upstream.
 *
 * That is a THIRD-PARTY behavioral contract, not a property of our code. `package.json` pins
 * DOMPurify with a caret and `.github/workflows/dependabot-auto-merge.yml` auto-merges
 * semver-minor bumps with no human reading the diff. So the assumption holding three guards'
 * necessity at bay can change overnight, unattended. This arm turns that from a silent
 * regression into a red dependency PR.
 *
 * If this test ever fails: DO NOT relax it. It means the attribute channel is live again and
 * `player-core.mjs`'s guards stopped being depth and became the fix.
 */
test('DOMPurify still drops a `style=` attribute carrying the element terminator', async () => {
	const [{ createSlideSanitizer }, DOMPurify, { JSDOM }] = await Promise.all([
		import('../../../lib/core/sanitize-slide-html.mjs'),
		import('dompurify').then((m) => m.default ?? m),
		import('jsdom'),
	]);
	const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window);

	// Control: a benign light-dark() attribute must SURVIVE, or the arm below proves nothing —
	// a sanitizer that dropped every style attribute would pass it vacuously.
	const benign = sanitize('<section data-lattice-slide="1" style="color:light-dark(#fff,#000)"><h1>x</h1></section>');
	assert.match(benign, /style="color:light-dark\(#fff,#000\)"/, 'a benign inline style must survive — else the payload arm is vacuous');

	// Every shape that would reach hoistInlineLightDark carrying a live terminator.
	const payloads = [
		`--a:light-dark(#fff,#000);--b:"</style><img src=x>"`,
		`--a:light-dark(#fff,'</style><img src=x>')`,
		`--a:light-dark(#fff,#000);--b:"</STYLE><img src=x>"`,
		`--a:light-dark(#fff,#000);--b:"</style/"`,
		`--a:light-dark(#fff,#000);background:url("</style><img src=x>")`,
	];
	for (const p of payloads) {
		const out = sanitize(`<section data-lattice-slide="1" style="${p.replace(/"/g, '&quot;')}"><h1>x</h1></section>`);
		assert.doesNotMatch(out, /<\/style/i, `DOMPurify let a live terminator through an inline style attribute: ${p}`);
		assert.doesNotMatch(out, /style=/, `the style attribute survived carrying a payload — the hoist path is live again: ${p}`);
	}
});
