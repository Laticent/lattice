/**
 * lib/export/player-core.mjs
 *
 * The PURE, browser-safe assembly core of the self-contained `.html` player
 * (engineering/decisions/2026-07-08-studio-html-player-export.md, P1). Everything
 * here is DOM- and fs-free: it takes pre-rendered inputs plus *injected*
 * capabilities and returns the assembled player HTML. Two adapters supply the
 * environment-specific pieces (the sanitize-slide-html seam, reused):
 *
 *   - lib/export/html-player.js (Node)  — the CLI path: jsdom parse, DOMPurify
 *                                          sanitize, crypto sha256, fs image
 *                                          inlining, katex fs read, subset-font.
 *                                          Its output is BYTE-IDENTICAL to before
 *                                          this core was extracted (golden-pinned).
 *   - the Studio (browser, P2)           — real document/DOMParser, crypto.subtle,
 *                                          already-inline assets, fetched katex.
 *
 * The LOGIC lives once (HARD RULE #1): the player CSS/JS templates, minifyCss, the
 * component-aware prose projection, the CSP/envelope assembly. The prune (CSS +
 * font) stays ADAPTER-owned — the emulator prunes in Chromium, the Studio against
 * its live preview iframe — so it is deliberately NOT here.
 *
 * ESM (imported via dynamic `import()` from the CJS adapter, matching how the
 * adapter already loads sanitize-slide-html.mjs / present-transport.mjs).
 */

import { buildEnvelope } from '../core/lattice-doc.js';

export function escapeText(s) {
	return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttr(s) {
	return escapeText(s).replace(/"/g, '&quot;');
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
export function minifyCss(css) {
	const stash = [];
	const min = String(css)
		// Defensive: our placeholder below wraps the stash index in a U+E000 (Private-Use)
		// sentinel; strip any literal U+E000 from the input first so deck-authored CSS that
		// happened to contain it can’t collide with a placeholder. Real CSS never contains
		// this char, so this is a no-op for every real deck (golden-pinned byte-identical).
		.replace(/\uE000/g, "")
		.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)/g, (m) => {
			if (m.startsWith('/*')) return ''; // comment → drop (in the SAME pass as strings)
			stash.push(m); // string / url() → stash verbatim
			return `${stash.length - 1}`;
		})
		.replace(/\s+/g, ' ')
		.replace(/\s*([{};:,])\s*/g, '$1')
		.replace(/;}/g, '}')
		.trim();
	return min.replace(/(\d+)/g, (_m, i) => stash[Number(i)]);
}

/** The three-view player CSS. Palette-blind: uses theme tokens (var(--…)). */
export function playerCss() {
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
#lp-mode,#lp-full,#lp-notes-btn{border:1px solid var(--border,#ccc)!important;border-radius:8px}
#lp-stage{padding-top:48px}
/* Speaker-notes sheet — slides up over the stage in present mode (toggle: 'n' or the
   button). Only shown in present; absent entirely for a --strip-notes export. */
#lp-notes{position:fixed;left:0;right:0;bottom:0;z-index:60;max-height:42dvh;overflow:auto;
 background:var(--bg-alt,#f5f5f5);border-top:1px solid var(--border,#ddd);padding:20px 24px;
 transform:translateY(101%);transition:transform .22s ease;box-shadow:0 -14px 44px -22px rgba(0,0,0,.5);display:none}
.lp-js [data-lp-view=present] #lp-notes{display:block}
#lp-notes.lp-open{transform:translateY(0)}
#lp-notes-body{max-width:900px;margin:0 auto;white-space:pre-wrap;line-height:1.6;color:var(--text-body,#222);font-size:15px}
#lp-notes[data-empty=true] #lp-notes-body::after{content:"No notes for this slide.";color:var(--text-muted,#888);font-style:italic}
/* PRESENT — fill the MEASURED viewport (--lp-vh, set by the script from
   visualViewport/innerHeight; 100dvh is only the pre-JS/no-script fallback). A
   third-party iOS HTML-viewer's own in-app chrome (its own address bar / nav
   strip, outside the page) can report a dvh that doesn't match what's actually
   visible, pushing the centered stage off-screen-center — measuring in JS is
   immune to that. touch-action:none frees a horizontal drag for slide-swipe
   instead of scroll/zoom. */
.lp-js [data-lp-view=present] #lp-stage{position:fixed;top:48px;left:0;right:0;height:calc(var(--lp-vh,100dvh) - 48px);box-sizing:border-box;display:grid;place-items:center;justify-content:center;overflow:hidden;background:var(--bg,#fff);touch-action:none}
.lp-js [data-lp-view=present] .lp-frame{display:none}
.lp-js [data-lp-view=present] .lp-frame.lp-active{display:block;width:1280px;height:720px}
.lp-js [data-lp-view=present] .lp-frame.lp-active section[data-lattice-slide]{box-shadow:0 24px 70px -22px rgba(0,0,0,.45);transform-origin:center center}
.lp-js [data-lp-view=present] #lp-doc{display:none}
/* READ · SLIDES — the real slides as faithful miniatures. Each slide is a FIXED
   1280×720 canvas whose internal layout (a title slide centers, a content slide sits
   its text at the top) only renders correctly at that native size — resizing the box
   wrecks it. So keep the native size and SCALE the whole canvas with transform, NOT
   CSS zoom: iOS WebKit does not re-resolve container-type:size + cqi/cqh (the
   engine's whole typography/spacing scale) against a zoom-scaled container — cqi
   collapses to near-zero, rendering the type illegibly tiny (documented, previously
   REJECTED for this exact reason: engineering/gotchas.md "Preview slides collapse …
   CSS zoom", decision doc 2026-07-02-preview-scale-zoom.md). transform is immune —
   cqi resolves ONCE against the intrinsic 1280×720 box, and transform only scales the
   already-resolved paint. transform doesn't collapse the LAYOUT box the way zoom did,
   so each slide is wrapped in a .lp-frame sized to the scaled footprint
   (calc(1280px * var(--lp-fit))) — the flex column's gap then packs against that
   real size, same visual result as zoom gave, without breaking cqi. --lp-fit is set
   fluidly by the script to fill the column; the mobile default also serves the floor. */
[data-lp-view=read-slides] #lp-doc{display:none}
[data-lp-view=read-slides] #lp-stage{max-width:980px;margin:0 auto;padding:28px 16px 120px;display:flex;flex-direction:column;align-items:center;gap:24px}
[data-lp-view=read-slides] .lp-frame{width:calc(1280px * var(--lp-fit,.28));height:calc(720px * var(--lp-fit,.28));overflow:hidden;border-radius:12px}
[data-lp-view=read-slides] section[data-lattice-slide]{width:1280px!important;height:720px!important;transform:scale(var(--lp-fit,.28));transform-origin:0 0;
 border-radius:12px;overflow:hidden;border:1px solid var(--border,#e5e5e5);box-shadow:0 8px 30px -16px rgba(0,0,0,.35)}
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
/* NO-JS / BLOCKED-SCRIPT FLOOR (progressive enhancement). Every present/read rule
   above is scoped to .lp-js, which the player script adds to <html> only when it
   actually runs. Without it — a strict CSP that blocks the inline script (seen on some
   mobile browsers), scripting disabled, or a script error — the deck falls back to a
   readable stacked column instead of a BLANK page (present mode had hidden every slide
   until JS marked one active). The bar's live-only controls hide in this state. */
html:not(.lp-js){--lp-fit:.28}
@media(min-width:560px){html:not(.lp-js){--lp-fit:.40}}
@media(min-width:760px){html:not(.lp-js){--lp-fit:.56}}
@media(min-width:1000px){html:not(.lp-js){--lp-fit:.72}}
html:not(.lp-js) #lp-stage{max-width:980px;margin:0 auto;padding:68px 16px 90px;display:flex;flex-direction:column;align-items:center;gap:22px}
html:not(.lp-js) .lp-frame{width:calc(1280px * var(--lp-fit));height:calc(720px * var(--lp-fit));overflow:hidden;border-radius:12px}
html:not(.lp-js) section[data-lattice-slide]{width:1280px!important;height:720px!important;transform:scale(var(--lp-fit));transform-origin:0 0;border-radius:12px;overflow:hidden;border:1px solid var(--border,#e5e5e5);box-shadow:0 8px 30px -16px rgba(0,0,0,.35)}
html:not(.lp-js) #lp-notes,html:not(.lp-js) #lp-count,html:not(.lp-js) #lp-notes-btn,html:not(.lp-js) #lp-full{display:none}
`.trim();
}

/** The single inline player script (hashed by the CSP). Pure DOM transport. */
export async function playerJs() {
	// Inline the shared transport kernel (lib/core/present-transport.mjs) VERBATIM —
	// the player's script is CSP-hashed and cannot import, so its source is embedded
	// via `.toString()`. This is HARD RULE #1: the fit math + index/nav bounds + the
	// keymap live once and the docs-site transports import the same module. The
	// player's fit reproduces its historical scale exactly (insetX 56, insetY 48+56).
	const { fitScale, createTransport, keyAction, swipeAction, PRESENT_KEYMAP } = await import('../core/present-transport.mjs');
	// Bind each inlined kernel function to a STABLE `var` name rather than relying on
	// `.toString()` emitting a `function <name>(){…}` DECLARATION. A minifying bundler
	// (the docs-site PRODUCTION build behind the Studio export) renames these module
	// functions — createTransport→Q, keyAction→G, and the PRESENT_KEYMAP const→P — so
	// their `.toString()` no longer declares the identifier the player code below calls.
	// That threw `createTransport is not defined` at runtime → the catch stripped .lp-js
	// → the Studio-exported player showed only the no-JS floor (blank/stacked) on every
	// browser. `var name = <source>` makes the binding independent of the emitted function
	// name; the CLI (unminified) path is byte-for-byte unaffected in behavior. keyAction is
	// ALSO always called with the keymap passed explicitly (see keydown handler below), so
	// its `map = PRESENT_KEYMAP` default — whose free reference the minifier likewise
	// renames — is never evaluated.
	const kernel =
		`var PRESENT_KEYMAP=${JSON.stringify(PRESENT_KEYMAP)};\n` +
		`var keyAction=${keyAction.toString()};\n` +
		`var fitScale=${fitScale.toString()};\n` +
		`var createTransport=${createTransport.toString()};\n` +
		`var swipeAction=${swipeAction.toString()};`;
	const js = `(function(){
${kernel}
var root=document.documentElement,app=document.getElementById('lp-app');
if(!app)return;
// Progressive enhancement: mark JS active so the present/read CSS (which hides every
// slide until one is .lp-active) only engages when this script actually runs. If it is
// blocked (a strict CSP on some browsers), disabled, or throws, .lp-js is never left
// set and the slides fall back to a readable stacked column (see playerCss NO-JS FLOOR).
try{
root.className+=(root.className?' ':'')+'lp-js';
var slides=[].slice.call(document.querySelectorAll('section[data-lattice-slide]'));
// Each slide is wrapped in a .lp-frame (document order matches slides, one wrapper
// per section) — present toggles visibility on the FRAME (sized to match the section, so
// it's a transparent no-op box) while the SECTION itself keeps the transform-scale. This
// keeps the fixed-canvas cqi/cqh layout intact in every view — see playerCss.
var frames=[].slice.call(document.querySelectorAll('.lp-frame'));
var count=document.getElementById('lp-count'),view='present';
var t=createTransport({count:slides.length,onShow:render});
function fit(){if(view!=='present')return;var s=slides[t.index];if(!s)return;
 s.style.transform='scale('+fitScale({stageW:innerWidth,stageH:innerHeight,slideW:1280,slideH:720,insetX:56,insetY:48+56})+')';}
// READ·SLIDES fit: scale each native 1280x720 canvas (via the .lp-frame wrapper + the
// section's CSS transform) to fill the column exactly. The column is the stage's content
// width (clientWidth minus its 16px side padding). Set fluidly here so the miniatures grow
// with the window; the CSS default (.28) covers the first paint + the no-JS floor.
function fitRead(){var stage=document.getElementById('lp-stage');if(!stage)return;
 var avail=stage.clientWidth-32;if(avail>0)root.style.setProperty('--lp-fit',(avail/1280).toFixed(4));}
// PRESENT stage height: measure the ACTUAL visible viewport instead of trusting dvh.
// A third-party iOS HTML-viewer's own in-app chrome can report a dvh that doesn't match
// what's actually on screen, pushing the centered slide off-center; visualViewport (falling
// back to innerHeight) reads the real thing on every engine.
function setStageHeight(){var h=(window.visualViewport&&window.visualViewport.height)||innerHeight;
 root.style.setProperty('--lp-vh',h+'px');}
function render(){var i=t.index;frames.forEach(function(f,n){f.classList.toggle('lp-active',n===i);});
 if(count)count.textContent=(i+1)+' / '+slides.length;fit();syncNotes();}
function setView(v){view=v;app.setAttribute('data-lp-view',v);
 [].forEach.call(document.querySelectorAll('[data-lp-btn]'),function(b){b.setAttribute('aria-pressed',b.getAttribute('data-lp-btn')===v);});
 // Present's fit() sets an inline transform:scale on the active slide. Read views size
 // slides with CSS, so a stale present-scale would shrink one thumbnail (the title slide
 // rendered at ~92px). Clear every inline transform when leaving present.
 if(v!=='present')slides.forEach(function(s){s.style.transform='';});
 if(v==='read-slides')fitRead();
 if(count)count.style.visibility=v==='present'?'visible':'hidden';if(v==='present')render();}
addEventListener('keydown',function(e){if(view!=='present')return;
 var a=keyAction(e.key,PRESENT_KEYMAP);if(!a)return;t[a]();e.preventDefault();});
function onResize(){setStageHeight();fit();fitRead();}
setStageHeight();
addEventListener('resize',onResize);addEventListener('orientationchange',onResize);
if(window.visualViewport){try{visualViewport.addEventListener('resize',onResize)}catch(e){}}
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
// Speaker-notes sheet — present FROM the file. The note rides as a hidden
// aside.lattice-notes per slide (absent when the deck was exported --strip-notes);
// this slides it up over the stage in present mode, toggled by 'n' or the button.
// No note copy is created here — it reads the aside already in the DOM.
var notesBtn=document.getElementById('lp-notes-btn'),notesPanel=document.getElementById('lp-notes'),notesBody=document.getElementById('lp-notes-body');
var hasNotes=!!document.querySelector('aside.lattice-notes');
if(!hasNotes&&notesBtn)notesBtn.style.display='none';
function syncNotes(){if(!notesBody||!notesPanel||!notesPanel.classList.contains('lp-open'))return;
 var s=slides[t.index],a=s&&s.querySelector('aside.lattice-notes');
 notesBody.textContent=a?a.textContent:'';notesPanel.setAttribute('data-empty',a?'false':'true');}
function toggleNotes(){if(!notesPanel)return;var open=notesPanel.classList.toggle('lp-open');
 if(notesBtn)notesBtn.setAttribute('aria-pressed',open);syncNotes();}
if(notesBtn)notesBtn.onclick=toggleNotes;
addEventListener('keydown',function(e){if(view!=='present')return;if(e.key==='n'||e.key==='N'){toggleNotes();e.preventDefault();}});
[].forEach.call(document.querySelectorAll('[data-lp-btn]'),function(b){b.onclick=function(){setView(b.getAttribute('data-lp-btn'));};});
var mode=document.getElementById('lp-mode');
if(mode)mode.onclick=function(){var d=root.style.colorScheme==='dark';root.style.colorScheme=d?'light':'dark';mode.textContent=d?'☾':'☀';};
var links=[].slice.call(document.querySelectorAll('#lp-toc a'));
if(links.length&&window.IntersectionObserver){var spy=new IntersectionObserver(function(es){es.forEach(function(e){
 if(e.isIntersecting)links.forEach(function(l){l.classList.toggle('lp-on',l.getAttribute('href')==='#'+e.target.id);});});},
 {rootMargin:'-48px 0px -70% 0px'});[].forEach.call(document.querySelectorAll('#lp-article [id^=lp-sec-]'),function(h){spy.observe(h);});}
setView('present');
}catch(e){if(root){root.className=root.className.replace(/(^|\\s)lp-js\\b/,'');}}
})();`;
	// Force the script to pure ASCII. The player script is pinned by a sha256 CSP, and
	// WebKit (iOS Safari + every iOS webview/viewer app) computes that hash over a
	// DIFFERENT byte encoding than Chromium/Node for NON-ASCII characters — so a glyph
	// like ☾/☀, or an em-dash inlined from the kernel's own comments via .toString(),
	// makes the shipped hash disagree with WebKit's → WebKit REFUSES the script → the
	// player is dead on iOS (only the no-JS floor shows). Escaping every non-ASCII code
	// point to a `\\uXXXX` sequence is runtime-identical (it only ever occurs in string
	// literals + comments here) and makes the hash agree on every engine. Verified: a deck
	// exported this way runs Present mode in a real iOS WebKit viewer.
	let ascii = '';
	for (let i = 0; i < js.length; i++) {
		const code = js.charCodeAt(i); // UTF-16 code unit (0–0xFFFF) → a valid 4-hex \uXXXX
		ascii += code > 0x7f ? `\\u${code.toString(16).toUpperCase().padStart(4, '0')}` : js[i];
	}
	return ascii;
}

/**
 * Build the Read·Article body + TOC from the sanitized slide DOM via the shared
 * component-aware prose projection (lib/transformers/prose-projection.mjs, P4).
 * Returns the article HTML and the TOC as rendered anchors. `doc` is a host DOM
 * Document (jsdom in Node, the real document in the browser).
 */
export async function buildArticle(doc) {
	const { projectDeckToProse } = await import('../transformers/prose-projection.mjs');
	const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
	const { articleHtml, toc } = projectDeckToProse(sections);
	const tocHtml = toc
		.map((t) => `<a href="#${t.id}"${t.level === 2 ? ' class="lp-lvl2"' : ''}>${escapeText(t.text)}</a>`)
		.join('\n');
	return { article: articleHtml, toc: tocHtml };
}

/**
 * Assemble the self-contained player HTML from pre-rendered inputs plus injected
 * environment capabilities (the sanitize-slide-html DI seam). Pure: no direct fs,
 * crypto, jsdom, or subset-font — every environment-specific step is a `caps`
 * function, so the Node CLI and the browser Studio drive the SAME assembly.
 *
 * @param {object} data
 * @param {string} data.docHtml       the emulator's cleanDocHtml (self-contained render)
 * @param {string} data.source        verbatim LFM source (for the envelope)
 * @param {string} [data.title]
 * @param {object} [data.theme]       { name, palette, mode }
 * @param {object} [data.config]      deck frontmatter
 * @param {boolean}[data.notes]
 * @param {number} [data.now] @param {string} [data.build] @param {string} [data.playerVersion]
 * @param {object} caps
 * @param {(html: string) => any} caps.parseHtml           parse to a DOM Document (jsdom | DOMParser)
 * @param {(html: string) => string} caps.sanitize         the #616 slide-HTML guard (DOMPurify)
 * @param {(str: string) => Promise<string>} caps.sha256   base64 sha256 (crypto | crypto.subtle)
 * @param {(html: string) => { html: string, count: number, missing: string[] }} caps.inlineAssets
 * @param {() => (string|null)} [caps.katexCss]            raw katex.min.css, or null if unavailable
 * @param {(html: string) => Promise<{ html: string, applied: boolean, saved: number }>} [caps.subsetFonts]
 * @returns {Promise<{ html: string, report: { images: number, missing: string[], strippedScripts: string[], math: boolean } }>}
 */
export async function assemblePlayer(data, caps) {
	const { docHtml, source } = data;
	if (typeof docHtml !== 'string' || typeof source !== 'string') {
		throw new TypeError('assemblePlayer: docHtml and source strings are required.');
	}
	const report = { images: 0, missing: [], strippedScripts: [], math: false };

	// 1. DETECT (do not regex-strip) runtime-inflated `file://` <script> srcs
	//    (state-chart / function-plot) for the honesty report — their headless bake is
	//    a later slice. The scripts are REMOVED wholesale by the parse pass below
	//    (`script:not([type=lattice+json])`), which is the real guard; a regex is never
	//    the sanitizer here (it can't reliably neutralize HTML — CodeQL is right).
	for (const m of docHtml.matchAll(/<script\b[^>]*\bsrc=["'](file:\/\/[^"']*)["']/gi)) {
		report.strippedScripts.push(m[1]);
	}
	let html = docHtml;

	// 2. inline file:// images (only <img src>; scripts are not inlined — see above).
	const inlined = caps.inlineAssets(html);
	report.images = inlined.count;
	report.missing = inlined.missing;
	html = inlined.html;

	// 3. KaTeX: inline the stylesheet only if the deck actually renders math; else
	//    drop the file:// link (offline-safe). (Full KaTeX-font inlining is a later slice.)
	report.math = /class="katex/.test(html);
	html = html.replace(/<link[^>]*katex[^>]*>\s*/i, () => {
		if (!report.math) return '';
		const raw = caps.katexCss ? caps.katexCss() : null;
		if (raw == null) {
			report.missing.push('katex.min.css');
			return '';
		}
		return `<style>${minifyCss(raw)}</style>`;
	});

	// 4. Parse the doc, sanitize the slide DOM, build the article shell.
	const doc = caps.parseHtml(html);
	// Drop every inline <script> from the rendered doc (authoring watcher etc.) — the
	// ONLY script the player ships is our single hashed transport block.
	for (const s of [...doc.querySelectorAll('script:not([type="application/lattice+json"])')]) s.remove();
	// Sanitize the slide DOM (the #616 guard; the file is a live surface). Sanitize
	// each section's OUTER html — so the section element's own attributes (class/style/
	// on*) are cleaned too, not just its children — and replace the node in place.
	for (const sec of [...doc.querySelectorAll('section[data-lattice-slide]')]) {
		sec.outerHTML = caps.sanitize(sec.outerHTML);
	}
	// Each slide is wrapped in a plain `.lp-frame` div — author markup, not sanitized
	// content, so it's added AFTER the sanitize pass above. The frame lets present/read
	// scale the fixed 1280×720 canvas with `transform` (immune to the WebKit cqi+zoom
	// bug; see playerCss) while still packing the read-slides column tight: the wrapper
	// carries the SCALED footprint so flex `gap` spaces real boxes, not the section's
	// untransformed layout size.
	const slidesHtml = [...doc.querySelectorAll('section[data-lattice-slide]')]
		.map((s) => `<div class="lp-frame">${s.outerHTML}</div>`)
		.join('\n');
	// Body-level a11y texture defs are engine-injected + author-unreachable today, but
	// sanitize them too so the two-layer model never degrades to CSP-only for any region.
	const a11yDefs = [...doc.querySelectorAll('body > svg')].map((s) => caps.sanitize(s.outerHTML)).join('\n');
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
	const title = data.title || doc.querySelector('title')?.textContent || 'Lattice deck';

	// 5–6. player chrome + single hashed script + CSP.
	const js = await playerJs();
	const jsHash = await caps.sha256(js);
	const csp =
		`default-src 'none'; script-src 'sha256-${jsHash}'; style-src 'unsafe-inline'; ` +
		`img-src data:; font-src data:; base-uri 'none'; form-action 'none'`;

	// 7. envelope (verbatim source; whole-envelope base64 → no breakout).
	const envelope = buildEnvelope(
		{ source, title, theme: data.theme, config: data.config, notes: data.notes },
		{ now: data.now, build: data.build, playerVersion: data.playerVersion },
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
 <button id="lp-notes-btn" title="Speaker notes (n)" aria-pressed="false">☰</button>
 <button id="lp-full" title="Toggle fullscreen" aria-pressed="false">⛶</button>
 <button id="lp-mode" title="Toggle dark / light">☾</button>
</div>
<div id="lp-app" data-lp-view="present">
 <div id="lp-stage">
${a11yDefs}
${slidesHtml}
 </div>
 <div id="lp-notes" data-empty="true"><div id="lp-notes-body"></div></div>
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
	// the single biggest size lever (~6×). Optional cap + graceful fallback.
	const subset = caps.subsetFonts ? await caps.subsetFonts(out) : { html: out, applied: false, saved: 0 };
	return { html: subset.html, report: { ...report, fontBytesSaved: subset.saved, subsetApplied: subset.applied } };
}
