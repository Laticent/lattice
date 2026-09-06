/**
 * Unit: deck-preview.js — the shared multi-slide "filmstrip" preview controller
 * used by the playground, the Drawing Board, and both Workbench studios.
 *
 * The DOM/iframe parts (patchSections, renderDeck) are verified interactively in
 * each host; here we lock the two pure, Node-importable pieces: the `buildSrcdoc`
 * string assembly (so each per-surface knob keeps emitting the right CSS/agents —
 * the contract that, when it drifted across four hand-rolled copies, caused the
 * flash / flicker / gap bugs) and the `hashString` render-signature helper.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
	return import('../../../docs/src/playground/deck-preview.js');
}

const BASE = {
	html: '<div class="lattice"><section><h1>One</h1></section></div>',
	css: '/* theme */',
	mode: 'light',
	geom: { w: 1280, h: 720 },
	runtimeUrl: '/rt.js',
};

describe('buildSrcdoc', () => {
	test('always gates visibility, pins the slide box, and injects the engine + FIT', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE });
		// Anti-flash gate + the box pin that keeps container-type:size from collapsing.
		assert.match(doc, /\.lattice\{visibility:hidden;\}/);
		assert.match(doc, /\.lattice>section\{width:1280px;height:720px\}/);
		// FIT agent: scales, reveals, and exposes the patch hook — through the
		// drag-suspension gate (the pane splitter suspends per-frame re-fits
		// mid-drag; resume runs the one authoritative fit).
		assert.match(doc, /window\.__latticeFit=gatedFit/);
		assert.match(doc, /window\.__latticeFitSuspend=function\(\)\{fitSuspended=true;\}/);
		assert.match(doc, /window\.__latticeFitResume=function\(\)\{fitSuspended=false;requestAnimationFrame\(gatedFit\);setTimeout\(gatedFit,120\);\}/);
		assert.match(doc, /lattice\.style\.visibility="visible"/);
		// Engine wiring + the deck's geometry globals.
		assert.match(doc, /window\.__SLIDE_W=1280;window\.__SLIDE_H=720;/);
		assert.match(doc, /src="\/rt\.js"/);
	});

	test('stamps <html lang> — default en, and the deck language when given (WCAG 3.1.1)', async () => {
		const { buildSrcdoc } = await load();
		// `[ >]` closes each match rather than `>`: the tag can also carry
		// `data-lattice-diagrams` (this builder stamps it when it injects Mermaid; the
		// runtime's own `data-lattice-runtime` is written at boot on `document.documentElement`,
		// never here). The assertion is that the lang attribute is present and
		// well-formed — including that a hostile value cannot break out of it — not that it is
		// the only attribute on the tag.
		assert.match(buildSrcdoc({ ...BASE }), /<html lang="en"[ >]/); // default
		assert.match(buildSrcdoc({ ...BASE, lang: 'fr' }), /<html lang="fr"[ >]/);
		// A hostile lang is sanitized to letters/hyphen (no attribute-breakout).
		assert.match(buildSrcdoc({ ...BASE, lang: 'en"><script>' }), /<html lang="enscript"[ >]/);
	});

	// A PROMISE ABOUT THE DOCUMENT, not a style hook. `mermaid.css` withholds an un-tagged
	// Mermaid fence's ink only under `[data-lattice-diagrams]`, because hiding a diagram's
	// source is right only where something is going to DRAW it. So the claim follows the
	// MERMAID script, not the runtime — a document with the runtime and no Mermaid renders
	// no diagram and its author needs the source they can read. (The first version of this
	// gate keyed on `data-lattice-runtime`, which the runtime itself stamps at boot; it
	// turned the rule on in exactly the hosts it was meant to spare.)
	// See engineering/decisions/2026-09-05-diagram-fence-flash.md §4A.
	test('claims diagrams on the <html> tag only when it injects Mermaid', async () => {
		const { buildSrcdoc, previewDiagramsAttr } = await load();
		const withFence = { ...BASE, html: '<pre><code class="language-mermaid">graph LR</code></pre>', mermaidUrl: '/m.js' };
		assert.match(buildSrcdoc(withFence), /<html[^>]* data-lattice-diagrams[ >]/);
		// No Mermaid injected → no claim, on either half of the condition.
		assert.doesNotMatch(buildSrcdoc({ ...BASE }), /data-lattice-diagrams/);
		assert.doesNotMatch(buildSrcdoc({ ...withFence, mermaidUrl: '' }), /data-lattice-diagrams/);
		assert.equal(previewDiagramsAttr(''), '');
		assert.equal(previewDiagramsAttr(undefined), '');
		assert.equal(previewDiagramsAttr('/m.js'), ' data-lattice-diagrams');
	});

	// THE SEAM, and the only thing on this branch that has been wrong twice. The gate lives
	// in CSS and the stamp lives in JS, joined by nothing but a matching string — so a rename
	// on either side passes lint, `build:check` and all 8000+ unit tests while silently
	// switching rule A off (or, as in round 1, on in every document the runtime booted in).
	// Join them here: whatever attribute the rule keys on must be the attribute the builder
	// writes. Found missing by the third independent checker.
	test('the CSS gate is keyed on exactly the attribute the builder stamps', async () => {
		const { previewDiagramsAttr } = await load();
		const fs = require('node:fs');
		const path = require('node:path');
		const css = fs.readFileSync(path.join(__dirname, '../../../lib/integrations/mermaid/mermaid.css'), 'utf8');
		// The one rule that withholds an un-tagged fence's ink, minus comments.
		const live = css.replace(/\/\*[\s\S]*?\*\//g, '');
		const rule = live.split('\n').find((l) => l.includes('language-mermaid') && l.includes('visibility:hidden'));
		assert.ok(rule, 'mermaid.css no longer carries the un-tagged-fence rule');
		const gate = /^\[([a-z-]+)\]/.exec(rule.trim());
		assert.ok(gate, 'the rule is no longer gated on a root attribute — it would hide fences everywhere');
		assert.equal(' ' + gate[1], previewDiagramsAttr('/m.js'));
	});

	// The offscreen EXPORT capture frame opts OUT: it is rasterized through `html-to-image`,
	// which copies the COMPUTED style onto its clone, so a `visibility:hidden` rule A applied
	// is baked into the .pdf/.png/.pptx. With Mermaid failing inside that frame nothing tags
	// the fence, and stamping would export an empty slot where the author's unrendered source
	// used to be. Driven through the real rasterizer by the third independent checker.
	test('does not claim diagrams when the caller opts out (the export capture frame)', async () => {
		const { buildSrcdoc } = await load();
		const withFence = { ...BASE, html: '<pre><code class="language-mermaid">graph LR</code></pre>', mermaidUrl: '/m.js' };
		assert.match(buildSrcdoc(withFence), /<html[^>]* data-lattice-diagrams[ >]/);
		assert.doesNotMatch(buildSrcdoc({ ...withFence, diagrams: false }), /data-lattice-diagrams/);
		// Opting out must not also drop the Mermaid script — the frame still renders diagrams.
		assert.match(buildSrcdoc({ ...withFence, diagrams: false }), /src="\/m\.js"/);
	});

	// A CENSUS OF THE STAMPERS, because the per-caller knob is the shape that keeps being got
	// wrong. `data-lattice-diagrams` is a document's promise that something will draw a fence,
	// and the rule that promise switches on withholds the fence's ink — right for a frame a
	// human WATCHES, wrong for a document whose bytes the author keeps, where a Mermaid
	// failure turns their unrendered source into an empty slot.
	//
	// #2073 fixed that for the raster capture frame and MISSED the desktop vector print
	// document, because nothing in the tree enumerated the population: three documents said
	// "no export path stamps" while one did.
	//
	// THE POPULATION IS `previewDiagramsAttr` CALL SITES, not `buildSrcdoc` ones, and the
	// first version of this census got that wrong. Two builders assemble their own
	// `<!doctype html>` and call the stamp directly — `single-slide-render.ts` and the Present
	// stage window — so a `buildSrcdoc`-scoped census could not see either, which is the same
	// blind spot in a new place. Every call site is listed below with what it builds; a new one
	// fails here until someone classifies it.
	//
	// See engineering/decisions/2026-09-05-diagram-fence-flash.md §5 and §7.
	test('every document that can stamp data-lattice-diagrams is classified', async () => {
		const fs = require('node:fs');
		const path = require('node:path');
		const root = path.join(__dirname, '../../../docs/src');
		// file → one entry per call site, in source order. `true` = this site can stamp an
		// EXPORT document (one whose bytes the author keeps) and must be gated so it does not.
		const EXPECTED = {
			// The shared builder. Gated on its `diagrams` knob, which is what its callers set.
			'playground/deck-preview.js': ['gated'],
			// The single-slide preview frame — the Studio editor, thumbs, landing previews.
			'lib/single-slide-render.ts': ['watched'],
			// The Present stage window: a presenter is watching it.
			'components/studio/present/stage-window.js': ['watched'],
		};
		// And every caller of the gated builder, with what it hands the knob.
		const KNOB = {
			// renderDeck's full write — the deck preview frame. Forwards `...opts`; every host
			// that reaches it today is a live preview.
			'playground/deck-preview.js': ['default'],
			// The print PREVIEW cells (watched), then the DESKTOP PRINT document (offscreen at
			// -10000px, handed straight to print() — the author's PDF).
			'components/studio/PrintOptionsPanel.tsx': ['default', 'false'],
			// The offscreen raster capture frame: rasterized through html-to-image, which bakes
			// the computed style into the .pdf/.png/.pptx.
			'components/studio/export/deck-export.js': ['false'],
		};
		// EVERY SCAN BELOW READS CODE, NOT PROSE. This file's own comments discuss
		// `buildSrcdoc` and `diagrams: false` at length, and a text matcher cannot tell a
		// mention from a call — the first version of this census reported eight "unclassifiable
		// references" that were all sentences. Blank the BODIES of comments and string literals,
		// preserving length so every offset below still indexes the original text. Blanking the
		// strings also deletes the brace-matching hazard: a call whose CSS argument carries an
		// unbalanced `{` (`css: '@media print {'` is real) used to run off the end of the call
		// and swallow the NEXT call's opt-out, certifying an export document that never opted
		// out. That false PASS was demonstrated by a red-team pass.
		const codeOnly = (text) => {
			const out = text.split('');
			let i = 0;
			const blank = (from, to) => {
				for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
			};
			while (i < text.length) {
				const two = text.slice(i, i + 2);
				if (two === '//') {
					const end = text.indexOf('\n', i);
					blank(i, end === -1 ? text.length : end);
					i = end === -1 ? text.length : end;
				} else if (two === '/*') {
					const end = text.indexOf('*/', i + 2);
					blank(i, end === -1 ? text.length : end + 2);
					i = end === -1 ? text.length : end + 2;
				} else if (text[i] === '"' || text[i] === "'" || text[i] === '`') {
					const q = text[i];
					let j = i + 1;
					for (; j < text.length; j++) {
						if (text[j] === '\\') j++;
						else if (text[j] === q) break;
					}
					blank(i + 1, j);
					i = j + 1;
				} else i++;
			}
			return out.join('');
		};
		const stamps = {};
		const knobs = {};
		const indirect = [];
		const walk = (dir) => {
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				const p = path.join(dir, e.name);
				if (e.isDirectory()) {
					walk(p);
					continue;
				}
				// `.astro` is in scope: `docs/src` has 41 of them and one already imports this
				// module and installs it on `window`. Leaving them out was a hole a red-team pass
				// walked through.
				if (!/\.(js|ts|tsx|mjs|astro)$/.test(e.name) || /\.test\./.test(e.name)) continue;
				const text = codeOnly(fs.readFileSync(p, 'utf8'));
				const rel = path.relative(root, p);
				// Stamp sites. The definition and the import line are not call sites.
				for (const m of text.matchAll(/previewDiagramsAttr\(/g)) {
					const before = text.slice(Math.max(0, m.index - 30), m.index);
					if (/function\s+$/.test(before) || /import\s*\{[^}]*$/.test(before)) continue;
					(stamps[rel] ||= []).push(rel.endsWith('deck-preview.js') ? 'gated' : 'watched');
				}
				// Callers of the gated builder, and what each passes. `\s*` on both sides of the
				// paren: a red-team pass got three shapes past an `indexOf('buildSrcdoc({')`
				// scan, and a line break before the brace was one of them.
				for (const m of text.matchAll(/buildSrcdoc\s*\(\s*\{/g)) {
					const i = m.index;
					if (/function\s+$/.test(text.slice(Math.max(0, i - 20), i))) continue;
					// STRING-AWARE brace matching. A naive counter walks INTO string literals, and
					// a call whose CSS argument contains an unbalanced `{` — `css: '@media print {'`
					// is real — runs off the end of the call and swallows the NEXT call's
					// `diagrams: false`, certifying an export document that never opted out. That
					// false PASS was demonstrated; this loop is why it cannot happen again.
					let depth = 0;
					let j = i + m[0].length - 1;
					const from = j;
					for (; j < text.length; j++) {
						if (text[j] === '{') depth++;
						else if (text[j] === '}' && --depth === 0) break;
					}
					// The knob, read from code only — every opt-out here carries a paragraph
					// explaining itself, and those paragraphs name it. A census reading the raw
					// span is satisfied by the PROSE about the fix and passes with the fix deleted;
					// that was caught by mutating this test, which stayed green.
					const args = text.slice(from, j + 1);
					(knobs[rel] ||= []).push(/\bdiagrams:\s*false\b/.test(args) ? 'false' : 'default');
				}
				// AN INDIRECT REFERENCE THIS SCAN CANNOT CLASSIFY. `buildSrcdoc(opts)`, an alias,
				// or a value passed on — each is a document this census would silently miss, so it
				// FAILS rather than certifying a tree it cannot read. This is the honest edge of a
				// text matcher, and it is the one that has to be loud.
				for (const m of text.matchAll(/\bbuildSrcdoc\b/g)) {
					const after = text.slice(m.index + 'buildSrcdoc'.length, m.index + 'buildSrcdoc'.length + 40);
					const before = text.slice(Math.max(0, m.index - 40), m.index);
					const isCall = /^\s*\(\s*\{/.test(after);
					const isDefn = /function\s+$/.test(before);
					// A RENAMING import hides the call behind a name this scan never looks for —
					// `import { buildSrcdoc as bsd }` then `bsd({…})`. It is the one evasion that
					// survived the first hardening pass, so it is called out by name.
					const isRenamed = /^\s*as\s+\w/.test(after);
					const isImportOrExport = !isRenamed && (/(import|export)\s*\{[^}]*$/.test(before) || /^\s*[,}]/.test(after));
					if (!isCall && !isDefn && !isImportOrExport) indirect.push(`${rel}: …${text.slice(Math.max(0, m.index - 25), m.index + 35).replace(/\n/g, ' ')}…`);
				}
			}
		};
		walk(root);
		const listed = (found, want, what) => {
			assert.deepEqual(
				Object.keys(found).sort(),
				Object.keys(want).sort(),
				`${what}: a file appeared or vanished. A NEW one must be added to this census with ` +
					'what it builds — a document nobody watches, whose bytes the author keeps, must not ' +
					'withhold a fence it failed to draw. A file that vanished means the entry is stale.',
			);
			for (const [file, expect] of Object.entries(want)) {
				assert.deepEqual(found[file], expect, `${what} — ${file}: each site must be ${expect.join(', then ')}`);
			}
		};
		assert.deepEqual(
			indirect,
			[],
			'a `buildSrcdoc` reference this census cannot classify — an alias, a variable argument, ' +
				'or a value passed on. Give it a literal object argument, or teach this test to read it. ' +
				'A document nobody watches, whose bytes the author keeps, must not withhold a fence it ' +
				'failed to draw, and this scan cannot tell whether that one does.',
		);
		listed(stamps, EXPECTED, 'stamp sites');
		listed(knobs, KNOB, 'buildSrcdoc callers');
	});

	test('always injects the link guard so an external tap cannot navigate (blank) the frame', async () => {
		const { buildSrcdoc } = await load();
		// The guard is unconditional (every filmstrip srcdoc), capture-phase, gated to
		// http(s) hrefs, and opens a top-level tab instead of navigating the iframe.
		const doc = buildSrcdoc({ ...BASE });
		assert.match(doc, /addEventListener\("click"[\s\S]*?closest\("a\[href\]"\)/);
		assert.match(doc, /\/\^https\?:\/i\.test\(href\)/);
		assert.match(doc, /window\.top\|\|window\)\.open\(href,"_blank"/);
		// It must run in capture phase (so it wins before the frame follows the link).
		assert.match(doc, /addEventListener\("click",function\(e\)\{[\s\S]*?\},true\)/);
		// Video posters first offer themselves to a parent-hosted player (window.__videoPlay);
		// only if that declines (no overlay / non-embeddable) does it fall back to a tab.
		assert.match(doc, /video-poster.*window\.__videoPlay/);
	});

	test('clamps the filmstrip tail by default and can be turned off', async () => {
		const { buildSrcdoc } = await load();
		assert.match(buildSrcdoc({ ...BASE }), /lattice\.style\.overflow="clip"/);
		assert.doesNotMatch(buildSrcdoc({ ...BASE, clamp: false }), /lattice\.style\.overflow="clip"/);
	});

	test('the gap rides into BOTH the FIT margin and the SYNC slot pitch', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE, gap: 22, sync: true });
		// FIT declares GAP once (marginBottom = SH*sc - SH + GAP).
		assert.match(doc, /GAP=22;/);
		assert.match(doc, /marginBottom=\(SH\*sc-SH\+GAP\)/);
		// SYNC: slot pitch = SH*(w/SW) + GAP — must agree with FIT or the scroll drifts.
		assert.match(doc, /SH\*\(w\/SW\)\+22/);
	});

	test('opt-in knobs only emit when requested', async () => {
		const { buildSrcdoc } = await load();
		const off = buildSrcdoc({ ...BASE });
		assert.doesNotMatch(off, /content-visibility:auto/);
		assert.doesNotMatch(off, /db-active/);
		assert.doesNotMatch(off, /@media print/);
		assert.doesNotMatch(off, /db-slide-scrolled/); // SYNC agent absent
		assert.doesNotMatch(off, /justify-content:safe center/);
		assert.doesNotMatch(off, /color-scheme:/);

		const on = buildSrcdoc({
			...BASE,
			mode: 'dark',
			contentVisibility: true,
			activeOutline: '#b0492e',
			printRules: true,
			sync: true,
			center: true,
			colorScheme: 'dark',
			fontCss: '/* faces */',
		});
		assert.match(on, /content-visibility:auto;contain-intrinsic-size:1280px 720px/);
		assert.match(on, /\.lattice>section\.db-active\{outline:3px solid #b0492e/);
		assert.match(on, /@media print/);
		assert.match(on, /db-slide-scrolled/); // SYNC agent present
		assert.match(on, /window\.__latticeTag=tag/);
		assert.match(on, /justify-content:safe center/);
		assert.match(on, /:root\{color-scheme:dark;\}/);
		assert.match(on, /\/\* faces \*\//);
	});

	test('print path un-hides + un-clamps .lattice so export is not clipped', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE, printRules: true, contentVisibility: true });
		assert.match(doc, /@media print\{/);
		// un-hides + un-clamps .lattice (then centers each slide on the sheet — the fit
		// flex column follows the un-hide props, so match the prefix, not a closing brace).
		assert.match(doc, /\.lattice\{visibility:visible!important;height:auto!important;overflow:visible!important;/);
		assert.match(doc, /content-visibility:visible!important/);
		// paper-fit: a standard sheet is picked and the slide is scaled to it.
		assert.match(doc, /@page\{size:(legal|letter) (landscape|portrait);margin:9mm;\}/);
		assert.match(doc, /zoom:[0-9.]+/);
	});

	test('background + padding follow the mode and the opt', async () => {
		const { buildSrcdoc } = await load();
		assert.match(buildSrcdoc({ ...BASE, mode: 'dark', padding: 22 }), /padding:22px;background:#0c0c0c;/);
		assert.match(buildSrcdoc({ ...BASE, mode: 'light' }), /background:#e7e7ea;/);
	});

	test('geometry drives the box, the globals, and the content-visibility placeholder', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE, geom: { w: 3840, h: 2160 }, contentVisibility: true });
		assert.match(doc, /\.lattice>section\{width:3840px;height:2160px\}/);
		assert.match(doc, /window\.__SLIDE_W=3840;window\.__SLIDE_H=2160;/);
		assert.match(doc, /contain-intrinsic-size:3840px 2160px/);
	});
});

describe('hashString', () => {
	test('is deterministic and order-sensitive', async () => {
		const { hashString } = await load();
		assert.equal(hashString('alpha'), hashString('alpha'));
		assert.notEqual(hashString('alpha'), hashString('beta'));
		assert.notEqual(hashString('ab'), hashString('ba'));
	});

	test('returns a non-negative integer', async () => {
		const { hashString } = await load();
		const h = hashString('some long-ish theme css string {}');
		assert.equal(Number.isInteger(h), true);
		assert.equal(h >= 0, true);
	});
});

// ── Remote-subresource containment (#1753) ────────────────────────────────────
// A deck could make a preview frame fetch an arbitrary external URL on open — a beacon
// leaking the viewer's IP and User-Agent and confirming they opened it — through FULLY
// SANITIZED slide HTML. The posture chosen is containment by CSP, matching what the
// exported player already ships.
//
// WHAT THESE PIN, AND WHAT THEY CANNOT. A browser's enforcement of a valid CSP is the
// browser's guarantee, not ours; what can regress on our side is the meta going missing,
// landing after content, or losing a directive. That is what is asserted here. The
// enforcement itself was measured on the REAL assembled srcdoc in Chromium 131: the same
// document fired 3 requests (markdown image, raw <img>, inline `background-image:url()`)
// with the meta removed and 0 with it present, the payload elements still in the DOM both
// times — so the fetch is refused rather than the markup rewritten.
describe('deck-preview: preview-frame CSP', () => {
	test('buildSrcdoc emits the CSP before any content or subresource link', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE });
		const csp = doc.indexOf('http-equiv="Content-Security-Policy"');
		assert.ok(csp !== -1, 'the preview srcdoc carries no CSP');
		// A CSP meta governs only what the parser has not already reached, so its POSITION
		// is the whole guarantee — after a <link> or the body it would be inert.
		assert.ok(csp < doc.indexOf('<body'), 'the CSP must precede <body>');
		const link = doc.indexOf('<link');
		if (link !== -1) assert.ok(csp < link, 'the CSP must precede every subresource link');
	});

	test('the policy closes every channel a deck can aim at a remote host', async () => {
		const { buildSrcdoc } = await load();
		const doc = buildSrcdoc({ ...BASE });
		// img: markdown images, raw <img>, and `url()` in an inline style attribute.
		// media: <video>/<audio>, which survive sanitization. connect/object/base/form:
		// exfiltration routes nothing in a preview needs.
		for (const directive of ['img-src', 'media-src', 'font-src', 'connect-src', 'object-src', 'base-uri', 'form-action']) {
			assert.match(doc, new RegExp(`${directive}[^;"]*[;"]`), `CSP is missing ${directive}`);
		}
		assert.match(doc, /img-src 'self' data: blob:;/, 'img-src must allow only same-document sources');
		// No `default-src`, deliberately: script/style/worker loading stays exactly as
		// unrestricted as before, so this cannot break Mermaid, KaTeX or the runtime by
		// starving a directive nobody enumerated.
		assert.doesNotMatch(doc, /default-src/, 'a default-src here would restrict more than the posture chose');
	});

	// The PREVIEW / EXPORT boundary, pinned from both sides. A preview is a frame the author
	// browses, where a deck's remote image beacons on open; the Studio's capture frame is an
	// export renderer whose output the author downloads, and containing it would blank a
	// legitimately-remote image in the .pdf/.pptx/.png — an export-bytes change, and a
	// divergence from the CLI, which emits no CSP. Neither side may flip by accident.
	test('csp:false omits the meta entirely — the export capture frame opts out', async () => {
		const { buildSrcdoc } = await load();
		assert.doesNotMatch(buildSrcdoc({ ...BASE, csp: false }), /Content-Security-Policy/);
		assert.match(buildSrcdoc({ ...BASE }), /Content-Security-Policy/, 'the DEFAULT must stay on');
	});

	test("the Studio's export capture frame passes csp:false, deliberately", () => {
		const fs = require('fs');
		const path = require('path');
		const src = fs.readFileSync(
			path.join(__dirname, '..', '..', '..', 'docs/src/components/studio/export/deck-export.js'), 'utf8'
		);
		assert.match(
			src, /csp:\s*false/,
			'deck-export.js builds the offscreen frame that PDF/PPTX/PNG are rasterized from. If it '
			+ 'stops passing csp:false, a deck\'s remote image is blocked during capture and blanks in '
			+ 'the downloaded file — an EXPORT-BYTES change needing sign-off (QUALITY BAR), not a tweak.'
		);
	});

	test('the font-src origin follows the katexUrl rather than a hard-coded CDN', async () => {
		const { previewCspMeta } = await load();
		assert.match(previewCspMeta({ katexUrl: 'https://cdn.example.net/katex/katex.min.css' }), /font-src 'self' data: https:\/\/cdn\.example\.net;/);
		// A relative path is already covered by 'self'; a malformed value must not throw.
		assert.match(previewCspMeta({ katexUrl: '/local/katex.css' }), /font-src 'self' data:;/);
		assert.match(previewCspMeta({ katexUrl: '???' }), /font-src 'self' data:;/);
		assert.match(previewCspMeta(), /font-src 'self' data:;/);
	});
});

// The CENSUS. `buildSrcdoc` is one of three modules that assemble a preview-frame document;
// the other two are TypeScript / dependency-heavy and are not Node-importable here, so they
// are pinned by SOURCE. This is the same shape HARD RULE #22's own guards use, and for the
// same reason: a file-scoped text match is what survives when the module cannot be loaded.
//
// The list mirrors SANCTIONED_PREVIEW_BUILDERS in tools/check-ownership.js minus
// `sanitize-slide-html.js`, which binds the sanitizer and assembles no document. If a fourth
// builder appears, #22's gate makes it declare its sanitizer calls; this makes it declare the
// CSP too — otherwise the new frame is open exactly as these three were.
describe('deck-preview: every preview-frame builder carries the CSP', () => {
	const fs = require('fs');
	const path = require('path');
	const ROOT = path.join(__dirname, '..', '..', '..');
	const BUILDERS = [
		'docs/src/playground/deck-preview.js',
		'docs/src/lib/single-slide-render.ts',
		'docs/src/components/studio/present/stage-window.js',
	];
	for (const rel of BUILDERS) {
		test(`${rel} calls previewCspMeta`, () => {
			const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
			assert.match(
				src, /previewCspMeta\(/,
				`${rel} assembles a preview document but does not emit the CSP — the frame it builds `
				+ 'can beacon the viewer out on open (#1753)'
			);
			// It has to land in the HEAD, before content. Assert the call sits ahead of the
			// document's <body>, which is the ordering the browser actually honors.
			const call = src.indexOf('previewCspMeta(');
			const body = src.indexOf("'</style></head><body>'") === -1 ? src.indexOf('<body') : src.indexOf("'</style></head><body>'");
			if (body !== -1) assert.ok(call < body, `${rel} emits the CSP after <body>, where it is inert`);
		});
	}
});
