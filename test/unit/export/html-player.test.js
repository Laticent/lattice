const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const {
	buildPlayerHtml,
	fileToDataUri,
	subsetEmbeddedFonts,
	collectBaseSelectors,
	prunePlayerCss,
	prunePlayerFontFaces,
	normalizeFamily,
} = require('../../../lib/export/html-player.js');
const { READ_ALONG_VERSION, parseEnvelope } = require('../../../lib/core/lattice-doc.js');

// `minifyCss` moved to the pure player-core (ESM) when the assembler was extracted
// (2026-07-08-studio-html-player-export.md, P1). Loaded via dynamic import before the
// suite runs — the adapter no longer re-exports it (a CJS module can't sync-forward an
// ESM binding), so the tests read it from its new home.
let minifyCss;
let resolveLightDark;
let themeDualMode;
let playerCss;
let playerJs;
let resolveCanvas;
test.before(async () => {
	({ minifyCss, resolveLightDark, themeDualMode, playerCss, playerJs, resolveCanvas } = await import('../../../lib/export/player-core.mjs'));
});

// ── light-dark() → engine-independent dual-mode transform (pure kernel) ──────────
test('resolveLightDark picks the right arm, respecting nested parens and recursion', () => {
	// Top-level comma only — a var() fallback's own comma must NOT split the pair.
	assert.equal(resolveLightDark('--x:light-dark(var(--a,#fff), #000)', 0), '--x:var(--a,#fff)');
	assert.equal(resolveLightDark('--x:light-dark(var(--a,#fff), #000)', 1), '--x:#000');
	// Multiple pairs in one string, both resolved.
	assert.equal(resolveLightDark('a light-dark(1,2) b light-dark(3,4)', 1), 'a 2 b 4');
	// Single-argument form maps to both sides.
	assert.equal(resolveLightDark('light-dark(red)', 0), 'red');
	assert.equal(resolveLightDark('light-dark(red)', 1), 'red');
	// A nested light-dark inside the chosen arm is resolved too.
	assert.equal(resolveLightDark('light-dark(light-dark(a,b), c)', 0), 'a');
	// No light-dark → untouched.
	assert.equal(resolveLightDark('color:var(--x,#fff)', 0), 'color:var(--x,#fff)');
});

test('resolveLightDark never rewrites light-dark() inside a string, url(), or comment', () => {
	// A content string that literally contains the token text must survive verbatim.
	assert.equal(resolveLightDark('content:"light-dark(a,b)"', 0), 'content:"light-dark(a,b)"');
	assert.equal(resolveLightDark("content:'light-dark(a,b)'", 1), "content:'light-dark(a,b)'");
	// A data-URI (url()) is opaque — even an unbalanced-looking paren inside must not
	// derail the scanner into rewriting the real token that follows.
	assert.equal(
		resolveLightDark('background:url("data:image/svg+xml,light-dark(x,y)");--t:light-dark(#fff,#000)', 1),
		'background:url("data:image/svg+xml,light-dark(x,y)");--t:#000',
	);
	// A comment with an UNBALANCED paren must not run the paren scanner off the end and
	// corrupt the real declaration after it.
	assert.equal(resolveLightDark('/* light-dark(a */--t:light-dark(#fff,#000)', 0), '/* light-dark(a */--t:#fff');
});

test('themeDualMode splits a light base + a dark override, FLATTENING var() indirection to literals', () => {
	// --bg's dark arm is `var(--scheme-dark-bg)` → must be FLATTENED to the literal
	// #001D33 (the on-device fix: an older WebKit couldn't resolve a custom property
	// pointing at another custom property across <style> blocks, leaving --bg unset →
	// white). --code's dark arm is `var(--accent)` → must be KEPT as a var, because
	// --accent is itself a dark token redefined in this same block (flattening it would
	// wrongly pin the LIGHT accent).
	const css = ':root{--scheme-dark-bg:#001D33;--brand:#4338ca;--bg: light-dark(#FFFFFF, var(--scheme-dark-bg)); --accent: light-dark(var(--brand), #82C8E5); --code: light-dark(#006599, var(--accent))}';
	const { base, darkBlock } = themeDualMode(css);
	assert.doesNotMatch(base, /light-dark\(/, 'no light-dark() survives in the base');
	assert.match(base, /--bg: #FFFFFF/);
	const attrRule = darkBlock.split('@media')[0];
	assert.match(attrRule, /--bg:#001D33/, 'cross-block var(--scheme-dark-bg) is flattened to its literal');
	assert.doesNotMatch(attrRule, /var\(--scheme-dark/, 'no var(--scheme-dark-*) indirection remains');
	assert.match(attrRule, /--accent:#82C8E5/, 'the accent dark arm is its literal');
	assert.match(attrRule, /--code:var\(--accent\)/, 'a var() pointing at a same-block dark token is KEPT (resolves within the dark block)');
	// The tokens are set on :root AND directly on the slide sections (belt-and-suspenders
	// for an engine that repaints :root but doesn't re-propagate to deep section subtrees).
	assert.match(attrRule, /:root\[data-lp-scheme=dark\],:root\[data-lp-scheme=dark\] section\[data-lattice-slide\]\{/, 'the dark tokens are set on :root AND directly on every slide section');
	// The @media block is the SYSTEM-scheme rule (a deck exported with the author's
	// 'system' choice follows the receiver's OS). It keys on =system — NOT :not([=light]) —
	// so a pinned light/dark export is never touched by the receiver's OS. Note the space
	// after @media for old parsers.
	assert.match(darkBlock, /@media \(prefers-color-scheme:dark\)\{:root\[data-lp-scheme=system\],:root\[data-lp-scheme=system\] section\[data-lattice-slide\]\{--bg:#001D33/);
});

test('themeDualMode flattens a MULTI-HOP var chain to a literal (no residual cross-block indirection)', () => {
	// --on-accent's dark arm is var(--surface-inverse), which is var(--brand-canvas),
	// which is a literal — a two-hop chain. The whole chain must collapse to the literal
	// so no surface token depends on cross-block var resolution (the on-device failure).
	const css =
		':root{--brand-canvas:#0A1628;--surface-inverse:var(--brand-canvas);' +
		'--on-accent:light-dark(#FFF, var(--surface-inverse,#000));' +
		'--accent:light-dark(#4338ca,#82C8E5);--code:light-dark(#069, var(--accent))}';
	const attr = themeDualMode(css).darkBlock.split('@media')[0];
	assert.match(attr, /--on-accent:#0A1628/, 'the two-hop chain resolves to the final literal');
	assert.doesNotMatch(attr, /var\(--surface-inverse|var\(--brand-canvas/, 'no intermediate var indirection remains');
	assert.match(attr, /--code:var\(--accent\)/, 'a same-block dark token ref is still kept (cycle-safe, block-local)');
});

test('themeDualMode is a no-op (empty dark block) when the CSS has no light-dark()', () => {
	const { base, darkBlock } = themeDualMode('section{color:red}');
	assert.equal(base, 'section{color:red}');
	assert.equal(darkBlock, '');
});

// The self-contained .html PLAYER assembler (lib/export/html-player.js) — P2 slice 3
// of 2026-07-07-html-lattice-player.md. These pin the §Security v1 gate: the shipped
// file is offline (no file://), the slide DOM is sanitized, the ONE player script is
// covered by a sha256 CSP, and the verbatim source round-trips.

// A tiny on-disk SVG so we can exercise real file:// image inlining.
const tmpSvg = path.join(os.tmpdir(), `lp-test-${process.pid}.svg`);
fs.writeFileSync(tmpSvg, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>');
const imgUrl = pathToFileURL(tmpSvg).href;

const source = '---\ntheme: indaco\n---\n\n# Deck\n\nA `code` span and a <!-- note -->.\n';

// A minimal emulator-style cleanDocHtml: embedded-fonts style, a stray file:// KaTeX
// link (no math → should be dropped), two slides (one carrying a hostile onerror +
// a file:// image), and an authoring inline <script> (should be stripped).
const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Deck</title>
<style id="lattice-embedded-fonts">@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}</style>
<link rel="stylesheet" href="file:///nonexistent/katex.min.css">
<style>section[data-lattice-slide]{color:red}@font-face{font-family:Playfair;src:url('fonts/playfair-400.woff2')}</style>
</head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>Deck</h1><p>Intro paragraph.</p>
<img src="${imgUrl}"><img src="x" onerror="steal(localStorage.k)"></section>
<section data-lattice-slide="2" id="2" class="content"><h2>Second</h2><ul><li>a<ul><li>nested</li></ul></li></ul></section>
<script>/* overflow watcher */ document.title='watched';</script>
</body></html>`;

test('produces a self-contained file — no file:// survives', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, title: 'Deck', now: 0 });
	assert.doesNotMatch(html, /file:\/\//, 'no file:// references may remain');
});

test('sanitizes the slide DOM — hostile onerror is stripped (the #616 gate)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.doesNotMatch(html, /onerror/i, 'onerror handler must be stripped');
	assert.doesNotMatch(html, /steal\(/, 'the injected payload must be gone');
});

test('ships exactly ONE executable script + the non-exec envelope; watcher stripped', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	const execScripts = html.match(/<script(?![^>]*type="application\/lattice\+json")[^>]*>/gi) || [];
	assert.equal(execScripts.length, 1, 'only the single hashed player script may execute');
	assert.doesNotMatch(html, /overflow watcher|watched/, 'the authoring watcher must be stripped');
	assert.match(html, /<script type="application\/lattice\+json"/, 'the envelope node is present');
});

test('the CSP sha256 actually covers the shipped player script (freeze-surviving)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	const cspHash = (html.match(/script-src 'sha256-([^']+)'/) || [])[1];
	assert.ok(cspHash, 'a sha256 script-src must be present');
	// Extract the executable player script body and hash it — must match the CSP.
	// (Case-insensitive so an upper-case tag can't slip past — CodeQL js/bad-tag-filter.)
	const body = html.match(/<script>([\s\S]*?)<\/script>/i);
	assert.ok(body, 'the player script block is present');
	const actual = crypto.createHash('sha256').update(body[1], 'utf8').digest('base64');
	assert.equal(actual, cspHash, 'CSP hash must match the exact shipped script — else it is blocked or a hole');
	assert.match(html, /default-src 'none'/, 'default-src none locks down the file');
});

test('a scene deck injects the Anima bundle under the SAME sha256 CSP; a scene-less deck does not', async () => {
	// The security-critical invariant of the export-hydration path (Stage 6b slice C): the
	// Anima bundle rides in the ONE hashed <script>, and the sha256 CSP still covers it — a
	// future refactor that appends the bundle AFTER the hash (or the ascii pass) would leave a
	// hash the browser rejects, dead on iOS. This pins hash-covers-bundle permanently.
	const spec = Buffer.from(
		JSON.stringify({ source: 'built', duration: 1000, hero: 0.5, elements: [{ id: 'a', shape: 'cone', motion: [{ verb: 'spin', axis: 'y', period: 1000 }] }] }),
	).toString('base64');
	const sceneDoc = docHtml.replace(
		'<section data-lattice-slide="1" id="1" class="title"><h1>Deck</h1><p>Intro paragraph.</p>',
		`<section data-lattice-slide="1" id="1" class="scene" data-scene-spec="${spec}"><div class="scene-figure"><svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg></div><p>Intro paragraph.</p>`,
	);
	const { html } = await buildPlayerHtml({ docHtml: sceneDoc, source, now: 0 });
	assert.match(html, /__latticeAnima/, 'the Anima bundle must be injected for a scene deck');
	assert.match(html, /hydrateScenes\(document\)/, 'the hydrate call must be present');
	const cspHash = (html.match(/script-src 'sha256-([^']+)'/) || [])[1];
	const body = html.match(/<script>([\s\S]*?)<\/script>/i);
	assert.ok(body, 'the player script block is present');
	const actual = crypto.createHash('sha256').update(body[1], 'utf8').digest('base64');
	assert.equal(actual, cspHash, 'CSP hash must cover the script WITH the Anima bundle appended');
	// Byte-identity gate: a scene-LESS deck must NOT carry the backends.
	const { html: plain } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.doesNotMatch(plain, /__latticeAnima/, 'a scene-less export must not ship the ~58 KB backends');
});

test('the CSP-hashed script is pure ASCII (WebKit hashes non-ASCII differently → blocks it)', async () => {
	// iOS WebKit (Safari + every iOS webview) computes the sha256 CSP hash over a different
	// byte encoding than Chromium/Node for non-ASCII, so a glyph or em-dash in the script
	// makes the shipped hash mismatch and WebKit REFUSES the script — the player is dead on
	// iOS. The script must stay pure ASCII (glyphs escaped to \uXXXX). Regression guard.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	const body = html.match(/<script>([\s\S]*?)<\/script>/i)[1];
	const nonAscii = [...body].filter((c) => c.codePointAt(0) > 0x7f);
	assert.equal(nonAscii.length, 0, `the player script must be pure ASCII; found: ${[...new Set(nonAscii)].map((c) => 'U+' + c.codePointAt(0).toString(16)).join(', ')}`);
});

test('embeds the verbatim source envelope, round-tripping byte-exact', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, title: 'Deck', now: 0 });
	assert.equal(parseEnvelope(html).source, source);
});

test('a math-less deck drops the KaTeX file:// link entirely', async () => {
	const { html, report } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.doesNotMatch(html, /katex/i, 'no KaTeX link/style for a deck with no math');
	assert.equal(report.math, false);
});

test('inlines a real file:// image to a data: URI and reports the count', async () => {
	const { html, report } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /data:image\/svg\+xml/, 'the file:// image is inlined as a data: URI');
	assert.equal(report.images, 1, 'exactly one image inlined');
	assert.deepEqual(report.missing, [], 'no un-inlinable assets for this fixture');
});

test('carries the three view controls + the Typora TOC shell', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	for (const v of ['present', 'read-slides', 'read-article']) {
		assert.match(html, new RegExp(`data-lp-btn="${v}"`), `view control ${v} present`);
	}
	assert.match(html, /id="lp-toc"/, 'the article TOC shell is present');
});

test('present ships visible prev/next controls wired to the shared transport', async () => {
	// Mirrors the Studio's audio-present overlay chevrons (PresentOverlay.tsx), giving
	// Present a click-target nav affordance alongside keyboard/swipe — some third-party
	// iOS HTML viewers don't reliably deliver keydown to the page. Wired to the SAME
	// transport object (t.prev()/t.next()) the keyboard/swipe handlers already use, not
	// a hand-rolled clamp, so bounds/nav logic stays single-sourced (HARD RULE #1).
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /id="lp-prev"[^>]*aria-label="Previous slide"/, 'a labeled previous-slide button is present');
	assert.match(html, /id="lp-next"[^>]*aria-label="Next slide"/, 'a labeled next-slide button is present');
	assert.match(html, /prevBtn\.onclick=function\(\)\{t\.prev\(\);\}/, 'prev is wired to the shared transport');
	assert.match(html, /nextBtn\.onclick=function\(\)\{t\.next\(\);\}/, 'next is wired to the shared transport');
	assert.match(html, /prevBtn\.disabled=i===0/, 'prev disables at the first slide');
	assert.match(html, /nextBtn\.disabled=i===slides\.length-1/, 'next disables at the last slide');
});

test('the view-switcher tabs carry an icon + text label at tablet/desktop, icon-only (sr-only text) on phone', async () => {
	// Regression, three rounds on the same real-device loop: (1) "Read · Slides" /
	// "Read · Article" wrapped to two lines on a real iPhone, blowing out the bar's
	// height — "fixed" by hiding the text below 560px and showing icon-only. (2) That
	// regressed the OTHER way — the user wanted the label legible at every width, so
	// the bar compacted (smaller font/icon/padding) instead of dropping the text, both
	// surviving together. (3) On the real "Welcome to Lattice" seed deck at real phone
	// width, that compacted icon+text bar crowded the notes/fullscreen/mode controls
	// to within single-digit pixels of the viewport edge — visibly cramped, read as
	// "cut off." Icon-only on phone (<560px) is the durable fix: the text is NEVER
	// removed from the DOM (still a real child, still the accessible name via
	// aria-label) — only visually sr-only-clipped below 560px, so nothing regresses
	// for assistive tech, only sighted phone users get the tighter icon-only bar.
	// Tablet/desktop (≥560px) keep icon + visible text, unchanged from round (2).
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	for (const [v, label] of [['present', 'Present'], ['read-slides', 'Read · Slides'], ['read-article', 'Read · Article']]) {
		const btn = (html.match(new RegExp(`<button data-lp-btn="${v}"[^>]*>[\\s\\S]*?</button>`)) || [])[0];
		assert.ok(btn, `${v} button present`);
		assert.match(btn, new RegExp(`aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`), `${v} carries its own aria-label`);
		assert.match(btn, new RegExp(`class="lp-tab-text">${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<`), `${v}'s text label is real DOM content, not removed`);
	}
	assert.match(html, /class="lp-tab-icon"/, 'each tab carries an icon');
	assert.doesNotMatch(html, /lp-tab-text\{display:none\}/, 'the text label is sr-only clipped, never display:none (which some assistive tech also drops)');
	assert.match(html, /#lp-bar \.lp-tab-text\{position:absolute;width:1px;height:1px/, 'below 560px the tab text is visually clipped to icon-only, sr-only');
});

test('the fullscreen/notes/mode buttons use SVG icons, not emoji glyphs', async () => {
	// Regression: these three carried literal Unicode glyphs (notes "☰", fullscreen
	// "⛶", mode "☾"/"☀") — visually inconsistent with the SVG icon language used
	// everywhere else in the bar, and the mode glyph's swap changed the character's
	// intrinsic width, making the button visibly SHIFT size on toggle.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	for (const glyph of ['☰', '⛶', '☾', '☀']) assert.doesNotMatch(html, new RegExp(glyph), `no leftover "${glyph}" emoji glyph`);
	assert.match(html, /id="lp-notes-btn"[^>]*aria-label="Speaker notes"[^>]*><svg/, 'notes uses an SVG icon');
	assert.match(html, /id="lp-full"[^>]*aria-label="Toggle fullscreen"[^>]*><svg/, 'fullscreen uses an SVG icon');
	assert.match(html, /id="lp-mode"[^>]*aria-label="Toggle dark \/ light theme"[^>]*><svg/, 'mode uses an SVG icon');
});

test('dark/light mode swaps a fixed-size icon (never a shifting text glyph)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /var MOON_ICON=/, 'the moon icon is a stable var');
	assert.match(html, /var SUN_ICON=/, 'the sun icon is a stable var');
	assert.match(html, /function applyScheme\(\)\{root\.setAttribute\('data-lp-scheme',isDark\?'dark':'light'\)/, 'toggling drives a data-lp-scheme attribute (not the light-dark()-only color-scheme)');
	assert.match(html, /mode\.innerHTML=isDark\?SUN_ICON:MOON_ICON/, 'the icon swaps innerHTML, not textContent');
	// Both icon markups declare the SAME width/height, so the button's box never resizes.
	const moon = (html.match(/MOON_ICON='([^']*)'/) || [])[1] || '';
	const sun = (html.match(/SUN_ICON='([^']*)'/) || [])[1] || '';
	assert.match(moon, /width="16" height="16"/);
	assert.match(sun, /width="16" height="16"/);
});

test('dark/light mode seeds from the BAKED scheme (document fidelity), deferring to the OS only for system', async () => {
	// The toggle drives a data-lp-scheme ATTRIBUTE the export's CSS keys on — NOT the
	// CSS light-dark() function, which older in-app WebKit lacks (that was the whole
	// reason the toggle did nothing on the user's phone). isDark now seeds from the
	// scheme the EXPORT baked onto <html> (the author's light/dark/system choice), so a
	// shared file opens the way the sender made it: pinned dark → dark on a light-OS
	// device; only 'system' defers to matchMedia. color-scheme is set for native controls.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /var baked=root\.getAttribute\('data-lp-scheme'\)/, 'the effective mode reads the baked scheme attribute');
	assert.match(html, /var following=baked==='system'/, "a 'system' export live-follows the OS; a pinned export never does");
	assert.match(html, /var isDark=baked==='dark'\|\|\(following&&sysDark\(\)\)/, 'pinned dark → dark; following (system) → OS; pinned light → light');
	// CRUX of the on-device fix: ALWAYS stamp a CONCRETE attribute at load (even for system),
	// so dark tokens ride the reliable ATTRIBUTE selector, never the @media gate the user's
	// older WebKit ignored while matchMedia still read dark. applyScheme is called
	// unconditionally — NOT gated behind a `baked==='system'` branch that left it on @media.
	assert.match(html, /\napplyScheme\(\);\n/, 'the concrete scheme is stamped at load for every mode, driven by matchMedia — content never depends on the @media query');
	assert.doesNotMatch(html, /if\(baked==='system'\)\{/, 'no media-gated system branch remains (that left content on the unreliable @media query)');
	assert.match(html, /root\.style\.setProperty\('color-scheme',isDark\?'dark':'light'\)/, 'color-scheme is set via setProperty (cross-engine safe), for native controls');
	// While following, an OS change re-stamps the concrete attribute (guarded for old WebKit).
	assert.match(html, /if\(following&&window\.matchMedia\)\{try\{matchMedia\('\(prefers-color-scheme:dark\)'\)\.addEventListener\('change',function\(e\)\{if\(following\)\{isDark=e\.matches;applyScheme\(\);\}/, 'a system export re-stamps on an OS change while still following');
	assert.match(html, /if\(mode\)mode\.onclick=function\(\)\{following=false;isDark=!isDark;applyScheme\(\);\}/, 'one tap stops live-following and commits a concrete mode');
});

test('the baked scheme rides onto <html> from the authored mode (light default, dark/system honored)', async () => {
	// The author's document-fidelity choice — light | dark | system — is baked as the
	// data-lp-scheme attribute the player CSS + JS key on. An unset/unknown mode falls
	// back to 'light' (a shared deck without an explicit mode opens light, never surprise-dark).
	const light = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(light.html, /<html lang="en" data-lp-scheme="light">/, 'no mode → baked light');
	const dark = await buildPlayerHtml({ docHtml, source, now: 0, theme: { name: 't', mode: 'dark' } });
	assert.match(dark.html, /<html lang="en" data-lp-scheme="dark">/, 'theme.mode dark is baked');
	const system = await buildPlayerHtml({ docHtml, source, now: 0, theme: { name: 't', mode: 'system' } });
	assert.match(system.html, /<html lang="en" data-lp-scheme="system">/, 'theme.mode system is baked');
	// A standalone player has no host to inherit from, so `inherited` bakes as `system`.
	const inherited = await buildPlayerHtml({ docHtml, source, now: 0, theme: { name: 't', mode: 'inherited' } });
	assert.match(inherited.html, /<html lang="en" data-lp-scheme="system">/, 'theme.mode inherited bakes as system in a standalone player');
});

test('the export carries NO light-dark() and ships an explicit dark-mode block (works on WebKit < 17.5)', async () => {
	// The root cause of "color mode does not work" on the user's real phone: every theme
	// token is authored as `--t: light-dark(L, D)`, a CSS function that only exists on
	// Safari/WebKit 17.5+ (mid-2024). On an older in-app browser it is invalid → tokens
	// unset → the deck loses its colors AND the toggle (which only flipped color-scheme,
	// which nothing but light-dark() reads) is inert. themeDualMode resolves the pairs at
	// export time into a light base + an explicit dark override gated by a manual attribute
	// and a prefers-color-scheme media query — plain CSS supported for a decade. So the
	// SHIPPED file must contain no light-dark() in its styles, and must carry the dark block.
	// A fixture whose deck CSS carries light-dark() tokens the way a real theme does.
	const themed = docHtml.replace(
		'<style>section[data-lattice-slide]{color:red}@font-face{font-family:Playfair;src:url(\'fonts/playfair-400.woff2\')}</style>',
		'<style>:root{--bg:light-dark(#FFFFFF, #001D33);--accent:light-dark(var(--brand,#4338ca), #82C8E5)}section[data-lattice-slide]{background:var(--bg)}</style>',
	);
	const { html } = await buildPlayerHtml({ docHtml: themed, source, now: 0 });
	// Strip the inlined <script> (its comments legitimately mention the function name).
	const styleOnly = html.replace(/<script>[\s\S]*?<\/script>/gi, '');
	assert.doesNotMatch(styleOnly, /light-dark\(/, 'no shipped CSS depends on the light-dark() function');
	assert.match(html, /:root\[data-lp-scheme=dark\],:root\[data-lp-scheme=dark\] section\[data-lattice-slide\]\{--bg:#001D33;--accent:#82C8E5\}/, 'the manual-dark override carries the DARK arm on :root AND the slide sections');
	assert.match(html, /@media \(prefers-color-scheme:dark\)\{:root\[data-lp-scheme=system\],:root\[data-lp-scheme=system\] section\[data-lattice-slide\]\{--bg:#001D33/, 'the system-scheme rule follows the OS (keyed on =system, so a pinned export is never touched), with a space after @media for old parsers');
	// The light base kept the LIGHT arm (nested var() fallback comma respected).
	assert.match(html, /:root\{--bg:#FFFFFF;--accent:var\(--brand,#4338ca\)\}/, 'the base resolves each pair to its light arm, splitting on the TOP-LEVEL comma only');
});

test('fullscreen is feature-detected and the button hides when the API is unavailable', async () => {
	// iOS/iPadOS Safari has historically shipped no Fullscreen API for arbitrary
	// elements (only native video) — a click there silently no-oped forever, reading
	// as "broken." Hide the control entirely rather than leave a dead affordance.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /var canFullscreen=!!\(fsEl\.requestFullscreen\|\|fsEl\.webkitRequestFullscreen\)/, 'fullscreen support is feature-detected up front');
	assert.match(html, /if\(full&&!canFullscreen\)full\.style\.display='none'/, 'the button hides itself when unsupported');
});

test('the player is a flex column (bar + app) sized to the visible viewport (100svh)', async () => {
	// The player shell is a flex column at 100svh (small viewport = the visible area with
	// the browser chrome shown), so Present's stage is a flex child sized to real visible
	// space and centers correctly on a mobile in-app browser — no position:fixed, no
	// JS-measured height. 100vh is the pre-svh fallback. Scoped to .lp-js; the no-JS floor
	// keeps the old scrolling document.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /\.lp-js body\{display:flex;flex-direction:column;height:100vh;height:100svh;overflow:hidden\}/, 'the JS shell is a flex column at the visible viewport height');
	assert.match(html, /\.lp-js #lp-bar\{position:static;flex:none\}/, 'the bar is a flex child, not fixed, on the JS path');
	assert.match(html, /\.lp-js #lp-app\{flex:1;min-height:0;display:flex;flex-direction:column/, 'the app fills the rest of the column');
	// Read·Slides + Read·Article are the column's scrolling children (no bar-clearance
	// padding — the flex bar reserves its own space).
	assert.match(html, /\.lp-js \[data-lp-view=read-slides\] #lp-stage\{flex:1;min-height:0;overflow:auto\}/, 'read-slides scrolls internally below the flex bar');
	assert.match(html, /html:not\(\.lp-js\) #lp-stage\{padding-top:48px\}/, 'the base bar-clearance padding is scoped to the NO-JS floor only');
});

test('Present centers via a flex child (flex:1 + place-items:center), not position:fixed', async () => {
	// Regression: Present used a JS-measured `--lp-vh` height, then `position:fixed;bottom:0`
	// — both misbehaved on a mobile in-app browser (layout viewport taller than visible),
	// pushing the slide DOWN. It is now the flex column's growing child, so the browser
	// sizes it to real visible space and place-items:center centers in what the eye sees.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /\.lp-js \[data-lp-view=present\] #lp-stage\{flex:1;min-height:0;[^}]*place-items:center/, 'the present stage is a flex child that centers its slide');
	assert.doesNotMatch(html, /--lp-vh/, 'no JS-measured viewport-height variable');
	assert.doesNotMatch(html, /\[data-lp-view=present\] #lp-stage\{position:fixed/, 'the present stage is no longer position:fixed');
});

test('the player inlines the transport kernel and fits the FRAME to the measured stage box', async () => {
	// fit() measures the stage's own clientWidth/clientHeight and publishes the scale as a
	// CSS var (--lp-fit-present) that sizes the ACTIVE FRAME to the scaled footprint — so
	// place-items:center centers a box that FITS the stage at any height. (A fixed 720px
	// frame overflowed a short phone stage; grid top-aligned it and pushed the slide down.)
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /function fitScale\(/, 'the transport kernel is inlined into the player script');
	assert.match(html, /var st=lpEl\('lp-stage'\);if\(!st\)return/, 'fit measures the stage element directly');
	assert.match(html, /setProperty\('--lp-fit-present',fitScale\(\{stageW:st\.clientWidth,stageH:st\.clientHeight,slideW:1280,slideH:720,insetX:40,insetY:40\}\)\)/, 'the scale is published as a CSS var the frame sizes to');
	// The active frame + its section size to that var — the frame is the scaled footprint.
	assert.match(html, /\[data-lp-view=present\] \.lp-frame\.lp-active\{display:block;\s*width:calc\(1280px \* var\(--lp-fit-present,\.5\)\);height:calc\(720px \* var\(--lp-fit-present,\.5\)\)/, 'the active frame sizes to the scaled footprint, so it fits+centers at any stage height');
	assert.match(html, /createTransport\(\{count:slides\.length/, 'nav runs on the shared transport');
});

test('prev/next dock in a bottom nav row (#lp-nav), not over the slide', async () => {
	// The arrows moved from fixed side-overlays (which crowded the slide edges) into a
	// flex:none row BELOW the stage, so they never sit over slide content and the slide
	// keeps a symmetric centering box.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /<div id="lp-nav">\s*<button id="lp-prev"/, 'prev/next are wrapped in a bottom nav row');
	assert.match(html, /\.lp-js \[data-lp-view=present\] #lp-nav\{display:flex;flex:none;[^}]*justify-content:center/, 'the nav row is a centered flex row shown in present');
	assert.doesNotMatch(html, /#lp-prev\{left:/, 'the arrows are no longer edge-anchored side overlays');
});

test('Read·Slides frames the border + shadow on the .lp-frame, not the scaled section', async () => {
	// Regression: the border + shadow sat on the section, which is transform:scale(~.28),
	// so the 1px border shrank to a sub-pixel hairline and its outward shadow was clipped
	// away by the frame's overflow:hidden — a white slide on the white page had NO visible
	// boundary. On the UNSCALED frame the border is a true 1px and the shadow paints
	// outside the frame's own box (not clipped by its own overflow), so each slide reads as
	// a distinct card.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	const frameRule = (html.match(/\[data-lp-view=read-slides\] \.lp-frame\{[^}]*\}/) || [])[0] || '';
	assert.match(frameRule, /border:1px solid var\(--border/, 'the frame carries the 1px border');
	assert.match(frameRule, /box-shadow:0 10px 34px -14px/, 'the frame carries the card shadow');
	// flex:none is load-bearing: #lp-stage is a flex COLUMN, so without it each fixed-height
	// frame would flex-shrink to fit the stage — squishing the frame while the scaled section
	// stays full height and overflows (clipped). flex:none keeps the height; the stage scrolls.
	assert.match(frameRule, /\.lp-frame\{flex:none;/, 'the frame does not shrink (the stage scrolls instead of squishing the slides)');
	const secRule = (html.match(/\[data-lp-view=read-slides\] section\[data-lattice-slide\]\{[^}]*\}/) || [])[0] || '';
	assert.doesNotMatch(secRule, /box-shadow/, 'the scaled section no longer carries the (clipped, sub-pixel) shadow/border');
});

test('present mode ships a speaker-notes sheet reading the baked asides (P3d)', async () => {
	// The player's docHtml carries a hidden aside.lattice-notes per slide (materialized
	// by the emulator). The sheet reads THAT — it creates no new note copy.
	const withNote = docHtml.replace(
		'<h1>Deck</h1>',
		'<h1>Deck</h1><aside class="lattice-notes" hidden data-slide="1">Pause and breathe.</aside>',
	);
	const { html } = await buildPlayerHtml({ docHtml: withNote, source, now: 0 });
	assert.match(html, /id="lp-notes-btn"/, 'the notes toggle control is present');
	assert.match(html, /id="lp-notes"/, 'the notes sheet shell is present');
	assert.match(html, /aside\.lattice-notes/, 'the sheet reads the existing note aside (no new copy)');
	assert.match(html, /toggleNotes/, 'the sheet has toggle wiring');
	assert.match(html, /Pause and breathe\./, 'the note aside rides in the baked DOM');
});

test('the player ships the Marp-equivalent chrome CSS (pagination + notes hide + sr-only description), not just the CLI docHtml', async () => {
	// Regression: the CLI's own docHtml bakes in a marpSystemCss block (pagination
	// content:attr(), aside.lattice-notes{display:none}, .lattice-description sr-only) —
	// but the Studio's browser-built docHtml (share-export.ts's buildSelfContainedDoc)
	// never included it. A Studio-exported deck carrying a `describe:` comment shipped
	// its accessible-description <p> fully VISIBLE — an extra, unstyled paragraph
	// duplicating the slide's own heading/body text, in Present AND Read Article — and
	// every deck's page-number span had no content:attr() binding to read from. Landing
	// this CSS in the ONE shared assembler (player-core.mjs's playerCss) closes the gap
	// for every host, CLI included, instead of leaving the CLI's copy as the only one.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /section\[data-lattice-pagination\]::after\{content:attr\(data-lattice-pagination\)\}/, 'page numbers render even when the host docHtml carries no pagination CSS of its own');
	assert.match(html, /aside\.lattice-notes\{display:none!important\}/, 'speaker-note asides stay hidden regardless of host docHtml');
	assert.match(html, /\.lattice-description\{position:absolute!important/, 'the accessible description is sr-only, never a visible extra paragraph on the slide');
});

test('present mode ships swipe, fullscreen, and flex-child viewport fill (P3c)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /function swipeAction\(/, 'the swipe kernel is inlined');
	assert.match(html, /pointerdown/, 'the stage is wired for touch/swipe');
	assert.match(html, /swipeAction\(\{dx:/, 'a decisive horizontal drag turns the slide');
	assert.match(html, /id="lp-full"/, 'the fullscreen control is present');
	assert.match(html, /requestFullscreen/, 'fullscreen is wired (feature-detected)');
	// The present stage fills the flex column (flex:1) and centers — the browser sizes the
	// box to real visible space (100svh column − bar), not a JS-measured height. A mobile
	// in-app browser reports a layout height taller than the visible area, which is why the
	// old JS/fixed approaches pushed the centered slide DOWN (the reported "not centered").
	assert.match(html, /\.lp-js \[data-lp-view=present\] #lp-stage\{flex:1;min-height:0/, 'the present stage fills the flex column');
	assert.doesNotMatch(html, /--lp-vh/, 'the fragile JS viewport-height variable is gone entirely');
	assert.doesNotMatch(html, /function setStageHeight/, 'no JS viewport-height measurement remains');
	assert.match(html, /place-items:center;justify-content:center/, 'the oversized slide is centered in the flex stage box');
	assert.match(html, /addEventListener\('orientationchange',onResize\)/, 'the fit re-runs on orientation change');
	assert.match(html, /function onResize\(\)\{fit\(\);fitRead\(\);\}/, 'onResize just refits (present via fit, read-slides via fitRead) — no viewport remeasure');
});

test('the inlined transport kernel binds STABLE names (survives a minifying bundler)', async () => {
	// Regression: the kernel was inlined as bare `${createTransport.toString()}` — a
	// `function createTransport(){…}` DECLARATION. That works unminified (CLI), but the
	// docs-site PRODUCTION build minifies player-core and renames the module functions
	// (createTransport→Q, keyAction→G, PRESENT_KEYMAP→P). Their `.toString()` then no
	// longer declares the name the player code calls, so the Studio-exported player threw
	// `createTransport is not defined`, stripped `.lp-js`, and showed only the no-JS floor
	// on every browser. Binding to a fixed `var` decouples the call sites from the emitted
	// function name; passing the keymap explicitly avoids keyAction's renamed default.
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	for (const name of ['createTransport', 'fitScale', 'keyAction', 'swipeAction']) {
		assert.match(html, new RegExp(`var ${name}=`), `${name} is bound to a stable var, not a bare declaration`);
	}
	assert.match(html, /keyAction\(e\.key,PRESENT_KEYMAP\)/, 'the keymap is passed explicitly so the renamed default is never evaluated');
});

test('slides keep display:flex in every view so vertical centering survives (no "content rides high")', async () => {
	// Regression: the player views once forced `display:block` on the section, which
	// overrode the engine's base `section{display:flex;flex-direction:column}`. That made
	// `section.title{justify-content:center}` inert, so a cover slide's content flowed to
	// the TOP instead of centering — the "content rides high" / "title slide tiny" bug seen
	// on a real iPhone. Present must re-show the active slide as flex; read-slides + the
	// no-JS floor must NOT re-assert block (they inherit base flex).
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.doesNotMatch(html, /\[data-lp-view=read-slides\] section\[data-lattice-slide\]\{[^}]*display:block/, 'read-slides never forces block (keeps base flex)');
	assert.doesNotMatch(html, /html:not\(\.lp-js\) section\[data-lattice-slide\]\{[^}]*display:block/, 'the no-JS floor never forces block (keeps base flex)');
});

test('read-slides + the no-JS floor scale each slide with a wrapped transform, never CSS zoom', async () => {
	// Regression: switching Read·Slides + the no-JS floor to CSS `zoom` (to collapse the
	// layout footprint the way `transform` doesn't) reintroduced a KNOWN, previously
	// REJECTED bug: iOS WebKit does not re-resolve `container-type:size` + cqi/cqh — the
	// engine's whole typography/spacing scale — against a zoom-scaled container, so cqi
	// collapses to near-zero and the type renders illegibly tiny. Confirmed on a real
	// iPhone (engineering/gotchas.md "Preview slides collapse … CSS zoom", decision doc
	// 2026-07-02-preview-scale-zoom.md, REJECTED — headless Chromium cannot reproduce this,
	// so it silently looked fine in every CI gate). Fix: each slide is wrapped in a
	// `.lp-frame` sized to the SCALED footprint (so the flex column still packs tight
	// without zoom's layout-collapse), and the section inside is scaled with `transform`
	// (immune — cqi resolves once against its own intrinsic 1280x720 box).
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.doesNotMatch(html, /zoom:/, 'no view scales with CSS zoom (WebKit cqi/cqh collapse)');
	assert.match(html, /class="lp-frame"/, 'every slide is wrapped in a sizeable .lp-frame');
	assert.match(html, /\[data-lp-view=read-slides\] \.lp-frame\{flex:none;width:calc\(1280px \* var\(--lp-fit,\.28\)\)/, 'the frame carries the scaled footprint so the flex gap packs tight');
	assert.match(html, /\[data-lp-view=read-slides\] section\[data-lattice-slide\]\{width:1280px!important;height:720px!important;transform:scale\(var\(--lp-fit,\.28\)\);transform-origin:0 0/, 'read-slides scales the native canvas with transform, not zoom');
	assert.match(html, /html:not\(\.lp-js\) \.lp-frame\{width:calc\(1280px \* var\(--lp-fit\)\)/, 'the no-JS floor frame also carries the scaled footprint');
	assert.match(html, /html:not\(\.lp-js\) section\[data-lattice-slide\]\{width:1280px!important;height:720px!important;transform:scale\(var\(--lp-fit\)\)/, 'the no-JS floor scales with transform, not zoom');
	assert.match(html, /function fitRead\(\)/, 'the script fits the read-slides miniatures fluidly to the column');
	assert.match(html, /var frames=\[\]\.slice\.call\(document\.querySelectorAll\('\.lp-frame'\)\)/, 'present toggles visibility on the frame wrapper, not the section');
});

// ── the deck's own canvas reaches the player (#1577) ─────────────────────────
//
// The player hardcoded 1280x720 in nine places, so a deck declaring any other `size:` was laid
// out by the engine for its real canvas — the type scale rides `--_sec-1cqi`, derived from that
// canvas — and then forced into an HD box. A 4K deck rendered every token at 3x: headings over
// body copy, slides cut off mid-word. Silently, because the same run's PDF was correct. 35 of
// the committed decks that declare a `size:` reproduce it.
//
// The geometry is THREADED from the host rather than derived from the document: both hosts
// already resolve it, and parsing it back out of our own emitted CSS would mean reading two
// different shapes with no rule at all in some fixtures.

test('a non-default canvas reaches every sizing site in the player CSS (#1577)', async () => {
	const css = playerCss(false, false, { w: 3840, h: 2160 });
	// Present frame + slide, read-slides frame + slide, and the no-JS floor: five sites, and a
	// miss in any one of them is a differently-broken deck rather than a smaller bug.
	assert.match(css, /\.lp-frame\.lp-active\{[^}]*width:calc\(3840px \* var\(--lp-fit-present/, 'present frame');
	assert.match(css, /\.lp-frame\.lp-active section\[data-lattice-slide\]\{width:3840px!important;height:2160px!important/, 'present slide');
	assert.match(css, /\[data-lp-view=read-slides\] \.lp-frame\{flex:none;width:calc\(3840px \*/, 'read-slides frame');
	assert.match(css, /\[data-lp-view=read-slides\] section\[data-lattice-slide\]\{width:3840px!important;height:2160px!important/, 'read-slides slide');
	assert.match(css, /html:not\(\.lp-js\) section\[data-lattice-slide\]\{width:3840px!important;height:2160px!important/, 'no-JS floor slide');
	assert.doesNotMatch(css, /1280px!important/, 'no HD literal survives for a 4K deck');
});

test('the fit math divides by the deck canvas, not by 1280x720 (#1577)', async () => {
	const js = await playerJs('', null, false, { w: 1080, h: 1920 });
	assert.match(js, /slideW:1080,slideH:1920,insetX:40,insetY:40/, 'present fit');
	assert.match(js, /slideW:1080,slideH:1920,insetX:40,insetY:0/, 'read-slides fit');
	assert.doesNotMatch(js, /slideW:1280/, 'no HD divisor survives');
});

test("the no-JS floor's scale ladder follows the canvas, keeping the frame the same width", async () => {
	// The ladder shipped as fixed fractions of 1280 — a literal no find-and-replace over "1280"
	// would catch, because the number is not there. Unscaled, a 1080-wide story deck sits 778px
	// wide at the top rung instead of 922. The floor is a scrolling column, so the width is what
	// matters and the fraction is derived from it.
	const hd = playerCss(false, false);
	const story = playerCss(false, false, { w: 1080, h: 1920 });
	// ALL FOUR RUNGS, from the module — not just rung 0, and not literal arithmetic. An earlier
	// version of this cell asserted `Math.abs(1080*0.3319 - 1280*0.28) < 1`, which references
	// nothing under test and cannot fail for any edit: it documented the reasoning instead of
	// gating it. Corrupting any of the upper three rungs was invisible to the whole suite.
	const rungs = (css) => [...css.matchAll(/--lp-fit:(\.\d+)\}/g)].map((m) => Number.parseFloat(m[1]));
	const hdRungs = rungs(hd);
	const storyRungs = rungs(story);
	assert.deepEqual(hdRungs, [0.28, 0.4, 0.56, 0.72], 'an HD deck keeps the historical literals');
	assert.equal(storyRungs.length, 4, 'a non-default canvas still emits four rungs');
	// Each rung must put the frame at the SAME physical width as the HD deck's — that is what
	// the ladder means, and it is the property the derivation exists to preserve.
	storyRungs.forEach((r, i) => {
		assert.ok(Math.abs(1080 * r - 1280 * hdRungs[i]) < 1, `rung ${i}: 1080×${r} should match HD's 1280×${hdRungs[i]}`);
	});
});

test('the HD literals and the derived ladder cannot drift apart', () => {
	// Two arrays state the same ladder — the target widths and the byte-frozen HD literals — and
	// nothing made them agree. Re-tune one and the other silently disagrees, and because the
	// HD path takes the literal branch, no default export ever exercises the derived code.
	const derivedAtHd = playerCss(false, false, { w: 1280, h: 720 });
	const asIfNotHd = playerCss(false, false, { w: 1280.0001, h: 720 });
	const rungs = (css) => [...css.matchAll(/--lp-fit:(\.?\d*\.?\d+)\}/g)].map((m) => Number.parseFloat(m[1]));
	rungs(derivedAtHd).forEach((r, i) => {
		assert.ok(Math.abs(r - rungs(asIfNotHd)[i]) < 0.0002, `rung ${i}: the literal and the derivation disagree`);
	});
});

test('the canvas is taken from the host, DERIVED from the document, then defaulted (#1577)', () => {
	// Threading alone left the defect armed for any caller outside this repo — `lib/*` is a
	// published export, and the Tauri wrapper calls this from another tree. Each route is pinned
	// because each one silently produced a wrong-but-plausible player before.
	const doc = '<style>section{--_sec-1cqi:10.800px;--_sec-1cqh:19.200px}</style>';
	assert.deepEqual(resolveCanvas({ width: 3840, height: 2160, docHtml: doc }), { w: 3840, h: 2160 }, 'the host wins when it speaks');
	assert.deepEqual(resolveCanvas({ docHtml: doc }), { w: 1080, h: 1920 }, 'the document is read when it does not');
	// The CSS-string shape is what the engine's own resolveSize returns; a host wiring the
	// obvious object used to get a silent 1280x720.
	assert.deepEqual(resolveCanvas({ width: '1080px', height: '1920px', docHtml: doc }), { w: 1080, h: 1920 }, 'a CSS-string geometry falls through rather than defaulting');
	// One axis is worse than none: it asserts an aspect nobody stated and clips every slide.
	assert.deepEqual(resolveCanvas({ width: 1080, docHtml: doc }), { w: 1080, h: 1920 }, 'a half-stated geometry is not half-applied');
	assert.deepEqual(resolveCanvas({}), { w: 1280, h: 720 }, 'and only then the historical default');
});

test('a deck with NO declared size is byte-identical — the fallback is the historical canvas', async () => {
	// The whole class of decks that worked before this existed must not move a byte, which is
	// what lets the frozen-artifact golden stay put. Omitting the geometry is a supported call:
	// third-party callers and fixtures rely on it, so it defaults rather than throwing.
	const withOut = await buildPlayerHtml({ docHtml, source, now: 0, build: 'X', playerVersion: 'X' });
	const withHd = await buildPlayerHtml({ docHtml, source, now: 0, build: 'X', playerVersion: 'X', width: 1280, height: 720 });
	assert.equal(withOut.html, withHd.html, 'omitting the canvas is the same as passing the default');
});

test('assemblePlayer threads a declared canvas end to end (#1577)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0, width: 1080, height: 1350 });
	assert.match(html, /width:1080px!important;height:1350px!important/, 'the CSS carries the portrait canvas');
	assert.match(html, /slideW:1080,slideH:1350/, 'and so does the fit math');
});

test('Read·Slides is unified onto Present\'s frame, with a floating Home/End overlay + Present mouse wheel', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	// fitRead now uses the SAME fitScale as Present (over ~86% of the stage height) so the
	// first slide matches Present and the next peeks — NOT the old fill-the-width math.
	assert.match(html, /function fitRead\(\)\{var st=lpEl\('lp-stage'\);if\(!st\)return;[\s\S]*?fitScale\(\{stageW:st\.clientWidth,stageH:st\.clientHeight\*0\.86,slideW:1280,slideH:720,insetX:40,insetY:0\}\)/, 'read-slides fits to Present\'s footprint (86% height, 40px inset), reserving a peek');
	assert.doesNotMatch(html, /avail\/1280/, 'the old fill-the-width read-slides fit is gone');
	// The floating Home/End overlay: markup, view-scoped CSS, and the smooth-scroll handlers.
	assert.match(html, /<div id="lp-read-nav">/, 'the floating read-slides nav is in the markup');
	assert.match(html, /<button id="lp-top"[^>]*aria-label="Jump to first slide"/, 'a Home (top) button');
	assert.match(html, /<button id="lp-bottom"[^>]*aria-label="Jump to last slide"/, 'an End (bottom) button');
	assert.match(html, /\.lp-js \[data-lp-view=read-slides\] #lp-read-nav\{[^}]*position:absolute;right:calc\(16px \+ env\(safe-area-inset-right,0px\)\);bottom:calc\(16px \+ env\(safe-area-inset-bottom,0px\)\)/, 'the overlay is absolute bottom-right with SAFE-AREA insets, only in read-slides — the scroll flow is unobstructed');
	assert.match(html, /if\(topBtn\)topBtn\.onclick=function\(\)\{scrollStage\(0\);\}/, 'Home scrolls the stage to the top');
	assert.match(html, /if\(bottomBtn\)bottomBtn\.onclick=function\(\)\{var st=lpEl\('lp-stage'\);if\(st\)scrollStage\(st\.scrollHeight\);\}/, 'End scrolls the stage to the bottom');
	// AUTO-HIDE: starts hidden (opacity:0), reveals on scroll (.lp-show), idle-hides after
	// 1.5s, and each button hides via the `hidden` attr when its direction isn't actionable.
	assert.match(html, /\.lp-js \[data-lp-view=read-slides\] #lp-read-nav\{[^}]*opacity:0;transform:translateY\(6px\);pointer-events:none/, 'the overlay starts hidden (fades in on reveal)');
	assert.match(html, /#lp-read-nav\.lp-show\{opacity:1;transform:none;pointer-events:auto\}/, '.lp-show reveals it');
	assert.match(html, /#lp-top\[hidden\],#lp-bottom\[hidden\]\{display:none\}/, 'a button hides when its edge is reached');
	assert.match(html, /@media\(prefers-reduced-motion:reduce\)\{\.lp-js \[data-lp-view=read-slides\] #lp-read-nav\{transition:none/, 'reduced-motion snaps visibility');
	assert.match(html, /rStage\.addEventListener\('scroll',revealReadNav,\{passive:true\}\)/, 'scrolling reveals the control');
	// iOS/in-app WebKit coalesces the overflow container's scroll event during momentum, so
	// touch-drag never fired the reveal on mobile — touchstart/touchmove drive it reliably
	// (touchstart also = tap-to-summon). Regression guard for "auto reveal not working on mobile".
	assert.match(html, /rStage\.addEventListener\('touchstart',revealReadNav,\{passive:true\}\)/, 'touch (and a plain tap) reveals the control on mobile');
	assert.match(html, /rStage\.addEventListener\('touchmove',revealReadNav,\{passive:true\}\)/, 'a touch-drag scroll reveals the control on mobile');
	assert.match(html, /if\(navIdle\)clearTimeout\(navIdle\);if\(!navEngaged\)navIdle=setTimeout\(hideReadNav,1500\)/, 'it idle-hides after 1.5s unless engaged');
	// Present mouse wheel — one decisive notch = one slide (debounced), present-only.
	assert.match(html, /addEventListener\('wheel',function\(e\)\{if\(view!=='present'\)return;[\s\S]*?if\(wheelBusy\)return;[\s\S]*?t\[d>0\?'next':'prev'\]\(\);e\.preventDefault\(\);\},\{passive:false\}\)/, 'present advances/reverses on a decisive wheel delta, debounced, present-only');
	// A TRACKPAD PINCH arrives as ctrl+wheel and must be declined BEFORE the debounce, and
	// without preventDefault so the browser zooms instead (#1558's trackpad arm — the Studio
	// got this in #1555 and the player did not).
	assert.match(html, /if\(e\.ctrlKey\|\|e\.metaKey\)return;/, 'a trackpad pinch is not a wheel notch');
});

test('fileToDataUri returns null for a missing file (feeds the honesty report)', () => {
	assert.equal(fileToDataUri('/no/such/file.png'), null);
});

test('a runtime-inflated file:// <script> is REPORTED as stripped, not counted as an image', async () => {
	// Finding 1 regression: the script strip must run BEFORE image inlining, else the
	// script's file:// src gets data-URI'd and the honesty report silently lies.
	const withRuntime = docHtml.replace(
		'</body>',
		'<script src="file:///some/state-chart-runtime.js"></script></body>',
	);
	const { html, report } = await buildPlayerHtml({ docHtml: withRuntime, source, now: 0 });
	assert.equal(report.strippedScripts.length, 1, 'the runtime script is reported');
	assert.match(report.strippedScripts[0], /state-chart-runtime\.js/);
	assert.equal(report.images, 1, 'still exactly one real image — the script is not miscounted');
	assert.doesNotMatch(html, /state-chart-runtime/, 'the runtime script is gone from the output');
});

test('sanitizing at the section level also cleans the section element attributes', async () => {
	// Finding 2: an on* handler on the <section> itself must be stripped (outerHTML
	// sanitize), not survive because only innerHTML was cleaned.
	const evilSection = docHtml.replace(
		'<section data-lattice-slide="1" id="1" class="title">',
		'<section data-lattice-slide="1" id="1" class="title" onmouseover="steal()">',
	);
	const { html } = await buildPlayerHtml({ docHtml: evilSection, source, now: 0 });
	assert.doesNotMatch(html, /onmouseover/i, 'a handler on the section element is stripped');
});

// ── frozen-artifact golden ────────────────────────────────────────────────────
// The player is a FROZEN, shared artifact and its assembler is refactored across
// slices (player-core extraction, prune-kernel extraction). The property tests above
// each pin ONE aspect; this pins the WHOLE output byte-for-byte for a fixed, external-
// file-free fixture at now:0, so any unintended byte drift (attribute order, block
// order, whitespace, report shape) fails loudly and forces intent. Re-bless ONLY with
// a deliberate player change: update the sha in the SAME commit and say why.
test('the assembled player is byte-for-byte stable (frozen-artifact golden)', async () => {
	const goldenDoc = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Golden</title>
<style id="lattice-embedded-fonts">@font-face{font-family:X;src:url(data:font/woff2;base64,AA)}</style>
<style>section[data-lattice-slide]{color:red}.unused-x{color:blue}</style>
</head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>Golden deck</h1><aside class="lattice-notes" hidden data-slide="1">A note.</aside><p>Body.</p></section>
<section data-lattice-slide="2" id="2" class="content"><h2>Two</h2><ul><li>a</li></ul></section>
</body></html>`;
	const goldenSource = '---\ntheme: indaco\n---\n\n# Golden deck\n\nBody.\n';
	const { html } = await buildPlayerHtml({ docHtml: goldenDoc, source: goldenSource, title: 'Golden', now: 0, build: 'GOLDEN', playerVersion: 'GOLDEN' });
	const sha = crypto.createHash('sha256').update(html, 'utf8').digest('hex');
	// Re-blessed for the live FLOW-HEIGHT charts in Read·Article: the article CSS gained the
	// Re-blessed for the player's LANDMARK skeleton (semantic-html ADR §15.1, §17.3). Four
	// deliberate edits, and nothing else moved — verified by diffing the assembled output:
	//   · `div#lp-app` → `main#lp-app` — the player discards the deck container, so §4A's
	//     deck-level landmark does not survive into it; the shell has to supply its own. It
	//     wraps all three views, so the `main` is stable as the view switches.
	//   · `nav#lp-toc` gains `aria-label="Slides"` — it was a NAMELESS landmark, which §8-#3
	//     bars: a screen reader could reach it but not say what it was.
	//   · `#lp-count` gains `aria-live="polite"` and a spelled-out `aria-label` ("Slide 2 of
	//     7") set alongside the visible "2 / 7" — gap G3. The visible text is unchanged.
	// Re-blessed AGAIN for the ARIA best-practice pass: the player's 12 decorative chrome
	// icons (the inline 24x24 viewBox SVGs in the tab bar, nav arrows and toggles) gained
	// `aria-hidden="true" focusable="false"`. Their buttons already carry aria-labels, so
	// the icons never corrupted an accessible NAME — but an un-hidden inline SVG can still
	// surface in an AT graphics rotor as noise, and `focusable="false"` keeps legacy
	// engines from tabbing into them. Attribute-only: no CSS, no layout, no script.
	// Re-blessed AGAIN for the G10 follow-up: `#lp-bar` is now a `<header>` (axe's `region`
	// rule caught the deck TITLE sitting outside every landmark, so a screen reader
	// navigating by landmark skipped the one string naming the deck), and every
	// `role="img"` chart svg now references its own `<title>`/`<desc>` by id
	// (`aria-labelledby`/`aria-describedby`) instead of relying on a bare child `<title>`,
	// which VoiceOver/Safari and older JAWS drop. Tag + attribute only — `#lp-bar` is
	// styled by id, so the retag costs no CSS, no layout and no script.
	// Re-blessed for the adversarial-review round: `#lp-count` splits into a visible,
	// aria-hidden numeral plus an sr-only live region carrying "Slide N of M". The prior
	// shape put `aria-label` on a bare <span> (role `generic`), where ARIA prohibits it —
	// and a live region announces its changed TEXT, not its name, so a screen reader got
	// "2 / 7" regardless. Adds one <span> + one sr-only rule; the visible counter is
	// unchanged. Re-hosted charts in the Read view also get suffixed ids so the clone
	// stops duplicating the originals' ARIA-referenced ids (axe duplicate-id-aria).
	// The sr-only rule uses `clip-path: inset(50%)` rather than the classic
	// `clip` + `margin:-1px` pair: the box is already out of flow, so the negative margin
	// buys nothing, and HARD RULE #20 keeps margins out of this engine's CSS on principle
	// (this file is not in the gate's scan path, which is not a reason to write one).
	// A pure-attribute + tag change plus that one hidden-utility rule: no layout, no
	// script behaviour. Deliberate.
	// (Prior bless: the `.lp-chart` width-container rules for flow-height chart re-hosts.)
	// Re-blessed for #1462 item 3 — the player now resolves ALL of its chrome through one
	// scoped `lpEl(id)` helper instead of bare `getElementById`. The document body IS deck
	// content and `id` survives sanitization, so a slide carrying `id="lp-next"` won tree
	// order and left the shipped Next button with no handler at all (observed on a real
	// exported artifact; keyboard nav still worked, so nothing looked wrong until someone
	// clicked it). Every real chrome node sits on a direct-child chain from `#lp-bar` or
	// `#lp-app`, while authored content is always a descendant of `#lp-stage` — so a child
	// combinator is a boundary a deck structurally cannot cross. Script-only: adds the
	// CHROME map plus the helper, rewrites 21 lookups and roots the `#lp-toc a` /
	// `#lp-article [id^=lp-sec-]` collection queries at the resolved element. No markup, no
	// CSS, no layout. Re-blessed AGAIN in the same PR: scoping the SELECTOR was not enough. The
	// adversarial trio broke it before merge — a descendant selector matches a chain a slide
	// builds itself, so twelve lookups still resolved to deck content. The lookups are now
	// ANCHORED at roots resolved via `body > #lp-app` / `body > #lp-bar`, which a slide can
	// never be a child of, and queried relative to those with `:scope`. Script-only.
	// Re-blessed for #1558 — the present stage's swipe rule now COUNTS THE FINGERS. A
	// two-finger pinch used to turn the slide, and worse than on the Studio surfaces this
	// mirrors: being pointer-based, the second finger's pointerdown overwrote the single
	// sx/sy, so the first finger's pointerup was measured against the OTHER finger's start —
	// a dx of roughly the whole inter-finger span, the strongest swipe signal there is.
	// #lp-stage carries touch-action:none, so the browser's own pinch-zoom was suppressed too
	// and the gesture did the wrong thing instead of the right one. Script-only: a pointer-id
	// list plus a pinch flag, a window-level release for contacts that end off the stage, and
	// a pointercancel handler. No markup, no CSS, no layout, and the one-finger swipe, the
	// keyboard and every control behave exactly as before. Signed off with a demo deck
	// exported in both schemes per CLAUDE.md's export gate.
	// Re-blessed AGAIN in the same PR, after the adversarial trio: counting contacts on the
	// STAGE left the player's own chrome (#lp-bar above, #lp-nav below — 119px, 14% of a phone
	// screen) outside the count, so a pinch with one finger there counted as ONE contact and
	// still turned the deck, at every width. Contacts are counted on the WINDOW now, plus an
	// e.isPrimary re-sync so a release the platform eats cannot latch the guard. Still
	// script-only.
	// Re-blessed a THIRD time, after a second trio round found three things wrong with that:
	// (1) a TRACKPAD pinch still turned the deck on every laptop — it arrives as ctrl+wheel,
	// which no finger count can see, so the wheel handler now declines it (and does NOT
	// preventDefault, so the browser zooms instead); (2) the re-sync was type-blind, and
	// isPrimary is per pointer type — a mouse click or stylus tap wiped fingers that were still
	// down and re-armed the very cross-contact measurement this change exists to kill; (3) the
	// guard had three overlapping reads, none individually killable by a mutation, so it was
	// reshaped to one. Script-only throughout: no markup, no CSS, no layout.
	assert.equal(sha, 'c65687ef2d960de2ea2c90c99c1e4c9fb5fb48d345bd831d45259b29794bb2d1', 'player bytes moved — if intentional, re-bless this sha in the same commit and say why');
});

test('generic article-table chrome is scoped away from chart re-hosts (.lp-chart)', async () => {
	// A flow-height chart re-host (roadmap) OWNS its table look via its figure-broadened component
	// CSS. The generic `#lp-article td` chrome is ID-specific (1,1,1) and would otherwise BEAT the
	// component's class-level (0,1,2) cell rules — zeroing roadmap's grid hairlines, cell padding,
	// and first-column accent stripe. The `:not(.lp-chart *)` guard keeps it off chart tables so the
	// component styling is the sole source. Locks the fix so the ID-specificity trap can't silently
	// return (a runtime cascade bug the byte-golden + jsdom tests can't otherwise catch).
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	assert.match(html, /#lp-article td:not\(\.lp-chart \*\)\{border:/, 'generic td chrome is scoped out of .lp-chart');
	assert.doesNotMatch(html, /#lp-article th,#lp-article td\{border:1px/, 'no UNscoped generic td border rule (would override chart cells)');
});

test.after(() => {
	try {
		fs.unlinkSync(tmpSvg);
	} catch {}
});

// ── size levers: CSS minify + font subset ────────────────────────────────────

test('minifyCss strips comments + whitespace but preserves strings, url(), calc, combinators', () => {
	assert.equal(minifyCss('/* c */ a { color : red ; }'), 'a{color:red}');
	assert.equal(minifyCss('b{width:calc(1px + 2px)}'), 'b{width:calc(1px + 2px)}', 'calc spaces kept');
	assert.equal(minifyCss('c::before{content:"a  b"}'), 'c::before{content:"a  b"}', 'string spaces kept');
	assert.equal(minifyCss('d > e ~ f + g{x:1}'), 'd > e ~ f + g{x:1}', 'combinator spaces kept');
	assert.equal(minifyCss('h{background:url(  x.svg  )}'), 'h{background:url(  x.svg  )}', 'url() untouched');
	// A literal U+E000 in the input must be stripped, never mistaken for the internal
	// stash sentinel (else it would swap in a stashed string / "undefined"). U+E000 is a
	// Private-Use char absent from real CSS; this guards the pathological deck-authored case.
	assert.equal(minifyCss('a{content:"0"}'), 'a{content:"0"}', 'a literal U+E000 sentinel char is stripped from input');
	assert.doesNotMatch(minifyCss('a{x:1}'), //, 'no U+E000 survives into the output');
	assert.ok(!minifyCss('/* x */a{b:1}').includes(String.fromCodePoint(0xe000)), 'no sentinel leftover');
	// Regression: an apostrophe INSIDE a comment must not be read as a string delimiter
	// and swallow the following rule. (Protect-before-strip deleted half of lattice.css.)
	assert.equal(minifyCss("/* it's */ .a{x:1} /* don't */ .b{y:2}"), '.a{x:1}.b{y:2}', 'comment apostrophes do not eat rules');
	// And a `/*` inside a real string must NOT be stripped as a comment.
	assert.equal(minifyCss('a::before{content:"/* not a comment */"}'), 'a::before{content:"/* not a comment */"}', 'comment-like string literal survives');
});

test('minifyCss on the REAL lattice.css matches the build minifier (no rules dropped)', () => {
	// The blocker the checker caught: minifyCss must not silently delete rules from the
	// actual ~955 KB lattice.css the player inlines. Pin token/brace parity vs the build's
	// own dist/lattice.min.css so a protect-before-strip regression can never ship again.
	const cssPath = path.join(__dirname, '..', '..', '..', 'dist', 'lattice.css');
	const refPath = path.join(__dirname, '..', '..', '..', 'dist', 'lattice.min.css');
	if (!fs.existsSync(cssPath) || !fs.existsSync(refPath)) return; // dist not built in this env
	const min = minifyCss(fs.readFileSync(cssPath, 'utf8'));
	const ref = fs.readFileSync(refPath, 'utf8');
	const open = (min.match(/\{/g) || []).length;
	const close = (min.match(/\}/g) || []).length;
	assert.equal(open, close, 'braces stay balanced');
	assert.ok(!min.includes(String.fromCodePoint(0xe000)), 'no stray sentinel in the shipped CSS');
	const count = (s, tok) => s.split(tok).length - 1;
	for (const tok of ['--fs-', '@font-face', 'aspect-ratio']) {
		assert.equal(count(min, tok), count(ref, tok), `${tok} count matches the build minifier`);
	}
});

test('the player inlines MINIFIED css — no block comments survive (the biggest size lever)', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	// The engine inlines unminified lattice.css (1600+ comments); the player must strip them.
	assert.equal((html.match(/\/\*/g) || []).length, 0, 'no CSS block comments in the shipped player');
});

test('subsetEmbeddedFonts shrinks each embedded face to valid, smaller woff2 (optional dep)', async () => {
	// Build a tiny doc with one real embedded face (base64), then subset it.
	const face = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dist', 'fonts', 'outfit-400.woff2'));
	const b64 = face.toString('base64');
	const doc = `<html><head><style id="lattice-embedded-fonts">@font-face{font-family:'Outfit';src:url(data:font/woff2;base64,${b64}) format('woff2')}</style></head><body><p>Hello 123 — the quick fox.</p></body></html>`;
	const { html, applied, saved } = await subsetEmbeddedFonts(doc);
	assert.equal(applied, true, 'subset-font is installed → subsetting applies');
	assert.ok(saved > 0, 'the face got smaller');
	const outB64 = (html.match(/data:font\/woff2;base64,([A-Za-z0-9+/=]+)/) || [])[1];
	assert.ok(outB64.length < b64.length, 'shipped face is smaller than the source face');
	assert.equal(Buffer.from(outB64, 'base64').slice(0, 4).toString('hex'), '774f4632', 'output is valid woff2 (wOF2 magic)');
});

test('subsetEmbeddedFonts is a graceful no-op when there are no embedded faces', async () => {
	const { html, applied, saved } = await subsetEmbeddedFonts('<html><body><p>no fonts here</p></body></html>');
	assert.equal(applied, false);
	assert.equal(saved, 0);
	assert.match(html, /no fonts here/);
});

// ── used-selector CSS prune (P6) ─────────────────────────────────────────────
// The pure kernel side of the prune (parse + keep-logic). The AUTHORITATIVE
// real-DOM matching + the computed-style gate live in the emulator and are
// exercised by test/integration/export (real Chromium, the honest surface).

const PRUNE_CSS = [
	':root{--x:1}',
	'.used{color:red}',
	'.unused{color:blue}',
	'.used:hover{color:green}', // dynamic pseudo → rides with base .used
	'.used::before{content:"x"}', // pseudo-element → rides with base .used
	'.used .child{margin:0}',
	'.used,.unused{padding:1px}', // multi-selector → only .used survives
	'@media (min-width:1px){.used{gap:2px}.unused{gap:3px}}',
	'@media (min-width:9px){.unused{gap:4px}}', // fully dead → whole block drops
	'@font-face{font-family:F;src:url(x.woff2)}',
	'@keyframes k{from{opacity:0}to{opacity:1}}', // from/to must NOT be pruned
].join('');

test('collectBaseSelectors strips dynamic pseudos to the matchable base', () => {
	const bases = collectBaseSelectors('.a:hover::before,.b:focus .c{x:1}.d[data-y="1"]{z:2}');
	assert.ok(bases.includes('.a'), 'pseudo-class + pseudo-element stripped to .a');
	assert.ok(bases.includes('.b .c'), 'dynamic pseudo stripped, combinator + descendant kept');
	assert.ok(bases.includes('.d[data-y="1"]'), 'attribute selector kept verbatim');
});

test('prunePlayerCss drops unmatched rules but keeps matched, pseudos, at-rules', () => {
	const used = new Set([':root', '.used', '.used .child']);
	const out = prunePlayerCss(PRUNE_CSS, (b) => used.has(b));
	assert.equal(out.applied, true);
	assert.match(out.css, /\.used\{color:red\}/, 'a matched rule survives');
	assert.doesNotMatch(out.css, /\.unused\{color:blue\}/, 'an unmatched rule is dropped');
	assert.match(out.css, /\.used:hover/, ':hover rides with its matched base');
	assert.match(out.css, /\.used::before/, '::before decoration rides with its matched base');
	assert.match(out.css, /@font-face/, '@font-face is always kept');
	assert.match(out.css, /@keyframes k\{/, '@keyframes survives (from/to are not document selectors)');
	assert.match(out.css, /from\{opacity:0\}/, 'keyframe steps are untouched');
	assert.ok(out.css.length < PRUNE_CSS.length, 'the result is smaller');
});

test('prunePlayerCss keeps only the matching members of a multi-selector rule', () => {
	const out = prunePlayerCss('.used,.unused{padding:1px}', (b) => b === '.used');
	assert.match(out.css, /\.used\{padding:1px\}/);
	assert.doesNotMatch(out.css, /\.unused/, 'the unmatched selector member is removed');
});

test('prunePlayerCss drops an @media block emptied by pruning', () => {
	const out = prunePlayerCss('@media (min-width:9px){.gone{x:1}}', () => false);
	assert.doesNotMatch(out.css, /min-width:9px/, 'a now-empty @media block is removed entirely');
});

test('prunePlayerCss keeps a selector whose base is safelisted', () => {
	const out = prunePlayerCss('.lp-live{x:1}', () => false, { safelist: ['.lp-live'] });
	assert.match(out.css, /\.lp-live/, 'safelisted selector survives even with no DOM match');
});

test('prunePlayerCss force-keeps a dynamic pseudo NESTED in a functional pseudo-class', () => {
	// The checker's MAJOR: `.a:is(.b:hover)` can never match the static DOM, so a plain
	// match would false-drop it — and the computed-style gate (no interaction states)
	// couldn't catch it. It must be force-kept even when isUsed says "no".
	for (const sel of ['.a:is(.b:hover)', '.a:has(:focus-within)', '.a:where(.b:checked)']) {
		const out = prunePlayerCss(`${sel}{x:1}`, () => false);
		assert.match(out.css, /\{x:1\}/, `${sel} is force-kept (nested dynamic pseudo)`);
	}
	// But a plain unused rule with NO dynamic pseudo is still dropped.
	assert.doesNotMatch(prunePlayerCss('.plain-unused{x:1}', () => false).css, /plain-unused/);
});

// ── used-family FONT prune (P6) ──────────────────────────────────────────────
// The embedded font block ships the whole type stack (incl. the `sketch` hand pair);
// drop the faces whose family the deck never uses. Authoritative detection lives in
// the emulator (real Chromium); this is the pure filter.

const FONT_BLOCK = [
	"@font-face{font-family:'Playfair Display';font-weight:700;src:url(data:font/woff2;base64,AA==)}",
	"@font-face{font-family:'Outfit';font-weight:400;src:url(data:font/woff2;base64,BB==)}",
	"@font-face{font-family:'Caveat';font-weight:400;src:url(data:font/woff2;base64,CC==)}",
	"@font-face{font-family:'Shantell Sans';font-weight:500;src:url(data:font/woff2;base64,DD==)}",
].join('');

test('normalizeFamily strips quotes and trims', () => {
	assert.equal(normalizeFamily("'Playfair Display'"), 'Playfair Display');
	assert.equal(normalizeFamily('  "Outfit" '), 'Outfit');
	assert.equal(normalizeFamily('Caveat'), 'Caveat');
});

test('prunePlayerFontFaces drops unused families, keeps used ones', () => {
	const out = prunePlayerFontFaces(FONT_BLOCK, ['Playfair Display', 'Outfit']);
	assert.equal(out.applied, true);
	assert.equal(out.total, 4);
	assert.equal(out.kept, 2);
	assert.match(out.css, /Playfair Display/);
	assert.match(out.css, /Outfit/);
	assert.doesNotMatch(out.css, /Caveat/, 'an unused family is dropped');
	assert.doesNotMatch(out.css, /Shantell/, 'the other unused family is dropped');
});

test('prunePlayerFontFaces HONORS sketch — a deck that uses the hand fonts keeps them', () => {
	// The user contract: assume sketch may be used; if it is, honor it. When the
	// detected families include the sketch pair, no sketch face may be dropped.
	const out = prunePlayerFontFaces(FONT_BLOCK, ['Playfair Display', 'Outfit', 'Caveat', 'Shantell Sans']);
	assert.equal(out.applied, false, 'nothing to drop → not applied');
	assert.match(out.css, /Caveat/, 'Caveat (sketch display) kept');
	assert.match(out.css, /Shantell Sans/, 'Shantell (sketch body) kept');
});

test('prunePlayerFontFaces keeps EVERYTHING when detection is empty (never strand a deck)', () => {
	const out = prunePlayerFontFaces(FONT_BLOCK, []);
	assert.equal(out.applied, false);
	assert.equal(out.css, FONT_BLOCK, 'an empty used-set is a no-op, not a wipe');
});

test('prunePlayerFontFaces keeps a face whose family it cannot parse (keep-on-doubt)', () => {
	const weird = '@font-face{src:url(data:font/woff2;base64,ZZ==)}'; // no font-family
	const out = prunePlayerFontFaces(weird + FONT_BLOCK, ['Outfit']);
	assert.match(out.css, /ZZ==/, 'the unparseable face is kept, never dropped on doubt');
});

test('prunePlayerFontFaces keeps ALL faces when the used-set matches none (no wipe)', () => {
	// Finding A: a non-empty used-set that names no embedded family must be treated
	// as a detection failure — keep everything, never strand the deck in system fonts.
	const out = prunePlayerFontFaces(FONT_BLOCK, ['system-ui', 'sans-serif']);
	assert.equal(out.applied, false, 'kept===0 is a no-op, not a wipe');
	assert.equal(out.kept, 0);
	assert.equal(out.css, FONT_BLOCK, 'the full block is preserved');
});

test('prunePlayerFontFaces matches families case-insensitively', () => {
	// Finding B: CSS family matching is ASCII case-insensitive.
	const out = prunePlayerFontFaces(FONT_BLOCK, ['playfair display', 'OUTFIT']);
	assert.match(out.css, /Playfair Display/, 'lowercase used-family still keeps its face');
	assert.match(out.css, /Outfit/, 'uppercase used-family still keeps its face');
	assert.doesNotMatch(out.css, /Caveat/, 'a genuinely unused family is still dropped');
});

test('prunePlayerCss safelist matches whole tokens, not substrings', () => {
	// `body` in the safelist must NOT keep `.accent-body` (the checker's over-keep).
	assert.doesNotMatch(
		prunePlayerCss('.accent-body{x:1}', () => false, { safelist: ['body'] }).css,
		/accent-body/,
		'a substring collision does not keep an unrelated rule',
	);
	assert.match(
		prunePlayerCss('body{x:1}', () => false, { safelist: ['body'] }).css,
		/body\{x:1\}/,
		'the whole-token safelist entry still keeps its rule',
	);
});

test('prunePlayerCss returns the css unchanged (applied:false) on a parse throw', () => {
	// A pathological input that css-tree rejects → never a hard failure; ship full CSS.
	const weird = '@@@ not css';
	const out = prunePlayerCss(weird, () => true);
	// Either it parses trivially (applied:true, unchanged) or bails (applied:false);
	// the contract is only that it never throws and never corrupts.
	assert.equal(typeof out.css, 'string');
	assert.doesNotThrow(() => prunePlayerCss(weird, () => true));
});

// ── baked narration (#1393) ──────────────────────────────────────────────────
// "A shared deck has no voice": everything built for a deck that presents itself stopped
// at the Studio boundary. These pin the EXPORT side of closing that — the carrier, its
// breakout guard, the CSP line it needs, and the promise that a deck WITHOUT audio is
// untouched (which the frozen-artifact golden above enforces to the byte).

const NARRATION_DOC = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Spoken</title>
<style>section[data-lattice-slide]{color:red}</style>
</head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>One</h1></section>
<section data-lattice-slide="2" id="2" class="divider"><h2>Two</h2></section>
</body></html>`;

/** The word timeline the caption crawl highlights against — the presence of one is what
 *  tells the assembler this export ships captions (see `hasCaptions`). */
const wordsOf = (text) => text.split(' ').map((display, i) => ({ display, startMs: i * 300, endMs: i * 300 + 280 }));

/** Two slides of cues, the second silent, for the carrier tests. Captioned by default,
 *  because the common export ships both halves; `cue(text, audio, [])` is the audio-only
 *  shape the panel produces when the captions switch is off. */
const cue = (text, audio, words) => ({ text, estimateMs: 900, gapMs: 120, audio, words: words ?? wordsOf(text) });
const NARRATION = [
	[cue('First line.', 'data:audio/mpeg;base64,AAAA'), cue('Second line.', null)],
	[cue('On the divider.', 'data:audio/mpeg;base64,BBBB')],
];
/** The same delivery with no word timings — an export whose captions switch was off. */
const NARRATION_NO_CAPTIONS = NARRATION.map((cues) => cues.map((c) => ({ ...c, words: [] })));
/** Captions with no clips — the read-along a player would have to synthesize to hear. */
const NARRATION_NO_AUDIO = NARRATION.map((cues) => cues.map((c) => ({ ...c, audio: null })));

async function narratedPlayer(extra = {}) {
	return buildPlayerHtml({ docHtml: NARRATION_DOC, source: '---\ntheme: indaco\n---\n\n# One\n', title: 'Spoken', now: 0, narration: NARRATION, ...extra });
}

test('narration: the carrier is one inert block per narrated slide, and it round-trips', async () => {
	const { html } = await narratedPlayer();
	const { JSDOM } = require('jsdom');
	const doc = new JSDOM(html).window.document;
	const blocks = [...doc.querySelectorAll('script[type="application/lattice+audio"]')];
	assert.equal(blocks.length, 2, 'one block per narrated slide');
	assert.deepEqual(blocks.map((b) => b.getAttribute('data-lp-audio')), ['0', '1'], 'blocks are keyed by slide index');
	const first = JSON.parse(blocks[0].textContent);
	assert.equal(first.length, 2);
	assert.equal(first[0].t, 'First line.');
	assert.equal(first[0].a, 'data:audio/mpeg;base64,AAAA');
	assert.equal(first[1].a, null, 'a sentence with no clip ships as a caption with no sound');
	assert.equal(first[1].d, 900, 'and keeps its estimated read time, so the deck still paces');
	assert.equal(first[0].g, 120, 'the inter-sentence breath rides along');
});

test('narration: a slide with no cues gets no block at all', async () => {
	const { html } = await buildPlayerHtml({ docHtml: NARRATION_DOC, source: '# x', now: 0, narration: [[], [cue('Only this.', 'data:audio/mpeg;base64,CC')]] });
	const { JSDOM } = require('jsdom');
	const blocks = [...new JSDOM(html).window.document.querySelectorAll('script[type="application/lattice+audio"]')];
	assert.equal(blocks.length, 1);
	assert.equal(blocks[0].getAttribute('data-lp-audio'), '1', 'the surviving block keeps its ORIGINAL slide index');
});

test('narration: hostile caption text cannot break out of its block', async () => {
	// The manifest envelope buys this property with whole-payload base64 (lattice-doc.js
	// §Security). This payload carries deck TEXT, so it buys the same property by emitting
	// every `<` as the JSON escape — the HTML parser never sees one, and JSON.parse gives
	// the original characters back.
	const nasty = '</script><script>alert(1)</script> and <!-- a comment --> & an ampersand';
	const { html } = await buildPlayerHtml({ docHtml: NARRATION_DOC, source: '# x', now: 0, narration: [[cue(nasty, 'data:audio/mpeg;base64,AA')]] });
	const { JSDOM } = require('jsdom');
	const doc = new JSDOM(html).window.document;
	// Exactly three script elements: the one hashed player script, our data block, and the
	// manifest envelope. Critically, only ONE of them is executable — an injected
	// `<script>alert(1)</script>` would show up as a second type-less script.
	const scripts = [...doc.querySelectorAll('script')];
	assert.equal(scripts.length, 3, 'no injected extra script element');
	assert.equal(scripts.filter((s) => !s.getAttribute('type')).length, 1, 'exactly one executable script');
	assert.doesNotMatch(html, /alert\(1\)<\/script>/, 'the payload never reaches the parser as markup');
	const block = doc.querySelector('script[type="application/lattice+audio"]');
	assert.equal(JSON.parse(block.textContent)[0].t, nasty, 'the caption survives verbatim — including its ampersand');
	assert.doesNotMatch(block.textContent, /</, 'not one raw `<` inside the block');
});

test('narration: only a data: URI is allowed through — the file stays network-free', async () => {
	// The whole contract of the exported player is `default-src 'none'` and no origin. A
	// remote URL reaching the carrier would make a "self-contained" file phone home.
	const { html } = await buildPlayerHtml({
		docHtml: NARRATION_DOC,
		source: '# x',
		now: 0,
		narration: [[cue('a', 'https://example.com/a.mp3'), cue('b', 'blob:http://x/y'), cue('c', 'data:audio/mpeg;base64,AA')]],
	});
	const { JSDOM } = require('jsdom');
	const parsed = JSON.parse(new JSDOM(html).window.document.querySelector('script[type="application/lattice+audio"]').textContent);
	assert.deepEqual(parsed.map((c) => c.a), [null, null, 'data:audio/mpeg;base64,AA']);
});

test('narration: the CSP gains media-src ONLY when audio actually ships', async () => {
	const withAudio = (await narratedPlayer()).html;
	assert.match(withAudio, /content="[^"]*media-src data:/, 'a narrated deck may play its inline audio');
	const silent = (await buildPlayerHtml({ docHtml: NARRATION_DOC, source: '# x', now: 0 })).html;
	assert.doesNotMatch(silent, /media-src/, 'a silent deck grants nothing it cannot use');
});

test('narration: the chrome exists only for a deck that speaks', async () => {
	const withAudio = (await narratedPlayer()).html;
	assert.match(withAudio, /id="lp-play"/, 'a play control');
	assert.match(withAudio, /id="lp-caption"/, 'a caption band — the text alternative for the audio');
	assert.match(withAudio, /#lp-caption\{/, 'and its CSS');
	const silent = (await buildPlayerHtml({ docHtml: NARRATION_DOC, source: '# x', now: 0 })).html;
	assert.doesNotMatch(silent, /lp-play/, 'no dead affordance on a silent deck');
	assert.doesNotMatch(silent, /lp-caption/, 'and no rule for chrome it does not have');
});

// ── the four states the export panel's two switches produce ───────────────────────────────
//
// Captions and audio are separate options because they cost wildly different amounts and are
// separately useful. All four combinations have to be REAL in the file, not merely accepted
// by the panel — and the assembler derives which one it is from the PAYLOAD (does any cue
// carry words?) rather than from a second input, so the band, its stylesheet, the inlined
// cursor and the shipped words can never disagree.
test('narration: audio with captions OFF ships the voice and no band at all', async () => {
	const { html } = await narratedPlayer({ narration: NARRATION_NO_CAPTIONS });
	assert.match(html, /id="lp-play"/, 'the delivery still has a transport');
	assert.match(html, /media-src data:/, 'and may still play its audio');
	// The player script still LOOKS for a band (`getElementById('lp-caption')`) — that one
	// runtime reference is exactly what makes the crawl no-op here. What must be absent is the
	// element and its stylesheet.
	assert.doesNotMatch(html, /id="lp-caption"/, 'but no band element');
	assert.doesNotMatch(html, /#lp-caption\{/, 'and no stylesheet for one');
	assert.doesNotMatch(html, /\.lp-cap-track\{/, 'nor any of the crawl’s own rules');
	// The crawl's own FUNCTIONS stay in the script — they are a few hundred bytes and they
	// no-op without a band, and one shape is worth more than a second conditional-emission
	// seam that can rot. The KERNEL is the part worth gating: several KB of inlined Cadenza
	// source that a deck with nothing to highlight has no use for.
	assert.doesNotMatch(html, /var makeCursor=/, 'and not one byte of the caption cursor');
	const { JSDOM } = require('jsdom');
	const parsed = JSON.parse(new JSDOM(html).window.document.querySelector('script[type="application/lattice+audio"]').textContent);
	assert.deepEqual(parsed.map((c) => c.w), [[], []], 'the words are not shipped either');
	assert.equal(parsed[0].t, 'First line.', 'the cue text still rides — it is what carries the beat');
});

test('narration: captions with audio OFF ship a read-along that costs kilobytes', async () => {
	// A captions-only export is a working teleprompter, not a degraded narration: the player
	// crawls it on its own wall clock (narrationJs › crawlClock's `silentFrom` path).
	const silentCues = NARRATION.map((cues) => cues.map((c) => ({ ...c, audio: null })));
	const { html } = await narratedPlayer({ narration: silentCues });
	assert.match(html, /id="lp-caption"/, 'the band ships');
	assert.match(html, /var makeCursor=/, 'and the cursor that drives it');
	assert.doesNotMatch(html, /media-src/, 'but nothing is granted for audio the file does not have');
	assert.doesNotMatch(html, /data:audio\//, 'and not one clip rides along');
});

test('narration: the player binds to its OWN chrome, not to a deck element wearing the same id', async () => {
	// The document body IS deck content, and the engine renders authored HTML, so a slide can
	// contain `<div id="lp-caption">`. A bare getElementById bound the transport to it — and
	// with captions OFF the cursor kernel is not inlined, so the crawl's one guarded call site
	// threw a ReferenceError inside a click handler that sits outside the init try/catch: the
	// button flipped to "Pause" and the deck never spoke a word. The lookups are scoped to a
	// direct child of the player's own chrome, which a slide (nested in #lp-stage) never is.
	const hostile = NARRATION_DOC.replace('<h1>One</h1>', '<h1>One</h1><div id="lp-caption"></div><button id="lp-play"></button>');
	const { html } = await narratedPlayer({ docHtml: hostile, narration: NARRATION_NO_CAPTIONS });
	assert.match(html, /querySelector\('body > #lp-app'\)/, 'the shell root is resolved from body, which a slide can never be a child of');
	assert.match(html, /querySelector\(':scope > #lp-caption'\)/, 'and the band is queried RELATIVE to it, not from the document');
	assert.match(html, /querySelector\(':scope > #lp-play'\)/, 'and so is the play control');
	assert.doesNotMatch(html, /getElementById\('lp-caption'\)/, 'no bare id lookup survives for deck content to hijack');
	// The forged element still ships (it is the author's markup, sanitized) — what must not
	// happen is the transport binding to it.
	const { JSDOM } = require('jsdom');
	const doc = new JSDOM(html).window.document;
	assert.equal(doc.querySelectorAll('#lp-app > #lp-caption').length, 0, 'an audio-only export has no band of its own');
	assert.ok(doc.querySelector('section[data-lattice-slide] #lp-caption'), "the author's element is still in their slide");
});

test('the transport chrome is unforgeable too, not just the caption band and play control', async () => {
	// #1462 item 3. #lp-caption and #lp-play were scoped; EVERY other lookup was a bare
	// getElementById, and all of that chrome is emitted AFTER the slides — so a deck element
	// won tree order. Observed on a real exported artifact: a slide carrying id="lp-next" left
	// the shipped Next button with no handler at all. Keyboard nav still worked, so the deck
	// looked healthy right up until someone clicked the control.
	//
	// The fix is structural, not a denylist: every real chrome node sits on a direct-child
	// chain from #lp-bar or #lp-app, and authored content is always a descendant of #lp-stage,
	// so a deck can never occupy one of those positions.
	const forged = ['lp-next', 'lp-prev', 'lp-top', 'lp-bottom', 'lp-notes', 'lp-notes-body', 'lp-doc', 'lp-toc', 'lp-article', 'lp-stage', 'lp-count', 'lp-mode', 'lp-full', 'lp-notes-btn', 'lp-read-nav'];
	// FLAT *and* CHAINED. The first version of this test forged only flat divs, so it passed
	// against a fix that did not work: a descendant selector like '#lp-app > #lp-nav > #lp-next'
	// matches a chain a slide builds ITSELF, and that forgery wins document order because this
	// chrome is emitted after the slides. Twelve lookups fell to it.
	const chained =
		'<div id="lp-app"><div id="lp-nav"><button id="lp-prev">F</button><button id="lp-next">F</button></div>' +
		'<div id="lp-read-nav"><button id="lp-top">F</button><button id="lp-bottom">F</button></div>' +
		'<div id="lp-notes"><div id="lp-notes-body">F</div></div>' +
		'<div id="lp-doc"><div id="lp-toc">F</div><div id="lp-article">F</div></div>' +
		'<div id="lp-caption">F</div><div id="lp-stage">F</div></div>';
	const hostile = docHtml.replace('<p>Intro paragraph.</p>', `<p>Intro paragraph.</p>${forged.map((id) => `<div id="${id}"></div>`).join('')}${chained}`);
	const { html } = await buildPlayerHtml({ docHtml: hostile, source, now: 0 });

	for (const id of forged) {
		assert.doesNotMatch(html, new RegExp(`getElementById\\('${id}'\\)`), `${id} is no longer resolved by a bare id lookup`);
	}

	const { JSDOM } = require('jsdom');
	const doc = new JSDOM(html).window.document;
	// The forged elements still SHIP — they are the author's markup, sanitized. What must not
	// happen is the player resolving to them.
	assert.ok(doc.querySelector('section[data-lattice-slide] #lp-next'), "the author's element is still in their slide");
	// EXECUTE THE PLAYER, do not re-implement it. The previous version of this test built its own
	// map of the anchored selectors and asserted that ITS OWN copy resolved correctly — so
	// reverting `lpEl` to the broken unrooted form left this green, and only the byte-golden hash
	// noticed. A test that duplicates the fix cannot fail for the bug, which is the exact defect
	// class #1462 item 7 is about. So: run the real script and click the real button.
	const dom = new JSDOM(html, { runScripts: 'dangerously' });
	const d = dom.window.document;
	assert.ok(d.documentElement.classList.contains('lp-js'), 'the player script actually ran');

	// Root the test's OWN selectors at `body >` too — an unrooted query here would hand us the
	// forged node and we would be driving the deck's markup instead of the player's.
	const realNext = d.querySelector('body > #lp-app > #lp-nav > #lp-next');
	const counter = d.querySelector('body > #lp-bar > #lp-count');
	assert.ok(realNext && counter, "the player's own controls exist");
	assert.ok(d.querySelector('section[data-lattice-slide] #lp-next'), "the author's forged element also shipped");

	const before = counter.textContent.trim();
	realNext.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
	assert.notEqual(counter.textContent.trim(), before, 'the REAL Next button advances the deck');
	assert.match(counter.textContent, /\d/, "and the counter read is the player's own element");

	// The forged nodes still ship — they are the author's markup — they just cannot be found.
	for (const id of ['lp-next', 'lp-notes-body', 'lp-toc']) {
		const forgedNode = d.querySelector(`section[data-lattice-slide] #${id}`);
		if (forgedNode) assert.ok(forgedNode.closest('#lp-stage'), `the forged ${id} stays inside the deck content`);
	}
});

// ── the swipe rule counts the fingers (#1558) ────────────────────────────────
//
// A two-finger PINCH used to turn the slide. The stage bound pointerdown/pointerup with a
// single sx/sy and no finger count, so the second finger's pointerdown OVERWROTE the start
// point and the first finger's pointerup was measured against the OTHER finger's start — a
// dx of roughly the whole inter-finger span, which is the strongest swipe signal there is.
// The Studio surfaces were fixed in 2026-08-10-preview-pinch-zoom.md; this is the same rule
// reaching the artifact a recipient actually opens.
//
// These EXECUTE the real player script (the file's own house rule: a test that re-implements
// the fix cannot fail for the bug). They run MID-DECK on purpose — on slide 1 a misfired
// `prev` clamps and reads identically to a gesture correctly ignored, which is exactly the
// trap that produced a false pass while #1555 was being verified. The real-surface claim is
// NOT made here: jsdom has no touch stack, so `tools/verify-player-input.mjs` drives a real
// exported file with genuine CDP touch (HARD RULE #23). This tier is the cheap standing gate.

// FIVE slides, parked on the third. The deck length is load-bearing: the first cut of these
// tests used three slides and parked on the second, where a misfired `next` followed by a
// swipe lands on the LAST slide and clamps — so "a pinch does not latch" passed against the
// unguarded player by coincidence. A cell that cannot fail for the bug is not a gate. With
// slack on both sides, every assertion below distinguishes the two behaviors.
const GESTURE_DOC = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Deck</title></head><body>
<section data-lattice-slide="1" id="1" class="title"><h1>One</h1></section>
<section data-lattice-slide="2" id="2" class="content"><h2>Two</h2></section>
<section data-lattice-slide="3" id="3" class="content"><h2>Three</h2></section>
<section data-lattice-slide="4" id="4" class="content"><h2>Four</h2></section>
<section data-lattice-slide="5" id="5" class="content"><h2>Five</h2></section>
</body></html>`;

/** Boot the real player in jsdom and park it on slide 3 of 5. */
async function gesturePlayer() {
	const { html } = await buildPlayerHtml({ docHtml: GESTURE_DOC, source, now: 0 });
	const { JSDOM } = require('jsdom');
	const dom = new JSDOM(html, { runScripts: 'dangerously' });
	const d = dom.window.document;
	assert.ok(d.documentElement.classList.contains('lp-js'), 'the player script actually ran');
	const stage = d.querySelector('body > #lp-app > #lp-stage');
	const bar = d.querySelector('body > #lp-bar');
	const counter = d.querySelector('body > #lp-bar > #lp-count');
	// jsdom has no PointerEvent, and the handlers read only pointerId/clientX/clientY/isPrimary
	// — so a MouseEvent carrying those is the same event shape as far as this code is concerned.
	//
	// `isPrimary` is DERIVED from what is already down rather than hard-coded, because the guard
	// reads it as "the UA has no other live contact of this type" and a test that asserted its
	// own convenient value would be testing itself. `primary` overrides it for the one case that
	// matters: a contact the browser released and we never heard about, where the browser's next
	// press really is primary while our own list still thinks otherwise.
	// `pointerType` is modeled too, because `isPrimary` is scoped to it: a mouse press is ALWAYS
	// primary and a pen press is primary for pen while fingers are live. A helper that pretended
	// every contact was the same type could not express the sequences that broke this code.
	const live = new Map();
	const send = (target, type, id, x, y = 400, opts = {}) => {
		const kind = opts.pointerType || 'touch';
		const e = new dom.window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
		Object.defineProperty(e, 'pointerId', { value: id });
		Object.defineProperty(e, 'pointerType', { value: kind });
		const sameKind = [...live.values()].filter((k) => k === kind).length;
		Object.defineProperty(e, 'isPrimary', { value: opts.primary === undefined ? sameKind === 0 : opts.primary });
		if (type === 'pointerdown') live.set(id, kind);
		else live.delete(id);
		target.dispatchEvent(e);
	};
	const next = d.querySelector('body > #lp-app > #lp-nav > #lp-next');
	next.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
	next.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
	assert.equal(counter.textContent.trim(), '3 / 5', 'parked mid-deck, so a misfire cannot hide behind an edge clamp');
	return { dom, d, stage, bar, counter, send, at: () => counter.textContent.trim() };
}

test('a two-finger pinch on the present stage never turns the deck (#1558)', async () => {
	const { stage, send, at } = await gesturePlayer();
	// A symmetric spread about the stage center: each finger travels 200px outward. Measured
	// the old way that is a dx of ~±400 against swipeAction's 45px threshold, perfectly
	// horizontal — the strongest possible swipe signal, from a gesture that meant the opposite.
	//
	// ASSERT AFTER EVERY RELEASE, not only at the end. A symmetric pinch that misfires twice in
	// opposite directions nets to zero, so an end-state-only assertion passes while the deck
	// visibly jumps away and back. An off-by-one in the finger count (`> 1` written `> 2`)
	// does exactly that, and survived this cell until it checked each step.
	send(stage, 'pointerdown', 1, 500);
	send(stage, 'pointerdown', 2, 900);
	send(stage, 'pointerup', 1, 300);
	assert.equal(at(), '3 / 5', 'the first finger up moved nothing');
	send(stage, 'pointerup', 2, 1100);
	assert.equal(at(), '3 / 5', 'and neither did the second');
});

test('a pinch whose second finger lands on the player chrome is still a pinch (#1558)', async () => {
	// THE HOLE THE FIRST CUT SHIPPED. Counting only contacts that landed on #lp-stage left the
	// transport bar and the prev/next row — 119px, 14% of a phone screen, and the bottom edge
	// where fingers actually rest — outside the count. One finger there made the gesture read as
	// a single contact, and the finger on the slide was measured as the swipe the guard exists
	// to refuse: on the real artifact, an ordinary bottom-of-screen pinch moved slide 4 to 3 at
	// every width. The contacts are counted on the window now, so where a finger lands is no
	// longer part of the rule.
	const { stage, bar, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 500);
	send(bar, 'pointerdown', 2, 900);
	send(stage, 'pointerup', 1, 300);
	assert.equal(at(), '3 / 5', 'the finger on the slide is not a swipe — the other one is on the bar');
	send(bar, 'pointerup', 2, 1100);
	assert.equal(at(), '3 / 5', 'and the deck is still where it was');
});

test('a pinch does not latch — the next one-finger swipe still turns the deck', async () => {
	const { stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 500);
	send(stage, 'pointerdown', 2, 900);
	send(stage, 'pointerup', 1, 300);
	send(stage, 'pointerup', 2, 1100);
	// The whole risk of a guard is that it never turns off. The flag clears when the LAST
	// pointer lifts, so the deck is navigable again immediately.
	assert.equal(at(), '3 / 5', 'the pinch itself moved nothing');
	send(stage, 'pointerdown', 3, 900);
	send(stage, 'pointerup', 3, 600);
	assert.equal(at(), '4 / 5', 'a plain swipe after a pinch advances exactly one slide');
});

test('a primary press re-syncs the finger count — the guard heals a release it never saw', async () => {
	// Every enumerated leak is closed by the window-level release, but the list of ways a
	// platform can eat a release is not knowable from here — an iOS edge swipe, the notification
	// shade, a call arriving mid-touch. A guard that latches is worse than the defect it fixes,
	// so it does not rely on that list being complete: `isPrimary` is the UA stating it has no
	// other live contact of this type, which makes a primary press authoritative over whatever
	// this code still believes. The kernel gets the same property for free by being handed the
	// live contact list on every event.
	const { stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 900); // …and its release never arrives.
	send(stage, 'pointerdown', 2, 900, 400, { primary: true }); // a fresh gesture: the browser says nothing else is down
	send(stage, 'pointerup', 2, 600);
	assert.equal(at(), '4 / 5', 'the stale contact was dropped, so the swipe was measured');
});

test('a press of ANOTHER pointer type cannot wipe live contacts (#1558)', async () => {
	// `isPrimary` is per pointer TYPE. A mouse press is always primary; a pen press is primary
	// for pen even while fingers are on the glass. So a type-blind re-sync emptied the contact
	// list mid-gesture and handed the surviving finger's travel straight to swipeAction — the
	// exact cross-contact arithmetic this whole change exists to kill, reintroduced by its own
	// self-heal. Reachable on a touchscreen laptop, an iPad with a Pencil, a tablet with a
	// trackpad — device classes this repo declares in scope. Not reachable on a touch-only
	// phone, which is why it was invisible to every touch-shaped test.
	const { stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 900); // a finger rests on the slide
	send(stage, 'pointerdown', 9, 320, 400, { pointerType: 'mouse' }); // always primary
	send(stage, 'pointerup', 9, 322, 400, { pointerType: 'mouse' }); // a stationary click
	assert.equal(at(), '3 / 5', 'the click did not turn the deck against the finger`s start');
	// The same with a pen, mid-pinch, plus a third finger — the sequence that turned the deck
	// with three contacts down.
	const b = await gesturePlayer();
	b.send(b.stage, 'pointerdown', 1, 500);
	b.send(b.stage, 'pointerdown', 2, 900);
	b.send(b.stage, 'pointerdown', 7, 600, 300, { pointerType: 'pen' });
	b.send(b.stage, 'pointerup', 7, 600, 300, { pointerType: 'pen' });
	b.send(b.stage, 'pointerdown', 3, 1000);
	b.send(b.stage, 'pointerup', 1, 300);
	assert.equal(b.at(), '3 / 5', 'a pen tap during a pinch does not release the guard');
});

test('a gesture whose release was eaten heals on the SAME swipe, not the next one', async () => {
	// The re-sync cleared the contact list but not the pinch flag, and the stage runs before
	// the window — so the first swipe after an eaten release was silently swallowed and only
	// the second one worked. Silent, and the cell named for this property could not fail for
	// it, because it set up a case where the flag had never been set.
	const { stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 500);
	send(stage, 'pointerdown', 2, 900); // a real pinch: the flag is genuinely set
	send(stage, 'pointerup', 1, 300); // …and finger 2's release never arrives.
	send(stage, 'pointerdown', 3, 900, 400, { primary: true }); // a fresh gesture, per the UA
	send(stage, 'pointerup', 3, 600);
	assert.equal(at(), '4 / 5', 'the FIRST swipe after the eaten release navigates');
});

test('a mouse drag on top of a live pinch is not a swipe (#1558)', async () => {
	// A primary press of ANOTHER pointer type while a pinch is live must not release the guard.
	// This is the shape a red team used to turn the deck against an earlier revision, where a
	// type-blind re-sync emptied the contact list and re-armed the measurement.
	const { stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 500);
	send(stage, 'pointerdown', 2, 900);
	send(stage, 'pointerdown', 9, 1000, 400, { pointerType: 'mouse' }); // primary, another type
	send(stage, 'pointerup', 9, 300, 400, { pointerType: 'mouse' }); // a long leftward drag
	assert.equal(at(), '3 / 5', 'a mouse drag on top of a live pinch is not a swipe');
});

test('a release for a contact we never saw cannot drop a real one', async () => {
	// A stray pointerup — an id that is not in the list, while a real contact IS — must be a
	// no-op. Without the not-found check, indexOf returns -1 and splice(-1, 1) removes the LAST
	// entry instead: a live finger silently deleted from the count, which is exactly how a pinch
	// stops looking like one. Pointer traces of a mouse-plus-touch sequence produce this case
	// for real, so it is not hypothetical.
	const { d, stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 500);
	send(stage, 'pointerdown', 2, 900);
	send(d.body, 'pointerup', 77, 0, 0); // never pressed
	send(stage, 'pointerup', 1, 300); // the pinch must still be a pinch
	assert.equal(at(), '3 / 5', 'the stray release did not evict a live contact');
});

test('pointercancel is what releases a canceled contact, not the next primary press', async () => {
	// The primary re-sync also recovers a lost contact, which can mask a missing pointercancel
	// handler — so this drives a follow-up gesture the UA reports as NON-primary (another
	// contact of that type is, as far as it knows, still down). Only pointercancel can have
	// cleared the canceled one.
	const { d, stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 500);
	send(d.body, 'pointercancel', 1, 500);
	send(stage, 'pointerdown', 2, 900, 400, { primary: false });
	send(stage, 'pointerup', 2, 600);
	assert.equal(at(), '4 / 5', 'the canceled contact was released without help from a re-sync');
});

test('a contact held across a view switch is still counted', async () => {
	// The counting listener used to stand down outside Present, so a finger pressed in Read
	// view was invisible to the count forever — and its lift was then measured against another
	// finger's start. Pre-existing, on the path of this change, fixed here rather than filed.
	const { dom, d, stage, send, at } = await gesturePlayer();
	const click = () => new dom.window.MouseEvent('click', { bubbles: true });
	const readBtn = d.querySelector('body > #lp-bar > .lp-seg > [data-lp-btn="read-slides"]');
	const presentBtn = d.querySelector('body > #lp-bar > .lp-seg > [data-lp-btn="present"]');
	assert.ok(readBtn && presentBtn, 'the view controls resolve');
	readBtn.dispatchEvent(click());
	send(stage, 'pointerdown', 1, 60, 300); // a finger goes down while reading
	presentBtn.dispatchEvent(click());
	send(stage, 'pointerdown', 2, 1000);
	send(stage, 'pointerup', 1, 300, 400);
	assert.equal(at(), '3 / 5', 'the contact from the other view still counted as a finger');
});

test('a repeated pointerdown for one contact cannot fake a second finger', async () => {
	// A multi-button mouse fires pointerdown twice for the SAME pointerId. Pushed twice, the id
	// reads as two fingers and the single matching release only removes one copy — so the list
	// never empties and the guard latches for the life of the page. The dedup on push is what
	// stops that, and nothing else tests it.
	const { stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 900);
	send(stage, 'pointerdown', 1, 900);
	send(stage, 'pointerup', 1, 600);
	assert.equal(at(), '4 / 5', 'one contact pressed twice is still one contact');
	send(stage, 'pointerdown', 2, 900);
	send(stage, 'pointerup', 2, 600);
	assert.equal(at(), '5 / 5', 'and the next swipe still works');
});

test('a one-finger swipe still turns the deck in both directions', async () => {
	const { stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 900);
	send(stage, 'pointerup', 1, 600);
	assert.equal(at(), '4 / 5', 'a decisive leftward drag advances');
	send(stage, 'pointerdown', 2, 600);
	send(stage, 'pointerup', 2, 900);
	assert.equal(at(), '3 / 5', 'and a rightward drag goes back');
	// A mostly-vertical drag is still ignored, so the swipe rule never fights a scroll.
	send(stage, 'pointerdown', 3, 900, 200);
	send(stage, 'pointerup', 3, 800, 600);
	assert.equal(at(), '3 / 5', 'a vertical drag is not a swipe');
});

test('a contact that ends off the stage is still released, and cannot be re-measured', async () => {
	// A contact can end anywhere — over the transport bar, the prev/next row, outside the
	// window. (Chromium's implicit pointer capture retargets a TOUCH release back to the stage,
	// so this is really about mouse and pen, which have no such capture, and about cancel
	// routing, which varies by engine. The window listener covers all of them without needing
	// to know which.) Two things must hold: the id must be dropped, and the half-finished
	// gesture must be forgotten — otherwise its stale start point is still armed, and the next
	// release over the stage from a contact that never began there gets measured against it.
	const { d, stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 900);
	send(d.body, 'pointerup', 1, 200);
	send(stage, 'pointerup', 2, 200);
	assert.equal(at(), '3 / 5', 'a release with no press of its own is not a swipe');
	send(stage, 'pointerdown', 3, 900);
	send(stage, 'pointerup', 3, 600);
	assert.equal(at(), '4 / 5', 'the leaked-elsewhere contact did not poison the next swipe');
});

test('pointercancel releases a contact — a palm rejection does not kill navigation', async () => {
	// A canceled contact never fires pointerup. Its handler is what the Studio's presenter
	// popup shipped without, where it latched the pinch flag and silently ate the next swipe.
	const { d, stage, send, at } = await gesturePlayer();
	send(stage, 'pointerdown', 1, 500);
	send(stage, 'pointerdown', 2, 900);
	send(d.body, 'pointercancel', 1, 500);
	send(d.body, 'pointercancel', 2, 900);
	send(stage, 'pointerdown', 3, 900);
	send(stage, 'pointerup', 3, 600);
	assert.equal(at(), '4 / 5', 'navigation survives a canceled pinch');
});

test('narration: an encoded clip carries its lead, and the player seeks past it', async () => {
	// lamejs writes no gapless header, so ~46 ms of encoder silence sits at the head of every
	// clip WE compress and no decoder trims it. Left in, audio starts after its own caption on
	// every sentence and the tuned breath grows ~28% — the defect that drove compression off the
	// live reading path, delivered instead to the recipient's copy. So the bake ships the figure
	// and the player skips it.
	const withLead = NARRATION.map((cues) => cues.map((c) => ({ ...c, leadMs: 46 })));
	const { html } = await narratedPlayer({ narration: withLead });
	assert.match(html, /"l":46/, 'the lead travels in the cue block');
	assert.match(html, /a\.currentTime=lead\/1000/, 'and the player seeks past it before playing');
	assert.match(html, /a\.duration\*1000-lead/, 'and re-anchors the crawl to the real speech duration, not the padded one');

	// A clip that arrived already compressed carries none, and must not pay for a key.
	const noLead = (await narratedPlayer()).html;
	assert.doesNotMatch(noLead, /"l":/, 'no lead key when there is no encoder silence');
});

test('narration: the deck’s own pace is baked, because the player cannot read front matter', async () => {
	// The assembler strips every non-envelope <script>, so the baked
	// `application/lattice-front-matter` block never reaches the player — and a shared file
	// has no workspace preset to fall back on. The number has to be resolved here.
	const deliberate = (await narratedPlayer({ source: '---\npace: deliberate\n---\n\n# One\n' })).html;
	assert.match(deliberate, /NAR_BEAT=\{"slide":2200,"section":4000\}/, 'the author’s declared rhythm travels');
	const plain = (await narratedPlayer({ source: '---\ntheme: indaco\n---\n\n# One\n' })).html;
	assert.match(plain, /NAR_BEAT=\{"slide":1400,"section":2600\}/, 'and an undeclared deck gets `natural`');
	const typo = (await narratedPlayer({ source: '---\npace: delibrate\n---\n\n# One\n' })).html;
	assert.match(typo, /NAR_BEAT=\{"slide":1400,"section":2600\}/, 'a typo falls through to the default, as the register documents');
});

test('narration: the manifest carries the read-along track, and NOT the audio bytes', async () => {
	// Audio in the envelope would be base64'd twice (the manifest is base64'd whole) and
	// could only be reached by parsing the entire manifest to play one sentence. The track
	// and the voice identity DO belong there — that is what lets the artifact say what
	// narrated it, and what a re-import would restore.
	//
	// The section is SHAPED by the manifest kernel (`buildReadAlong`), not passed through
	// verbatim: the caller hands over a Studio-internal voice object, and a document format that
	// goes out to boards must not carry the Studio's own voice-ladder names (#1462 item 1).
	const { html } = await narratedPlayer({ readAlong: { voice: { rung: 'openrouter', model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 } } });
	const manifest = parseEnvelope(html);
	assert.deepEqual(manifest.readAlong, {
		version: READ_ALONG_VERSION,
		audioMode: 'embedded',
		voice: { engine: 'cloud', model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 },
	});
	assert.doesNotMatch(JSON.stringify(manifest), /base64/, 'no audio payload inside the envelope');
});

test('narration: the manifest says WHICH mode it is, and names the engine in its own vocabulary', async () => {
	// Both fields were simply absent (#1462 item 1). `version` is the field whose entire purpose
	// is to let a future player migrate an old artifact — without it every reader must treat
	// "missing" as a legacy dialect forever, and that cost only grows once decks are in other
	// people's inboxes. `audioMode` is how a reader knows whether the file can speak on its own
	// or needs a key; it had to go looking for audio blocks to find out.
	const withAudio = parseEnvelope((await narratedPlayer({ readAlong: { voice: { rung: 'kokoro', model: 'hexgrad/kokoro-82m', voice: 'af_sky', speed: 1 } } })).html);
	assert.equal(withAudio.readAlong.audioMode, 'embedded', 'this file carries its own audio');
	assert.equal(withAudio.readAlong.voice.engine, 'on-device', "the document's word, not the Studio's rung name");
	assert.ok(withAudio.readAlong.version, 'a section version, always');
	assert.doesNotMatch(JSON.stringify(withAudio.readAlong), /rung|openrouter|kokoro-82m'/, 'no internal ladder identity leaks into the document');

	// Captions with no clips: the deck ships a read-along that a player must synthesize to hear.
	const captionsOnly = parseEnvelope(
		(await narratedPlayer({ narration: NARRATION_NO_AUDIO, readAlong: { voice: { rung: 'openrouter', model: 'm', voice: 'v', speed: 1 } } })).html,
	);
	assert.equal(captionsOnly.readAlong.audioMode, 'regenerate', 'no audio rode along, and the artifact says so');
});
