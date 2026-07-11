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

/**
 * Replace every `light-dark(LIGHT, DARK)` in a CSS string with one side of the pair.
 * `pick` 0 keeps LIGHT, 1 keeps DARK. Paren-aware (the top-level comma is found by
 * balancing parentheses, so a `var(--x, #fff)` argument's own comma is never
 * mistaken for the separator) and recursive (a nested light-dark inside the chosen
 * arm is resolved too). A single-argument `light-dark(x)` maps x to both sides.
 *
 * WHY this exists — the whole theming stack (themes/*.css) expresses every dual-mode
 * token as `--t: light-dark(L, D)`. That CSS function only shipped in Safari/WebKit
 * 17.5 (mid-2024); on an older in-app browser it is an invalid value, so EVERY token
 * goes unset and the deck loses its colors (falls back to white + wrong slide fills)
 * AND the dark/light toggle does nothing (nothing reads color-scheme except
 * light-dark). Resolving the pairs at export time into plain values + an explicit
 * dark override (see themeDualMode) makes the player theme correctly on every engine.
 *
 * String/url/comment SAFE: comments, quoted strings and `url(…)` are masked out (the
 * same one-pass tokenizer minifyCss uses) BEFORE the scan, so the literal text
 * `light-dark(` inside a `content:"…"` string, a `url("data:…")` data-URI, or a
 * comment is never rewritten — and an unbalanced `(` inside such a token can't run the
 * paren scanner off into real declarations.
 */
export function resolveLightDark(css, pick) {
	const stash = [];
	// Mask comments / strings / url() to U+E000-fenced index placeholders so the scan
	// below never sees `light-dark(` (or a stray paren) inside them. U+E000/E001 are
	// Private-Use chars real CSS never contains; strip any literal ones from the input
	// first so authored CSS can't collide with a placeholder (mirrors minifyCss).
	const masked = String(css)
		.replace(/[\uE000\uE001]/g, '')
		.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)/g, (m) => {
			stash.push(m);
			return `\uE000${stash.length - 1}\uE001`;
		});
	const resolved = resolveMasked(masked, pick);
	return resolved.replace(/\uE000(\d+)\uE001/g, (_m, i) => stash[Number(i)]);
}

/** The paren-balancing core of resolveLightDark, run on masked CSS (no strings/urls/
 *  comments to confuse the scan). Recurses into the chosen arm. Not exported. */
function resolveMasked(css, pick) {
	let out = '';
	let i = 0;
	const TOKEN = 'light-dark(';
	while (i < css.length) {
		const idx = css.indexOf(TOKEN, i);
		if (idx === -1) {
			out += css.slice(i);
			break;
		}
		out += css.slice(i, idx);
		// Balance parentheses from just after `light-dark(` to find its matching `)`
		// and the top-level comma separating the two arms.
		let depth = 1;
		let comma = -1;
		let j = idx + TOKEN.length;
		for (; j < css.length && depth > 0; j++) {
			const c = css[j];
			if (c === '(') depth++;
			else if (c === ')') depth--;
			else if (c === ',' && depth === 1 && comma === -1) comma = j;
		}
		const close = j - 1; // css[close] === ')'
		const light = (comma === -1 ? css.slice(idx + TOKEN.length, close) : css.slice(idx + TOKEN.length, comma)).trim();
		const dark = comma === -1 ? light : css.slice(comma + 1, close).trim();
		out += resolveMasked(pick === 0 ? light : dark, pick); // recurse into the chosen arm
		i = close + 1;
	}
	return out;
}

/**
 * Split a stylesheet into a light-default base plus an explicit dark-override block,
 * eliminating the runtime dependency on the CSS `light-dark()` function (see
 * resolveLightDark for why that dependency is fatal on older WebKit). Returns:
 *   · base      — the CSS with every `light-dark(L, D)` collapsed to L (the light
 *                 value), so the deck renders correctly in light mode on ANY engine.
 *   · darkBlock — the dark values, as a small standalone rule set that applies when
 *                 the user picks dark (`:root[data-lp-scheme=dark]`) OR the OS prefers
 *                 dark and the user hasn't overridden to light
 *                 (`@media(prefers-color-scheme:dark) :root:not([data-lp-scheme=light])`).
 *
 * Every dual-mode token in Lattice's themes is a `--custom-prop: …light-dark(…)…`
 * declaration on `:root` (verified across all shipping themes), so consolidating the
 * dark values onto `:root[data-lp-scheme=dark]` is complete: custom properties on
 * :root inherit to the whole tree.
 *
 * SCOPE — the dark decls are hoisted onto a flat `:root[data-lp-scheme=dark]` without
 * their original selector context. That is correct precisely because every dual-mode
 * token today is a `:root` custom property. It is NOT selector-general: a (hypothetical,
 * none ship) `section.x{--t:light-dark(a,b)}` would hoist its dark `--t` onto :root,
 * where it can't beat the element-level base — so that one token would stay light in
 * dark mode. The light BASE is always correct regardless. A drift test
 * (test/unit/export/player-core-dualmode) would catch a future theme that breaks the
 * :root-only assumption; until then this stays :root-scoped by contract.
 *
 * Comments are stripped first, so a `light-dark(` (or an unbalanced paren) inside a
 * theme comment can't be collected as a phantom dark declaration.
 *
 * The darkBlock is emitted as its OWN small <style>, so the CSS prune (which only
 * ever targets the single LARGEST style block — the ~450KB lattice.css) never touches
 * it: its `:root[data-lp-scheme=dark]` selector matches nothing at prune time (the
 * attribute is set only on toggle) and would otherwise be dropped.
 */
export function themeDualMode(css) {
	const noComments = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
	const base = resolveLightDark(css, 0);

	// Map EVERY base custom property to its light-resolved value (literal OR a var()
	// chain) so the dark values can be flattened to literals with ZERO indirection. The
	// dark arm of a surface token is authored as e.g. `var(--scheme-dark-bg)` (→ a
	// literal) or a MULTI-HOP chain like `var(--surface-inverse)` → `var(--brand-canvas)`
	// → a literal. FLATTENING the whole chain is the fix for the on-device dark-mode
	// failure: an older in-app WebKit that can't resolve a custom property whose value is
	// ANOTHER custom property (across <style> blocks) left the token guaranteed-invalid,
	// so `background:var(--bg,#fff)` fell back to WHITE. A literal can't fail that way.
	const baseVals = {};
	const litRe = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g;
	let lm;
	const baseLight = resolveLightDark(noComments, 0);
	while ((lm = litRe.exec(baseLight))) baseVals[lm[1]] = lm[2].trim();

	const darkDecls = [];
	const darkKeys = new Set();
	const declRe = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]*light-dark[^;{}]*?)\s*(?=[;}])/g;
	let m;
	while ((m = declRe.exec(noComments))) darkKeys.add(m[1]);
	declRe.lastIndex = 0;
	// Resolve each `var(--x)` to its final literal by following the base chain — but STOP
	// at a `--x` that is itself a dark decl (a `var(--accent)` in a dark value must keep
	// referencing the DARK --accent redefined in THIS block, not the light base literal),
	// and guard cycles via `seen`. Only substitute when the chain resolves with NO var()
	// left; an unresolvable/unknown var (or a paren-bearing fallback the regex can't span)
	// is left intact — at worst a missed flatten, never a wrong colour.
	const deepFlatten = (value, seen) =>
		value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^()]*)?\)/g, (full, name) => {
			if (darkKeys.has(name) || seen.has(name) || baseVals[name] === undefined) return full;
			const resolved = deepFlatten(baseVals[name], new Set(seen).add(name)).trim();
			return /var\(|light-dark\(/.test(resolved) ? full : resolved;
		});
	while ((m = declRe.exec(noComments))) {
		darkDecls.push(`${m[1]}:${deepFlatten(resolveLightDark(m[2], 1).trim(), new Set())}`);
	}
	if (!darkDecls.length) return { base, darkBlock: '' };
	const body = `${darkDecls.join(';')};`;
	// Two DEFAULT-NEUTRAL dark rules, plain attribute selectors + literal values (no
	// light-dark(), no var() indirection — all supported on pre-2016 WebKit). Which one
	// (if any) fires is decided by the data-lp-scheme value the export BAKES onto <html>,
	// matching the mode the deck was AUTHORED for — the sender's choice of light / dark /
	// system (document fidelity: a shared deck opens the way the sender made it):
	//   · [data-lp-scheme=dark]   → the sender pinned DARK: always dark.
	//   · [data-lp-scheme=system] + a system-dark receiver → follow the OS (the sender
	//     chose to DEFER to the receiver). System + light OS, and [data-lp-scheme=light],
	//     both fall through to the light base.
	// The in-player toggle overrides for one viewer by flipping the attribute to a
	// concrete light/dark. Note the system rule keys on =system (not :not([=light])), so a
	// pinned light/dark export is NEVER touched by the receiver's OS.
	//
	// The tokens are set on :root AND directly on every slide section. The :root copy
	// themes the page + everything via inheritance; the section copy is belt-and-
	// suspenders for the reported "page flips but slides don't" — an older engine that
	// repaints :root on a custom-property change but doesn't re-propagate the new value
	// down to already-laid-out deep section subtrees. Setting `--bg` etc. ON the section
	// makes `background:var(--bg)` read the section's OWN (dark) value, no :root
	// inheritance needed. Harmless in light mode (attribute=light → sections use :root).
	const sel = (scope) => `${scope},${scope} section[data-lattice-slide]`;
	const darkBlock =
		`${sel(':root[data-lp-scheme=dark]')}{${body}}` +
		`@media (prefers-color-scheme:dark){${sel(':root[data-lp-scheme=system]')}{${body}}}`;
	return { base, darkBlock };
}

/** The three-view player CSS. Palette-blind: uses theme tokens (var(--…)). */
export function playerCss() {
	return `
:root{color-scheme:light dark}
html,body{margin:0;padding:0;background:var(--bg,#fff)}
/* FLEX-COLUMN SHELL (JS path). The player is a column: the bar (flex:none) on top,
   the app filling the rest. Height is the VISIBLE viewport (100svh — the small
   viewport, i.e. with the browser's own chrome shown, so nothing sits under it;
   100vh is the pre-svh fallback). This is what makes Present center correctly on a
   mobile in-app browser: the stage is a flex child sized to real visible space, so
   place-items:center centers in what the eye sees — no position:fixed, no
   JS-measured height, no layout-vs-visual-viewport mismatch to misreport. The no-JS
   floor (html:not(.lp-js), bottom of this sheet) keeps the old scrolling document. */
.lp-js body{display:flex;flex-direction:column;height:100vh;height:100svh;overflow:hidden}
.lp-js #lp-bar{position:static;flex:none}
.lp-js #lp-app{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
/* Marp-equivalent chrome the CLI's own docHtml bakes in (lattice-emulator.js's
   marpSystemCss) but the browser render path's docHtml does not — so it belongs
   HERE, in the one assembler both paths share (HARD RULE #1), closing the gap for
   every host instead of only the CLI. Without it, a Studio-exported deck with a
   \`describe:\` comment ships its accessible-description <p> fully VISIBLE (no
   sr-only rule to hide it) — it renders as a stray extra paragraph of body text on
   the slide itself, duplicating what the heading/body already say, in Present AND
   Read Article — and any deck's page-number span goes uninitialized (the digits
   have nowhere to come from without the content:attr() binding). */
section[data-lattice-pagination]::after{content:attr(data-lattice-pagination)}
aside.lattice-notes{display:none!important}
.lattice-description{position:absolute!important;width:1px!important;height:1px!important;
 padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;
 white-space:nowrap!important;border:0!important}
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
/* The view-switcher tabs carry BOTH an icon and a text label at tablet/desktop
   widths, where there's room. Below 560px (phone) the tabs go ICON-ONLY — the
   text label is visually hidden (not removed: every button still carries its
   full aria-label, so a screen reader announces "Present" / "Read · Slides" /
   "Read · Article" exactly as before). "Read · Slides" / "Read · Article" have
   no room to sit beside their icon at phone widths without crowding the
   brand + the notes/fullscreen/mode controls toward the edge — icon-only, at a
   deliberately generous tap-target size, is the reliable fit. */
#lp-bar .lp-seg button{display:flex;align-items:center;gap:6px;white-space:nowrap}
#lp-bar .lp-tab-icon{flex:none}
@media(max-width:560px){
 #lp-bar{padding:0 8px;gap:.35rem}
 #lp-bar .lp-brand{max-width:22vw;font-size:12px}
 #lp-bar .lp-seg{gap:1px;padding:2px}
 #lp-bar .lp-seg button{font-size:10.5px;padding:10px;gap:0}
 #lp-bar .lp-tab-text{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
 #lp-bar .lp-tab-icon{width:17px;height:17px}
 #lp-count{font-size:11px;min-width:34px}
 /* Same crowding complaint applies to these three — bump them toward the tab's
    tap target too (still short of the 44px HIG ideal at this bar height budget,
    but consistent with the tabs instead of visibly smaller). */
 #lp-mode,#lp-full,#lp-notes-btn{padding:9px!important}
}
#lp-count{font-variant-numeric:tabular-nums;color:var(--text-muted,#888);font-size:13px;min-width:46px;text-align:center}
#lp-mode,#lp-full,#lp-notes-btn{border:1px solid var(--border,#ccc)!important;border-radius:8px}
/* Clears the fixed bar for the NO-JS floor only (there the bar is position:fixed and
   the document scrolls under it). On the JS path the bar is a flex child that takes
   its own space, so no clearance is needed — the stage flexes below it. */
html:not(.lp-js) #lp-stage{padding-top:48px}
/* Speaker-notes sheet — slides up over the stage in present mode (toggle: 'n' or the
   button). Only shown in present; absent entirely for a --strip-notes export. */
#lp-notes{position:fixed;left:0;right:0;bottom:0;z-index:60;max-height:42dvh;overflow:auto;
 background:var(--bg-alt,#f5f5f5);border-top:1px solid var(--border,#ddd);padding:20px 24px;
 transform:translateY(101%);transition:transform .22s ease;box-shadow:0 -14px 44px -22px rgba(0,0,0,.5);display:none}
.lp-js [data-lp-view=present] #lp-notes{display:block}
#lp-notes.lp-open{transform:translateY(0)}
#lp-notes-body{max-width:900px;margin:0 auto;white-space:pre-wrap;line-height:1.6;color:var(--text-body,#222);font-size:15px}
#lp-notes[data-empty=true] #lp-notes-body::after{content:"No notes for this slide.";color:var(--text-muted,#888);font-style:italic}
/* PRESENT — the stage is the flex-column's growing child (flex:1), so it occupies
   exactly the visible space below the bar, and place-items:center centers the slide
   in THAT box. No position:fixed, no JS-measured height: the browser sizes the box to
   the real visible viewport (100svh column − bar), which is what an iOS in-app browser
   with its own chrome reports correctly. touch-action:none frees a horizontal drag for
   slide-swipe instead of scroll/zoom. */
.lp-js [data-lp-view=present] #lp-stage{flex:1;min-height:0;box-sizing:border-box;
 display:grid;place-items:center;justify-content:center;overflow:hidden;background:var(--bg,#fff);touch-action:none}
.lp-js [data-lp-view=present] .lp-frame{display:none}
/* The active frame is sized to the SCALED footprint (like read-slides), NOT the raw
   1280×720 — so place-items:center centers a box that FITS the stage. The old fixed
   720px frame overflowed a phone stage shorter than 720px, and grid can't center an
   oversized item (it top-aligns/overflows), which pushed the scaled slide down off
   center. --lp-fit-present is set by the script's fit() to fill the stage; the section
   scales into the frame from its top-left (transform-origin:0 0). Shadow rides the
   frame (the scaled section's own shadow would shrink with it). */
.lp-js [data-lp-view=present] .lp-frame.lp-active{display:block;
 width:calc(1280px * var(--lp-fit-present,.5));height:calc(720px * var(--lp-fit-present,.5));
 border-radius:12px;box-shadow:0 24px 70px -22px rgba(0,0,0,.45)}
.lp-js [data-lp-view=present] .lp-frame.lp-active section[data-lattice-slide]{width:1280px!important;height:720px!important;
 transform:scale(var(--lp-fit-present,.5));transform-origin:0 0}
.lp-js [data-lp-view=present] #lp-doc{display:none}
/* Present prev/next — a control ROW docked at the BOTTOM of the column (flex:none),
   BELOW the centered slide, never over its content. This keeps the slide free to use
   the full width and the centering box symmetric (no side gutters to offset it).
   Hidden outside present + until .lp-js engages. Boundary buttons disable at the
   first/last slide (real disabled, so assistive tech gets the correct state). */
#lp-nav{display:none}
.lp-js [data-lp-view=present] #lp-nav{display:flex;flex:none;align-items:center;justify-content:center;
 gap:32px;padding:10px 0 16px}
#lp-prev,#lp-next{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:999px;
 border:1px solid var(--border,#ddd);background:var(--bg-alt,#f5f5f5);color:var(--text-secondary,#333);cursor:pointer}
#lp-prev:hover,#lp-next:hover{color:var(--accent,#4338ca);border-color:var(--accent,#4338ca)}
#lp-prev:disabled,#lp-next:disabled{opacity:.3;pointer-events:none}
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
/* The read-slides stage is the column's scrolling child (flex:1;overflow:auto). No
   bar-clearance padding — the flex bar above already reserves its own space. */
.lp-js [data-lp-view=read-slides] #lp-stage{flex:1;min-height:0;overflow:auto}
[data-lp-view=read-slides] #lp-stage{padding:28px 16px 120px;display:flex;flex-direction:column;align-items:center;gap:28px}
/* The frame — NOT the scaled section — carries the border + shadow that makes each
   slide a distinct card. The border/shadow used to sit on the section, but the
   section is transform:scale(~.28) so the 1px border shrank to a sub-pixel hairline,
   and its shadow (which spreads OUTWARD) was clipped away by this frame's
   overflow:hidden — so a white slide on the white page had no visible boundary at
   all. On the unscaled frame the border is a true 1px and the shadow paints outside
   the frame's box (an element's own box-shadow is not clipped by its overflow), so
   every slide reads as a framed card. */
/* flex:none is load-bearing: #lp-stage is now a flex COLUMN (the scrolling child of
   the app), and a flex item's default flex-shrink:1 would COMPRESS each fixed-height
   frame to make the column fit — squishing the frame (e.g. 201px → 107px) while the
   scaled section stays full height and overflows the squished frame (clipped). flex:none
   keeps every frame at its calc()'d height so the stage SCROLLS instead of squishing. */
[data-lp-view=read-slides] .lp-frame{flex:none;width:calc(1280px * var(--lp-fit,.28));height:calc(720px * var(--lp-fit,.28));overflow:hidden;border-radius:12px;
 border:1px solid var(--border,#e5e5e5);box-shadow:0 10px 34px -14px rgba(0,0,0,.4)}
[data-lp-view=read-slides] section[data-lattice-slide]{width:1280px!important;height:720px!important;transform:scale(var(--lp-fit,.28));transform-origin:0 0}
/* READ · ARTICLE — Typora-style prose + sticky left TOC (shell; component-aware projection = P4) */
[data-lp-view=read-article] #lp-stage{display:none}
#lp-doc{display:none}
/* The article view is the column's scrolling child; the TOC sticks to the top of
   that scroll box (top:0, since the flex bar is above it, not overlaying). */
.lp-js [data-lp-view=read-article] #lp-doc{flex:1;min-height:0;overflow:auto}
[data-lp-view=read-article] #lp-doc{display:grid;grid-template-columns:250px minmax(0,1fr);align-items:start}
#lp-toc{position:sticky;top:0;max-height:100vh;overflow:auto;padding:38px 16px 38px 24px;
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
var prevBtn=document.getElementById('lp-prev'),nextBtn=document.getElementById('lp-next');
var t=createTransport({count:slides.length,onShow:render});
if(prevBtn)prevBtn.onclick=function(){t.prev();};
if(nextBtn)nextBtn.onclick=function(){t.next();};
// Measure the STAGE ELEMENT ITSELF, not innerWidth/innerHeight. The stage is the
// flex-column's growing child, so its own clientWidth/clientHeight IS the exact box
// place-items:center centers within — reading that same box makes the fit scale and
// the centering box identical by construction, symmetric regardless of any
// viewport-measurement quirk in whatever engine is hosting the file. The scale is
// published as a CSS var so the ACTIVE FRAME sizes to the scaled footprint (which
// place-items:center can actually center); a fixed 720px frame overflowed a short
// stage and grid top-aligned it, pushing the slide down.
function fit(){if(view!=='present')return;
 var st=document.getElementById('lp-stage');if(!st)return;
 root.style.setProperty('--lp-fit-present',fitScale({stageW:st.clientWidth,stageH:st.clientHeight,slideW:1280,slideH:720,insetX:40,insetY:40}));}
// READ·SLIDES fit: scale each native 1280x720 canvas (via the .lp-frame wrapper + the
// section's CSS transform) to fill the column exactly. The column is the stage's content
// width (clientWidth minus its 16px side padding). Set fluidly here so the miniatures grow
// with the window; the CSS default (.28) covers the first paint + the no-JS floor.
function fitRead(){var stage=document.getElementById('lp-stage');if(!stage)return;
 var avail=stage.clientWidth-32;if(avail>0)root.style.setProperty('--lp-fit',(avail/1280).toFixed(4));}
function render(){var i=t.index;frames.forEach(function(f,n){f.classList.toggle('lp-active',n===i);});
 if(count)count.textContent=(i+1)+' / '+slides.length;
 if(prevBtn)prevBtn.disabled=i===0;
 if(nextBtn)nextBtn.disabled=i===slides.length-1;
 fit();syncNotes();}
function setView(v){view=v;app.setAttribute('data-lp-view',v);
 [].forEach.call(document.querySelectorAll('[data-lp-btn]'),function(b){b.setAttribute('aria-pressed',b.getAttribute('data-lp-btn')===v);});
 // Both present and read-slides scale the section via a view-scoped CSS transform
 // (var(--lp-fit-present) / var(--lp-fit)), so switching views just re-applies the
 // right rule — no inline transform to clear.
 if(v==='read-slides')fitRead();
 if(count)count.style.visibility=v==='present'?'visible':'hidden';if(v==='present')render();}
addEventListener('keydown',function(e){if(view!=='present')return;
 var a=keyAction(e.key,PRESENT_KEYMAP);if(!a)return;t[a]();e.preventDefault();});
// Present now sizes its stage purely in CSS (position:fixed;top:48px;bottom:0), so a
// resize needs only to RE-FIT the slide scale to the new stage box — no JS viewport
// measurement anymore (that was the iOS in-app-browser misreport that pushed the slide
// off-center). fit() reads the stage's own clientWidth/Height, which the browser has
// already recomputed by the time this fires.
function onResize(){fit();fitRead();}
addEventListener('resize',onResize);addEventListener('orientationchange',onResize);
if(window.visualViewport){try{visualViewport.addEventListener('resize',onResize)}catch(e){}}
// Touch/swipe on the present stage — a decisive horizontal drag turns the slide
// (the shared swipeAction; a vertical/short move is ignored so it never fights scroll).
var stage=document.getElementById('lp-stage'),sx=0,sy=0,sw=false;
if(stage){stage.addEventListener('pointerdown',function(e){if(view!=='present')return;sx=e.clientX;sy=e.clientY;sw=true;},{passive:true});
 stage.addEventListener('pointerup',function(e){if(!sw||view!=='present')return;sw=false;
  var a=swipeAction({dx:e.clientX-sx,dy:e.clientY-sy});if(a)t[a]();},{passive:true});}
// Fullscreen toggle — present from the file to a room. iOS/iPadOS Safari has
// historically shipped NO Fullscreen API for arbitrary elements (only native
// video), so a click there would silently no-op forever, reading as "broken."
// Feature-detect up front and hide the button entirely when neither the
// standard nor -webkit- entry point exists, rather than leaving a dead affordance.
var full=document.getElementById('lp-full');
var fsEl=document.documentElement;
var canFullscreen=!!(fsEl.requestFullscreen||fsEl.webkitRequestFullscreen);
if(full&&!canFullscreen)full.style.display='none';
if(full&&canFullscreen){full.onclick=function(){var d=document,el=d.documentElement;
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
// Dark/light toggle. Driven by a data-lp-scheme attribute the export's CSS keys on
// (themeDualMode resolves the theme's light-dark() pairs into a light base + an
// explicit dark override at export time), NOT by the CSS light-dark() function —
// which older in-app WebKit lacks, the whole reason the toggle used to do nothing
// there. The icon SWAPS (not a text glyph) so the button's box size never shifts —
// both icons share the same fixed width/height.
var MOON_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var SUN_ICON='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
var mode=document.getElementById('lp-mode');
// Dark/light is driven by the data-lp-scheme ATTRIBUTE on <html>, which the export BAKES
// to the mode the deck was AUTHORED for (light / dark / system) and the CSS keys on with
// plain attribute selectors + literal values (themeDualMode; all pre-2016 WebKit). The
// DEFAULT is the sender's choice — never the receiver's OS, UNLESS the sender picked
// 'system', in which case the effective mode follows matchMedia. The toggle overrides for
// this viewer by flipping to a concrete light/dark. color-scheme is set alongside
// (cross-engine-safe setProperty) so native controls match. Icon swaps a fixed-size glyph.
var sysDark=function(){return !!(window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches);};
var baked=root.getAttribute('data-lp-scheme');
// Effective dark = pinned dark, OR (system default AND the OS prefers dark).
var isDark=baked==='dark'||(baked!=='light'&&baked!=='dark'&&sysDark());
function applyScheme(){root.setAttribute('data-lp-scheme',isDark?'dark':'light');
 root.style.setProperty('color-scheme',isDark?'dark':'light');
 if(mode)mode.innerHTML=isDark?SUN_ICON:MOON_ICON;}
// At load, DON'T stamp a concrete value when the export is 'system' — leave the attribute
// as 'system' so the CSS @media keeps the deck live-following the OS; only sync the icon +
// color-scheme. A pinned light/dark export already carries the right attribute. The toggle
// is what commits a concrete choice.
if(baked==='system'){root.style.setProperty('color-scheme',isDark?'dark':'light');if(mode)mode.innerHTML=isDark?SUN_ICON:MOON_ICON;
 if(window.matchMedia){try{matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(e){if(root.getAttribute('data-lp-scheme')==='system'){isDark=e.matches;if(mode)mode.innerHTML=isDark?SUN_ICON:MOON_ICON;root.style.setProperty('color-scheme',isDark?'dark':'light');}});}catch(e){}}}
else applyScheme();
if(mode)mode.onclick=function(){isDark=!isDark;applyScheme();};
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
	// Accumulate the dark-mode overrides lifted out of every deck-CSS block (the
	// light-dark() → light-default + explicit-dark split; themeDualMode). Emitted as
	// one small trailing <style> so the deck themes correctly on browsers without the
	// light-dark() CSS function (older in-app WebKit) — and so the prune, which only
	// touches the single largest block, never drops it.
	let darkOverrides = '';
	const styles = [...doc.querySelectorAll('head style, head link[rel="stylesheet"]')]
		.map((s) => {
			let out = s.outerHTML.replace(/@font-face\s*\{[^{}]*url\(\s*['"]?fonts\/[^{}]*\}/gi, '');
			// Minify every <style> EXCEPT the base64 font block — the engine inlines the
			// UNMINIFIED lattice.css (~955 KB, 1600+ comments), the file's single biggest
			// chunk. Minifying it (lossless) is the largest size lever (~518 KB), bigger
			// than font subsetting. (The base64 font block is left alone — nothing to gain
			// and its data-URIs must not be touched.)
			if (s.tagName === 'STYLE' && s.id !== 'lattice-embedded-fonts') {
				out = out.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/i, (_m, open, css, close) => {
					// Resolve light-dark() to a light base + collect the dark overrides, so
					// no shipped color depends on the light-dark() CSS function (fatal on
					// WebKit < 17.5). The base minifies + prunes exactly as before.
					const { base, darkBlock } = themeDualMode(css);
					if (darkBlock) darkOverrides += darkBlock;
					return `${open}${minifyCss(base)}${close}`;
				});
			}
			return out;
		})
		.join('\n');
	const darkStyle = darkOverrides ? `<style>${minifyCss(darkOverrides)}</style>` : '';
	const lang = doc.documentElement.getAttribute('lang') || 'en';
	const title = data.title || doc.querySelector('title')?.textContent || 'Lattice deck';
	// The color mode the deck was AUTHORED for — 'light' | 'dark' | 'system' — baked onto
	// <html> as the default so the player opens the way the sender chose (document
	// fidelity), correct even before the script runs and with no script at all. 'dark' /
	// 'light' pin the mode; 'system' defers to the receiver's OS (the CSS @media rule).
	// The in-player toggle overrides for one viewer. Source: Studio's export choice or the
	// CLI's theme/front-matter color-scheme (data.theme.mode); anything unrecognized → light.
	const rawScheme = data.theme?.mode || data.mode;
	const exportedScheme = rawScheme === 'dark' || rawScheme === 'system' ? rawScheme : 'light';

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
<html lang="${escapeAttr(lang)}" data-lp-scheme="${exportedScheme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
<title>${escapeText(title)}</title>
${styles}
<style>${minifyCss(playerCss())}</style>
${darkStyle}
</head><body>
<div id="lp-bar">
 <span class="lp-brand">${escapeText(title)}</span>
 <div class="lp-seg">
  <button data-lp-btn="present" aria-pressed="true" aria-label="Present"><svg class="lp-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span class="lp-tab-text">Present</span></button>
  <button data-lp-btn="read-slides" aria-pressed="false" aria-label="Read · Slides"><svg class="lp-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10.5" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/></svg><span class="lp-tab-text">Read · Slides</span></button>
  <button data-lp-btn="read-article" aria-pressed="false" aria-label="Read · Article"><svg class="lp-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span class="lp-tab-text">Read · Article</span></button>
 </div>
 <span id="lp-count"></span>
 <button id="lp-notes-btn" title="Speaker notes (n)" aria-pressed="false" aria-label="Speaker notes"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="17" y2="12"/><line x1="3" y1="18" x2="13" y2="18"/></svg></button>
 <button id="lp-full" title="Toggle fullscreen" aria-pressed="false" aria-label="Toggle fullscreen"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>
 <button id="lp-mode" title="Toggle dark / light" aria-label="Toggle dark / light theme"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
</div>
<div id="lp-app" data-lp-view="present">
 <div id="lp-stage">
${a11yDefs}
${slidesHtml}
 </div>
 <div id="lp-nav">
  <button id="lp-prev" type="button" aria-label="Previous slide" title="Previous slide (←)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
  <button id="lp-next" type="button" aria-label="Next slide" title="Next slide (→)"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
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
