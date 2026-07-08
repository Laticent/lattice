/**
 * lib/export/html-player.js
 *
 * The self-contained `.html` PLAYER assembler — P2 of the HTML player
 * (engineering/decisions/2026-07-07-html-lattice-player.md). Takes the emulator's
 * already-self-contained render (`cleanDocHtml`: inline fonts + inline lattice.css
 * + pre-rendered `<section>` slides) and turns it into a portable, offline,
 * double-clickable player with three views (Present · Read·Slides · Read·Article
 * shell), closing the remaining `file://` gaps and applying the §Security v1 gate.
 *
 * What it does (all at export time — the shipped file runs no engine, only a small
 * transport that navigates static DOM):
 *   1. Inline `file://` IMAGES → data-URIs (the last non-font asset gap).
 *   2. Drop / inline the KaTeX `file://` CSS link (inline only when the deck uses math).
 *   3. Strip the authoring overflow-watcher + any runtime-inflated `file://` scripts
 *      (state-chart / function-plot) — those are baked headlessly in a later slice;
 *      here they are reported as un-inlinable, never shipped as a live file:// call.
 *   4. SANITIZE the slide DOM through the shared #616 guard
 *      (lib/core/sanitize-slide-html.mjs) — the export runs in Node and the file is a
 *      live surface a recipient opens (§Security 1).
 *   5. Wrap the slides in the three-view chrome + a single inline player `<script>`.
 *   6. Bake a `sha256`-pinned CSP `<meta>` over that one script (§Security 3) — the
 *      freeze-surviving mitigation; injected script is refused, the hashed player runs.
 *   7. Embed the verbatim source ENVELOPE (lib/core/lattice-doc.js) for lossless
 *      re-import; base64'd whole, so no deck field can break out (§Security 2).
 *
 * CommonJS (lib/export convention, beside pptx-export.js). `async` because the
 * sanitizer is ESM (dynamic import) and it reads asset bytes off disk.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { fileURLToPath } = require('node:url');
const { buildEnvelope } = require('../core/lattice-doc.js');

const MIME = {
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
};

/** Read a local file and return a data: URI, or null if unreadable. */
function fileToDataUri(absPath) {
	try {
		const ext = path.extname(absPath).toLowerCase();
		const mime = MIME[ext] || 'application/octet-stream';
		const buf = fs.readFileSync(absPath);
		if (ext === '.svg') {
			// SVG inlines smaller as utf8;charset with minimal percent-encoding than base64.
			const enc = encodeURIComponent(buf.toString('utf8')).replace(/%20/g, ' ');
			return `data:${mime};charset=utf-8,${enc}`;
		}
		return `data:${mime};base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}

/**
 * Replace every `file://…` URL in the document (in `<img src>` and CSS
 * `url('file://…')`) with a data: URI. Returns the rewritten HTML and a list of
 * assets that could not be inlined (the honesty report).
 *
 * TRUST BOUNDARY: this reads arbitrary local files a `file://` URL names and bakes
 * their bytes into the shared file. That is BENIGN for the CLI (an author baking
 * their OWN deck on their OWN machine — they already have those files). It would be a
 * disclosure vector if this exporter is ever run SERVER-SIDE on an UNTRUSTED deck
 * (`<img src="file:///etc/passwd">`): a hosted bake path must first gate `file://`
 * inlining to an allowlisted asset root under the deck directory.
 */
function inlineFileUrls(html) {
	const missing = [];
	const inlinedUrls = new Set();
	const seen = new Map();
	const inline = (fileUrl) => {
		if (seen.has(fileUrl)) return seen.get(fileUrl);
		let abs;
		try {
			abs = fileURLToPath(fileUrl.split(/[?#]/)[0]);
		} catch {
			missing.push(fileUrl);
			return null;
		}
		const uri = fileToDataUri(abs);
		if (uri) inlinedUrls.add(fileUrl);
		else missing.push(fileUrl);
		seen.set(fileUrl, uri);
		return uri;
	};
	// `<img src="file://…">` ONLY (matched as a whole img tag): NOT stylesheet <link>
	// hrefs (data: link trips style-src CSP) and NOT <script src> (removed wholesale by
	// the jsdom pass — never inlined, never regex-"sanitized" here).
	let out = html.replace(/(<img\b[^>]*?\bsrc=)(["'])(file:\/\/[^"']+)\2/gi, (m, pre, q, url) => {
		const uri = inline(url);
		return uri ? `${pre}${q}${uri}${q}` : m;
	});
	// CSS `url(file://…)` / `url('file://…')` inside inline style attrs and <style>.
	out = out.replace(/url\((["']?)(file:\/\/[^)"']+)\1\)/gi, (m, q, url) => {
		const uri = inline(url);
		return uri ? `url(${q}${uri}${q})` : m;
	});
	return { html: out, missing, count: inlinedUrls.size };
}

/** The three-view player CSS. Palette-blind: uses theme tokens (var(--…)). */
function playerCss() {
	return `
:root{color-scheme:light dark}
html,body{margin:0;padding:0;background:var(--bg,#fff)}
#lp-bar{position:fixed;inset:0 0 auto 0;height:48px;z-index:50;display:flex;align-items:center;gap:.5rem;
 padding:0 14px;background:color-mix(in srgb,var(--bg,#fff) 86%,transparent);backdrop-filter:blur(12px);
 border-bottom:1px solid var(--border,#ddd);font-family:'Outfit',system-ui,sans-serif}
#lp-bar .lp-brand{font-weight:600;color:var(--text-heading,#111);margin-right:auto;font-size:14px;letter-spacing:-.01em;
 overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40vw}
#lp-bar .lp-seg{display:flex;gap:3px;padding:3px;border:1px solid var(--border,#ddd);border-radius:10px;background:var(--bg-alt,#f5f5f5)}
#lp-bar button{font:inherit;font-size:13px;border:none;background:transparent;color:var(--text-secondary,#333);
 padding:6px 11px;border-radius:8px;cursor:pointer;line-height:1}
#lp-bar button:hover{background:var(--bg-alt,#eee)}
#lp-bar button[aria-pressed=true]{background:var(--accent,#4338ca);color:var(--on-accent,#fff)}
#lp-count{font-variant-numeric:tabular-nums;color:var(--text-muted,#888);font-size:13px;min-width:46px;text-align:center}
#lp-mode,#lp-full{border:1px solid var(--border,#ccc)!important;border-radius:8px}
#lp-stage{padding-top:48px}
/* PRESENT — fill the DYNAMIC viewport (dvh) so mobile toolbars don't clip the stage;
   touch-action:none frees a horizontal drag for slide-swipe instead of scroll/zoom. */
[data-lp-view=present] #lp-stage{position:fixed;top:48px;left:0;right:0;height:calc(100dvh - 48px);box-sizing:border-box;display:grid;place-items:center;justify-content:center;overflow:hidden;background:var(--bg,#fff);touch-action:none}
[data-lp-view=present] section[data-lattice-slide]{display:none;box-shadow:0 24px 70px -22px rgba(0,0,0,.45)}
[data-lp-view=present] section[data-lattice-slide].lp-active{display:block;transform-origin:center center}
[data-lp-view=present] #lp-doc{display:none}
/* READ · SLIDES — stack the real slides, scaled, in a column */
[data-lp-view=read-slides] #lp-doc{display:none}
[data-lp-view=read-slides] #lp-stage{max-width:960px;margin:0 auto;padding:28px 18px 120px}
[data-lp-view=read-slides] section[data-lattice-slide]{width:100%!important;height:auto!important;aspect-ratio:16/9;
 display:block;margin:0 0 26px;border-radius:12px;overflow:hidden;border:1px solid var(--border,#e5e5e5);
 box-shadow:0 8px 30px -16px rgba(0,0,0,.35)}
/* READ · ARTICLE — Typora-style prose + sticky left TOC (shell; component-aware projection = P4) */
[data-lp-view=read-article] #lp-stage{display:none}
#lp-doc{display:none}
[data-lp-view=read-article] #lp-doc{display:grid;grid-template-columns:250px minmax(0,1fr);align-items:start}
#lp-toc{position:sticky;top:48px;max-height:calc(100vh - 48px);overflow:auto;padding:38px 16px 38px 24px;
 border-right:1px solid var(--border,#e5e5e5);font-family:'Outfit',system-ui,sans-serif}
#lp-toc a{display:block;text-decoration:none;color:var(--text-secondary,#555);font-size:13px;padding:4px 9px;
 border-radius:6px;border-left:2px solid transparent;margin:1px 0}
#lp-toc a.lp-lvl2{padding-left:20px;color:var(--text-muted,#888)}
#lp-toc a:hover{background:var(--bg-alt,#f4f4f4)}
#lp-toc a.lp-on{color:var(--accent,#4338ca);border-left-color:var(--accent,#4338ca);background:var(--bg-alt,#f4f4f4);font-weight:600}
#lp-article{max-width:740px;margin:0 auto;padding:48px 32px 140px;font-family:'Outfit',system-ui,sans-serif;
 color:var(--text-body,#1a1a1a);font-size:18px;line-height:1.72}
#lp-article h1{font-family:'Playfair Display',serif;font-size:40px;line-height:1.1;color:var(--text-heading,#0d0d0d);margin:1.4em 0 .4em;letter-spacing:-.02em}
#lp-article h1:first-child{margin-top:0}
#lp-article h2{font-family:'Playfair Display',serif;font-size:27px;line-height:1.15;color:var(--text-heading,#111);margin:1.7em 0 .4em}
#lp-article p{margin:0 0 1em}#lp-article ul,#lp-article ol{margin:0 0 1.1em;padding-left:1.3em}#lp-article li{margin:.3em 0}
#lp-article .lp-kicker{font-size:13px;text-transform:uppercase;letter-spacing:.09em;color:var(--text-muted,#888);margin:1.8em 0 -.1em;font-family:'Outfit',system-ui,sans-serif}
#lp-article h1+.lp-kicker,#lp-article h2+.lp-kicker{margin-top:.2em}
#lp-article blockquote{border-left:3px solid var(--accent,#4338ca);margin:1.3em 0;padding:.1em 0 .1em 1.1em;color:var(--text-secondary,#333);font-size:1.05em}
#lp-article .lp-cite{display:block;margin:-.6em 0 1.3em 1.2em;color:var(--text-muted,#888);font-style:normal;font-size:.9em}
#lp-article .lp-cite::before{content:"— "}
#lp-article .lp-stats{display:grid;grid-template-columns:auto 1fr;gap:.35em 1em;margin:0 0 1.3em;align-items:baseline}
#lp-article .lp-stats dt{font-family:'Playfair Display',serif;font-size:1.5em;font-weight:700;color:var(--text-heading,#0d0d0d);font-variant-numeric:tabular-nums}
#lp-article .lp-stats dd{margin:0;color:var(--text-secondary,#333)}
#lp-article .lp-figure{margin:1.4em 0}#lp-article .lp-figure svg,#lp-article .lp-figure img{max-width:100%;height:auto}
#lp-article figcaption{font-size:.85em;color:var(--text-muted,#888);margin-top:.5em;text-align:center}
#lp-article .lp-figure-note{border:1px dashed var(--border,#ccc);border-radius:10px;padding:1.1em 1.3em;background:var(--bg-alt,#f7f7f7)}
#lp-article .lp-visual-note{margin:0;color:var(--text-secondary,#555);font-size:.95em}
#lp-article table{border-collapse:collapse;width:100%;margin:0 0 1.3em;font-size:.92em}
#lp-article th,#lp-article td{border:1px solid var(--border,#e2e2e2);padding:.4em .7em;text-align:left}
#lp-article th{background:var(--bg-alt,#f5f5f5);font-weight:600}
#lp-article pre{background:var(--bg-alt,#f5f5f5);padding:1em;border-radius:8px;overflow:auto;margin:0 0 1.3em;font-size:.85em}
#lp-article code{font-family:'JetBrains Mono',monospace;font-size:.88em}
@media (max-width:820px){[data-lp-view=read-article] #lp-doc{grid-template-columns:1fr}#lp-toc{display:none}}
/* JS-off floor: with no player, slides just stack and scroll. */
`.trim();
}

/** The single inline player script (hashed by the CSP). Pure DOM transport. */
async function playerJs() {
	// Inline the shared transport kernel (lib/core/present-transport.mjs) VERBATIM —
	// the player's script is CSP-hashed and cannot import, so its source is embedded
	// via `.toString()`. This is HARD RULE #1: the fit math + index/nav bounds + the
	// keymap live once and the docs-site transports import the same module. The
	// player's fit reproduces its historical scale exactly (insetX 56, insetY 48+56).
	const { fitScale, createTransport, keyAction, swipeAction, PRESENT_KEYMAP } = await import('../core/present-transport.mjs');
	const kernel =
		`var PRESENT_KEYMAP=${JSON.stringify(PRESENT_KEYMAP)};\n` +
		`${keyAction.toString()}\n${fitScale.toString()}\n${createTransport.toString()}\n${swipeAction.toString()}`;
	return `(function(){
${kernel}
var root=document.documentElement,app=document.getElementById('lp-app');
var slides=[].slice.call(document.querySelectorAll('section[data-lattice-slide]'));
var count=document.getElementById('lp-count'),view='present';
var t=createTransport({count:slides.length,onShow:render});
function fit(){if(view!=='present')return;var s=slides[t.index];if(!s)return;
 s.style.transform='scale('+fitScale({stageW:innerWidth,stageH:innerHeight,slideW:1280,slideH:720,insetX:56,insetY:48+56})+')';}
function render(){var i=t.index;slides.forEach(function(s,n){s.classList.toggle('lp-active',n===i);});
 if(count)count.textContent=(i+1)+' / '+slides.length;fit();}
function setView(v){view=v;app.setAttribute('data-lp-view',v);
 [].forEach.call(document.querySelectorAll('[data-lp-btn]'),function(b){b.setAttribute('aria-pressed',b.getAttribute('data-lp-btn')===v);});
 if(count)count.style.visibility=v==='present'?'visible':'hidden';if(v==='present')render();}
addEventListener('keydown',function(e){if(view!=='present')return;
 var a=keyAction(e.key);if(!a)return;t[a]();e.preventDefault();});
addEventListener('resize',fit);addEventListener('orientationchange',fit);
if(window.visualViewport){try{visualViewport.addEventListener('resize',fit)}catch(e){}}
// Touch/swipe on the present stage — a decisive horizontal drag turns the slide
// (the shared swipeAction; a vertical/short move is ignored so it never fights scroll).
var stage=document.getElementById('lp-stage'),sx=0,sy=0,sw=false;
if(stage){stage.addEventListener('pointerdown',function(e){if(view!=='present')return;sx=e.clientX;sy=e.clientY;sw=true;},{passive:true});
 stage.addEventListener('pointerup',function(e){if(!sw||view!=='present')return;sw=false;
  var a=swipeAction({dx:e.clientX-sx,dy:e.clientY-sy});if(a)t[a]();},{passive:true});}
// Fullscreen toggle — present from the file to a room. Feature-detected; a browser
// without the API just never shows the affordance change.
var full=document.getElementById('lp-full');
if(full){full.onclick=function(){var d=document,el=d.documentElement;
  if(d.fullscreenElement||d.webkitFullscreenElement){(d.exitFullscreen||d.webkitExitFullscreen||function(){}).call(d);}
  else{(el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el);}};
 document.addEventListener('fullscreenchange',function(){full.setAttribute('aria-pressed',!!(document.fullscreenElement||document.webkitFullscreenElement));fit();});}
[].forEach.call(document.querySelectorAll('[data-lp-btn]'),function(b){b.onclick=function(){setView(b.getAttribute('data-lp-btn'));};});
var mode=document.getElementById('lp-mode');
if(mode)mode.onclick=function(){var d=root.style.colorScheme==='dark';root.style.colorScheme=d?'light':'dark';mode.textContent=d?'☾':'☀';};
var links=[].slice.call(document.querySelectorAll('#lp-toc a'));
if(links.length&&window.IntersectionObserver){var spy=new IntersectionObserver(function(es){es.forEach(function(e){
 if(e.isIntersecting)links.forEach(function(l){l.classList.toggle('lp-on',l.getAttribute('href')==='#'+e.target.id);});});},
 {rootMargin:'-48px 0px -70% 0px'});[].forEach.call(document.querySelectorAll('#lp-article [id^=lp-sec-]'),function(h){spy.observe(h);});}
setView('present');
})();`;
}

/**
 * Build the Read·Article body + TOC from the sanitized slide DOM via the shared
 * component-aware prose projection (lib/transformers/prose-projection.mjs, P4).
 * Returns the article HTML and the TOC as rendered anchors.
 */
async function buildArticle(doc) {
	const { projectDeckToProse } = await import('../transformers/prose-projection.mjs');
	const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
	const { articleHtml, toc } = projectDeckToProse(sections);
	const tocHtml = toc
		.map((t) => `<a href="#${t.id}"${t.level === 2 ? ' class="lp-lvl2"' : ''}>${escapeText(t.text)}</a>`)
		.join('\n');
	return { article: articleHtml, toc: tocHtml };
}

function escapeText(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Lossless CSS minify for the inlined stylesheet — strip comments + collapse
 * whitespace. SAFE by construction: comments, quoted strings and `url(…)` are
 * tokenized in ONE left-to-right pass, so a quote *inside* a comment can never be
 * mistaken for a string delimiter (and a `/*` inside a string is never stripped).
 * Comments drop; strings/urls are stashed verbatim (so `content:"  "` and urls
 * are untouched). Only `{};:,` are tightened — NOT the combinators/operators
 * `+ ~ >`, which must keep their spaces inside `calc()` and selectors. Matches the
 * build's own `lattice.min.css` size.
 *
 * The single pass is load-bearing: an earlier version protected strings BEFORE
 * stripping comments, and `lattice.css`'s 400+ apostrophe-bearing comments paired
 * across comment boundaries and silently deleted half the stylesheet (2,686 → 411
 * rules, output no longer parsing). Do not split this into two passes.
 */
function minifyCss(css) {
	const stash = [];
	const min = css
		.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)/g, (m) => {
			if (m.startsWith('/*')) return ''; // comment \u2192 drop (in the SAME pass as strings)
			stash.push(m); // string / url() \u2192 stash verbatim
			return `\uE000${stash.length - 1}\uE000`;
		})
		.replace(/\s+/g, ' ')
		.replace(/\s*([{};:,])\s*/g, '$1')
		.replace(/;}/g, '}')
		.trim();
	return min.replace(/\uE000(\d+)\uE000/g, (_m, i) => stash[Number(i)]);
}
function escapeAttr(s) {
	return escapeText(s).replace(/"/g, '&quot;');
}

/**
 * Assemble the self-contained player HTML.
 *
 * @param {object} opts
 * @param {string} opts.docHtml       the emulator's cleanDocHtml (self-contained render)
 * @param {string} opts.source        verbatim LFM source (for the envelope)
 * @param {string} [opts.title]
 * @param {object} [opts.theme]       { name, palette, mode }
 * @param {object} [opts.config]      deck frontmatter
 * @param {boolean}[opts.notes]
 * @param {number} [opts.now] @param {string} [opts.build] @param {string} [opts.playerVersion]
 * @returns {Promise<{ html: string, report: { images: number, missing: string[], strippedScripts: string[], math: boolean } }>}
 */
async function buildPlayerHtml(opts) {
	const { docHtml, source } = opts;
	if (typeof docHtml !== 'string' || typeof source !== 'string') {
		throw new TypeError('buildPlayerHtml: docHtml and source strings are required.');
	}
	const report = { images: 0, missing: [], strippedScripts: [], math: false };

	// 1. DETECT (do not regex-strip) runtime-inflated `file://` <script> srcs
	//    (state-chart / function-plot) for the honesty report — their headless bake is
	//    a later slice. The scripts are REMOVED wholesale by the jsdom pass below
	//    (`script:not([type=lattice+json])`), which is the real guard; a regex is never
	//    the sanitizer here (it can't reliably neutralize HTML — CodeQL is right).
	for (const m of docHtml.matchAll(/<script\b[^>]*\bsrc=["'](file:\/\/[^"']*)["']/gi)) {
		report.strippedScripts.push(m[1]);
	}
	let html = docHtml;

	// 2. inline file:// images (only <img src>; scripts are not inlined — see above).
	const inlined = inlineFileUrls(html);
	report.images = inlined.count;
	report.missing = inlined.missing;
	html = inlined.html;

	// 3. KaTeX: inline the stylesheet only if the deck actually renders math; else
	//    drop the file:// link (offline-safe). (Full KaTeX-font inlining is a later slice.)
	report.math = /class="katex/.test(html);
	html = html.replace(/<link[^>]*katex[^>]*>\s*/i, () => {
		if (!report.math) return '';
		const cssPath = (() => {
			try {
				return require.resolve('katex/dist/katex.min.css');
			} catch {
				return null;
			}
		})();
		if (!cssPath) {
			report.missing.push('katex.min.css');
			return '';
		}
		return `<style>${minifyCss(fs.readFileSync(cssPath, 'utf8'))}</style>`;
	});

	// 4. Parse in jsdom, sanitize the slide DOM, build the article shell.
	const { JSDOM } = require('jsdom');
	const { createSlideSanitizer } = await import('../core/sanitize-slide-html.mjs');
	const DOMPurify = require('dompurify');
	const dom = new JSDOM(html);
	const { window } = dom;
	const doc = window.document;
	// Drop every inline <script> from the rendered doc (authoring watcher etc.) — the
	// ONLY script the player ships is our single hashed transport block.
	for (const s of [...doc.querySelectorAll('script:not([type="application/lattice+json"])')]) s.remove();
	// Sanitize the slide DOM (the #616 guard; the file is a live surface). Sanitize
	// each section's OUTER html — so the section element's own attributes (class/style/
	// on*) are cleaned too, not just its children — and replace the node in place.
	const sanitize = createSlideSanitizer(DOMPurify, window);
	for (const sec of [...doc.querySelectorAll('section[data-lattice-slide]')]) {
		sec.outerHTML = sanitize(sec.outerHTML);
	}
	const slidesHtml = [...doc.querySelectorAll('section[data-lattice-slide]')].map((s) => s.outerHTML).join('\n');
	// Body-level a11y texture defs are engine-injected + author-unreachable today, but
	// sanitize them too so the two-layer model never degrades to CSP-only for any region.
	const a11yDefs = [...doc.querySelectorAll('body > svg')].map((s) => sanitize(s.outerHTML)).join('\n');
	const { article, toc } = await buildArticle(doc);
	// Reuse the rendered doc's inline <style> (base64 fonts + lattice.css + theme),
	// but STRIP the redundant relative `@font-face{…url(fonts/…)}` blocks: the base64
	// `#lattice-embedded-fonts` block already declares every face, so the relative
	// refs are dead weight that resolve to `file://` on open (offline-broken + CSP
	// noise). The base64 faces use `url(data:…)` and are untouched by this strip.
	const styles = [...doc.querySelectorAll('head style, head link[rel="stylesheet"]')]
		.map((s) => {
			let out = s.outerHTML.replace(/@font-face\s*\{[^{}]*url\(\s*['"]?fonts\/[^{}]*\}/gi, '');
			// Minify every <style> EXCEPT the base64 font block — the engine inlines the
			// UNMINIFIED lattice.css (~955 KB, 1600+ comments), the file's single biggest
			// chunk. Minifying it (lossless) is the largest size lever (~518 KB), bigger
			// than font subsetting. (The base64 font block is left alone — nothing to gain
			// and its data-URIs must not be touched.)
			if (s.tagName === 'STYLE' && s.id !== 'lattice-embedded-fonts') {
				out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/i, (_m, open, css, close) => `${open}${minifyCss(css)}${close}`);
			}
			return out;
		})
		.join('\n');
	const lang = doc.documentElement.getAttribute('lang') || 'en';
	const title = opts.title || doc.querySelector('title')?.textContent || 'Lattice deck';

	// 5–6. player chrome + single hashed script + CSP.
	const js = await playerJs();
	const jsHash = crypto.createHash('sha256').update(js, 'utf8').digest('base64');
	const csp =
		`default-src 'none'; script-src 'sha256-${jsHash}'; style-src 'unsafe-inline'; ` +
		`img-src data:; font-src data:; base-uri 'none'; form-action 'none'`;

	// 7. envelope (verbatim source; whole-envelope base64 → no breakout).
	const envelope = buildEnvelope(
		{ source, title, theme: opts.theme, config: opts.config, notes: opts.notes },
		{ now: opts.now, build: opts.build, playerVersion: opts.playerVersion },
	);

	const out = `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
<title>${escapeText(title)}</title>
${styles}
<style>${minifyCss(playerCss())}</style>
</head><body>
<div id="lp-bar">
 <span class="lp-brand">${escapeText(title)}</span>
 <div class="lp-seg">
  <button data-lp-btn="present" aria-pressed="true">Present</button>
  <button data-lp-btn="read-slides" aria-pressed="false">Read · Slides</button>
  <button data-lp-btn="read-article" aria-pressed="false">Read · Article</button>
 </div>
 <span id="lp-count"></span>
 <button id="lp-full" title="Toggle fullscreen" aria-pressed="false">⛶</button>
 <button id="lp-mode" title="Toggle dark / light">☾</button>
</div>
<div id="lp-app" data-lp-view="present">
 <div id="lp-stage">
${a11yDefs}
${slidesHtml}
 </div>
 <div id="lp-doc">
  <nav id="lp-toc">
${toc}
  </nav>
  <article id="lp-article">
${article}
  </article>
 </div>
</div>
<script>${js}</script>
${envelope}
</body></html>`;

	// Glyph-subset the embedded text fonts to just the characters this deck uses —
	// the single biggest size lever (~6×). Optional dep + graceful fallback.
	const subset = await subsetEmbeddedFonts(out);
	return { html: subset.html, report: { ...report, fontBytesSaved: subset.saved, subsetApplied: subset.applied } };
}

/**
 * Rewrite each embedded `@font-face` `data:font/woff2` to a glyph subset covering
 * only the characters the shipped file could ever show. OPTIONAL: if `subset-font`
 * isn't installed the file ships with full fonts (today's behavior) — never a hard
 * failure. Emoji are unaffected: they render via the recipient's SYSTEM emoji font
 * (no emoji font is embedded), so they were never in these text faces.
 *
 * @param {string} html the assembled player HTML
 * @returns {Promise<{ html: string, applied: boolean, saved: number }>}
 */
async function subsetEmbeddedFonts(html) {
	let subsetFont;
	try {
		subsetFont = require('subset-font');
	} catch {
		return { html, applied: false, saved: 0 }; // optional dep absent — ship full fonts
	}
	// The character set = EVERY distinct character in the whole document — visible
	// slide/article/chrome text AND the player-JS glyph literals (e.g. the ☀ that
	// only appears after a dark-toggle) AND attributes. Collected by CODE POINT (the
	// string iterator, so a surrogate-pair emoji stays one entry) — over-inclusive
	// on purpose: an unused char costs ~nothing, a missing one is permanent tofu.
	const chars = [...new Set(html)].join('');
	const re = /url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/g;
	const uniq = [...new Set([...html.matchAll(re)].map((m) => m[1]))];
	const map = new Map();
	let saved = 0;
	for (const b64 of uniq) {
		try {
			const full = Buffer.from(b64, 'base64');
			const sub = await subsetFont(full, chars, { targetFormat: 'woff2' });
			const subB64 = sub.toString('base64');
			// Only accept a subset that is actually smaller (a corrupt/parse edge could
			// grow it); otherwise keep the full face.
			if (subB64.length < b64.length) {
				saved += b64.length - subB64.length;
				map.set(b64, subB64);
			}
		} catch {
			/* per-face failure — keep the full face, no tofu */
		}
	}
	if (map.size === 0) return { html, applied: false, saved: 0 };
	const out = html.replace(re, (m, b64) => (map.has(b64) ? `url(data:font/woff2;base64,${map.get(b64)})` : m));
	return { html: out, applied: true, saved };
}

// ── used-selector CSS pruning (P6) ───────────────────────────────────────────
// The player inlines the WHOLE visual contract (all 53 components) but a given
// deck uses a handful. Dropping the rules whose selectors match no element in the
// baked DOM is the last size lever toward the "Minimal" tier — and the riskiest,
// because a wrongly-dropped rule breaks a FROZEN file silently. Two guards make it
// safe: (1) matching is AUTHORITATIVE — the emulator answers `isUsed` with real
// Chromium `querySelector` against the union of all three view-DOMs, not a token
// heuristic; (2) the emulator gates the result behind a computed-style diff and
// falls back to the full CSS on any mismatch (see the --player wiring). Slide
// content is fully STATIC in the player (no overflow watcher, no in-slide runtime
// state), and the runtime-toggled chrome classes (lp-active / lp-on / data-lp-view)
// live in the un-pruned playerCss block — so the static union DOM is complete.

// Pseudo-classes a static `querySelector` can never satisfy — stripped to the
// structural BASE before matching, so `.btn:hover` rides with `.btn` and a
// `::before` decoration rides with its subject. Structural pseudos that
// querySelector CAN evaluate (:not/:is/:where/:has/:nth-*/:first-child/:root/…)
// are deliberately NOT here — they stay in the base and get matched for real.
const DYNAMIC_PSEUDO_CLASSES = new Set([
	'hover', 'focus', 'focus-visible', 'focus-within', 'active', 'target', 'visited',
	'link', 'checked', 'enabled', 'disabled', 'indeterminate', 'default', 'required',
	'optional', 'valid', 'invalid', 'in-range', 'out-of-range', 'read-only', 'read-write',
	'placeholder-shown', 'autofill', 'user-invalid', 'user-valid', 'current', 'past', 'future',
]);

// A dynamic pseudo can also hide NESTED inside a functional pseudo-class —
// `.a:is(.b:hover)`, `.a:has(:focus-within)` — where `baseSelectorString` (which
// strips only top-level pseudos) leaves it in the base. Such a base can never match
// the static DOM (`querySelector(':is(.b:hover)')` → null), so the rule would be
// FALSE-DROPPED and the computed-style gate can't catch it (it never enters an
// interaction state). So: if the base STILL carries a dynamic pseudo, force-keep the
// rule. Zero occurrences in today's lattice.css, but frozen files exported after a
// future `:has(:hover)` lands must not silently break.
const DYNAMIC_PSEUDO_RE = new RegExp(`:(?:${[...DYNAMIC_PSEUDO_CLASSES].join('|')})(?![-\\w])`, 'i');

// Optional opt-in keep list (whole-token match on the base, never a substring — so
// `body` never keeps `.accent-body`). Empty by default: :root / html / body all
// match the real document via querySelector, so they need no special-casing; this
// is the hook for a future runtime-injected class the static DOM wouldn't show.
const PLAYER_PRUNE_SAFELIST = [];

function requireCssTree() {
	try {
		return require('css-tree');
	} catch {
		return null; // optional dep absent — pruning is skipped, full CSS ships
	}
}

/**
 * Reduce ONE css-tree Selector node to its static base string: pseudo-elements and
 * dynamic pseudo-classes removed, everything structural (classes, attributes,
 * combinators, :not/:is/:has, …) kept. Returns '' when nothing structural remains
 * (e.g. a bare `::backdrop`) — the caller treats '' as keep-on-doubt.
 */
function baseSelectorString(csstree, selector) {
	const clone = csstree.clone(selector);
	const drop = [];
	clone.children.forEach((node, item) => {
		if (
			node.type === 'PseudoElementSelector' ||
			(node.type === 'PseudoClassSelector' && DYNAMIC_PSEUDO_CLASSES.has(node.name))
		) {
			drop.push(item);
		}
	});
	for (const item of drop) clone.children.remove(item);
	// A dangling leading/trailing combinator left by the removal (rare) would make
	// an invalid selector — trim to be safe.
	return csstree.generate(clone).replace(/^[\s>+~]+|[\s>+~]+$/g, '').trim();
}

/**
 * Every distinct base selector in `css` (deduped) — the emulator tests each against
 * the real rendered DOM and hands back the used set for {@link prunePlayerCss}.
 * Returns [] if css-tree isn't installed (→ caller keeps the full CSS).
 *
 * @param {string} css
 * @returns {string[]}
 */
function collectBaseSelectors(css) {
	const csstree = requireCssTree();
	if (!csstree) return [];
	const set = new Set();
	const ast = csstree.parse(css);
	csstree.walk(ast, {
		visit: 'Selector',
		enter(selector) {
			const base = baseSelectorString(csstree, selector);
			if (base) set.add(base);
		},
	});
	return [...set];
}

/**
 * Drop every style rule whose selectors all match nothing. `isUsed(base)` is the
 * authoritative predicate (real-DOM `querySelector` from the emulator). At-rules
 * ride along: @font-face / @keyframes / @page / @layer / @import are always kept,
 * and @media / @container / @supports keep only their surviving inner rules (an
 * emptied block is dropped). A rule with several selectors keeps only the members
 * that match. css-tree absent OR any parse error → the full CSS is returned
 * unchanged (never a hard failure on a frozen artifact).
 *
 * @param {string} css
 * @param {(base: string) => boolean} isUsed
 * @param {{ safelist?: string[] }} [opts]
 * @returns {{ css: string, applied: boolean, totalRules: number, keptRules: number }}
 */
function prunePlayerCss(css, isUsed, opts = {}) {
	const csstree = requireCssTree();
	if (!csstree) return { css, applied: false, totalRules: 0, keptRules: 0 };
	const safelist = opts.safelist || PLAYER_PRUNE_SAFELIST;
	// Safelist match is whole-token (split the base on combinators/commas), never a
	// substring — so a `body` entry can't accidentally keep `.accent-body`.
	const safelisted = (base) => safelist.some((s) => base === s || base.split(/[\s>+~,]+/).includes(s));
	const keep = (base) =>
		!base || DYNAMIC_PSEUDO_RE.test(base) || safelisted(base) || isUsed(base);
	let total = 0;
	let kept = 0;
	try {
		const ast = csstree.parse(css);
		// Pass 1 — prune selectors inside every style Rule; mark fully-dead rules.
		csstree.walk(ast, {
			visit: 'Rule',
			enter(rule, item, list) {
				if (!rule.prelude || rule.prelude.type !== 'SelectorList') return;
				// A rule INSIDE @keyframes has `from`/`to`/`50%` preludes that parse as a
				// SelectorList but are NOT document selectors — never prune them, or the
				// whole animation is silently dropped.
				if (this.atrule && /keyframes$/i.test(this.atrule.name)) return;
				total++;
				const dead = [];
				rule.prelude.children.forEach((selector, selItem) => {
					if (!keep(baseSelectorString(csstree, selector))) dead.push(selItem);
				});
				const survivors = rule.prelude.children.size - dead.length;
				if (survivors === 0) {
					list.remove(item); // whole rule is dead
					return;
				}
				for (const selItem of dead) rule.prelude.children.remove(selItem);
				kept++;
			},
		});
		// Pass 2 — drop at-rule blocks (@media/@container/@supports) emptied by pass 1.
		csstree.walk(ast, {
			visit: 'Atrule',
			enter(atrule, item, list) {
				if (atrule.block && atrule.block.children.isEmpty) list.remove(item);
			},
		});
		return { css: csstree.generate(ast), applied: true, totalRules: total, keptRules: kept };
	} catch {
		return { css, applied: false, totalRules: total, keptRules: kept };
	}
}

/** Normalize a CSS font-family token for comparison: strip quotes + trim. */
function normalizeFamily(name) {
	return String(name).trim().replace(/^["']|["']$/g, '').trim();
}

/**
 * Drop the embedded `@font-face` faces whose family the deck never uses. The player
 * embeds the WHOLE type stack (display serif, body sans, mono, AND the two `sketch`
 * hand faces) regardless of the deck; a boardroom deck ships the ~267 KB sketch pair
 * for nothing. `usedFamilies` is authoritative — the emulator collects it from the
 * real render (every face the browser actually loaded, UNION every family named in
 * an element's computed `font-family`), so a deck that genuinely uses `sketch` keeps
 * Caveat + Shantell; a deck that doesn't, drops them. Family-level by design: if a
 * family is used at all, ALL its weights/italics ride along (no weight surprise).
 *
 * SAFETY: keep-on-doubt everywhere. A face whose family can't be parsed is kept; an
 * EMPTY `usedFamilies` (detection failed) keeps everything (never strand a deck with
 * no fonts). Returns { css, applied, total, kept }.
 *
 * @param {string} fontCss  the `#lattice-embedded-fonts` block body (@font-face rules)
 * @param {Set<string>|string[]} usedFamilies  normalized family names actually used
 */
function prunePlayerFontFaces(fontCss, usedFamilies) {
	// Case-folded compare: CSS family matching is ASCII case-insensitive, so a theme
	// that authors a family in non-canonical case must still match its face.
	const fold = (s) => normalizeFamily(s).toLowerCase();
	const used = new Set([...usedFamilies].map(fold));
	if (used.size === 0) return { css: fontCss, applied: false, total: 0, kept: 0 };
	const faces = fontCss.match(/@font-face\s*\{[^}]*\}/gi) || [];
	if (faces.length === 0) return { css: fontCss, applied: false, total: 0, kept: 0 };
	let kept = 0;
	const out = faces
		.filter((face) => {
			const m = face.match(/font-family\s*:\s*([^;}]+)/i);
			if (!m) return true; // unparseable family → keep (never drop on doubt)
			const keep = used.has(fold(m[1]));
			if (keep) kept++;
			return keep;
		})
		.join('');
	// If nothing would be dropped, report not-applied (no rewrite needed). And if
	// NOTHING matched (kept 0) — a used-set that names no embedded family — treat it
	// as a detection failure and keep every face, never strand the deck fontless.
	if (kept === faces.length || kept === 0) return { css: fontCss, applied: false, total: faces.length, kept };
	return { css: out, applied: true, total: faces.length, kept };
}

module.exports = {
	buildPlayerHtml,
	inlineFileUrls,
	fileToDataUri,
	subsetEmbeddedFonts,
	minifyCss,
	collectBaseSelectors,
	prunePlayerCss,
	baseSelectorString,
	prunePlayerFontFaces,
	normalizeFamily,
	PLAYER_PRUNE_SAFELIST,
};
