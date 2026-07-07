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
#lp-mode{border:1px solid var(--border,#ccc)!important;border-radius:8px}
#lp-stage{padding-top:48px}
/* PRESENT */
[data-lp-view=present] #lp-stage{position:fixed;inset:48px 0 0 0;display:grid;place-items:center;overflow:hidden;background:var(--bg,#fff)}
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
#lp-article h1{font-family:'Playfair Display',serif;font-size:40px;line-height:1.1;color:var(--text-display,#0d0d0d);margin:0 0 .5em;letter-spacing:-.02em}
#lp-article h2{font-family:'Playfair Display',serif;font-size:27px;line-height:1.15;color:var(--text-heading,#111);margin:1.7em 0 .4em}
#lp-article p{margin:0 0 1em}#lp-article ul{margin:0 0 1.1em;padding-left:1.3em}#lp-article li{margin:.3em 0}
@media (max-width:820px){[data-lp-view=read-article] #lp-doc{grid-template-columns:1fr}#lp-toc{display:none}}
/* JS-off floor: with no player, slides just stack and scroll. */
`.trim();
}

/** The single inline player script (hashed by the CSP). Pure DOM transport. */
function playerJs() {
	return `(function(){
var root=document.documentElement,app=document.getElementById('lp-app');
var slides=[].slice.call(document.querySelectorAll('section[data-lattice-slide]'));
var count=document.getElementById('lp-count');var i=0,view='present';
function fit(){if(view!=='present')return;var s=slides[i];if(!s)return;
 var k=Math.min((innerWidth-56)/1280,(innerHeight-48-56)/720);s.style.transform='scale('+k+')';}
function show(){slides.forEach(function(s,n){s.classList.toggle('lp-active',n===i);});
 if(count)count.textContent=(i+1)+' / '+slides.length;fit();}
function setView(v){view=v;app.setAttribute('data-lp-view',v);
 [].forEach.call(document.querySelectorAll('[data-lp-btn]'),function(b){b.setAttribute('aria-pressed',b.getAttribute('data-lp-btn')===v);});
 if(count)count.style.visibility=v==='present'?'visible':'hidden';if(v==='present')show();}
addEventListener('keydown',function(e){if(view!=='present')return;
 if(e.key==='ArrowRight'||e.key===' '){i=Math.min(i+1,slides.length-1);show();e.preventDefault();}
 else if(e.key==='ArrowLeft'){i=Math.max(i-1,0);show();}});
addEventListener('resize',fit);
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
 * Build the article shell + TOC from the sanitized slide DOM (P2: headings-first;
 * the component-aware projection is P4). Promotes each slide's first heading to the
 * article spine and lifts its paragraphs/lists as prose.
 */
function buildArticle(doc) {
	const toc = [];
	const parts = [];
	const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
	sections.forEach((sec, idx) => {
		const h = sec.querySelector('h1, h2, h3');
		const id = `lp-sec-${idx}`;
		const level = h && h.tagName === 'H1' ? 1 : 2;
		const heading = h ? h.textContent.trim() : `Slide ${idx + 1}`;
		toc.push({ id, level, heading });
		parts.push(`<h${level} id="${id}">${escapeText(heading)}</h${level}>`);
		// Lift prose (shell fidelity — the component-aware projection is P4). Clone the
		// slide's block content in document order, preserving list NESTING (cloning the
		// list rather than flattening `li` avoids the parent+child duplication), and
		// skipping the heading we already promoted + hidden speaker-notes/chrome.
		const blocks = [...sec.querySelectorAll(':scope p, :scope ul, :scope ol, :scope blockquote, :scope pre, :scope table')];
		const emitted = new Set();
		for (const el of blocks) {
			// Skip nodes nested inside another block we'll already emit (e.g. a <p>/<ul>
			// inside a <li>): only top-most blocks, so nesting is preserved once.
			if (el.closest('li, blockquote, pre, table') && el.closest('li, blockquote, pre, table') !== el) continue;
			if ([...emitted].some((e) => e.contains(el))) continue;
			if (el.closest('aside, header, footer, .lattice-notes')) continue;
			const txt = el.textContent.trim();
			if (!txt) continue;
			emitted.add(el);
			parts.push(el.outerHTML);
		}
	});
	const tocHtml = toc
		.map((t) => `<a href="#${t.id}"${t.level === 2 ? ' class="lp-lvl2"' : ''}>${escapeText(t.heading)}</a>`)
		.join('\n');
	return { article: parts.join('\n'), toc: tocHtml };
}

function escapeText(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
		return `<style>${fs.readFileSync(cssPath, 'utf8')}</style>`;
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
	const { article, toc } = buildArticle(doc);
	// Reuse the rendered doc's inline <style> (base64 fonts + lattice.css + theme),
	// but STRIP the redundant relative `@font-face{…url(fonts/…)}` blocks: the base64
	// `#lattice-embedded-fonts` block already declares every face, so the relative
	// refs are dead weight that resolve to `file://` on open (offline-broken + CSP
	// noise). The base64 faces use `url(data:…)` and are untouched by this strip.
	const styles = [...doc.querySelectorAll('head style, head link[rel="stylesheet"]')]
		.map((s) => s.outerHTML.replace(/@font-face\s*\{[^{}]*url\(\s*['"]?fonts\/[^{}]*\}/gi, ''))
		.join('\n');
	const lang = doc.documentElement.getAttribute('lang') || 'en';
	const title = opts.title || doc.querySelector('title')?.textContent || 'Lattice deck';

	// 5–6. player chrome + single hashed script + CSP.
	const js = playerJs();
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
<style>${playerCss()}</style>
</head><body>
<div id="lp-bar">
 <span class="lp-brand">${escapeText(title)}</span>
 <div class="lp-seg">
  <button data-lp-btn="present" aria-pressed="true">Present</button>
  <button data-lp-btn="read-slides" aria-pressed="false">Read · Slides</button>
  <button data-lp-btn="read-article" aria-pressed="false">Read · Article</button>
 </div>
 <span id="lp-count"></span>
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

	return { html: out, report };
}

module.exports = { buildPlayerHtml, inlineFileUrls, fileToDataUri };
