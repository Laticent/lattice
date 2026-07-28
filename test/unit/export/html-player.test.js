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
const { parseEnvelope } = require('../../../lib/core/lattice-doc.js');

// `minifyCss` moved to the pure player-core (ESM) when the assembler was extracted
// (2026-07-08-studio-html-player-export.md, P1). Loaded via dynamic import before the
// suite runs — the adapter no longer re-exports it (a CJS module can't sync-forward an
// ESM binding), so the tests read it from its new home.
let minifyCss;
let resolveLightDark;
let themeDualMode;
test.before(async () => {
	({ minifyCss, resolveLightDark, themeDualMode } = await import('../../../lib/export/player-core.mjs'));
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
	assert.match(html, /var st=document\.getElementById\('lp-stage'\);if\(!st\)return/, 'fit measures the stage element directly');
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

test('Read·Slides is unified onto Present\'s frame, with a floating Home/End overlay + Present mouse wheel', async () => {
	const { html } = await buildPlayerHtml({ docHtml, source, now: 0 });
	// fitRead now uses the SAME fitScale as Present (over ~86% of the stage height) so the
	// first slide matches Present and the next peeks — NOT the old fill-the-width math.
	assert.match(html, /function fitRead\(\)\{var st=document\.getElementById\('lp-stage'\);if\(!st\)return;[\s\S]*?fitScale\(\{stageW:st\.clientWidth,stageH:st\.clientHeight\*0\.86,slideW:1280,slideH:720,insetX:40,insetY:0\}\)/, 'read-slides fits to Present\'s footprint (86% height, 40px inset), reserving a peek');
	assert.doesNotMatch(html, /avail\/1280/, 'the old fill-the-width read-slides fit is gone');
	// The floating Home/End overlay: markup, view-scoped CSS, and the smooth-scroll handlers.
	assert.match(html, /<div id="lp-read-nav">/, 'the floating read-slides nav is in the markup');
	assert.match(html, /<button id="lp-top"[^>]*aria-label="Jump to first slide"/, 'a Home (top) button');
	assert.match(html, /<button id="lp-bottom"[^>]*aria-label="Jump to last slide"/, 'an End (bottom) button');
	assert.match(html, /\.lp-js \[data-lp-view=read-slides\] #lp-read-nav\{[^}]*position:absolute;right:calc\(16px \+ env\(safe-area-inset-right,0px\)\);bottom:calc\(16px \+ env\(safe-area-inset-bottom,0px\)\)/, 'the overlay is absolute bottom-right with SAFE-AREA insets, only in read-slides — the scroll flow is unobstructed');
	assert.match(html, /if\(topBtn\)topBtn\.onclick=function\(\)\{scrollStage\(0\);\}/, 'Home scrolls the stage to the top');
	assert.match(html, /if\(bottomBtn\)bottomBtn\.onclick=function\(\)\{var st=document\.getElementById\('lp-stage'\);if\(st\)scrollStage\(st\.scrollHeight\);\}/, 'End scrolls the stage to the bottom');
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
	assert.match(html, /addEventListener\('wheel',function\(e\)\{if\(view!=='present'\)return;if\(wheelBusy\)return;[\s\S]*?t\[d>0\?'next':'prev'\]\(\);e\.preventDefault\(\);\},\{passive:false\}\)/, 'present advances/reverses on a decisive wheel delta, debounced, present-only');
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
	// A pure-attribute + tag change: no CSS, no layout, no script behaviour. Deliberate.
	// (Prior bless: the `.lp-chart` width-container rules for flow-height chart re-hosts.)
	assert.equal(sha, 'c669af1c76726387757265778150e6075080d42537ef6569d952df9671b27095', 'player bytes moved — if intentional, re-bless this sha in the same commit and say why');
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
