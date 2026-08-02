// Shared single-slide live renderer — the de-duplicated successor of
// landing-engine.ts (landing islands) AND live-render.js (component specimens).
//
// WRAP, DON'T REINVENT. The marp render path lives in window.LatticePlayground
// (the on-demand engine bundle, injected by load-engine.ts). This module only
// orchestrates the SAME calls both copies made — fetch theme css → PG.addThemes
// (via theme-fetch.ts) → PG.render → write an isolated `srcdoc` iframe + scale
// it to fill its host. Nothing here reimplements the engine; it touches
// window/fetch/DOM, so it stays OUTSIDE the React tree (DeckPreview.tsx wraps it
// for the React islands; specimen.js consumes the function form directly).
//
// SIBLINGS (kept divergent on purpose): src/playground/deck-preview.js is the
// MULTI-slide filmstrip superset (playground, drawing-board, both studios). The
// drawing-board inline controller + practice/focus builders are Tier 2 and own
// their surface-specific srcdoc. This module is the SINGLE-slide twin only.
//
// THE FONT FIX (carried from live-render, now landing gets it too): the engine's
// Google-Fonts @import is inert inside the srcdoc <style> (it lands after the
// frame CSS, and CSS ignores an @import that isn't first), so the iframe loads
// none of its own webfonts and would render only the faces the parent docs page
// happens to load — never the sketch finish's Caveat/Shantell. We register the
// vendored faces ourselves (font-embed.js), lazily-imported + cached: font-embed
// pulls bundled .woff2 that Node can't load, so a static import would break this
// module in a Node/SSR context — the lazy import keeps construction Node-safe.

import { sourceHasMath } from '../../../lib/engine/math-detect.mjs';
import { applyDebug } from '../playground/debug-overlay.js';
import { hashString, linkGuardAgent, splitSections } from '../playground/deck-preview.js';
import { DEFAULT_H, DEFAULT_W, singleSlideFrame } from '../playground/frame-css.js';
import { hasRenderListeners, patchOverflow, type RenderStats, recordRenderSample } from '../playground/render-metrics';
import { installVideoBridge } from '../playground/video-overlay.js';
import { hasVizScanListeners, recordVizScan, scanBlackFills } from '../playground/viz-findings';
import { ensureEngine } from './load-engine';
import { renderMarkdown } from './render-engine';
import { sanitizeSlideHtml } from './sanitize-slide-html.js';
import { createThemeFetcher } from './theme-fetch';

const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';

// `window.LatticePlayground` is declared once, canonically, in playground-global.d.ts.

// ── Drag-time observer gating (2026-07-02 resizable-panes decision §8) ──────
// Every live host gets a ResizeObserver that re-runs scaleFrame on any host
// resize. The single-slide preview scales via one cheap outer CSS transform, so
// the Studio lets it (and the shared host's positioning) track the divider LIVE
// through a drag — suspending it froze the `position:fixed` host at its pre-drag
// geometry and bled the slide over the neighbor pane (2026-07-19 post-ship fix).
// So `suspendScaleObservers(true)` is no longer called on drag; the Studio calls
// only `suspendScaleObservers(false)` at drag-END, which is now purely the
// authoritative "refit every live host once + prune unmounted hosts" pass (the
// `on=true` suspend branch is retired but kept inert for any future re-fit gate).
// Module-level so one gate covers every renderer instance on the page.
let scaleSuspended = false;
const scaleTargets = new Map<HTMLElement, () => void>();
export function suspendScaleObservers(on: boolean): void {
	scaleSuspended = on;
	if (on) return;
	for (const [host, refit] of scaleTargets) {
		// Prune unmounted hosts on resume: the module-level Map would otherwise
		// root every detached preview subtree forever (Studio's mobile pane
		// swaps, Compose↔Fabricate) and refit dead iframes each resume.
		if (host.isConnected) refit();
		else scaleTargets.delete(host);
	}
}

export type Geom = { width: number; height: number };
export type RenderStatus = {
	ok: boolean;
	slides: number;
	error: string | null;
	/** Which regime drew this render: 'patch' swapped only the `.lattice` body (cheap,
	 * ~2ms); 'restyle' swapped the resident theme `<style>` in place + the body (a
	 * theme/mode/palette change with no srcdoc rewrite — no new iframe realm minted, the
	 * fix for the theme-toggle realm-churn leak); 'write' rebuilt the whole srcdoc (a full
	 * iframe reparse + a fresh realm, tens–hundreds of ms). Lets a scheduling caller
	 * (DeckPreview's frame loop) render a patch/restyle instantly but coalesce a heavy
	 * write. Absent on a failed render. */
	writePath?: 'patch' | 'restyle' | 'write';
};

export type SingleSlideOptions = {
	/** Base URL the theme CSS is fetched from (`<themeBase><name>.css`). */
	themeBase: string;
	/** URL of the runtime bundle injected into each slide iframe. */
	runtimeUrl: string;
	/**
	 * On-demand engine bundle URL. When present, whenReady() triggers the inject
	 * (load-engine.ts) on first need; absent → whenReady() falls back to a poll
	 * (tests, or a legacy eager tag already on the page).
	 */
	engineUrl?: string;
	/**
	 * URL of the UMD Mermaid bundle injected into a `mermaid` slide's iframe.
	 * Absent → the jsdelivr CDN (back-compat). A docs surface that wants Mermaid
	 * to render offline / under a strict CSP / from its own origin passes the
	 * locally-vendored copy (`<assetBase>mermaid.min.js`, staged by
	 * sync-playground-assets) so previews never depend on a third-party CDN.
	 */
	mermaidUrl?: string;
	/**
	 * URL of the KaTeX stylesheet for surfaces that render the full deck through the
	 * presenter/stage path (studio-presenter). Absent → the jsdelivr CDN. A docs
	 * surface passes the locally-vendored copy (`<assetBase>katex/katex.min.css`,
	 * staged by sync-playground-assets) so math previews stay off a third-party CDN.
	 */
	katexUrl?: string;
};

/** Resolve `<html data-palette/-mode>` → the palette + mode to render with. */
export function currentPaletteMode(paletteOverride?: string): { palette: string; mode: 'light' | 'dark' } {
	const root = document.documentElement;
	return {
		palette: paletteOverride || root.getAttribute('data-palette') || 'indaco',
		mode: root.getAttribute('data-mode') === 'dark' ? 'dark' : 'light',
	};
}

// Host carries its resolved slide box so scaleFrame divides by the right width
// (a `size: 4K` deck pins a 3840×2160 box, not the HD default). It also carries
// the debounce's coalesce count for the NEXT render (set by DeckPreview), which
// renderInto consumes synchronously at render start — binding the count to THIS
// render's sample instead of a shared module global that an overlapping render
// could steal. And the render SIGNATURE of everything baked into its live srcdoc
// OUTSIDE the <section> (theme, mode, geom, mermaid, extra/author CSS) — an
// unchanged sig means the next render can PATCH the section in place; plus a
// pending-load flag so a same-sig render can't patch an outgoing (still-loading)
// full-write document.
type LiveHost = HTMLElement & { __latticeGeom?: Geom; __latticeCoalesce?: number; __latticeFrameSig?: string; __latticeRestyleSig?: string; __latticePendingLoad?: boolean; __latticeRevealPoll?: ReturnType<typeof setInterval> };
// "Has the live iframe actually painted a slide yet?" — true once its document holds a
// rendered `.lattice`. scaleFrame reveals the frame only when this is true, so it never
// unhides the pre-load `about:blank` white document (no `.lattice`) — the white-flash
// gate — WITHOUT depending on the `onload` event, which iOS Safari fires unreliably for
// srcdoc (the on-device stuck-hidden blank). Best-effort: a cross-doc read can't actually
// throw for a same-origin srcdoc, but guard anyway for teardown races.
function frameHasPainted(fr: HTMLIFrameElement): boolean {
	try {
		return !!fr.contentDocument?.querySelector('.lattice');
	} catch {
		return false;
	}
}

// Replace ONLY the live document's `.lattice` contents with a new (already
// sanitized) slide — the resident theme <style> + runtime <script> stay parsed and
// executed, so the runtime's body observer re-processes the swapped section for
// free. Returns false if the live document is gone (caller falls back to a full
// srcdoc write). The single-slide twin of deck-preview.js's patchSections.
function patchSlideBody(fr: HTMLIFrameElement, safeHtml: string): boolean {
	const doc = fr.contentDocument;
	const lattice = doc?.querySelector('.lattice');
	if (!doc || !lattice) return false;
	const holder = doc.createElement('div');
	holder.innerHTML = safeHtml;
	const fresh = holder.querySelector('.lattice');
	lattice.innerHTML = (fresh || holder).innerHTML;
	return true;
}

// ── Deck-context render: keep ONE section of a whole-deck render ─────────────
// Keep only section `index` of a rendered deck, preserving the `<article class="lattice">`
// wrapper and any trailing chrome (the engine emits a `<script>`/`<style>` tail on some
// decks), and dropping every other section.
//
// WHY a whole-deck render is rendered at all when one slide is shown: the engine numbers a
// slide by its ORDINAL POSITION among the sections of the document it parses
// (`lattice_directives_apply` in lib/engine/slides.js — `pageNumber += 1` per section, then
// `data-lattice-pagination-total` = the final count). There is no offset to hand it; the
// count IS the position. So a caller that slices one slide out and renders it ALONE gets
// "1 of 1" — which is exactly what every Studio preview showed, on every slide. Rendering
// the deck and DISPLAYING one section is the only way to get a true number without teaching
// the engine a second numbering mode.
//
// The kept section carries the engine-stamped `data-lattice-pagination` / `-total` (read by
// the `section[data-lattice-pagination]::after` pseudo in lib/engine/css.js), the visible
// `<span class="lat-pagination">` the footer dock uses, AND its positional `id` — all
// computed against the real deck.
//
// COST: one whole-deck engine parse per render instead of one slide's. That is the same
// bargain `playground-engine.ts` already makes for the filmstrip (it renders the full source
// on every edit, with typing INP green), and it leaves the DOMINANT preview cost untouched:
// the srcdoc still carries ONE section, so the 563KB CSS parse + runtime execution inside the
// frame — which is where the milliseconds actually are — is unchanged. See
// engineering/decisions/2026-07-11-preview-performance-diagnosis.md.
//
// ALIGNMENT IS NOT FREE — and getting it wrong shows the WRONG SLIDE. `index` is an index
// into the CALLER's authored-slide list (the Studio's `splitSlides`), while this function
// indexes the ENGINE's sections. Those counts diverge for real, committed decks, and when they
// do an index-based lookup silently paints a slide the author did not select — strictly worse
// than the wrong page number this whole path exists to fix. Two confirmed causes:
//   · a 1→N EXPANSION — `_focusSteps` clones one authored slide into a step per section
//     (`examples/focus.md`: 11 authored → 14 sections), and `split: headings` divides one
//     chunk at every heading (`examples/split-headings.md`: 1 → 7);
//   · SPLITTER DISAGREEMENT — the engine's `splitOnHr` (lib/engine/slides.js) breaks on ANY
//     markdown-it `hr` (`***`, `___`, `- - -`, `---` with trailing spaces), while the Studio's
//     `SEP_RE` (docs/src/components/studio/lint.ts) is `/\n-{3,}\n/` — three-or-more hyphens alone
//     on a line, nothing after them — so `***`, `___`, `- - -` and a trailing space split for the
//     engine and not for the Studio.
// So the caller passes the count it believes (`slideCount`) and narrowing happens ONLY when the
// engine agrees. On disagreement `narrowToSlide` returns null and the caller re-renders the one
// slide alone — the pre-deck-context behavior: the RIGHT slide with a "1 of 1" number. Right
// slide always; true number only when it is provably true. This mirrors the guard the same
// feature family already uses — `PresentOverlay.tsx` drops its narration projection wholesale
// when "the render's section count doesn't match the slide count".
//
// Reuses the filmstrip's `splitSections` (HARD RULE #15) rather than a second parser.
function narrowToSlide(html: string, index: number, slideCount?: number): string | null {
	// `splitSections` is the FLAT walker: it pairs each `<section` with the NEXT `</section>`.
	// The engine passes author raw HTML through verbatim, so a slide containing its own
	// `<section>…</section>` mis-pairs — the walker closes the slide at the inner tag and the
	// neighbor's markup (including its visible `.lat-pagination` number) leaks into the frame.
	// A count agreement can't catch it: the mis-paired total often still equals the caller's
	// slide count. So verify the walker against a raw `<section` tally, and fail closed when
	// they disagree. The repo HAS a depth-aware walker for exactly this — `lib/core/split-sections.js`,
	// whose own header says the scan "survives nested sections" — but it is CJS and not exposed
	// on the browser engine bundle, so wiring it to `docs/src` is a bundle-surface change, not a
	// line edit. Detect-and-degrade here; expose that kernel as the follow-up.
	const opens = (html.match(/<section\b/g) || []).length;
	const sections: string[] = splitSections(html);
	// Fail CLOSED on any disagreement or unusable index: null means "cannot prove which section
	// is slide `index`", and the caller falls back rather than guessing. Never return the whole
	// deck — stacking every section into a frame whose CSS and scale transform assume exactly
	// one is both visibly broken and (on a 117-slide deck) hundreds of KB of wasted HTML.
	if (opens !== sections.length) return null; // the flat walker mis-paired — nested `<section>`
	if (typeof slideCount === 'number' && sections.length !== slideCount) return null;
	// `Number.isInteger` is load-bearing, not defensive noise: a fractional or NaN index passes
	// both range comparisons (`NaN < 0` and `NaN >= n` are BOTH false), then `i === index` never
	// matches and the walk emits a wrapper with ZERO sections — a blank frame, the one outcome
	// this whole path is supposed to make unreachable.
	if (!Number.isInteger(index) || index < 0 || index >= sections.length) return null;
	if (sections.length < 2) return html;
	let out = '';
	let pos = 0;
	// Walk by INDEX (not by matching the section string), so a deck with two byte-identical
	// slides can't collapse onto the wrong one.
	for (let i = 0; i < sections.length; i++) {
		const at = html.indexOf(sections[i], pos);
		if (at === -1) return null; // shape we cannot walk — fail closed, same as a count mismatch
		out += html.slice(pos, at); // inter-section text: the wrapper open tag, newlines
		if (i === index) out += sections[i];
		pos = at + sections[i].length;
	}
	return out + html.slice(pos);
}

// ── Does this deck need a whole-deck render at all? ──────────────────────────
// The deck-context render exists to get three things right, and EVERY ONE of them requires the
// deck to actually carry deck-scoped state:
//   · the page NUMBER — only rendered when `paginate` is truthy, which in the Studio is a
//     default-OFF toggle that none of the three shipped decks sets;
//   · inherited RUNNING-GLOBAL directives — a bare `<!-- header: … -->` mid-deck. The Studio's own
//     header/footer controls write FRONT MATTER, which the caller already prepends to the slice, so
//     this is reachable only by hand-authoring directive comments;
//   · the deck-scoped PROGRESS RAIL and watermark glyph — both derived from divider slides, and both
//     no-ops in a deck with no dividers.
//
// Rendering the whole deck unconditionally therefore taxes the UNIVERSAL case to buy correctness in
// the OPT-IN case: a plain 40-slide prose deck with pagination off — the product's default shape —
// paid 20.2ms per keystroke instead of 9.0ms to compute a number it will never display.
//
// So decide first, from the source, which document the engine should get. This is deliberately NOT
// the thing `2026-07-15-incremental-per-slide-render-cache.md`'s trio rejected: it re-derives no
// engine semantics, synthesizes no directive prelude, re-stamps no number. It only picks the input.
// The engine stays the single owner of the page number (HARD RULE #1).
//
// It FAILS OPEN — anything it is unsure about returns true — so a wrong answer costs latency, never
// correctness. Cost is a regex pass over the source, measured at 0.033ms across 117 slides.
// THE QUESTION THIS ASKS. Not "does this deck show page numbers" — that was the first
// framing and it is a PROXY, which is how the gate shipped blind to `split-panel proof`.
// Pagination is only one deck-derived fact, and it is the forgiving one: a page number
// nobody displays can be wrong invisibly. A categorical hue is displayed either way, so
// the same shortcut renders it wrong in plain sight.
//
// The question is: **does any slide render something whose value depends on OTHER slides?**
// Each entry below is one such fact, named, with the reason it cannot be derived from a
// lone slice. Adding a deck-derived feature means adding an entry — and the registry is
// exported so a test can assert every fact is actually probed, rather than trusting that
// whoever added the feature remembered this file.
//
// Bias is toward OVER-triggering, but do NOT read that as "false positives are free" — an
// earlier version of this comment said exactly that, citing "~39ms, memoized", and it is
// wrong on the path that hurts. The memo helps NAVIGATION (same deck, different slide); a
// KEYSTROKE misses it by construction, because the markdown changed — see the memo's own
// note below. On the typing path a false positive costs a full whole-deck parse per
// keystroke, measured at 46.3ms p50 on a 40-slide gallery deck (the decision doc's +345%).
//
// So: over-trigger where the fact is genuinely possible, and do not add a probe merely
// because it is cheap to write. Each entry widens a real latency cliff for every deck that
// matches it. A false negative renders wrong output, which is still worse — that is why the
// bias exists at all — but the trade is a trade, not a freebie.
export const DECK_DERIVED_FACTS: ReadonlyArray<{
	fact: string;
	why: string;
	probes: RegExp[];
	/** For a fact no single regex can express. Checked after `probes`. */
	test?: (deck: string) => boolean;
}> = [
	{
		// NOT pagination. The page number is `slide k of N` — positional metadata the caller
		// already holds, so it is SUPPLIED to the engine (`page` on the render opts) rather than
		// re-derived by parsing the deck. That is why `paginate` is no longer a trigger, and it
		// is the single biggest saving here: of 126 committed decks, 115 set pagination and 68
		// tripped this gate for that reason ALONE. Those now keep the cheap slice path AND print
		// a true number.
		//
		// What supplying a position DOES require is that the caller's slide indices mean the same
		// thing the engine's sections do. Two plugins break that 1→N: `_focusSteps` clones one
		// authored slide into one rendered slide per step, and `split: headings` starts a new
		// slide at every `##`. Under either, "slide k" of the caller's list is not section k, so a
		// supplied position would number the WRONG slide — worse than the bug it fixes. Those
		// decks keep the whole-deck render, where the engine counts for itself and is right by
		// construction. One committed deck (examples/focus.md) is in this class.
		fact: 'slide expander (1→N)',
		why: 'a plugin turns one authored slide into several rendered ones, so the caller\'s slide index no longer identifies a section and a supplied position would number the wrong slide',
		probes: [
			/<!--\s*_?focusSteps\s*:/, // one slide per step
			/^\s*split\s*:\s*headings\b/m, // a new slide at every `##`
		],
	},
	{
		fact: 'running-global directive',
		why: 'a directive comment without the `_` spot prefix applies to its slide AND every one after, so a slice loses what it inherited',
		probes: [/<!--\s*(?!_)[a-zA-Z][\w-]*\s*:/],
	},

	{
		// The section number is SUPPLIED (deckSectionFor), so an ordinary divider deck keeps the
		// cheap slice path — that is this change's whole point. This entry catches only the case
		// where the count cannot be trusted: a deck where a `_class: divider` appears inside code,
		// so the raw and code-stripped readings disagree.
		//
		// It exists because supplying INVERTS the gate's failure direction. As a probe, matching a
		// divider mentioned in prose cost a wasted parse and produced correct output. As a counter
		// the same match paints an extra dot and bumps the watermark glyph — wrong output. When the
		// reading is ambiguous we pay the parse and let the engine count for itself, which is right
		// by construction.
		fact: 'ambiguous divider count',
		why: 'a `_class: divider` inside code makes the raw and code-stripped counts disagree, so a supplied section could paint the wrong rail',
		probes: [],
		test: (deck) => /<!--[^>]*\b_?class\s*:[^>]*\bdivider\b/.test(deck) && deckSectionFor(deck, 0) === undefined,
	},
	{
		fact: 'glossary: auto',
		why: 'appends a derived appendix slide built from terms across the whole deck, changing the slide count',
		probes: [/^\s*glossary\s*:\s*auto\b/m],
	},
	{
		// THE ONE THE PROXY MISSED. `cat-N` on a `split-panel proof` run is assigned from the
		// slide's ordinal among the deck's proof slides (`sequenceProofPanels`, lib/core/split-panels.js),
		// never authored. A slice rendered alone is always "the first proof slide" and takes `cat-1`,
		// so a leveled deck presented as six identical blue panels — the originally reported bug,
		// which survived the first cut of this gate because it paginates and tripped `pagination`
		// by luck. Verified on the real Present overlay: without this entry a three-slide proof run
		// with no `paginate` paints one hue for all three; with it, three.
		//
		// Matches `proof`/`capstone` WITHOUT requiring `split-panel` in the same directive, because
		// `deckClassPropagate` can supply that token from front matter. Over-triggering on a stray
		// `proof` class is the cheap direction.
		fact: 'split-panel proof run',
		why: 'cat-N is assigned from the slide\'s ordinal among the deck\'s proof slides, so a lone slice always takes cat-1',
		probes: [
			/<!--\s*_?class\s*:[^>]*\b(?:proof|capstone)\b/, // directive comment
			/^\s*class\s*:[^\n]*\b(?:proof|capstone)\b/m, // front matter / global
		],
	},
];

/**
 * Can the caller's slide indices be TRUSTED as engine section indices?
 *
 * Supplying a page position is only sound if "slide k of N" means the same thing to the caller
 * and to the engine. The whole-deck path VERIFIES that (narrowToSlide bails when the section
 * count disagrees, and falls back to an honest 1-of-1); the slice path has no such backstop, so
 * it has to earn the right to supply a number.
 *
 * WHY A PROBE IS NOT ENOUGH, and how this was caught. An earlier cut gated on a `split: headings`
 * probe — but heading splitting is the DEFAULT (`DEFAULT_SPLIT` in lib/core/resolve-split.js), so
 * a deck splits on headings with no directive to match. A deck whose `---` chunk carries two
 * top-level h1/h2 therefore renders THREE sections while the Studio counts TWO slides, and the
 * preview confidently painted "2 of 2" where the truth was "3 of 3". On the whole-deck path the
 * same deck failed CLOSED to "1 of 1". Trading an honest fallback for a plausible lie is strictly
 * worse than the bug being fixed, which is the bar this file's own registry comment sets.
 *
 * So this COUNTS what the engine will produce, conservatively, and returns false the moment it is
 * unsure. Every "unsure" costs only the optimization — the render falls back to no supplied
 * position, i.e. exactly the pre-existing 1-of-1 — so the failure direction is honest, never wrong.
 */
function positionIsTrustworthy(deck: string, slideCount: number | undefined): boolean {
	if (!(typeof slideCount === 'number' && slideCount > 0)) return false;
	const body = String(deck ?? '')
		.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '') // front matter
		.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, ''); // fenced code — never a boundary

	// A `_focusSteps` slide becomes one slide PER STEP; the count is not derivable here at all.
	if (/<!--\s*_?focusSteps\s*:/.test(body)) return false;
	// An hr form the Studio's `\n---\n` splitter does not recognise but markdown-it does
	// (`***`, `___`, `- - -`, `---` with trailing space). Either side miscounts; bail.
	if (/^[ \t]*(?:\*[ \t]*\*[ \t]*\*[-* \t]*|_[ \t]*_[ \t]*_[_ \t]*|-[ \t]+-[ \t]+-[- \t]*|-{3,}[ \t]+)$/m.test(body)) return false;

	const chunks = body.split(/\n-{3,}\n/);
	if (chunks.length !== slideCount) return false; // the caller and this splitter already disagree

	// Heading splitting is ON unless the deck opts out, and it inserts a break before every
	// top-level h1/h2 after the first in a chunk. Count only headings at column 0 — one nested in
	// a list or blockquote does not divide (see the plugin's `token.level === 0` guard).
	const splitsOnHeadings = !/^\s*split\s*:\s*(rule|none|off)\b/m.test(deck);
	if (splitsOnHeadings) {
		for (const chunk of chunks) {
			if ((chunk.match(/^#{1,2}[ \t]+\S/gm) || []).length > 1) return false;
		}
	}
	return true;
}

/**
 * Which divider-delimited SECTION the shown slide sits in, and how many the deck has.
 *
 * The progress rail and the watermark glyph both derive this by walking every section
 * (`progress.transform.js`, `watermark.transform.js`), which is why a deck with dividers had to
 * re-render in full on every keystroke — 63ms of engine work per keypress on a 40-slide gallery
 * deck, against 3ms for a deck without them. It is the same positional metadata the page number
 * is, so the caller supplies it rather than making the engine recount.
 *
 * Only ever called behind `positionIsTrustworthy`, which is what guarantees chunk k IS section k.
 * `index` counts dividers at or before the shown slide, matching exactly where the transform's
 * own walk would have arrived; `total` is the deck's divider count. Both zero → no rail, which is
 * also what a deck with no dividers gets.
 */
function deckSectionFor(deck: string, slideIndex: number): { index: number; total: number } | undefined {
	const stripFm = String(deck ?? '').replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
	// Blank every form of code the engine renders literally. A `_class: divider` inside a code
	// SAMPLE is documentation, not a directive — and decks that teach Lattice authoring are full
	// of them (examples/speaker-notes.md, split-headings.md, debug.md, …).
	const body = stripFm
		.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1/gm, '') // fenced
		.replace(/^(?: {4}|\t)[^\n]*$/gm, '') // indented block
		.replace(/`[^`\n]*`/g, ' '); // inline span
	const chunks = body.split(/\n-{3,}\n/);
	const isDivider = (c: string) => /<!--[^>]*\b_?class\s*:[^>]*\bdivider\b/.test(c);
	const total = chunks.filter(isDivider).length;

	// FAIL SAFE, NOT FAIL WRONG. This is the property the whole gate design rests on, and it
	// INVERTS the moment a fact stops being a probe and becomes a counter. As a probe, matching a
	// `divider` mentioned in prose merely forced the whole-deck render — a wasted parse and correct
	// output. As a counter the same match paints an extra dot and bumps the watermark glyph, which
	// is wrong output. Found by an inversion review, reproduced: a slide whose body shows
	// `<!-- _class: divider -->` in an inline code span rendered "02" against the deck's "01".
	//
	// So when the two readings disagree — anything that looks like a divider in the raw source but
	// not after code is blanked, or vice versa — return nothing. The caller then supplies no
	// section, the gate keeps the whole-deck render, and the rail is right by construction. The
	// cost of being unsure is a parse; the cost of guessing is a lie.
	const rawChunks = stripFm.split(/\n-{3,}\n/);
	if (rawChunks.length !== chunks.length || rawChunks.filter(isDivider).length !== total) return undefined;
	if (!total) return undefined;

	let index = 0;
	for (let i = 0; i <= slideIndex && i < chunks.length; i++) if (isDivider(chunks[i])) index += 1;
	return { index, total };
}

function needsDeckContext(deck: string): boolean {
	return DECK_DERIVED_FACTS.some((f) => f.probes.some((p) => p.test(deck)) || (f.test ? f.test(deck) : false));
}

// ── Whole-deck render memo — ONE entry, module-level ─────────────────────────
// The deck-context render re-parses the WHOLE deck to learn one slide's true page number, and
// two common interactions repeat that parse with BYTE-IDENTICAL inputs:
//   · NAVIGATION — changing the shown slide changes only `slideIndex`; the deck, theme, mode and
//     author CSS are the same, so the engine's output is identical. Measured on the real built
//     Studio at 4× CPU on a 40-slide gallery deck, patch path, before this memo: a rail click
//     cost TOTAL 52.1ms p50 / RENDER 43.8ms, against 12.8ms / 6.8ms on `main` — a 4× regression
//     that crossed `createFrameScheduler`'s 50ms heavy threshold, so every navigation coalesced
//     instead of painting immediately.
//   · THE OVERVIEW GRID — every visible tile renders the SAME deck document and displays its own
//     section, so N tiles paid N identical parses for one modal.
// MODULE-level, not per-host, precisely so the grid's tiles share one entry. ONE entry, replaced
// on any miss, so memory stays bounded at a single render (~290KB for a 117-slide deck) instead
// of growing per host.
//
// The key is the complete set of inputs this module feeds `renderMarkdown`: the markdown, the
// resolved theme name, the mode, and both author-CSS channels. `baseUrl` and the preview flag are
// fixed per renderer. Anything else that could change the output has to change one of these.
//
// A KEYSTROKE MISSES BY CONSTRUCTION — the markdown changed — and that is correct: that parse is
// real work this memo must not pretend away. Collapsing it needs the engine-side incremental
// render path (engineering/decisions/2026-07-15-incremental-per-slide-render-cache.md), not a memo.
// On a hit `engineMs` is the real (near-zero) elapsed time and `stats` is absent, because no
// engine stages ran — the perf overlay tells the truth rather than a fabricated breakdown.
type DeckRender = { html: string; css: string; width?: number; height?: number };
let deckMemo: { key: string; out: DeckRender } | null = null;
// SLICE CACHE — a small LRU of single-slide renders.
//
// The whole-deck memo made NAVIGATION nearly free: one memoized deck parse served all 40 slides,
// so changing the shown index cost a re-narrow and nothing more. Rendering slices instead is what
// took typing from 63ms of engine work per keystroke to 4ms, but it gave that back on navigation —
// every slide change became its own parse (~5.7ms on a gallery deck) where it used to be ~0.2ms.
//
// This restores it for the case that actually recurs: revisiting a slide. Presenting walks back and
// forth, the overview grid shows the same slides repeatedly, and an edit-then-return is the common
// authoring loop — all hits. A first linear pass still pays per slide, which is the honest floor for
// not parsing the deck.
//
// Bounded at 24 entries, ~1 slide of HTML each rather than a whole deck's worth, so the memory
// profile is smaller than the single whole-deck entry it supplements. Insertion-ordered Map: the
// oldest key is evicted, and a hit re-inserts to keep it warm.
const SLICE_CACHE_MAX = 24;
const sliceCache = new Map<string, DeckRender>();
/** Drop the slice cache. Separate from `clearDeckMemo` on purpose — see the note there. */
export function clearSliceCache(): void {
	sliceCache.clear();
}
function sliceCacheGet(key: string): DeckRender | undefined {
	const hit = sliceCache.get(key);
	if (!hit) return undefined;
	sliceCache.delete(key); // re-insert so recency is the eviction order
	sliceCache.set(key, hit);
	return hit;
}
function sliceCachePut(key: string, out: DeckRender): void {
	if (sliceCache.has(key)) sliceCache.delete(key);
	sliceCache.set(key, out);
	if (sliceCache.size > SLICE_CACHE_MAX) sliceCache.delete(sliceCache.keys().next().value as string);
}
function memoKey(markdown: string, theme: string, mode: string, extraCss: string, extraThemeCss: string): string {
	// Hash the long strings; keep theme/mode literal so a collision cannot cross palettes.
	return `${theme}|${mode}|${hashString(markdown)}|${markdown.length}|${hashString(extraCss)}|${hashString(extraThemeCss)}`;
}
/** Drop the whole-deck memo — used by tests, and safe to call at any time (it only costs a
 *  re-render). Deliberately does NOT touch `sliceCache`: `dispose()` calls this, and `dispose()`
 *  is PER-RENDERER while the slice cache is module-level and shared. Clearing it here meant one
 *  `DeckPreview` unmounting — leaving Present, closing the overview grid, a mobile pane swap —
 *  wiped every other host's entries, which is precisely the three cases the cache exists for.
 *  Use `clearSliceCache()` when you genuinely want it gone (tests). */
export function clearDeckMemo(): void {
	deckMemo = null;
}

// Scan the just-rendered slide for dropped-to-black SVG chart paint (the #956
// signal), feeding the live VizDiagnosticsOverlay — but ONLY while it's subscribed
// (off = free). Deferred ~650ms like the overflow re-read: an SVG chart is stamped
// by the runtime shortly after load, and a `mermaid` slide renders its SVG async,
// so an immediate scan would miss them. Best-effort: a cross-doc read can throw
// during teardown. getDoc is a thunk so a torn-down/replaced frame resolves late.
function scheduleVizScan(getDoc: () => Document | null | undefined): void {
	if (!hasVizScanListeners()) return;
	setTimeout(() => {
		try {
			const doc = getDoc();
			if (doc?.querySelector('.lattice svg')) recordVizScan(scanBlackFills(doc), performance.now());
			else if (doc) recordVizScan([], performance.now()); // no SVG on this slide → clear stale findings
		} catch {}
	}, 650);
}

/**
 * Build a single-slide renderer bound to a theme source + runtime URL. Returns:
 *   - renderInto(host, markdown, mermaid, paletteOverride?, extra?, modeOverride?, extraCss?, opts?) → Promise<RenderStatus>
 *     (`opts.slideIndex` → `markdown` is a whole deck; show only that section, so the
 *      engine's page number is computed against the real deck — see keepOnlySection)
 *   - whenReady()       → Promise<void> (triggers on-demand engine load)
 *   - onThemeChange(cb) → re-run cb (debounced) on a data-palette/-mode flip
 *   - scaleFrame(host)  → re-fit the host's iframe (after a reveal/resize)
 *   - ready()           → window.LatticePlayground present?
 */
export function createSingleSlideRenderer(opts: SingleSlideOptions) {
	const { themeBase, runtimeUrl, engineUrl } = opts;
	// Prefer a locally-vendored Mermaid (no CDN); fall back to jsdelivr.
	const mermaidUrl = opts.mermaidUrl || MERMAID;
	const themes = createThemeFetcher(themeBase);

	// Teardown bookkeeping — everything THIS renderer instance creates that would
	// otherwise outlive it: the per-host ResizeObservers, the hosts it registered
	// in the module-level scaleTargets Map (a GC ROOT — the leak vector), the
	// theme-change MutationObserver(s) on the immortal document.documentElement,
	// and the pending 4s reveal timers. dispose() releases them. Without it a
	// REMOUNTING host — HeroPreview's Preview<->Source tab flip, the Slide
	// Overview (one host per slide), the Studio overlays — leaks a fully-parsed
	// ~560KB theme iframe per cycle, invisible to GC because scaleTargets roots it.
	// See engineering/decisions/2026-07-17-preview-accumulation-leaks.md.
	const ownedObservers = new Set<ResizeObserver>();
	const ownedHosts = new Set<HTMLElement>();
	const themeObservers = new Set<MutationObserver>();
	const themeUnsubscribes = new Set<() => void>();
	const ownedTimers = new Set<ReturnType<typeof setTimeout>>();
	const ownedIntervals = new Set<ReturnType<typeof setInterval>>();
	// Latch: renderInto is async (awaits theme fetch + the engine render), so an
	// unmount can land mid-render. Without this the settling continuation would
	// re-register the host in scaleTargets + re-add its observer AFTER dispose()
	// emptied those sets — re-rooting the detached iframe the fix is meant to free.
	// dispose() sets it; the continuation bails before it touches the DOM.
	let disposed = false;

	// Last sanitize duration (ms), stashed by srcdoc() and read by renderInto for
	// the perf-overlay RENDER group. A closure var (not a return value) keeps the
	// srcdoc signature — and the #22 sanitize call site — untouched; renderInto
	// copies it into a local right after the call so a second concurrent host
	// can't clobber the sample.
	let lastSanitizeMs = 0;

	// Self-hosted preview fonts. Lazy-imported + cached: font-embed.js pulls
	// bundled .woff2 that Node can't load, so a static import would break this
	// module's unit test. The @font-face references the woff2 by URL (browser
	// caches once), not inlined per render.
	let fontFaceCss = '';
	let fontFacesReady: Promise<void> | null = null;
	function ensurePreviewFonts(): Promise<void> {
		if (!fontFacesReady) {
			fontFacesReady = import('../playground/font-embed.js')
				.then((m) => {
					fontFaceCss = m.previewFontFaceCss();
				})
				.catch(() => {
					fontFaceCss = '';
				});
		}
		return fontFacesReady;
	}

	// The inner text of the srcdoc's resident `<style id="lattice-theme">` — the ONE place a
	// slide's theme, mode, size-box, and author CSS are baked. Extracted so srcdoc() (full write)
	// and the RESTYLE fast path (renderInto) build it identically: a theme/mode change swaps THIS
	// string into the live document's existing <style> instead of rewriting the whole srcdoc, so
	// no new iframe realm is minted per palette/mode toggle (the theme-toggle realm-churn leak,
	// 2026-07-20-studio-audit-instrument-fix). @font-face is position-independent but kept up top
	// to document intent; color-scheme is forced to the rendered mode so a theme's `light-dark()`
	// pairs resolve as chosen; author-supplied `extraCss` (Fabricate Layout Studio's live component
	// styles) is appended AFTER the theme, the same order the Workbench previews it.
	function themeStyleContent(css: string, mode: 'light' | 'dark', geom: Geom, extraCss = ''): string {
		const bg = mode === 'dark' ? '#0c0c0c' : '#e7e7ea';
		return (
			fontFaceCss +
			singleSlideFrame(geom.width, geom.height) +
			':root{color-scheme:' +
			mode +
			'}html,body{background:' +
			bg +
			'}' +
			// PREVIEW-ONLY (this srcdoc builder is never an export path): a motion-eligible chart figure the
			// live host has pre-hidden starts invisible, so the viewer never sees the static poster flash
			// before the async Anima host mounts + reveals it (hidden → build → settle). `visibility:hidden`
			// keeps the figure's box (no reflow / no Fit-math corruption on reveal, unlike display:none). The
			// class is added ONLY by the live parent host — never by engine output — so it is inert in export.
			'.anima-prehide{visibility:hidden}' +
			css +
			(extraCss ? '\n/* studio-extra-css */\n' + extraCss : '')
		);
	}

	// Render the slide at its INTRINSIC `@size` box and scale the iframe ELEMENT
	// (never the SVG) to fit the host — sidesteps the Safari foreignObject scaling
	// bug (see frame-css.js + index.astro srcdoc note). `geom` is the render's
	// reported { width, height } (px).
	function srcdoc(html: string, css: string, mode: 'light' | 'dark', mermaid: boolean, geom: Geom, extraCss = ''): string {
		// Strip script-bearing content before it enters this same-origin,
		// un-sandboxed frame (#616 T-CONTENT) — the runtime/Mermaid scripts are
		// appended separately below, so they're untouched.
		const tSanitize = performance.now();
		html = sanitizeSlideHtml(html);
		lastSanitizeMs = performance.now() - tSanitize;
		let s =
			// The theme <style> carries an id so the RESTYLE fast path (renderInto) can find
			// and swap it in place on a theme/mode change — no srcdoc rewrite, no new realm.
			'<!doctype html><html><head><meta charset="utf-8"><style id="lattice-theme">' +
			themeStyleContent(css, mode, geom, extraCss) +
			'</style></head><body>' +
			html;
		if (mermaid) s += '<scr' + 'ipt src="' + mermaidUrl + '"></scr' + 'ipt>';
		s += '<scr' + 'ipt src="' + runtimeUrl + '"></scr' + 'ipt>';
		// Preview-only link guard: an external link tap (a video poster, a contact/qr
		// URL) must not navigate — and blank — this scaled srcdoc frame on iOS. Also
		// carries the video-playback bridge (window.__videoPlay) for the Studio.
		s += '<scr' + 'ipt>' + linkGuardAgent() + '</scr' + 'ipt>';
		s += '</body></html>';
		return s;
	}

	/** Scale the fixed-box iframe to fill its (16:9) host; driven by host width. */
	function scaleFrame(host: HTMLElement) {
		const fr = host.querySelector<HTMLIFrameElement>('iframe.live');
		if (!fr) return;
		const w = host.clientWidth;
		// Scale by the slide's OWN box (stashed by renderInto), not a hardcoded
		// 1280×720 — otherwise a 4K (3840-wide) slide is scaled 3× too large. The
		// element's CSS pins it to HD by default, so a non-HD deck also needs the
		// element resized to its real box here before the transform fits it.
		const geom = (host as LiveHost).__latticeGeom || { width: DEFAULT_W, height: DEFAULT_H };
		fr.style.width = geom.width + 'px';
		fr.style.height = geom.height + 'px';
		if (w > 0) {
			fr.style.transform = 'scale(' + (w / geom.width).toFixed(5) + ')';
			// Reveal once we have (a) a real width to scale to — else the frame shows UNSCALED
			// at its intrinsic 1280px and the centered content falls outside the box (blank) —
			// AND (b) the srcdoc has actually PAINTED its slide, detected by a `.lattice` in the
			// frame's document. Keying on CONTENT, not the `onload` event, is load-bearing:
			// iOS Safari fires `onload` UNRELIABLY for srcdoc (re)assignment, which left the
			// frame stuck hidden forever (rev:NO on-device — the "blank"). Content-presence is
			// onload-independent AND closes the white about:blank window (about:blank has no
			// `.lattice`, so the pre-load scaleFrame below can't reveal a blank white frame).
			// Reveal by fading OPACITY 0→1 (a quick ~180ms transition set on the element) rather
			// than a hard visibility cut, so the slide eases in over the loader instead of
			// popping — no flicker. opacity:0 hides the about:blank white just as well.
			if (fr.style.opacity === '0' && frameHasPainted(fr)) {
				fr.style.opacity = '1';
				// Restore hit-testing on reveal — an opacity:0 iframe is still hit-testable, so it was
				// held `pointer-events:none` (below) to not swallow scroll/clicks during the load window.
				fr.style.pointerEvents = '';
			}
		}
	}

	/** True once the engine bundle has loaded. */
	function ready(): boolean {
		return Boolean(window.LatticePlayground);
	}

	/**
	 * Fire the theme CSS + preview-font fetches WITHOUT waiting on the engine —
	 * `theme-fetch.ts`'s `fetch()` is a pure network call cached by name, so this
	 * can run in parallel with `whenReady()`'s engine-bundle load instead of
	 * behind it. `renderInto`'s later `themes.ensure()` reuses the same cached
	 * promise (a no-op network-wise) once the engine is ready to register it.
	 * Best-effort only: a network error here is swallowed — `renderInto`'s own
	 * `ensure()` still surfaces it through the normal render-failure path.
	 */
	function prefetchTheme(paletteOverride?: string, modeOverride?: 'light' | 'dark'): void {
		const { palette, mode } = currentPaletteMode(paletteOverride);
		void themes.fetch('lattice').catch(() => {});
		void themes.fetch(palette).catch(() => {});
		if ((modeOverride ?? mode) === 'dark') void themes.fetch(palette + '-dark').catch(() => {});
		void ensurePreviewFonts();
	}

	/**
	 * Render `markdown` into `host` (creating/updating its `iframe.live`), themed
	 * by the current (or overridden) palette + mode. Resolves to a status object.
	 */
	function renderInto(
		host: HTMLElement,
		markdown: string,
		mermaid: boolean,
		paletteOverride?: string,
		// Opt-in: render against a RAW in-memory theme (e.g. Fabricate's live
		// derived theme) instead of fetching `<themeBase><name>.css`. Registered
		// once per distinct name. Existing callers omit it → unchanged behaviour.
		extra?: { name: string; css: string },
		// Opt-in: render in a SPECIFIC light/dark mode instead of the global
		// `<html data-mode>` — lets a surface audition a theme in both modes (the
		// Fabricate specimen toggle) without flipping the whole page. Existing
		// callers omit it → mode still follows data-mode.
		modeOverride?: 'light' | 'dark',
		// Opt-in: raw author CSS appended after the theme (Fabricate's Layout Studio
		// previews a live local component's styles). Existing callers omit it.
		extraCss?: string,
		// Opt-in extras, as an object so future additions don't grow this positional list.
		// The DECK-CONTEXT render (see narrowToSlide above): `markdown` is a WHOLE DECK and only
		// one section is shown, so the engine's page number is computed against the real deck.
		// All three fields travel together — pass all or none:
		//   · `slideIndex`  — 0-based index of the shown slide in the caller's authored list;
		//   · `slideCount`  — how many slides the caller believes the deck has. Narrowing happens
		//     ONLY if the engine's section count matches, because otherwise the index does not
		//     mean what the caller thinks and would show the WRONG SLIDE;
		//   · `slideMarkdown` — the shown slide alone (front matter + that slide). Rendered as
		//     the fallback when the counts disagree: the right slide, numbered 1 of 1.
		// Existing callers omit all of it → the whole render is shown, unchanged.
		opts?: { slideIndex?: number; slideCount?: number; slideMarkdown?: string },
	): Promise<RenderStatus> {
		const PG = window.LatticePlayground;
		if (!PG) return Promise.resolve({ ok: false, slides: 0, error: 'engine not loaded' });
		const { palette, mode: docMode } = currentPaletteMode(paletteOverride);
		const mode = modeOverride ?? docMode;
		// Perf-overlay timing: whole edit→paint span starts here (includes the
		// usually-warm theme ensure below); per-stage deltas are taken inline.
		const tStart = performance.now();
		// Consume the coalesce count DeckPreview stamped on the host for this render
		// (edits collapsed by the debounce), synchronously here so it's bound to THIS
		// render. Reset to 1 so a follow-up palette/rising-edge render (which doesn't
		// go through the debounce) correctly reports "no coalescing".
		const liveHost = host as LiveHost;
		const coalesced = liveHost.__latticeCoalesce ?? 1;
		liveHost.__latticeCoalesce = 1;
		// The perf overlay's SOURCE-BYTES figure means "how much markdown produced the slide on
		// screen". Under deck context `markdown` is the whole deck, so reporting its length would
		// silently redefine the number (a 40× jump that reads as a content explosion, not as a
		// changed denominator). Report the SHOWN slide's bytes; `slideMarkdown` is that slide.
		const shownBytes = opts?.slideMarkdown?.length ?? markdown.length;
		const themeReady = extra
			? Promise.all([themes.ensureBase(), ensurePreviewFonts()]).then(() => {
					// ALWAYS (re-)register — addThemes overwrites by name, so an edited
					// theme re-saved under the same name takes effect immediately. A
					// hasTheme() guard would silently keep rendering the stale CSS.
					PG.addThemes([extra.css]);
				})
			: Promise.all([themes.ensure(palette, mode), ensurePreviewFonts()]);
		return themeReady
			.then(async () => {
				// Bail if the host was disposed/detached while the theme fetch was in
				// flight — don't spend an engine render on a torn-down preview.
				if (disposed || !host.isConnected) return { ok: false, slides: 0, error: 'renderer disposed' };
				const theme = extra ? extra.name : mode === 'dark' && PG.hasTheme(palette + '-dark') ? palette + '-dark' : palette;
				let out: { html: string; css: string; width?: number; height?: number; stats?: RenderStats };
				let engineMs = 0;
				// GATE the whole-deck render on whether this deck actually needs one (see
				// needsDeckContext). When it does not, render the shown slide ALONE — the
				// pre-deck-context cost, for a deck whose deck-scoped facts are all absent anyway.
				// This is the SINGLE decision point, so no call site has to know about it, and it also
				// removes the double render the misalignment fallback used to pay: a deck that needs no
				// context never renders the deck, so it can never fall back from one.
				// Divert to the slice ONLY when there is a slice to render and the deck contributes
				// nothing. A caller that passes `slideIndex` without `slideMarkdown` has no slice to
				// fall back to, so it keeps the deck render and the narrowing it asked for.
				const canDivert = typeof opts?.slideIndex === 'number' && !!opts.slideMarkdown;
				const wantsContext = typeof opts?.slideIndex === 'number' && (!canDivert || needsDeckContext(markdown));
				const renderSource = wantsContext || !canDivert ? markdown : (opts?.slideMarkdown as string);
				// SUPPLIED DECK POSITION for the slice path. When we render the shown slide alone,
				// the engine would number it "1 of 1" — so hand it the position the caller already
				// knows. This is what lets `paginate` stop forcing a whole-deck parse.
				//
				// Only on the slice path: a whole-deck render counts for itself and is right, and
				// supplying an offset there would shift EVERY section (slide 1 numbered as 4).
				// Supplied ONLY when the caller's indices are provably engine section indices
				// (positionIsTrustworthy). Otherwise omit it and let the slide number itself 1 of 1 —
				// the honest fallback, never a plausible wrong number.
				const slicePage =
					renderSource !== markdown &&
					typeof opts?.slideIndex === 'number' &&
					opts.slideIndex >= 0 &&
					positionIsTrustworthy(markdown, opts?.slideCount)
						? {
								offset: opts.slideIndex,
								total: opts.slideCount as number,
								deckSection: deckSectionFor(markdown, opts.slideIndex),
							}
						: undefined;
				// Resolve a sample deck's `![bg](sample-image-*.svg)` against the staged samples/
				// dir (sibling of themes/ under the hashed root). Make it ABSOLUTE — themeBase is
				// root-relative, and the engine's WHATWG-URL resolver needs an absolute base.
				// Hoisted out of the try below so the deck-context fallback render can reuse it.
				const samplesBase = new URL(themeBase.replace(/themes\/$/, 'samples/'), location.href).href;
				try {
					const tEngine = performance.now();
					// Reuse the last whole-deck render when every input is identical — a navigation
					// or a sibling overview tile (see the deckMemo note above). Copied out, never
					// handed over, because the narrowing step below mutates `out.html`.
					//
					// GATED ON DECK CONTEXT, and that gate is load-bearing rather than an optimization.
					// The memo exists for one problem: the same deck re-parsed because only the shown
					// index changed. A host WITHOUT deck context (a landing island, a component
					// specimen) renders a standalone slide once and never repeats it, so memoizing it
					// buys nothing and costs an entry — and, because the memo is module state, it would
					// silently couple every such host (and every test of them) to whatever rendered
					// last. Narrowing the gate keeps the shared state confined to the callers that
					// actually benefit from it.
					// The position is part of the key: two BYTE-IDENTICAL slides at different
					// deck positions render differently now (they print different numbers), so a
					// key over source alone would serve slide 7 the number it cached for slide 3.
					const key = typeof opts?.slideIndex === 'number'
						? `${memoKey(renderSource, theme, mode, extraCss || '', extra?.css || '')}|${samplesBase}|${slicePage ? `${slicePage.offset}/${slicePage.total ?? ''}/${slicePage.deckSection ? `${slicePage.deckSection.index}of${slicePage.deckSection.total}` : ''}` : ''}`
						: null;
					// Two caches, because the two paths cache different things: the whole-deck memo
					// holds ONE un-narrowed deck render, the slice cache holds up to 24 single
					// slides. A slice render never populates the deck memo and vice versa.
					const sliceHit = key !== null && slicePage ? sliceCacheGet(key) : undefined;
					if (sliceHit) {
						out = { ...sliceHit };
						engineMs = performance.now() - tEngine;
					} else if (key !== null && !slicePage && deckMemo?.key === key) {
						out = { ...deckMemo.out };
						engineMs = performance.now() - tEngine; // the real (near-zero) cost
					} else {
						// Ask the engine for its per-stage breakdown ONLY while the overlay is
						// subscribed — otherwise it collects nothing (off = free).
						out = await renderMarkdown(PG, renderSource, theme, { baseUrl: samplesBase, stats: hasRenderListeners(), page: slicePage });
						engineMs = performance.now() - tEngine;
						// Store the UN-narrowed render; the copy keeps the memo immune to the
						// mutation below and to any caller that edits what it received. Only a
						// deck-context render populates it (`key !== null`) — see the gate above.
						if (key !== null) {
							const snapshot = { html: out.html, css: out.css, width: out.width, height: out.height };
							// A slice render goes in the LRU; a whole-deck render in the single memo.
							if (slicePage) sliceCachePut(key, snapshot);
							else deckMemo = { key, out: snapshot };
						}
					}
					// engineMs brackets the WHOLE renderMarkdown call, which also does the
					// math prescan + (cold) KaTeX load before the engine's own render. Fold
					// that gap into an `other` bucket so the breakdown reconciles to
					// engineMs — otherwise the bars silently under-sum the headline and
					// point a perf-debugging user at the wrong stage.
					if (out.stats) {
						const s = out.stats;
						s.otherMs = Math.max(0, engineMs - (s.parseMs + s.transformsMs + s.assembleMs + s.cssMs));
						// Deck context (item 2): count chart-layout sections + mermaid fences
						// in the output, detect math from the source. Chart slides carry their
						// layout class (piechart/gantt/…) on the <section> in the engine HTML
						// string; the `chart-frame` marker is added at RUNTIME (applyToDom) and
						// isn't in the string yet — so we match the layout class, not the marker.
						// This alternation MIRRORS `CHART_LAYOUTS` in
						// lib/components/chart/_chart-family/chart-family.js (all 13 layouts) —
						// keep it in sync when a chart type is added there (neither the engine
						// nor the playground re-exports the list, so it can't be imported here).
						// Overflow is read from the live frame after it settles (below) — 0 here
						// as a placeholder.
						s.charts = (out.html.match(/<section\b[^>]*\bclass="[^"]*\b(?:progress|timeline-list|piechart|gantt|kanban|radar|quadrant|state-chart|funnel|map|journey|word-cloud|roadmap)\b/g) || []).length;
						s.mermaid = (out.html.match(/language-mermaid/g) || []).length;
						// Match the engine's OWN KaTeX gate exactly — renderMarkdown
						// (render-engine.ts) loads KaTeX when `sourceHasMath(source)` is true on
						// the UN-stripped source, and that cold-load cost lands in `other`. Using
						// the same gate makes the "math" chip mean precisely "this render
						// triggered a KaTeX load"; stripping code here would hide math whose cost
						// the engine still paid (e.g. a `$…$` inside a code fence).
						s.math = sourceHasMath(markdown);
						s.overflow = 0;
					}
				} catch (e) {
					console.error('single-slide render failed', e);
					return { ok: false, slides: 0, error: String((e as Error)?.message || e) };
				}
				// dispose()/unmount may have landed during the (awaited) engine render.
				// Bail BEFORE any DOM mutation or observer/scaleTargets registration below,
				// so a settling render can't re-root a host dispose() just released.
				if (disposed || !host.isConnected) return { ok: false, slides: 0, error: 'renderer disposed' };
				// DECK-CONTEXT RENDER — narrow a whole-deck render to the one shown section, so the
				// slide carries the page number the engine computed against the REAL deck. Done here,
				// before the section count / sanitize / signature work below, so every downstream step
				// (and the reported `slides`) sees exactly the one-section document it saw before this
				// option existed. The engine `stats` above deliberately still describe the WHOLE render
				// — that is the work the engine actually did, and what its timing covers.
				// Narrowing only applies when we actually rendered the deck.
				if (wantsContext && typeof opts?.slideIndex === 'number') {
					const narrowed = narrowToSlide(out.html, opts.slideIndex, opts.slideCount);
					if (narrowed !== null) out.html = narrowed;
					else if (opts.slideMarkdown) {
						// The engine's sections do not correspond 1:1 to the caller's slides (a
						// `_focusSteps` / `split: headings` expansion, or a separator the two splitters
						// disagree about), so an index cannot identify the shown slide. Re-render that
						// slide ALONE: the right content, honestly numbered 1 of 1, which is exactly
						// what this surface did before deck context existed. One extra engine call on
						// an uncommon deck shape, and only for as long as the deck stays that shape.
						const alone = await renderMarkdown(PG, opts.slideMarkdown, theme, { baseUrl: samplesBase });
						if (disposed || !host.isConnected) return { ok: false, slides: 0, error: 'renderer disposed' };
						// Swap only the HTML: theme CSS and `@size` geometry are identical (same theme,
						// same front matter), and keeping the first render's `stats` keeps the perf
						// overlay describing the work that was actually done.
						out = { ...out, html: alone.html };
					}
					// No fallback markdown supplied → show the whole render rather than nothing. Only
					// reachable from a caller that passed slideIndex without slideMarkdown.
				}
				// Stash the resolved slide box so scaleFrame divides by the right width.
				const geom: Geom = { width: out.width || DEFAULT_W, height: out.height || DEFAULT_H };
				(host as LiveHost).__latticeGeom = geom;
				// Section count — computed here so the onload sample below captures it.
				const slides = (out.html.match(/<\/section>/g) || []).length;

				// PATCH FAST PATH. Everything baked into the srcdoc OUTSIDE the section —
				// the theme <style> (out.css + extra/author CSS) and the runtime <script> —
				// is fingerprinted here. When it's unchanged and a live document already
				// exists, swap ONLY the `.lattice` body: the browser skips re-parsing the
				// ~560KB theme sheet and re-executing the runtime (a ~485ms full-write on a
				// throttled phone → ~2ms), and the resident runtime's observer re-processes
				// the new section. Any change to theme/mode/size/mermaid/author-CSS misses
				// the sig and falls through to a full rewrite so the new <style>/<script>
				// take effect. The single-slide twin of deck-preview.js's renderDeck gate.
				// mermaid is keyed on the PROP (not a content scan like deck-preview's K/M
				// suffix) DELIBERATELY: this path's mermaid <script> injection is itself
				// prop-driven (see srcdoc()), so a constant prop means constant script
				// presence — a mermaid-content edit needs no full write, and the resident
				// runtime re-renders the swapped fence. KaTeX needs no flag either: single
				// -slide never injects a katex <link>; math rides the patch as static HTML.
				const sig = `${theme}|${mode}|${geom.width}x${geom.height}|${mermaid ? 'M' : ''}|${hashString(extraCss || '')}|${hashString(extra?.css || '')}`;
				// RESTYLE sig — everything a theme/mode change CANNOT re-render in place: the frame
				// box (geom, which sizes the resident <style>'s singleSlideFrame + the iframe element)
				// and the mermaid <script> presence (prop-driven, so it can't be injected post-hoc).
				// Theme, mode, the composed CSS, and author extraCss all bake into the swappable
				// <style>, so they are DELIBERATELY absent here — a change in any of them keeps the
				// same geom+mermaid, hits the restyle path, and swaps the <style> instead of rewriting.
				const restyleSig = `${geom.width}x${geom.height}|${mermaid ? 'M' : ''}`;
				const live = host.querySelector<HTMLIFrameElement>('iframe.live');
				// Skip the patch while a full-write srcdoc is still loading: its
				// contentDocument is briefly the OUTGOING one (which still has `.lattice`),
				// and patching THAT would be lost when the pending navigation commits. The
				// full write below sets __latticePendingLoad and clears it in onload.
				if (
					live &&
					!(host as LiveHost).__latticePendingLoad &&
					(host as LiveHost).__latticeFrameSig === sig &&
					live.contentDocument?.querySelector('.lattice')
				) {
					const tSan = performance.now();
					const safe = sanitizeSlideHtml(out.html);
					const patchSanitizeMs = performance.now() - tSan;
					const tFrame = performance.now();
					if (patchSlideBody(live, safe)) {
						const tFit = performance.now();
						scaleFrame(host);
						const patchFitMs = performance.now() - tFit;
						// Defer the debug overlay one frame so it measures AFTER the resident
						// runtime re-stamps the swapped section's geometry (the full-write path
						// gets this for free by drawing in onload, post-layout).
						requestAnimationFrame(() => applyDebug(live, { force: null }));
						const now = performance.now();
						// Feed the SAME overlay signals the full-write path does (coalesce
						// count + engine per-stage stats + settled overflow), so the RENDER
						// breakdown / COALESCE / overflow chip stay accurate on patched renders
						// too — not just on full writes.
						const rec = recordRenderSample({ engineMs, sanitizeMs: patchSanitizeMs, frameMs: now - tFrame, fitMs: patchFitMs, totalMs: now - tStart, slides, srcBytes: shownBytes, coalesced, stats: out.stats, writePath: 'patch' });
						if (out.stats) {
							const countOverflow = () => {
								try {
									return live.contentDocument?.querySelectorAll('section.overflow').length ?? 0;
								} catch {
									return 0;
								}
							};
							const shown = patchOverflow(rec, countOverflow());
							setTimeout(() => patchOverflow(shown, countOverflow()), 600);
						}
						scheduleVizScan(() => live.contentDocument);
						return { ok: true, slides, error: null, writePath: 'patch' as const };
					}
					// The live document vanished between the guard and the patch — fall
					// through to a full write below.
				}

				// RESTYLE FAST PATH. A theme / mode / palette change (the frame box + mermaid
				// unchanged) is the DOMINANT repeated action — and the full-write path below rewrites
				// the whole srcdoc for it, minting a fresh iframe realm every time; those detached
				// realms accumulate (~1.3 MB per toggle across the live previews — the theme-toggle
				// realm-churn leak, 2026-07-20-studio-audit-instrument-fix). Instead, when a live doc
				// already exists, swap the resident `<style id="lattice-theme">` in place and patch
				// the body — the same iframe + same realm, restyled. No reparse of the runtime, no new
				// realm. Falls through to a full write only when there is no live doc, a write is still
				// in flight, or the frame box / mermaid changed (which the resident <style>/<script>
				// can't express).
				const themeStyleEl = live?.contentDocument?.getElementById('lattice-theme') as HTMLStyleElement | null | undefined;
				if (
					live &&
					!(host as LiveHost).__latticePendingLoad &&
					(host as LiveHost).__latticeRestyleSig === restyleSig &&
					themeStyleEl &&
					live.contentDocument?.querySelector('.lattice')
				) {
					const tSan = performance.now();
					const safe = sanitizeSlideHtml(out.html);
					const restyleSanitizeMs = performance.now() - tSan;
					const tFrame = performance.now();
					// Swap the theme <style> in place FIRST, then the body — the new palette applies
					// atomically with the new section, so a viewer never sees the old theme on the new
					// body (or vice-versa) for a frame.
					themeStyleEl.textContent = themeStyleContent(out.css, mode, geom, extraCss);
					if (patchSlideBody(live, safe)) {
						(host as LiveHost).__latticeFrameSig = sig;
						(host as LiveHost).__latticeRestyleSig = restyleSig;
						const tFit = performance.now();
						scaleFrame(host);
						const restyleFitMs = performance.now() - tFit;
						requestAnimationFrame(() => applyDebug(live, { force: null }));
						const now = performance.now();
						const rec = recordRenderSample({ engineMs, sanitizeMs: restyleSanitizeMs, frameMs: now - tFrame, fitMs: restyleFitMs, totalMs: now - tStart, slides, srcBytes: shownBytes, coalesced, stats: out.stats, writePath: 'restyle' });
						if (out.stats) {
							const countOverflow = () => {
								try {
									return live.contentDocument?.querySelectorAll('section.overflow').length ?? 0;
								} catch {
									return 0;
								}
							};
							const shown = patchOverflow(rec, countOverflow());
							setTimeout(() => patchOverflow(shown, countOverflow()), 600);
						}
						scheduleVizScan(() => live.contentDocument);
						return { ok: true, slides, error: null, writePath: 'restyle' as const };
					}
					// patchSlideBody failed (the live doc vanished mid-swap) — fall through to a full write.
				}

				let fr = host.querySelector<HTMLIFrameElement>('iframe.live');
				// The once-guarded onload-side work, shared by the reveal poll (armed at the srcdoc-write
				// site below, the iOS paint path) and the browser `onload` (assigned near that write).
				// Declared out here so both the (later) poll and the onload assignment can see it.
				let onFrameLoad: (() => void) | null = null;
				if (!fr) {
					fr = document.createElement('iframe');
					fr.className = 'live';
					fr.setAttribute('title', 'Live-rendered Lattice slide');
					fr.setAttribute('scrolling', 'no');
					fr.setAttribute('tabindex', '-1');
					// Fixed intrinsic slide box, scaled to fit via a CSS transform set in
					// scaleFrame. transform-origin top-left so the scaled box aligns to the
					// host's corner (without it, scaling shrinks around center → offset).
					fr.style.position = 'absolute';
					fr.style.top = '0';
					fr.style.left = '0';
					fr.style.border = '0';
					fr.style.width = geom.width + 'px';
					fr.style.height = geom.height + 'px';
					fr.style.transformOrigin = 'top left';
					// Invisible until the FIRST srcdoc actually paints (revealed by scaleFrame's
					// content gate). A freshly-appended iframe with no srcdoc is `about:blank`,
					// which iOS Safari paints as an OPAQUE WHITE document ON TOP OF the element's
					// CSS `background` — so a cold load flashed a white slide card. `opacity:0`
					// makes the whole element (white content included) transparent, so the dark
					// pane behind covers that window — AND, unlike `visibility`, opacity animates,
					// so the reveal is a quick fade-in (transition below) instead of a hard pop.
					fr.style.opacity = '0';
					fr.style.transition = 'opacity 180ms ease-out';
					// An opacity:0 element is still HIT-TESTABLE (unlike visibility:hidden, which the
					// reveal used to be) — so while hidden the frame would intercept scroll/clicks meant
					// for what's behind it (e.g. the landing hero preview) during the load window. Hold
					// pointer-events off until scaleFrame reveals it (which clears this alongside opacity).
					fr.style.pointerEvents = 'none';
					host.appendChild(fr);
					// The CONTENT-DRIVEN reveal poll is armed below, at the srcdoc-write site, so it
					// covers EVERY full write (this first mount AND every subsequent edit) — not just
					// the create branch. See the block after `fr.srcdoc = …` (#1163).
					if (typeof ResizeObserver !== 'undefined') {
						// The callback honors the module-level drag gate above; the host is
						// registered so a resume can re-fit it once, authoritatively.
						// Sweep dead hosts on each registration so no-drag sessions
						// (where the resume-time prune never runs) stay bounded too.
						for (const h of scaleTargets.keys()) if (!h.isConnected) scaleTargets.delete(h);
						scaleTargets.set(host, () => scaleFrame(host));
						// Keep the observer instance (was anonymous) so dispose() can
						// disconnect it — and remember the host so dispose() can also drop
						// its scaleTargets entry (the module-level root that leaks it).
						const ro = new ResizeObserver(() => {
							if (!scaleSuspended) scaleFrame(host);
						});
						ro.observe(host);
						ownedObservers.add(ro);
						ownedHosts.add(host);
					}
				}
				// After the frame loads: fit it, then draw the layout debug overlay if the
				// deck opted in (`data-debug`, stamped from `debug:` front matter). This
				// single-slide path strictly FOLLOWS THE DECK (force:null) — it never reads
				// the toolbar override, so a specimen on the landing/showcase pages can't
				// inherit a debug flag a viewer flipped in the Studio/Playground.
				// Declared before onload so the (async) load handler closes over the
				// final values, stamped just below after the synchronous srcdoc setup.
				// srcBytes is captured as a number here so the closure doesn't retain
				// the whole `markdown` source string per live host.
				let tFrameStart = 0;
				let sanitizeMs = 0;
				const srcBytes = shownBytes;
				// Run exactly once — via the browser's `onload` (normal) OR the reveal poll's paint
				// detection (iOS, where onload is unreliable). The guard makes a double-trigger a no-op.
				let loadRan = false;
				onFrameLoad = () => {
					if (loadRan) return;
					loadRan = true;
					// Fit first (timed around the existing clientWidth read — no extra
					// reflow), then debug overlay + video bridge which are outside the
					// measured fit. frameMs is the browser's own parse/layout of the
					// srcdoc: from the end of our synchronous setup below to this load event.
					// This srcdoc has committed — future same-sig renders may now patch it.
					(host as LiveHost).__latticePendingLoad = false;
					const tFit = performance.now();
					// onload, when it DOES fire, is just one more reveal trigger — scaleFrame
					// fits and reveals via the content gate (frameHasPainted). The reveal poll
					// above is the reliable path on iOS where this event may never come.
					scaleFrame(host);
					const fitMs = performance.now() - tFit;
					applyDebug(fr, { force: null });
					// Parent-hosted video playback: tap a video poster in a Studio preview
					// to play the clip in a centered lightbox (the link guard bridges to it).
					installVideoBridge(fr.contentWindow);
					const now = performance.now();
					const rec = recordRenderSample({
						engineMs,
						sanitizeMs,
						frameMs: now - tFrameStart,
						fitMs,
						totalMs: now - tStart,
						slides,
						srcBytes,
						coalesced,
						stats: out.stats,
						writePath: 'write',
					});
					// Overflow settles AFTER load (font settle → the runtime's overflow
					// watcher toggles `section.overflow` inside the same-origin frame). Read
					// it once now and again after it settles, patching the sample in place
					// so the count is accurate without re-timing the render. Best-effort:
					// a cross-doc read can throw during teardown.
					if (out.stats) {
						const countOverflow = () => {
							try {
								return fr?.contentDocument?.querySelectorAll('section.overflow').length ?? 0;
							} catch {
								return 0;
							}
						};
						// Publish the immediate read AND a settled re-read through patchOverflow
						// — never an in-place mutation of the recorded sample. Mutating
						// `out.stats.overflow` here would poison patchOverflow's own
						// `overflow === n` change-guard, so a slide that already overflows at
						// load (immediate read == settled read) would never fire a re-render and
						// the chip would stay hidden. patchOverflow returns whichever sample is
						// now displayed, so the settled read patches the CURRENT one, not `rec`.
						const shownSample = patchOverflow(rec, countOverflow());
						setTimeout(() => patchOverflow(shownSample, countOverflow()), 600);
					}
					scheduleVizScan(() => fr?.contentDocument);
				};
				fr.onload = onFrameLoad;
				// The document the incoming srcdoc must REPLACE — the outgoing live document on a
				// subsequent write, or the freshly-created `about:blank` on the first write. The
				// reveal poll below fires the load-work only once the frame holds a NEW, PAINTED
				// document (identity !== this one): on a subsequent write the OLD `.lattice` lingers
				// until the new navigation commits, so a bare presence check would false-fire
				// onFrameLoad against the outgoing doc.
				const prevDoc = fr.contentDocument;
				// Did the OUTGOING doc already hold a slide? On the FIRST write it's `about:blank` (none),
				// so a painted `.lattice` is unambiguously the new one — presence alone fires, EXACTLY the
				// original create-path behavior (zero regression, and no dependence on whether the browser
				// mints a new document object for the first srcdoc navigation). On a SUBSEQUENT write it
				// does hold the old slide, so we additionally require a NEW document object (identity guard
				// below) — otherwise the lingering old `.lattice` would false-fire onFrameLoad before the
				// new navigation commits. Best-effort read (a same-origin doc won't throw, but guard for
				// teardown races).
				let prevHadLattice = false;
				try {
					prevHadLattice = !!prevDoc?.querySelector('.lattice');
				} catch {}
				// Mark the navigation in flight BEFORE assigning srcdoc: until onload (or the poll's
				// paint detection) clears it, the patch guard above must not touch the outgoing document.
				(host as LiveHost).__latticePendingLoad = true;
				fr.srcdoc = srcdoc(out.html, out.css, mode, mermaid, geom, extraCss);
				// srcdoc() runs the sanitize pass; copy its duration out of the shared
				// closure var before an interleaved render can overwrite it.
				sanitizeMs = lastSanitizeMs;
				scaleFrame(host);
				// CONTENT-DRIVEN reveal poll — armed for EVERY full write (first mount AND every
				// subsequent edit), NOT just the create branch (#1163). iOS Safari fires the srcdoc
				// `onload` UNRELIABLY: on the FIRST load that left the frame scaled-but-stuck-hidden
				// forever (rev:NO — "the blank"); on a SUBSEQUENT write it left `__latticePendingLoad`
				// stuck true, disabling the patch/restyle fast paths so every later edit fell back to a
				// full realm-churning rewrite — the very leak the restyle path exists to prevent. The
				// poll re-fits + reveals the moment the host has width AND the NEW doc has painted, and
				// fires the once-guarded onFrameLoad (which clears pendingLoad + re-enables the fast
				// paths) with NO dependence on the load event. There is deliberately NO force-reveal of
				// a still-not-good frame: the SKELETON model prefers the loader staying up over flashing
				// an unscaled/broken slide (DeckPreview keys its loader-fade on this reveal), and the
				// persistent host ResizeObserver keeps re-fitting after the poll ends. A fast re-edit can
				// start a new write before the previous paint — supersede that stale poll so only the
				// latest write's poll runs.
				const revealFr = fr;
				const stalePoll = (host as LiveHost).__latticeRevealPoll;
				if (stalePoll) {
					clearInterval(stalePoll);
					ownedIntervals.delete(stalePoll);
				}
				let revealTicks = 0;
				const revealPoll = setInterval(() => {
					revealTicks++;
					// Stop once the load-work cleared `__latticePendingLoad` (its once-guarded run both
					// reveals the frame AND re-enables the fast paths), the host is gone, or the ~30s
					// budget is spent. Keying the stop on pendingLoad (NOT "looks revealed",
					// `opacity !== '0'`) is load-bearing: the persistent ResizeObserver can reveal the
					// frame via its OWN scaleFrame before this poll fires onFrameLoad, and stopping on
					// opacity there would strand `pendingLoad = true` → the fast paths stay disabled and
					// every edit falls to a full realm-churning re-write. A frame that truly never paints
					// simply stays on the safe write path (we never patch an unpainted doc).
					if (disposed || !host.isConnected || (host as LiveHost).__latticePendingLoad === false || revealTicks > 300) {
						clearInterval(revealPoll);
						ownedIntervals.delete(revealPoll);
						if ((host as LiveHost).__latticeRevealPoll === revealPoll) (host as LiveHost).__latticeRevealPoll = undefined;
						return;
					}
					scaleFrame(host); // reveals IFF host width>0 AND the NEW srcdoc has painted .lattice — never a broken frame
					// Fire the once-guarded load-work on the FIRST paint of the NEW doc. When the outgoing
					// doc had no slide (first write) presence suffices; when it did (subsequent write) also
					// require a NEW document object, so the lingering old `.lattice` can't false-fire before
					// the new navigation commits.
					if (frameHasPainted(revealFr) && (!prevHadLattice || revealFr.contentDocument !== prevDoc)) onFrameLoad?.();
				}, 100);
				ownedIntervals.add(revealPoll);
				(host as LiveHost).__latticeRevealPoll = revealPoll;
				host.classList.add('is-live');
				// Record the sig this full document was built for, so the NEXT render can
				// take the patch fast path above when nothing outside the section changed.
				(host as LiveHost).__latticeFrameSig = sig;
				// Record the frame box + mermaid this srcdoc was built for, so the NEXT theme/mode/
				// palette change can take the RESTYLE fast path above (swap the <style> in place)
				// instead of rewriting the whole srcdoc and minting a new realm.
				(host as LiveHost).__latticeRestyleSig = restyleSig;
				// Stamp AFTER the synchronous setup (srcdoc build + sanitize + pre-load
				// fit) so frameMs isolates the browser's async parse/layout — the build
				// and sanitize costs are still captured by totalMs and sanitizeMs.
				tFrameStart = performance.now();
				return { ok: true, slides, error: null, writePath: 'write' as const };
			})
			.catch((e) => {
				// Surface failures in the console (the old landing bridge did; the
				// specimen also shows them via its status line) so a broken theme fetch
				// / engine error isn't swallowed silently on the landing islands.
				console.error('single-slide render failed', e);
				return { ok: false, slides: 0, error: String((e as Error)?.message || e) };
			});
	}

	/**
	 * Resolve when the engine bundle is present. On first call this also triggers
	 * the on-demand injection of the engine <script> (ensureEngine) if an
	 * engineUrl was supplied — so the bundle loads only when an island actually
	 * needs to render. Falls back to a bare poll if no URL was wired.
	 */
	function whenReady(): Promise<void> {
		if (ready()) return Promise.resolve();
		if (engineUrl) return ensureEngine(engineUrl);
		return new Promise((resolve) => {
			const t = setInterval(() => {
				if (ready()) {
					clearInterval(t);
					ownedIntervals.delete(t);
					resolve();
				}
			}, 50);
			// Tracked so dispose() cancels it — otherwise a host unmounted before the
			// engine loads (only the no-engineUrl fallback path: tests/legacy) would
			// leave this poll spinning forever.
			ownedIntervals.add(t);
		});
	}

	/**
	 * Call `cb` (debounced) whenever the palette or light/dark mode changes.
	 * Returns an unsubscribe that disconnects the observer. The observer sits on
	 * document.documentElement — a PERMANENT node — so it can NEVER be garbage-
	 * collected while the page lives, and its closure pins the whole renderer; a
	 * caller that can outlive the page (Astro soft-nav, or any re-init) MUST call
	 * the unsubscribe (specimen.js does, on teardown). dispose() also drops it.
	 */
	function onThemeChange(cb: () => void): () => void {
		let timer: ReturnType<typeof setTimeout>;
		const mo = new MutationObserver(() => {
			clearTimeout(timer);
			timer = setTimeout(cb, 80);
		});
		mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-palette', 'data-mode'] });
		themeObservers.add(mo);
		const unsub = () => {
			clearTimeout(timer); // clear the in-flight debounce so cb can't fire post-teardown
			mo.disconnect();
			themeObservers.delete(mo);
			themeUnsubscribes.delete(unsub);
		};
		themeUnsubscribes.add(unsub);
		return unsub;
	}

	/**
	 * Release everything this renderer owns — the per-host ResizeObservers, their
	 * module-level `scaleTargets` entries (the GC root that would otherwise keep a
	 * detached preview `<figure>`→`<iframe>` subtree alive), the theme-change
	 * observer(s) on the immortal documentElement, and the pending reveal timers.
	 * Idempotent. React hosts call this on unmount (DeckPreview); imperative
	 * callers (specimen) call it on page teardown. It does NOT remove the iframe
	 * from the DOM — the caller owns the host node's lifecycle (React unmounts it).
	 */
	function dispose(): void {
		disposed = true; // stop any in-flight renderInto from re-registering below
		// Release the whole-deck memo too. It is bounded at one entry, so it is not a leak — but this
		// function's whole doctrine is that it releases every module-level root this file owns, and
		// leaving the last-viewed deck's HTML (up to ~285KB on a 117-slide deck) resident after the
		// final preview unmounts is exactly the kind of quiet retention it exists to prevent. Costs
		// one re-render if a host mounts again.
		clearDeckMemo();
		for (const ro of ownedObservers) {
			try {
				ro.disconnect();
			} catch {}
		}
		ownedObservers.clear();
		for (const h of ownedHosts) scaleTargets.delete(h);
		ownedHosts.clear();
		// Unsubscribe theme watchers via their own closures so the pending debounce
		// timer is cleared too (a bare mo.disconnect() would leave it armed).
		for (const unsub of [...themeUnsubscribes]) unsub();
		themeUnsubscribes.clear();
		for (const mo of themeObservers) {
			try {
				mo.disconnect();
			} catch {}
		}
		themeObservers.clear();
		for (const t of ownedTimers) clearTimeout(t);
		ownedTimers.clear();
		// This clears the reveal poll too (it's in ownedIntervals). We deliberately do NOT null the
		// host's `__latticeRevealPoll` field here — the interval is already stopped, and the module's
		// re-register path is safe: the next write's supersession clears that stale id (a harmless
		// no-op on an already-cleared interval) before arming a fresh poll.
		for (const iv of ownedIntervals) clearInterval(iv);
		ownedIntervals.clear();
	}

	return { renderInto, whenReady, onThemeChange, scaleFrame, ready, prefetchTheme, dispose };
}

export type SingleSlideRenderer = ReturnType<typeof createSingleSlideRenderer>;
