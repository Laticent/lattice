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

import autoSplit from '../core/auto-split.js';
import { buildEnvelope, buildReadAlong } from '../core/lattice-doc.js';
// The deck-wide `color-mode:` register — imported rather than re-read, so the class the
// player's toggle manages is the SAME one the engine stamped (HARD RULE #1). Default
// import: the module is CJS, and a default import of it works on all three toolchains
// (node --test, esbuild for the emulator, rollup for the docs bundle).
import colorModeRegister from '../core/resolve-color-mode.js';
import { deckAnimatesCharts, deckMotionScalars, playerMotionSuppressed } from '../core/resolve-motion.mjs';
import { frontMatterPace, paceBeatMs } from '../core/resolve-pace.mjs';
// HARD RULE #22, STYLESHEET channel. What this assembler receives is a PARSED DOM, so a
// `</style>` that arrived in `docHtml` was already resolved by the parser and can never
// reach a style element's text — which is why the fix for the CLI belongs at the
// emulator's assembly, upstream of `caps.parseHtml`, and not here.
//
// What IS this file's to own is the CSS it takes back OUT of that DOM, transforms
// (`themeDualMode` + `minifyCss`), and re-serializes into a FRESH `<style>` element. A
// transform is entitled to normalize an escape away, and the document that guarded the
// text has no say over a string that left it. Style elements copied through verbatim as
// `outerHTML` need nothing: the parser's own guarantee is that their text contains no
// `</style`. See engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md.
import { sanitizeStyleText } from '../core/sanitize-style-text.mjs';
import { ANIMA_CHART_JS, ANIMA_PLAYER_JS } from './anima-player-bundle.generated.mjs';

/** The `<script>` type the baked narration rides in. Not executable — the same
 *  inert-data-block idiom the manifest envelope uses. */
export const AUDIO_BLOCK_MIME = 'application/lattice+audio';

/**
 * Serialize a deck's baked narration into one inert `<script>` per narrated slide.
 *
 * WHY NOT INSIDE THE MANIFEST ENVELOPE, which already has a `readAlong.slides[].audio` slot.
 * Two reasons, both about what a viewer actually pays:
 *
 *  1. DOUBLE ENCODING. `lattice-doc.js` base64s the WHOLE manifest — deliberately, so no
 *     deck content can terminate the script element. Audio nested inside it would therefore
 *     be base64'd twice: 1.33x on the clip, then 1.33x again on the manifest, for 1.78x
 *     over raw. On a 10 MB deck that is ~4.5 MB of pure encoding overhead, and the size of
 *     a shared deck is exactly the thing the author is being asked to consent to.
 *  2. EAGER PARSE. Audio in the envelope can only be reached by decoding and JSON-parsing
 *     the entire manifest — megabytes of main-thread work to play one sentence. Split per
 *     slide, the player parses only the slide it is about to speak, and a viewer who never
 *     presses Play parses nothing at all.
 *
 * The one-file contract is untouched: these blocks are inline `data:` URIs in the same
 * document, with no sidecar and no network origin.
 *
 * THE BREAKOUT GUARD. Whole-envelope base64 exists because a deck titled
 * `</script><script>…` would otherwise escape its own container (lattice-doc.js §Security).
 * This payload is not all base64 — the caption text is deck content — so it needs the same
 * property bought a different way: every `<` is emitted as the JSON escape `<`. The
 * HTML parser then never sees a `<` inside the block (so neither `</script` nor the `<!--`
 * that would flip it into script-data-escaped state can appear), while `JSON.parse` decodes
 * it back to the original character. HTML-entity escaping would be the WRONG tool here and
 * is deliberately not used: a `<script>` element's content is raw text, so `&amp;` would
 * survive into the parsed JSON verbatim and corrupt every caption containing an ampersand.
 *
 * @param {Array<Array<{text?: string, estimateMs?: number, gapMs?: number, words?: Array<{display?: string, startMs?: number, endMs?: number}>, audio?: string|null}>>} slides
 *        per-slide cues, index-aligned to the deck's slides
 * @returns {string} one block per NARRATED slide (a slide with cues), or '' when the deck has
 *   none. NOT "when nothing carries audio" — a captions-only export has no clips at all and
 *   still gets blocks, because the cues carry the caption text, the beats and the word
 *   timeline the player crawls on its own clock.
 */
export function narrationBlocks(slides) {
	if (!Array.isArray(slides)) return '';
	const out = [];
	for (let i = 0; i < slides.length; i++) {
		const cues = Array.isArray(slides[i]) ? slides[i] : [];
		if (!cues.length) continue;
		// A slide whose every cue is silent still ships: its captions are the text alternative
		// for a deck that speaks elsewhere, and its estimated beats keep the pacing honest.
		// Short keys, because this object repeats once per sentence across the whole deck and
		// every byte of it is paid by the recipient: `t`ext, `d`uration estimate, `g`ap, `a`udio,
		// `w`ords. `a` admits ONLY a `data:` URI — a remote URL reaching here would quietly make
		// a "self-contained, offline" file phone home, which is the player's whole contract.
		//
		// `w` is the word timeline the caption crawl highlights against, as compact triples
		// `[display, startMs, endMs]` with the times RELATIVE to the cue. Relative keeps them
		// small integers, and the player re-absolutizes when it expands the track. Objects with
		// named keys would roughly double this, and it repeats per word across the whole deck.
		// The ESTIMATE is what ships; the player re-anchors it to each clip's real decoded
		// duration through the shared cursor's `align`, so nothing here has to be measured.
		const payload = cues.map((c) => {
			const words = Array.isArray(c?.words) ? c.words : [];
			const base = Number.isFinite(words[0]?.startMs) ? words[0].startMs : 0;
			return {
				t: String(c?.text ?? ''),
				d: Number.isFinite(c?.estimateMs) ? Math.max(0, Math.round(c.estimateMs)) : 0,
				g: Number.isFinite(c?.gapMs) ? Math.max(0, Math.round(c.gapMs)) : 0,
				a: typeof c?.audio === 'string' && c.audio.startsWith('data:') ? c.audio : null,
				// Encoder-inserted leading silence, ms. Omitted when zero — most clips arrive
				// already compressed and carry none, and an absent key is smaller than a zero
				// repeated across every cue in the deck.
				...(Number.isFinite(c?.leadMs) && c.leadMs > 0 ? { l: Math.round(c.leadMs * 10) / 10 } : {}),
				w: words.map((w) => [String(w?.display ?? ''), Math.max(0, Math.round((w?.startMs ?? 0) - base)), Math.max(0, Math.round((w?.endMs ?? 0) - base))]),
			};
		});
		const json = scriptJson(payload);
		out.push(`<script type="${AUDIO_BLOCK_MIME}" data-lp-audio="${i}">${json}</script>`);
	}
	return out.join('\n');
}

/**
 * JSON for embedding inside a `<script>` element.
 *
 * A `<script>`'s content is HTML **RAWTEXT**: it ends at the first `</script`, and the
 * parser knows nothing about JavaScript strings or JSON escaping. `JSON.stringify` does
 * not escape `/`, so a single author-controlled string containing `</script>` closes the
 * element early and everything after it is parsed as MARKUP — the same shape HARD RULE #22
 * documents for `</style` in a stylesheet, one element over.
 *
 * Measured on a real export before this existed: a deck whose reader-view LABEL carried
 * `</script><img src=x onerror=…>` terminated the player's one hashed script, so `.lp-js`
 * was never set and the whole player fell back to its no-JS floor, with the attacker's
 * `<img>` live in the document. The CSP held — the script's sha256 no longer matched and
 * the inline handler was refused — so it was a denial of function plus markup injection
 * rather than script execution. That is one net, and it is not the net to rely on: the
 * Studio renders UNTRUSTED shared and AI-generated decks into a same-origin frame (#22),
 * and the moment it passes reader views (#1853 slice 4) this is that frame's problem.
 *
 * Escaping `<` is sufficient and is what the rest of the tree already does (the narration
 * blocks above, `lib/core/data-block.js`): it neutralizes `</script` and `<!--` alike, and
 * `\u003c` is valid inside a JSON string, so the value a consumer parses is unchanged.
 */
export function scriptJson(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c');
}

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
 * are untouched). Only `{};,` are tightened on both sides — NOT the combinators/operators
 * `+ ~ >`, which must keep their spaces inside `calc()` and selectors, and NOT the left of
 * a `:`, which is a DESCENDANT combinator wherever the colon opens a pseudo (see the rule
 * below; that one collapse silently disabled 59 rules in every exported player).
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
		.replace(/\s*([{};,])\s*/g, '$1')
		// `:` tightens on the RIGHT only. Whitespace to its LEFT is a DESCENDANT COMBINATOR
		// whenever the `:` opens a pseudo — `section :is(pre, marp-pre) code`,
		// `section.split-panel.watermark :is(header, footer)` — and collapsing it silently
		// re-means the selector into a compound that can never match (a section is not a
		// header). 59 rules in `dist/lattice.css` were re-meant this way, so they simply did
		// not apply in any exported player: the code/pre chip inside a section, the list
		// styling on cards-grid / cards-stack / closing, and the split-panel chrome ink —
		// which is how a `watermark` slide's running header ended up on the generic token
		// path and painted the canvas's muted ink on the accent rail, 1.45:1 (#1642). The
		// prune then removed the rules as unused, correctly, because by then they matched
		// nothing.
		//
		// A DECLARATION's colon still tightens on both sides, and it is told apart by POSITION
		// rather than by guessing: a property name is the first token of a declaration, so it
		// sits immediately after the `{` or `;` that the pass above just tightened. A selector's
		// pseudo never does.
		.replace(/([{;])([-\w]+)\s+:/g, '$1$2:')
		.replace(/:\s+/g, ':')
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
	const { masked, unmask } = maskCss(css);
	return unmask(resolveMasked(masked, pick));
}

/**
 * Mask CSS comments / quoted strings / `url(…)` to U+E000-fenced index placeholders, so a
 * scan over the result never sees `light-dark(`, a stray paren, or a `{;}` inside one of
 * them. U+E000/E001 are Private-Use chars real CSS never contains; any literal ones in the
 * input are stripped first so authored CSS can't collide with a placeholder (mirrors
 * minifyCss). Shared by `resolveLightDark` (which needs the paren scan safe) and
 * `hoistRuleLightDark` (which needs the BRACE scan safe) — one masker, because the two
 * questions have the same answer and a second copy is how the two drift apart.
 *
 * `dropComments` deletes the comments outright instead of stashing them — what a scan that
 * reads SELECTORS needs, since a comment sitting between two rules is otherwise glued to the
 * front of the next prelude (`/* … *\/ section.title` is not a selector, and prefixing it
 * yields one that matches nothing). `resolveLightDark` keeps them, because it rewrites a
 * stylesheet the export still ships.
 *
 * @param {string} css
 * @param {{dropComments?: boolean}} [opts]
 * @returns {{masked: string, unmask: (s: string) => string}}
 */
function maskCss(css, opts) {
	const stash = [];
	const masked = String(css)
		.replace(/[\uE000\uE001]/g, '')
		.replace(/\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)/g, (m) => {
			if (opts?.dropComments && m.startsWith('/*')) return ' ';
			stash.push(m);
			return `\uE000${stash.length - 1}\uE001`;
		});
	return { masked, unmask: (s) => s.replace(/\uE000(\d+)\uE001/g, (_m, i) => stash[Number(i)]) };
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

// The slide classes that PIN a scheme against the player's own — a slide the author marked
// light, and the print band, both of which must keep their light values when the viewer is
// in dark. Shared by the two emitters below so the pin set cannot drift between them.
const PINNED_TO_LIGHT = ['.light', '.color-light', '.print'];

/**
 * Collapse every `light-dark()` in an INLINE `style` attribute to its LIGHT arm, and return
 * the dark arms as a stylesheet that re-applies them under the player's scheme scopes.
 *
 * WHY THIS EXISTS. The player's contract is that NOTHING it ships depends on the
 * `light-dark()` CSS function: `themeDualMode` collapses every pair to a light base plus an
 * attribute-keyed dark block, because the function does not exist before WebKit 17.5 and —
 * where it does — it resolves against the ELEMENT's `color-scheme`, which is not the signal
 * the player's toggle drives. That contract had a hole exactly the width of an attribute.
 * `themeDualMode` only ever saw `<style>` blocks, and two chart components write their
 * gradient stops inline: `chart-family.js` (the gantt/bar fill) and
 * `state-chart.transform.js` (node fills). So a `<stop style="stop-color:light-dark(…)">`
 * shipped verbatim — 22 of them in `examples/data-viz-gallery.md`.
 *
 * The player only kept those in step by a side effect: its toggle also writes an inline
 * `color-scheme` onto `<html>`, so the function happened to resolve the same way the
 * attribute did. Everywhere that coupling does not hold — a script that never ran, a host
 * that re-parents the SVG, an engine that resolves `light-dark()` inside a never-rendered
 * `<defs>` subtree against the OS instead of the inherited scheme — the gradient picks one
 * scheme and the page picks the other. Reported from a real iPad: gantt bars and state-chart
 * nodes painted with the DARK fills on a light page, while every label, axis, badge and
 * legend dot beside them was correctly light. And on the pre-17.5 engine the whole machine
 * exists for, `stop-color` is simply invalid, so those charts lose their fills to black.
 *
 * A CLASS plus `!important` is the only mechanism that can win here, and the arms have to
 * stay where they were written: their inner `var()`s — `--chart-fill-top-l`, `--fill-hue` —
 * are declared on `.chart-frame`, not on `:root`. Lifting the whole expression to a `:root`
 * token was tried first and is silently fatal: the arms go invalid at computed-value time up
 * there, the token computes to nothing, and every gradient renders BLACK. So the light arm
 * stays inline (the base is then scheme-free on every engine, including the pre-17.5 one)
 * and the dark arm rides a scoped rule that re-declares it ON the same element, where its
 * tokens resolve exactly as they did before.
 *
 * @param {Document} doc the parsed export document (mutated in place)
 * @returns {string} a stylesheet re-applying the dark arms, or '' when nothing was inline
 */
export function hoistInlineLightDark(doc) {
	const seen = new Map(); // `light|dark` → class
	const rules = [];
	const TOKEN = 'light-dark(';
	// `[style]` + a JS filter, NOT `[style*="light-dark("]`: jsdom's selector engine takes the
	// `(` inside the quoted value as syntax and matches NOTHING — silently, so the hoist would
	// run, find nothing, and the export ship exactly as before. A substring test cannot lie.
	for (const el of doc.querySelectorAll('[style]')) {
		const value = el.getAttribute('style') || '';
		if (!value.includes(TOKEN)) continue;
		const light = resolveLightDark(value, 0);
		const dark = resolveLightDark(value, 1);
		el.setAttribute('style', light);
		if (dark === light) continue; // a one-armed light-dark(x) — nothing switches
		const key = `${light}|${dark}`;
		let cls = seen.get(key);
		if (!cls) {
			cls = `lp-sd-${seen.size}`;
			seen.set(key, cls);
			rules.push({ cls, light, dark });
		}
		el.setAttribute('class', `${el.getAttribute('class') || ''} ${cls}`.trim());
	}
	if (!rules.length) return '';
	// Every declaration carries `!important` — it is competing with the element's own inline
	// style, which nothing else can outrank.
	const bang = (decl) =>
		decl
			.split(';')
			.map((d) => d.trim())
			.filter(Boolean)
			.map((d) => `${d}!important`)
			.join(';');
	// The same scopes the token block uses, for the same reasons (see themeDualMode): the
	// viewer's dark choice, the no-JS system fallback, an author-pinned dark slide in EVERY
	// player scheme, and the restore for a slide pinned light — or to the print band — while
	// the player is dark. The class is matched as a DESCENDANT rather than on the section, so
	// the figure Read·Article re-hosts outside any section is themed too.
	const at = (prefix, arm) => rules.map((r) => `${prefix} .${r.cls}{${bang(r[arm])}}`).join('');
	const restore = (scope) => PINNED_TO_LIGHT.map((c) => at(`${scope} section[data-lattice-slide]${c}`, 'light')).join('');
	return (
		at(':root[data-lp-scheme=dark]', 'dark') +
		restore(':root[data-lp-scheme=dark]') +
		at('section[data-lattice-slide].dark:not(.print)', 'dark') +
		`@media (prefers-color-scheme:dark){${at(':root[data-lp-scheme=system]', 'dark')}${restore(':root[data-lp-scheme=system]')}}`
	);
}

/**
 * The scheme scopes every dual-mode emitter in this file re-applies a dark arm under, as
 * data rather than four hand-written template strings.
 *
 * Each entry is an ANCESTOR scope (matched on `:root`, or nothing) plus an optional SECTION
 * compound — the split matters because a slide-level pin has to be able to land ON the
 * section a rule already selects, not only on one above it (see `scopeSelector`).
 *
 *   · the viewer's dark choice                        → the dark arms
 *   · a slide the author pinned light, or the print band, while the player is dark
 *                                                     → back to the light arms
 *   · an author-pinned dark slide, in EVERY player scheme (unconditional — outside both
 *     the attribute rule and the media query), `:not(.print)` so a `dark print` slide keeps
 *     its B&W band
 *   · the no-JS system fallback, inside `@media (prefers-color-scheme:dark)`
 */
const SCHEME_SCOPES = [
	{ root: ':root[data-lp-scheme=dark]', section: '', arm: 'dark', media: '' },
	...PINNED_TO_LIGHT.map((c) => ({ root: ':root[data-lp-scheme=dark]', section: `section[data-lattice-slide]${c}`, arm: 'light', media: '' })),
	{ root: '', section: 'section[data-lattice-slide].dark:not(.print)', arm: 'dark', media: '' },
	{ root: ':root[data-lp-scheme=system]', section: '', arm: 'dark', media: '@media (prefers-color-scheme:dark)' },
	...PINNED_TO_LIGHT.map((c) => ({
		root: ':root[data-lp-scheme=system]',
		section: `section[data-lattice-slide]${c}`,
		arm: 'light',
		media: '@media (prefers-color-scheme:dark)',
	})),
];

/**
 * Split a selector list on its TOP-LEVEL commas.
 *
 * Not `String.split(',')`: a functional pseudo-class takes a selector list of its own, so
 * `:is(section.kanban, figure.kanban) .card` would split into two arms that are each invalid
 * — and the second would silently drop out of a re-scoped rule while the first re-scoped a
 * fragment. The build expands `:is()` in the engine bundle today, but `themeDualMode` also
 * runs over theme sheets and a deck's own authored CSS, where nothing expands anything.
 *
 * @param {string} selectorList
 * @returns {string[]} the non-empty arms, trimmed
 */
function selectorArms(selectorList) {
	const arms = [];
	let depth = 0;
	let current = '';
	for (const ch of selectorList) {
		if (ch === '(' || ch === '[') depth += 1;
		else if (ch === ')' || ch === ']') depth -= 1;
		if (ch === ',' && depth === 0) {
			arms.push(current);
			current = '';
		} else current += ch;
	}
	arms.push(current);
	return arms.map((arm) => arm.trim()).filter(Boolean);
}

/**
 * Re-scope one selector under a `SCHEME_SCOPES` entry.
 *
 * The ancestor part is always a plain descendant prefix — `:root` is above everything, so
 * `:root[…] .kanban-card` can only ever narrow the original match.
 *
 * The SECTION part cannot be, and that is the whole reason this is a function rather than a
 * string concat. A rule whose subject already IS the slide — `section.title.spectrum::before`,
 * the spectrum bookend's ribbon — has no section ancestor to hang a pin on, so a descendant
 * prefix (`section[…].dark section.title.spectrum::before`) asks for a section inside a
 * section and matches NOTHING. The same trap catches a rule that merely STARTS at the section
 * (`section.kanban:not(.tinted) .kanban-card`), where the prefix would look for a kanban
 * section nested inside a dark one. So when an arm opens with the `section` type selector the
 * pin is spliced INTO that first compound instead of stacked above it; an arm that opens with
 * anything else (`.kanban-card`, `figure.kanban …`) takes the descendant form — which is also
 * what themes the figure Read·Article re-hosts outside any section.
 *
 * The splice keys on a LITERAL leading `section`, so an arm that reaches the slide through a
 * functional pseudo-class instead — `:is(section.kanban, figure.kanban) .card` — takes the
 * descendant form and its slide-pin rules match nothing. Harmless where it matters: the engine
 * bundle expands `:is()` selector lists at build time (`tools/build-css.js`), so every rule
 * this runs over in practice opens on a real type selector, and the `:root`-scoped rules — the
 * viewer's own toggle, which is the path a reader actually drives — are unaffected either way.
 * What is lost in the unexpanded case is only the author-pinned-slide arm.
 *
 * @param {string} selectorList the rule's own selector, a comma list
 * @param {{root: string, section: string}} scope
 * @returns {string} the re-scoped comma list
 */
function scopeSelector(selectorList, scope) {
	return selectorArms(selectorList)
		.map((arm) => {
			const above = scope.root ? `${scope.root} ` : '';
			if (!scope.section) return `${above}${arm}`;
			// `section` as a TYPE selector, not the prefix of `sectionish` or a `--section-*`
			// custom ident: the negative lookahead keeps the splice off anything but the tag.
			if (/^section(?![\w-])/.test(arm)) return `${above}${scope.section}${arm.slice('section'.length)}`;
			return `${above}${scope.section} ${arm}`;
		})
		.join(',');
}

/**
 * Route every `light-dark()` written in a REAL property (not a custom property) through a
 * private custom property, so the player's scheme scopes can swap the arm WITHOUT touching
 * the cascade the declaration sits in. Returns the rewritten stylesheet plus the block that
 * defines the dark side.
 *
 * WHY THIS EXISTS — the third and last hole in the same contract. `themeDualMode` rebuilds
 * the dark side of the player from CUSTOM-PROPERTY declarations only: it scans for
 * `--x: …light-dark(…)` and re-emits those under the scheme scopes, on the (true, verified)
 * grounds that every dual-mode TOKEN is a `:root` custom property. The base beside it is the
 * whole sheet with every pair collapsed to its light arm. A pair written straight into a real
 * property is in neither set — the base keeps its light arm and nothing anywhere restores the
 * dark one, so the declaration is frozen light in every scheme. #1643 closed this for inline
 * style ATTRIBUTES (`hoistInlineLightDark`); rules are the other half, 18 declarations across
 * 14 rules in `dist/lattice.css`: the kanban card's whole elevation recipe (a four-layer
 * `box-shadow` whose light and dark layers are DIFFERENT layers, so the light-only version
 * ships a card with a contact shadow and no rim), the progress fill and percentage chip, four
 * state-chart surfaces plus the index disc's `fill`, the chart-frame canvas and status chip,
 * and the spectrum ribbon on both bookends. Measured on `examples/kanban-chart-redesign.md`:
 * `box-shadow` byte-identical before and after a toggle, against a reference `color-mode: dark`
 * render that shares none of its four layers.
 *
 * WHY AN INDIRECTION, and not a scoped COPY of the rule. Re-emitting `.kanban-card{box-shadow:
 * <dark>}` as `:root[data-lp-scheme=dark] .kanban-card{…}` is the obvious shape and it is
 * WRONG, because the copy does not just gain a scheme condition — it gains SPECIFICITY, and
 * that reorders the cascade for that property. Every rule that legitimately beat the original
 * by less than the prefix is worth now loses to it, in dark mode only. Measured, on the first
 * deck tried: `section.kanban.keyline .kanban-card{box-shadow:none}` (0,3,1) is what makes a
 * keyline card FLAT, and the copy of the base card's shadow under the pinned-dark scope
 * (0,4,1) outranked it — every keyline card came back elevated on a dark slide, a defect the
 * fix introduced rather than removed. There is no prefix small enough to be safe in general:
 * any positive specificity delta can jump SOME competing rule. Wrapping the scope in `:where()`
 * would cost zero specificity and would solve it on a current engine — the engine sheet uses
 * `:where()` freely — but this block holds to the same pre-selector-list vocabulary as its
 * sibling rules on purpose: an engine that cannot PARSE `:where()` drops the whole rule, and a
 * dropped rule here is silently un-themed dark mode, which is the exact failure this machine
 * exists to prevent (see the `:is()`/`:not(a,b)` note in themeDualMode). An indirection needs
 * no selector trick at all, so it is the shape that does not have to choose.
 *
 * So the declaration STAYS in its own rule, at its own specificity, and only its VALUE moves:
 *
 *     .kanban-card{box-shadow:var(--lp-ld-7,<light arms>)}          ← base, cascade untouched
 *     :root[data-lp-scheme=dark] .kanban-card{--lp-ld-7:<dark arms>} ← the scheme scope
 *
 * Nothing else declares `--lp-ld-7`, so the scoped rule's specificity is uncontested and can
 * be as heavy as the scope needs. The keyline rule still wins `box-shadow` in both schemes,
 * because nothing in either scheme changed what competes for `box-shadow`. The light arm rides
 * the var() FALLBACK rather than a separate declaration, so light mode never reads a custom
 * property at all — on any engine, including one that never applies the dark block.
 *
 * INDIRECTION DEPTH — the dark arms take the same `flatten` the token block's own dark values
 * take, so every `:root` token in them collapses to a literal and the common case is a custom
 * property holding plain text. What survives a `var()` after that is exactly two things, and a
 * unit test pins that it is only ever those two:
 *   · a token THIS SAME dark block redefines (`--bg-alt`, `--chart-cat1`) — it has to stay a
 *     reference, or the arm would freeze at the light value the flatten map holds. This is the
 *     identical shape the derived-token declarations beside it already ship, deliberately, and
 *     for the same reason (see `derivedDecls`);
 *   · a token that is not declared at `:root` at all (`--fill-hue`, `--chart-fill-top-l`,
 *     `--status-fill`, `--col-hue`, `--pill-hue`) — declared on `.chart-frame`, so it MUST stay
 *     on the element. Lifting one to `:root` is the tidy-looking shortcut that makes it compute
 *     to nothing and renders every gradient BLACK.
 * Neither is a new exposure: the first is already in the block, and the second is what the
 * inline hoist (#1643) had to preserve for the very same tokens.
 *
 * CONDITION-AWARE, where `rootScopedDecls` is condition-blind: a rule inside
 * `@media`/`@supports`/`@container` has its scheme scopes emitted INSIDE that same at-rule
 * chain, so the override applies exactly where the original did. Nothing in the bundle needs
 * this today (zero such rules, pinned by a test), but hoisting a conditional rule to top level
 * is the failure mode that would be invisible — it would apply everywhere, always.
 *
 * @param {string} css a stylesheet; comments need not be stripped.
 * @param {(value: string) => string} [flatten] resolve a value's `:root` var() chain to
 *   literals. Defaults to identity, for the unit tests that drive this function alone.
 * @returns {{css: string, darkBlock: string}} the rewritten sheet, and the dark/restore rules.
 */
export function hoistRuleLightDark(css, flatten) {
	const resolveChain = flatten || ((v) => v);
	const { masked, unmask } = maskCss(css, { dropComments: true });
	/** @type {{selector: string, at: string[], pairs: {name: string, light: string, dark: string}[]}[]} */
	const found = [];
	/** @type {{start: number, end: number, text: string}[]} */
	const edits = [];
	// Walk brace-balanced blocks rather than regex-matching `sel{…}`: the regex form cannot see
	// an at-rule wrapper at all (it matches the INNER rule and silently forgets the condition),
	// and it would read a `@keyframes` step (`0%{…}`) as a style rule.
	const walk = (from, to, at) => {
		let i = from;
		let start = from;
		while (i < to) {
			if (masked[i] === '}') {
				i += 1;
				start = i;
				continue;
			}
			if (masked[i] !== '{') {
				i += 1;
				continue;
			}
			const prelude = masked.slice(start, i).trim();
			let depth = 1;
			let j = i + 1;
			for (; j < to && depth > 0; j++) {
				if (masked[j] === '{') depth += 1;
				else if (masked[j] === '}') depth -= 1;
			}
			const bodyFrom = i + 1;
			const bodyTo = j - 1;
			if (prelude.startsWith('@')) {
				// A CONDITIONAL group rule wraps style rules whose condition has to come along.
				// Every other at-rule (`@font-face`, `@property`, `@keyframes`, `@counter-style`)
				// holds declarations or step blocks, never a selector this can re-scope.
				if (/^@(?:media|supports|container|scope|layer)\b/i.test(prelude)) walk(bodyFrom, bodyTo, [...at, prelude]);
			} else if (prelude && !prelude.startsWith('%')) {
				const pairs = [];
				for (const decl of declarations(masked, bodyFrom, bodyTo)) {
					if (decl.prop.startsWith('--') || !decl.value.includes('light-dark(')) continue;
					// The BASE keeps the light arm exactly as the plain collapse would have left it —
					// var() chains intact, because in light mode they resolve on this very element and
					// there is nothing to flatten around. Only the values that ride a custom property
					// take the flatten, the two SCOPED arms, and they take it symmetrically: an
					// asymmetric one would report `light-dark(var(--edge), var(--edge))` as a switch,
					// emitting a token for a pair that does not move.
					// UNMASKED before resolving: `resolveLightDark` masks its own input, and it strips
					// stray U+E000/U+E001 first so authored CSS can't collide with a placeholder — so
					// handing it text that is ALREADY masked erases the fences and leaves the bare
					// index digits behind. A value carrying both a `url(…)` and a pair (nothing ships
					// one today) would have lost the url to a stray number.
					const raw = unmask(decl.value);
					const baseArm = resolveLightDark(raw, 0).trim();
					const light = resolveChain(baseArm);
					const dark = resolveChain(resolveLightDark(raw, 1).trim());
					// A pair whose arms resolve the same switches nothing — a one-armed
					// `light-dark(x)`, or a pair written with both arms alike. Left exactly as the
					// light collapse would have left it, so it costs no token and no rule.
					if (light === dark) continue;
					const name = `--lp-ld-${found.length}-${pairs.length}`;
					pairs.push({ name, light, dark });
					edits.push({ start: decl.start, end: decl.end, text: `var(${name},${baseArm})` });
				}
				if (pairs.length) found.push({ selector: prelude, at, pairs });
			}
			i = j;
			start = j;
		}
	};
	walk(0, masked.length, []);
	if (!edits.length) return { css, darkBlock: '' };

	// Splice back to front so an earlier edit never shifts a later offset.
	let out = masked;
	for (const edit of [...edits].reverse()) out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);

	const blocks = [];
	for (const scope of SCHEME_SCOPES) {
		for (const rule of found) {
			const body = rule.pairs.map((pair) => `${pair.name}:${pair[scope.arm]}`).join(';');
			let text = `${scopeSelector(rule.selector, scope)}{${body}}`;
			// Innermost first, so the original's own condition ends up OUTSIDE the scheme media
			// query the scope may add — `@media print{@media (prefers-color-scheme:dark){…}}`.
			if (scope.media) text = `${scope.media}{${text}}`;
			for (const condition of [...rule.at].reverse()) text = `${condition}{${text}}`;
			blocks.push(text);
		}
	}
	return { css: unmask(out), darkBlock: unmask(blocks.join('')) };
}

/**
 * The declarations inside one rule body, split on TOP-LEVEL semicolons, each carrying the
 * absolute offsets of its VALUE in the source string — the caller rewrites values in place,
 * so a re-find by text would be ambiguous the moment two rules share a value (and they do:
 * the same four-layer shadow recipe appears twice in the kanban block alone).
 *
 * Paren-aware, so a `;` inside a `var()`/`color-mix()` argument list could never split a
 * declaration. Values keep their internal whitespace — a `box-shadow` layer list is not
 * reformattable — and are returned unresolved, so the caller picks the arm it wants.
 *
 * @param {string} text the whole stylesheet
 * @param {number} from first offset of the rule body
 * @param {number} to one past the last offset of the rule body
 * @returns {{prop: string, value: string, start: number, end: number}[]}
 */
function declarations(text, from, to) {
	const out = [];
	let depth = 0;
	let start = from;
	for (let i = from; i <= to; i++) {
		const ch = text[i];
		if (ch === '(') depth += 1;
		else if (ch === ')') depth -= 1;
		if (i !== to && !(ch === ';' && depth === 0)) continue;
		const part = text.slice(start, i);
		const colon = part.indexOf(':');
		if (colon !== -1) {
			const prop = part.slice(0, colon).trim();
			const raw = part.slice(colon + 1);
			const lead = raw.length - raw.trimStart().length;
			const value = raw.trim();
			if (prop && value) {
				out.push({ prop, value, start: start + colon + 1 + lead, end: start + colon + 1 + lead + value.length });
			}
		}
		start = i + 1;
	}
	return out;
}

/**
 * Every custom property a stylesheet declares AT `:root`, mapped to its light-resolved
 * value, last declaration winning as the cascade says.
 *
 * SCOPED TO `:root`, and that scoping is load-bearing for both of `themeDualMode`'s
 * consumers — the `deepFlatten` chain and the derived-token closure. Both answer the same
 * question ("what does `var(--x)` resolve to on the element these declarations land on")
 * and both land their output on `:root` plus every slide section, so only a `:root`
 * declaration is an admissible answer. The engine and themes also declare custom
 * properties inside COMPONENT rules: `--elevation-card` on `section.lifted`,
 * `--pill-border` on an nth-child arm, `--surface-inverse` on `section.print`, the whole
 * `--fs-*` type scale on size classes. Measured on `dist/lattice.css` +
 * `themes/indaco.css`: 405 of 567 candidate tokens have at least one declaration outside
 * `:root`. Reading those is wrong twice over — the closure hoisted them onto EVERY slide at
 * (0,7,1), outranking the very rules they were read from (a `_class: flat` slide got the
 * lifted card's shadow back), and the flattener took the print band's ink for a theme
 * token (#1637).
 *
 * A selector qualifies only when `:root` is its own SUBJECT — `:root`,
 * `:root[data-lp-scheme=dark]`, or a list with such an arm. `:root[…] .lattice-bg` does
 * NOT: its subject is a descendant, so its declarations land on that descendant.
 *
 * CONDITION-BLIND, and that is a live limitation rather than a settled one: the rule scan
 * walks into `@media` / `@supports` bodies and reads a `:root` block there as if it always
 * applied. Nothing ships one today (zero nested `:root` blocks in `dist/lattice.css`; the
 * themes carry no `@media` at all), so the flatten map is exact — but a future
 * `@media print{:root{--bg:white}}` would poison it the way `section.print` did, and the
 * fix then is to skip at-rule-nested blocks, not to widen the subject test.
 *
 * @param {string} noComments stylesheet text with CSS comments already stripped.
 * @returns {Map<string,string>} token name → light-resolved value (may still hold `var()`).
 */
/**
 * The B-column of a root-family compound, or -1 when `:root` is not the subject.
 *
 * WHY A NUMBER AND NOT A BOOLEAN. Both collectors below took the LAST declaration of a
 * token and called it the cascade winner. That is only true at equal specificity, and it
 * stopped being true when the palettes began declaring the status trio at BOTH `:root`
 * and `:root:root` (#1698): the engine bundle is concatenated after the palette and
 * declares the same tokens at `:root`, so last-wins handed the dark block base's trio
 * while the light base — which honors real specificity — kept the palette's. One
 * exported `--player` file, two different greens depending on the viewer's scheme
 * toggle, and no ratio gate can see it because both values clear their bar.
 *
 * Scored the way CSS scores it: `:root` is 1, `:root:root` is 2, a qualifier adds 1. A
 * selector whose subject is not `:root` returns -1 and is not root-scoped at all.
 */
function rootSpec(selectorList) {
	let best = -1;
	for (const raw of String(selectorList).split(',')) {
		const t = raw.trim();
		if (!/^:root(?:\[[^\]]*\]|:(?!:)[a-z-]+(?:\([^()]*\))?)*$/.test(t)) continue;
		// `:where()` contributes ZERO, so its contents are removed before anything is
		// counted — `:root:where(.x)` is (0,1,0), not (0,2,0), and `:where(:root)` is 0.
		// Counting the group as a qualifier scored both one too high, which is the wrong
		// direction here: it would let a zero-specificity block outrank a real `:root`.
		const bare = t.replace(/:where\([^()]*\)/g, '');
		const roots = (bare.match(/:root/g) || []).length;
		const quals = (bare.match(/\[[^\]]*\]|:(?!:)[a-z-]+(?:\([^()]*\))?/g) || [])
			.filter((q) => !/^:root$/.test(q)).length;
		best = Math.max(best, roots + quals);
	}
	return best;
}

function rootScopedDecls(noComments) {
	const vals = new Map();
	const spec = new Map();          // token -> the root specificity that set its value
	const declAny = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g;
	const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
	let rule;
	let d;
	while ((rule = ruleRe.exec(noComments))) {
		const sp = rootSpec(rule[1]);
		if (sp < 0) continue;
		declAny.lastIndex = 0;
		// The `}` is re-appended because the declaration matcher closes on a `;` or `}`
		// lookahead: scanning the block body alone silently drops the LAST declaration of
		// every block, which is where a theme's override most often sits.
		const block = `${rule[2]}}`;
		// `>=` so an equal-specificity later declaration still wins — plain source order,
		// which is the old behavior — while a LOWER-specificity later one no longer does.
		while ((d = declAny.exec(block))) {
			if (sp < (spec.get(d[1]) ?? -1)) continue;
			vals.set(d[1], resolveLightDark(d[2], 0).trim());
			spec.set(d[1], sp);
		}
	}
	return vals;
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

	// Map every `:root` custom property to its light-resolved value (literal OR a var()
	// chain) so the dark values can be flattened to literals with ZERO indirection. The
	// dark arm of a surface token is authored as e.g. `var(--scheme-dark-bg)` (→ a
	// literal) or a MULTI-HOP chain like `var(--surface-inverse)` → `var(--brand-canvas)`
	// → a literal. FLATTENING the whole chain is the fix for the on-device dark-mode
	// failure: an older in-app WebKit that can't resolve a custom property whose value is
	// ANOTHER custom property (across <style> blocks) left the token guaranteed-invalid,
	// so `background:var(--bg,#fff)` fell back to WHITE. A literal can't fail that way.
	//
	// SCOPED TO `:root`, for the same reason the derived-token pool below is (#1637). This
	// map answers "what does `var(--x)` resolve to ON THE ELEMENT these decls land on" —
	// `:root` and every slide section — so only a `:root` declaration is an admissible
	// answer. Scanning the whole sheet let the LAST declaration anywhere win, and the last
	// `--surface-inverse` in the bundle is `section.print{--surface-inverse:
	// var(--print-surface-inverse)}` → `#ECECEC`. So atelier's `--on-accent:
	// light-dark(#F0EDE6, var(--surface-inverse))` flattened its dark arm to the print
	// band's near-white instead of `#0F0E0C`, and the whole `--on-accent-*` family with it:
	// `examples/accent-on-accent.md` slide 5 shipped its headline at 1.24:1 on the accent
	// rail (13.0:1 in the reference render). A component-scoped declaration is now simply
	// absent from the map, so `deepFlatten` leaves that `var()` intact — a missed flatten,
	// never a wrong color.
	const baseVals = rootScopedDecls(noComments);

	const darkDecls = [];
	const lightDecls = [];
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
	// is left intact — at worst a missed flatten, never a wrong color.
	const deepFlatten = (value, seen) =>
		value.replace(/var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^()]*)?\)/g, (full, name) => {
			if (darkKeys.has(name) || seen.has(name) || baseVals.get(name) === undefined) return full;
			const resolved = deepFlatten(baseVals.get(name), new Set(seen).add(name)).trim();
			return /var\(|light-dark\(/.test(resolved) ? full : resolved;
		});
	// Pairs written in a REAL property are the same contract as the token pairs below —
	// nothing the player ships may depend on the `light-dark()` function — split only by where
	// the pair happens to be written, so they are collected from the SAME sheet and emitted
	// into the SAME trailing block. They route through a private custom property instead of a
	// scoped copy of the rule, because a copy would reorder the cascade for that property
	// (hoistRuleLightDark). Their dark arms take the same `deepFlatten` the tokens take, and
	// for the same reason: no shipped value may resolve one custom property through another.
	//
	// The rewritten sheet is what the light base is then collapsed from — the pairs it still
	// carries are the CUSTOM-PROPERTY ones this function handles itself.
	const { css: withVars, darkBlock: ruleBlock } = hoistRuleLightDark(css, (value) => deepFlatten(value, new Set()));
	const base = resolveLightDark(withVars, 0);

	// ONE ENTRY PER TOKEN, chosen the way the cascade would choose it, rather than every
	// occurrence pushed in source order. The emitted block is flat, so the last entry won —
	// which is right only at equal specificity. Walking rules (rather than the flat decl
	// scan this replaced) is what makes the enclosing selector, and therefore `rootSpec`,
	// available at all. A declaration whose subject is NOT `:root` scores -1 and keeps the
	// old last-wins behavior among its peers; the docblock above records that no shipped
	// token is declared both inside and outside `:root`, so nothing changes for them today.
	const best = new Map();          // token -> { sp, i, dark, light }
	const ruleWalk = /([^{}]+)\{([^{}]*)\}/g;
	let rule;
	let i = 0;
	while ((rule = ruleWalk.exec(noComments))) {
		const sp = rootSpec(rule[1]);
		declRe.lastIndex = 0;
		const block = `${rule[2]}}`;
		let dm;
		while ((dm = declRe.exec(block))) {
			i += 1;
			const prev = best.get(dm[1]);
			// Higher specificity wins; at a TIE the later declaration does, which is plain
			// source order and the behavior this replaced. `i` only ever increases, so the
			// tie arm is a statement of intent rather than a branch that fires — spelled out
			// so a future reader does not have to re-derive which way the tie goes.
			if (prev && prev.sp > sp) continue;
			best.set(dm[1], {
				sp,
				i,
				dark: `${dm[1]}:${deepFlatten(resolveLightDark(dm[2], 1).trim(), new Set())}`,
				// The mirror set, flattened the same way — what a section PINNED to light needs
				// when the rest of the player is in dark (see the per-section pins below).
				// `deepFlatten` stops at a `darkKeys` name, which is exactly right here too: a
				// light value referencing another dual-mode token must keep referring to the
				// value in force on THIS element.
				light: `${dm[1]}:${deepFlatten(resolveLightDark(dm[2], 0).trim(), new Set())}`,
			});
		}
	}
	for (const v of best.values()) {
		darkDecls.push(v.dark);
		lightDecls.push(v.light);
	}
	if (!darkDecls.length) return { base, darkBlock: ruleBlock };

	// DERIVED tokens — the half this block used to miss. Only declarations that literally
	// contain `light-dark()` were re-emitted, but a theme also defines tokens IN TERMS OF
	// those: `--cat-on-fill: var(--text-heading)`, `--status-pass: var(--pass)`, the `--seq-*`
	// and `--diagram-*` families. A custom property is substituted where it is DECLARED, so
	// `:root{--cat-on-fill:var(--text-heading)}` resolves against the LIGHT `--text-heading`
	// at `:root` and the section inherits that already-resolved value — pinning the surface
	// dark while the ink on it stays light. Measured on a `list-steps capsule dark` slide in
	// light scheme: 11.97:1 before, 2.80:1 after, near-black step badges on jewel-tone fills.
	//
	// They are re-emitted VERBATIM rather than resolved. Re-declaring `--cat-on-fill:
	// var(--text-heading)` on the pinned section moves the substitution to that element, so
	// the var() lookup finds the pinned value and the whole derived family follows for free —
	// no second resolver to keep honest, and it works for any depth of chain.
	//
	// Transitive: `--b: var(--a)` where `--a` is itself derived has to come along, and after
	// the ones it depends on. Bounded by the token count, so the fixed point terminates.
	const derivedDecls = [];
	{
		// The same `:root`-scoped map `deepFlatten` reads. Sharing it is not just thrift: the
		// two consumers are asking the SAME question — what a token resolves to on the element
		// these declarations land on — so a second scan with a second scope rule is exactly how
		// #1637 happened.
		const pool = baseVals;
		const known = new Set(darkKeys);
		for (let pass = 0; pass < pool.size; pass++) {
			let grew = false;
			for (const [name, value] of pool) {
				// A `light-dark()` token is already re-emitted as a light/dark pair above.
				if (known.has(name)) continue;
				const refs = [...value.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((r) => r[1]);
				if (!refs.some((r) => known.has(r))) continue;
				known.add(name);
				derivedDecls.push(`${name}:${value}`);
				grew = true;
			}
			if (!grew) break;
		}
	}
	const derived = derivedDecls.length ? `${derivedDecls.join(';')};` : '';
	const body = `${darkDecls.join(';')};${derived}`;
	const lightBody = `${lightDecls.join(';')};${derived}`;
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
	//
	// PER-SECTION SCHEME PINS. `light-dark()` resolves against the ELEMENT's own
	// `color-scheme`, and Lattice pins that per slide: `section.dark` (a `_class: dark`
	// slide, and every slide of a `color-mode: dark` deck) flips the section to dark;
	// `section.light` / `section.color-light` pin it light; `section.print` remaps the
	// whole band to its own `--print-*` literals. Collapsing `light-dark()` away erases
	// those pins, so the player used to theme a pinned section by the VIEWER's toggle
	// instead of the author's choice — and the failure was silent-then-invisible: a
	// `color-mode: dark` deck toggled to light gave every slide light surfaces while the
	// bookends kept painting `--text-display` (a constant #FFFFFF, no light-dark() pair,
	// so nothing here touches it) → white ink on a white canvas, title/divider/closing
	// blank. It read fine in dark only by luck: the page behind was dark too.
	//   · `.dark`  → the dark literals in BOTH player schemes.
	//   · `.light`/`.color-light` → the light literals even when the player is dark.
	//   · `.print` → excluded from the blanket rule so its own remap survives (its band
	//     is literals already, so it needs no restore rule of its own).
	// `.color-system` / `.color-inherited` are deliberately NOT pinned: both defer (to the
	// OS, to the host), which in a standalone player IS the toggle — the blanket behavior.
	// Written with chained `:not(.x)` / one arm per class rather than `:is()`/`:not(a,b)`:
	// the selector-list forms are Safari-14-era, and an engine that can't parse one drops
	// the WHOLE rule — which here would silently un-theme dark mode. Single-class `:not()`
	// is CSS3 and as old as the rest of this block's vocabulary.
	const PIN_LIGHT = ['.light', '.color-light'];
	const PIN_EXCLUDE = ':not(.dark):not(.light):not(.color-light):not(.print)';
	// The blanket rule targets :root (the chrome + article inherit from it) and every
	// UNPINNED section.
	const sel = (scope) => `${scope},${scope} section[data-lattice-slide]${PIN_EXCLUDE}`;
	// Higher specificity than the deck's own token rule on either host — the CLI ships the
	// theme on `:root` (0,1,0), the Studio on Marpit's packed `:where(section):not([\20
	// root])` (0,1,1) — and later in source order than both, since this rides its own
	// <style> after them.
	// `:not(.print)` for the same reason the `.dark` rule three lines below carries it, and it
	// was missing here: a slide CAN hold both classes (a `color-mode: print` deck with a
	// `_class: … light` slide renders `class="light print …"`, which the engine allows because
	// print is non-droppable). These rules are (0,4,1) and `section.print` is (0,1,1), so
	// without the exclusion a toggle to dark silently replaced the B&W-safe print band with the
	// theme's light colors on that slide — a contract break rather than a legibility one, which
	// is exactly the kind that ships unnoticed.
	const pinned = (scope) =>
		PIN_LIGHT.map((c) => `${scope} section[data-lattice-slide]${c}:not(.print)`).join(',');
	const darkBlock =
		// An author-pinned dark section is dark in EVERY player scheme, so this one is
		// unconditional — outside both the attribute rule and the media query.
		//
		// `:not(.print)` is load-bearing. Without it this (0,2,1) rule outranks
		// `section.print` (0,1,1), so a `_class: dark` slide inside a `color-mode: print`
		// deck — a combination `lib/core/color-mode.js` deliberately allows, since print is
		// non-droppable — got the dark canvas under the print band's `#111111` ink: 1.10:1,
		// measured, on a slide that read 18.88:1 before. That is the same white-on-white
		// shape this block exists to fix, reintroduced on a different class pair.
		//
		// A DECK-WIDE dark deck no longer relies on this rule at all: the player's toggle
		// adds and removes the `dark` class itself, so in light scheme the class is gone and
		// nothing here matches. What is left for this rule is exactly what should keep it —
		// a one-off `<!-- _class: dark -->` accent slide inside an unpinned deck.
		`section[data-lattice-slide].dark:not(.print){${body}}` +
		`${sel(':root[data-lp-scheme=dark]')}{${body}}` +
		`${pinned(':root[data-lp-scheme=dark]')}{${lightBody}}` +
		`@media (prefers-color-scheme:dark){${sel(':root[data-lp-scheme=system]')}{${body}}` +
		`${pinned(':root[data-lp-scheme=system]')}{${lightBody}}}`;
	// The real-property arms go LAST. They are scoped copies of ordinary rules, so they have
	// to sit after the token rules whose values they read — and a restore rule in there must
	// be the last word on its own property.
	return { base, darkBlock: darkBlock + ruleBlock };
}

/** The three-view player CSS. Palette-blind: uses theme tokens (var(--…)).
 *  `narration` adds the caption band + play-control rules; omitted for a deck with no baked
 *  audio, so a silent export carries no rule for chrome it does not have. */
/**
 * @param {boolean} [narration] the deck ships a narration transport (the play control).
 * @param {boolean} [captions] the deck ships a caption TRACK to crawl. Defaults to
 *   `narration`, because for most of this feature's life the two were the same thing —
 *   an audio-only export (captions switched off in the panel) is the case that separates
 *   them, and it must not ship the band's stylesheet for chrome it does not have.
 */
/**
 * The DEFAULT slide canvas — what a deck that declares no `size:` renders at.
 *
 * The player used to hardcode these numbers in nine places, so every deck declaring a
 * non-default `size:` (4K, story, portrait, square, mobile — 87 committed decks)
 * exported a webpage whose content was laid out for its real canvas and then forced into an
 * HD box. The type scale rides `--_sec-1cqi`, which the engine derives from the REAL canvas,
 * so a 4K deck rendered every token at 3x inside a 1280x720 frame: headings overlapping body
 * copy, slides cut off mid-word. Silent — the CLI printed a normal success line and the PDF
 * beside it was correct (#1577).
 *
 * The geometry is now THREADED from the host rather than derived from the document. Both hosts
 * already resolve it (the CLI at its slideW/slideH, the Studio at its w/h) and both write it
 * into the docHtml as a `section[data-lattice-slide]{width;height}` rule — but parsing that
 * back out means regex-reading our own emitted CSS in two different shapes (the Studio strips
 * the `article.lattice >` prefix), with no rule at all in some fixtures, and a deck's authored
 * CSS could carry a lookalike. Explicit data beats parsing your own output; this mirrors the
 * `theme.mode` seam, where both hosts compute and hand in.
 */
export const PLAYER_CANVAS = { w: 1280, h: 720 };

/**
 * The canvas for this export: what the host said, else what the document implies, else the
 * historical default. Exported for the tests that pin each of those three routes.
 *
 * `--_sec-1cqi` / `--_sec-1cqh` are hundredths of the canvas, so x100 recovers it. A partial or
 * nonsense geometry from a host (one axis, a CSS string like '1080px', NaN) falls through to the
 * document rather than half-applying — a mismatched aspect is worse than either source alone,
 * because it clips every slide instead of scaling it.
 */
export function resolveCanvas(data = {}) {
	const px = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
	const w = px(data.width);
	const h = px(data.height);
	if (w && h) return { w, h };
	const doc = String(data.docHtml || '');
	const cqi = doc.match(/--_sec-1cqi:\s*([0-9.]+)px/);
	const cqh = doc.match(/--_sec-1cqh:\s*([0-9.]+)px/);
	if (cqi && cqh) {
		const dw = Math.round(Number.parseFloat(cqi[1]) * 100);
		const dh = Math.round(Number.parseFloat(cqh[1]) * 100);
		if (dw > 0 && dh > 0) return { w: dw, h: dh };
	}
	return { ...PLAYER_CANVAS };
}

/**
 * The no-JS floor's scale ladder, expressed as the FRAME WIDTHS it was tuned to produce.
 *
 * That floor is a scrolling column, so what matters is how wide each slide sits at a given
 * viewport — not a fraction of some canvas. The ladder shipped as fixed fractions of 1280
 * (.28/.40/.56/.72), which silently meant something different for every other canvas: a
 * 1080-wide story deck at .72 is 778px, and a mistake no find-and-replace over "1280" would
 * ever catch, because the literal is not there. Deriving the fraction from these widths keeps
 * the floor identical for an HD deck and correct for the rest.
 */
const NO_JS_FRAME_WIDTHS = [358.4, 512, 716.8, 921.6];
/** The historical literals, kept verbatim so a DEFAULT-size deck's bytes do not move at all. */
const NO_JS_LADDER_HD = ['.28', '.40', '.56', '.72'];

export function playerCss(narration = false, captions = narration, canvas = PLAYER_CANVAS, lensViews = false) {
	const CW = canvas.w;
	const CH = canvas.h;
	const ladder =
		CW === PLAYER_CANVAS.w
			? NO_JS_LADDER_HD
			: NO_JS_FRAME_WIDTHS.map((px) => String(Math.round((px / CW) * 10000) / 10000).replace(/^0\./, '.'));
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
.lp-js #lp-app{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;position:relative}
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
${lensViews ? `
/* READER VIEWS — a second segmented control, only present in a multi-view carrier.
   It reuses .lp-seg for one visual language, and differs in one way that matters: its
   buttons are WORDS, because a view is the author's own noun ("Brief", "The ask") and
   there is no icon that could stand for one. That is why the narrow-width rule below
   re-shows .lp-tab-text inside it — the icon-only collapse the three view tabs use would
   leave three empty boxes here. Names shorten instead: the label is allowed to ellipsize
   rather than push the bar's buttons off the edge. */
#lp-bar .lp-lens-seg button{max-width:12ch;overflow:hidden;text-overflow:ellipsis;display:block}
/* A READER VIEW HIDES BY \`hidden\`, AND \`hidden\` HAS TO WIN. The UA sheet's
   \`[hidden]{display:none}\` is specificity (0,1,0) and loses to plenty of what is already
   here — \`#lp-article .lp-stats{display:grid}\` (1,1,0) and \`#lp-toc a{display:block}\`
   (1,0,1) both beat it — so switching views left a non-member's stat block sitting in the
   prose and the whole table of contents unfiltered, which a real browser showed and reading
   the markup did not. \`!important\` rather than a specificity race, because the rules it
   must outrank are open-ended: the article's prose forms grow, and the next one to set
   \`display\` would silently reopen the same hole. This also restores what \`hidden\` is FOR —
   an element the UA sheet does not hide is rendered, and therefore still in the
   accessibility tree, so a screen reader would read out a slide the reader's view excludes. */
#lp-article [data-lp-i][hidden],#lp-toc a[data-lp-i][hidden],.lp-frame[data-lp-i][hidden]{display:none!important}` : ''}
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
}${lensViews ? `
/* THE CARRIER'S BAR AT PHONE WIDTH. The bar's budget is fixed and a carrier adds a whole
   second segmented control to it — measured at 390px, the three view tabs (133px), the
   counter (51), the reader views (151) and the fullscreen + theme buttons (84) come to
   418 against 390, and the theme toggle went off-screen entirely. So the carrier pays for
   its own control rather than the deck's chrome losing a button:
     · the reader-view names ellipsize inside a share of the bar instead of sizing to text;
     · the numeric counter, which is decoration -- aria-hidden, with the real position
       carried on the sr-only live region beside it -- stands down at this width.
   Emitted only for a carrier, so a player without one keeps the bar it has. */
@media(max-width:560px){
 /* The deck title stands down first. It is the one thing here a reader does not act on —
    the file's own title bar already carries it — and at 40vw the view names truncated to
    "B… E… T…", which is a control nobody can use. */
 #lp-bar .lp-brand{display:none}
 #lp-bar .lp-lens-seg{min-width:0;max-width:56vw}
 #lp-bar .lp-lens-seg .lp-tab-text{position:static;width:auto;height:auto;margin:0;overflow:hidden;text-overflow:ellipsis;clip:auto}
 #lp-bar .lp-lens-seg button{flex:1 1 0;min-width:0;max-width:none;padding:10px 5px}
 /* The view you are READING gets the room to say its name; the others are hints you tap.
    Three author-named views, three view tabs and two icon buttons genuinely do not fit a
    390px bar at full width, and an even split spends the space on the two labels that
    matter least — "Brief / Evid… / The …" with no way to tell which one you are in. */
 #lp-bar .lp-lens-seg button[aria-pressed=true]{flex:2 1 0}
 #lp-count{display:none}
}` : ''}
/* Visually hidden, still announced. The classic recipe pairs this with margin:-1px to
   pull the 1px box off-screen; absolute positioning already takes it out of flow, and
   clip-path does the hiding, so the margin buys nothing — and HARD RULE #20 keeps
   margins out of this engine's CSS on principle, gated file or not. */
.lp-sr{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
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
 width:calc(${CW}px * var(--lp-fit-present,.5));height:calc(${CH}px * var(--lp-fit-present,.5));
 border-radius:12px;box-shadow:0 24px 70px -22px rgba(0,0,0,.45)}
.lp-js [data-lp-view=present] .lp-frame.lp-active section[data-lattice-slide]{width:${CW}px!important;height:${CH}px!important;
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
${
		captions
			? `/* NARRATION CAPTION — the text alternative for a deck that speaks, and the one signal
   that tells a viewer the file is working rather than stuck. It sits BELOW the slide, in the
   column, so it never covers the author's layout.
   The band holds its height whether or not a line is showing (min-height; only the TEXT
   changes): a band that collapsed between sentences would resize the stage mid-delivery and
   re-fit the slide under the viewer — the one thing a presentation must not do. Present
   only, and emitted only for a deck that actually ships audio, so a silent export carries no
   rule for chrome it does not have. */
/* The teleprompter crawl. Film-subtitle, NOT a pill: transparent, no card or border, docked
   between the slide and the transport. The vertical mask alone fades read and upcoming lines,
   so only the line being spoken reads clean. Its height is RESERVED whether or not anything is
   showing \u2014 a band that collapsed between slides would resize the stage mid-delivery and
   re-fit the slide under the viewer, the one thing a presentation must not do. */
#lp-caption{display:none}
.lp-js [data-lp-view=present] #lp-caption{display:block;flex:none;position:relative;overflow:hidden;
 height:76px;width:100%;max-width:720px;margin-inline:auto;padding:0 16px;
 font-family:'Outfit',system-ui,sans-serif;
 -webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);
 mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%)}
.lp-cap-track{position:absolute;left:0;right:0;will-change:transform;transition:transform .5s cubic-bezier(.22,.61,.36,1)}
.lp-cap-line{padding:2px 8px;text-align:center;font-size:18px;font-weight:600;line-height:1.35;
 transition:color .3s;color:var(--text-muted,#888)}
.lp-cap-line.lp-read{opacity:.45}
.lp-cap-line.lp-up{opacity:.55}
.lp-cap-line.lp-now{color:var(--text-heading,#111);opacity:1}
/* Only COLOR changes as a word is spoken \u2014 never weight or size, which would reflow the
   line mid-sentence and make the crawl jitter under the reader. */
.lp-cap-w{transition:color .18s}
.lp-cap-w.lp-said{color:var(--accent,#4338ca)}
.lp-cap-w.lp-soon{color:var(--text-muted,#888)}
@media(max-width:560px){.lp-js [data-lp-view=present] #lp-caption{height:64px;padding:0 10px}.lp-cap-line{font-size:15px}}
@media(prefers-reduced-motion:reduce){.lp-cap-track{transition:none}.lp-cap-w,.lp-cap-line{transition:none}}`
			: ''
	}${
		narration
			? `
/* The narration transport's own control. Shipped whenever the deck has a delivery to play,
   captions or not — an audio-only export still needs its Play button. */
#lp-play{border:1px solid var(--border,#ccc)!important;border-radius:8px}
#lp-play[aria-pressed=true]{background:var(--accent,#4338ca);color:var(--on-accent,#fff);border-color:var(--accent,#4338ca)!important}`
			: ''
	}
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
   cqi resolves ONCE against the intrinsic canvas box, and transform only scales the
   already-resolved paint. transform doesn't collapse the LAYOUT box the way zoom did,
   so each slide is wrapped in a .lp-frame sized to the scaled footprint
   (calc(<canvas>px * var(--lp-fit))) — the flex column's gap then packs against that
   real size, same visual result as zoom gave, without breaking cqi. --lp-fit is set
   fluidly by the script to fill the column; the mobile default also serves the floor. */
[data-lp-view=read-slides] #lp-doc{display:none}
/* The read-slides stage is the column's scrolling child (flex:1;overflow:auto). No
   bar-clearance padding — the flex bar above already reserves its own space. */
.lp-js [data-lp-view=read-slides] #lp-stage{flex:1;min-height:0;overflow:auto}
/* Each slide is now sized to the visible stage (the SAME fit as Present — see fitRead),
   so the first slide is identical between the two tabs (seamless switch) and the next one
   PEEKS below the fold — the "scroll for more" hint this control-free view needs. The 40px
   fit inset + align-items:center give the side breathing room (no more edge-to-edge); the
   bottom padding clears the floating Home/End buttons so the last slide isn't hidden. */
[data-lp-view=read-slides] #lp-stage{padding:32px 16px 96px;display:flex;flex-direction:column;align-items:center;gap:28px}
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
[data-lp-view=read-slides] .lp-frame{flex:none;width:calc(${CW}px * var(--lp-fit,.28));height:calc(${CH}px * var(--lp-fit,.28));overflow:hidden;border-radius:12px;
 border:1px solid var(--border,#e5e5e5);box-shadow:0 10px 34px -14px rgba(0,0,0,.4)}
[data-lp-view=read-slides] section[data-lattice-slide]{width:${CW}px!important;height:${CH}px!important;transform:scale(var(--lp-fit,.28));transform-origin:0 0}
/* READ·SLIDES floating Home/End — an AUTO-REVEALING "jump to top / bottom" affordance,
   OVERLAID (position:absolute over the scrolling stage), so the continuous scroll flow is
   never obstructed by a docked row. It REVEALS on scroll / touch / tap and idle-HIDES after
   ~1.5s (the script toggles .lp-show), so it never sits over content while you read; each button hides
   (the hidden attribute) when its direction isn't actionable (up at the top, down at bottom).
   Same circular pill styling as Present's prev/next; the arrow-to-line glyph reads "to the
   very edge" (vs Present's single-chevron one-step). Anchored to #lp-app (position:relative)
   so it rides the visible viewport; bottom-right with SAFE-AREA insets so it clears the iOS
   home indicator + browser chrome. */
#lp-read-nav{display:none}
.lp-js [data-lp-view=read-slides] #lp-read-nav{display:flex;flex-direction:column;gap:10px;z-index:40;
 position:absolute;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));
 opacity:0;transform:translateY(6px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}
.lp-js [data-lp-view=read-slides] #lp-read-nav.lp-show{opacity:1;transform:none;pointer-events:auto}
#lp-top,#lp-bottom{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border-radius:999px;
 border:1px solid var(--border,#ddd);background:var(--bg-alt,#f5f5f5);color:var(--text-secondary,#333);cursor:pointer;
 box-shadow:0 6px 20px -8px rgba(0,0,0,.5);opacity:.92}
#lp-top:hover,#lp-bottom:hover{opacity:1;color:var(--accent,#4338ca);border-color:var(--accent,#4338ca)}
#lp-top[hidden],#lp-bottom[hidden]{display:none}
/* Desktop: wheel + keys lead, so the buttons sit back (subtler until hover). */
@media(min-width:760px){#lp-top,#lp-bottom{opacity:.72}}
/* Honor a reduced-motion preference: snap visibility, no slide/fade. */
@media(prefers-reduced-motion:reduce){.lp-js [data-lp-view=read-slides] #lp-read-nav{transition:none;transform:none}}
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
/* BREAKOUT GRID — prose holds a readable ~740px measure in the center track;
   figures (charts/diagrams/tables) break OUT to a wider band (cap --lp-fig-max)
   so a chart uses the big screen instead of being trapped in the prose column.
   The 1fr side tracks center the prose; a figure spans them and self-caps. */
#lp-article{--lp-prose:740px;--lp-fig-max:1200px;
 display:grid;
 grid-template-columns:[fig-start] minmax(0,1fr) [prose-start] min(var(--lp-prose),100%) [prose-end] minmax(0,1fr) [fig-end];
 padding:48px 32px 140px;font-family:'Outfit',system-ui,sans-serif;
 color:var(--text-body,#1a1a1a);font-size:18px;line-height:1.72}
#lp-article>*{grid-column:prose-start/prose-end;min-width:0}
#lp-article>.lp-figure:not(.lp-figure-note){grid-column:fig-start/fig-end;justify-self:center;width:100%;max-width:var(--lp-fig-max)}
/* The visual-layout placeholder note (a text card) stays in the readable prose column;
   charts / diagrams / math / images break out above. */
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
#lp-article .lp-figure{margin:1.9em 0}
/* Chart/diagram SVGs are viewBox-only + preserveAspectRatio="meet": width:100% fills
   the (up to 1200px) figure, height:auto keeps aspect, and max-height keeps a tall
   or square chart VISIBLE — "meet" letterboxes inside the capped box, no distortion. */
#lp-article .lp-figure svg{width:100%;height:auto;max-height:78vh;display:block;margin-inline:auto}
#lp-article .lp-figure img{max-width:100%;height:auto;display:block;margin-inline:auto}
/* SPATIAL-BOUNDED figure (word-cloud / journey): a definite box that re-establishes the
   container-type:size + cqi context these layouts need (the slide's cell-stage gave them
   one). Breakout supplies the width (up to 1200px); aspect-ratio derives the height; the
   re-hosted chart-body fills it. word-cloud reads squarer, journey wider. */
/* word-cloud packs SVG text at viewBox coords + a %-positioned key, so it needs a DEFINITE
   box (container-type:size + aspect-ratio) for the % to resolve — the same box the slide's
   cell-stage gave it. Breakout supplies the width (up to 1200px); aspect-ratio derives the
   height; the re-hosted chart-body fills it. */
#lp-article .lp-spatial{container-type:size;width:100%;position:relative;overflow:hidden}
#lp-article .lp-spatial>.chart-body{width:100%;height:100%}
#lp-article .lp-spatial.word-cloud{aspect-ratio:3/2}
/* FLOW-HEIGHT figure (roadmap / progress / kanban / gantt / timeline-list): a WIDTH container
   (container-type:inline-size) that re-establishes the cqi context these HTML+CSS layouts need,
   with content-driven height — they have no cqh/cqb, so no aspect lock (unlike lp-spatial).
   Breakout supplies the width (up to 1200px); the re-hosted chart-body fills it. overflow-x
   guards a wide roadmap table on a narrow viewport — it scrolls in its own box, never breaks
   the page. Height is auto: the layout is exactly as tall as its content. */
#lp-article .lp-chart{container-type:inline-size;width:100%;overflow-x:auto}
#lp-article .lp-chart>.chart-body{width:100%}
#lp-article figcaption{font-size:.85em;color:var(--text-muted,#888);margin-top:.5em;text-align:center}
#lp-article .lp-figure-note{border:1px dashed var(--border,#ccc);border-radius:10px;padding:1.1em 1.3em;background:var(--bg-alt,#f7f7f7)}
#lp-article .lp-visual-note{margin:0;color:var(--text-secondary,#555);font-size:.95em}
/* Generic article-table chrome — for a re-hosted COMPARISON/data table. Scoped OUT of a chart
   re-host (.lp-chart, e.g. roadmap): those OWN their table look via each component's
   figure-broadened CSS, and this rule is ID-specific (1,1,1) — it would beat the component's
   class-level (0,1,2) cell rules and zero roadmap's grid hairlines / padding / accent stripe.
   The :not(.lp-chart *) guard (a Selectors-4 complex :not, fine on the modern-only article
   surface) keeps this off chart tables so the component styling is the sole source, as on the slide. */
#lp-article table:not(.lp-chart table){border-collapse:collapse;width:100%;margin:0 0 1.3em;font-size:.92em}
#lp-article th:not(.lp-chart *),#lp-article td:not(.lp-chart *){border:1px solid var(--border,#e2e2e2);padding:.4em .7em;text-align:left}
#lp-article th:not(.lp-chart *){background:var(--bg-alt,#f5f5f5);font-weight:600}
#lp-article pre{background:var(--bg-alt,#f5f5f5);padding:1em;border-radius:8px;overflow:auto;margin:0 0 1.3em;font-size:.85em}
#lp-article code{font-family:'JetBrains Mono',monospace;font-size:.88em}
@media (max-width:820px){[data-lp-view=read-article] #lp-doc{grid-template-columns:1fr}#lp-toc{display:none}}
/* NO-JS / BLOCKED-SCRIPT FLOOR (progressive enhancement). Every present/read rule
   above is scoped to .lp-js, which the player script adds to <html> only when it
   actually runs. Without it — a strict CSP that blocks the inline script (seen on some
   mobile browsers), scripting disabled, or a script error — the deck falls back to a
   readable stacked column instead of a BLANK page (present mode had hidden every slide
   until JS marked one active). The bar's live-only controls hide in this state. */
html:not(.lp-js){--lp-fit:${ladder[0]}}
@media(min-width:560px){html:not(.lp-js){--lp-fit:${ladder[1]}}}
@media(min-width:760px){html:not(.lp-js){--lp-fit:${ladder[2]}}}
@media(min-width:1000px){html:not(.lp-js){--lp-fit:${ladder[3]}}}
html:not(.lp-js) #lp-stage{max-width:980px;margin:0 auto;padding:68px 16px 90px;display:flex;flex-direction:column;align-items:center;gap:22px}
html:not(.lp-js) .lp-frame{width:calc(${CW}px * var(--lp-fit));height:calc(${CH}px * var(--lp-fit));overflow:hidden;border-radius:12px}
html:not(.lp-js) section[data-lattice-slide]{width:${CW}px!important;height:${CH}px!important;transform:scale(var(--lp-fit));transform-origin:0 0;border-radius:12px;overflow:hidden;border:1px solid var(--border,#e5e5e5);box-shadow:0 8px 30px -16px rgba(0,0,0,.35)}
html:not(.lp-js) #lp-notes,html:not(.lp-js) #lp-count,html:not(.lp-js) #lp-notes-btn,html:not(.lp-js) #lp-full{display:none}
`.trim();
}

/**
 * The narration transport, appended to the player script only when the deck ships baked
 * audio. Everything here is inside the main IIFE's scope, so it reads `slides`, `t`, `view`
 * and the two hooks the base script declares alongside it.
 *
 * THE SHAPE, and why it is this one:
 *
 *  · ONE `Audio` element, created on the play CLICK and reused for every cue. A fresh
 *    element per sentence is the obvious version and it is wrong on iOS: media playback is
 *    unlocked per ELEMENT by a user gesture, so cue 2 onward would be silently refused. The
 *    element is unlocked once and only its `src` changes after that.
 *  · CUES ARE READ LAZILY, one slide at a time. The audio blocks are inert `<script>` text
 *    until something parses them, so a viewer who never presses Play pays nothing, and a
 *    viewer who does pays one small parse per slide rather than one huge one up front.
 *  · A SILENT CUE STILL TAKES ITS TIME. A sentence the author never prepared holds its
 *    estimated read length instead of flashing past, so a partially-baked deck plays as a
 *    delivery with a few quiet lines rather than as a stutter.
 *  · THE BEAT IS SPENT ON THE SLIDE THAT ARRIVED. Advance, hold, then speak — the one
 *    ordering every practitioner agrees on, and the reason `pace:` exists (resolve-pace.mjs).
 *
 * @param {{slide: number, section: number}} beats the deck's resolved pace, in ms
 */
function narrationJs(beats) {
	return `
// ---- baked narration -------------------------------------------------------
var NAR_BEAT=${JSON.stringify({ slide: Math.round(beats.slide), section: Math.round(beats.section) })};
var PLAY_ICON='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
var PAUSE_ICON='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
// Scoped to the player's OWN chrome, never a bare id lookup. The document body IS deck
// content, and the engine renders authored HTML, so a slide can contain an element with any
// id it likes — including these. A bare getElementById then binds the transport to a deck
// element: with captions switched OFF the cursor kernel is not even inlined, so the crawl's
// one guarded call site would throw a makeCursor-is-not-defined ReferenceError inside a click handler that
// sits outside the init try/catch — the button flips to "Pause" and the deck never speaks.
// (Even with captions on, the author's element wins document order and the teleprompter
// renders into the middle of a slide.) The real chrome is a direct child of the bar and of
// #lp-app respectively, and a slide never is: it is nested inside #lp-stage.
var lpBar0=document.querySelector('body > #lp-bar'),lpApp0=document.querySelector('body > #lp-app');
var playBtn=lpBar0&&lpBar0.querySelector(':scope > #lp-play'),capBand=lpApp0&&lpApp0.querySelector(':scope > #lp-caption');
var au=null,cues=null,cueSlide=-1,narPlaying=false,beatT=null,autoNav=false;
// The slide narration is CURRENTLY anchored on, and a generation counter for in-flight
// play() promises. Both exist to tell a real event from a stale one — see onSlideShown
// (a clamped no-op nav must not restart the slide) and nextCue (a play() that rejects
// after its cue was replaced must not tear down the cue that replaced it).
var spokeSlide=-1,gen=0;
// The audio element is created on the first user gesture and then REUSED — see the header.
// It is ATTACHED to the document (hidden, no controls) rather than left detached: older
// WebKit is unreliable about playing a media element that was never in the tree, and an
// element in the document is one a maintainer can actually inspect when a deck arrives
// silent. It adds nothing to the layout.
function audioEl(){if(!au){au=document.createElement('audio');au.setAttribute('playsinline','');au.setAttribute('hidden','');au.preload='auto';document.body.appendChild(au);}return au;}
function clearBeat(){if(beatT){clearTimeout(beatT);beatT=null;}}
function stopAudio(){clearBeat();stopCrawlLoop();gen++;if(au){try{au.pause();}catch(e){}au.onended=null;au.onerror=null;au.onloadedmetadata=null;au.onplaying=null;try{au.removeAttribute('src');au.load();}catch(e){}}}
// ---- the caption crawl -------------------------------------------------------------
// The Studio's treatment (PresentCaption.tsx), reproduced: a teleprompter where the line
// being read sits CENTERED, read lines lift up and out, upcoming lines rise from below, and
// words light as they are spoken. Only a masked ~3-line band is visible, so it can never bury
// the slide. React + Tailwind cannot cross into a CSP-hashed vanilla script, so the PRESENTATION
// is rebuilt here — but the TIMING is not reimplemented: makeCursor above is the same kernel,
// inlined verbatim, so there is exactly one answer to "which word is being spoken now".
var capTrack=null,cursor=null,held={cueIndex:0,wordIndex:0},cueOnset=0;
// Expand the compact per-slide payload into the CaptionTrack shape makeCursor takes. Word
// times ship RELATIVE to their cue (small integers); absolutize them against the running
// estimate so the whole slide is one monotonic timeline, exactly as buildTrack produces.
function expandTrack(cues){
 var at=0,out=[];
 for(var i=0;i<cues.length;i++){
  var c=cues[i],ws=c.w||[],dur=Math.max(1,c.d||0),words=[];
  for(var j=0;j<ws.length;j++)words.push({display:ws[j][0],startMs:at+ws[j][1],endMs:at+ws[j][2]});
  // A cue with no word timings still needs a span, or the crawl has nothing to center on.
  if(!words.length)words.push({display:c.t||'',startMs:at,endMs:at+dur});
  out.push({display:c.t||'',words:words,startMs:at,endMs:at+dur});
  at+=dur+Math.max(0,c.g||0);
 }
 return {cues:out,durationMs:at};}
// Build the crawl's DOM once per slide. textContent per word — never innerHTML, because every
// one of these strings is deck-authored.
function renderCrawl(track){
 if(!capBand)return;
 capBand.textContent='';
 var inner=document.createElement('div');
 inner.className='lp-cap-track';
 for(var i=0;i<track.cues.length;i++){
  var line=document.createElement('div');
  line.className='lp-cap-line';
  line.setAttribute('data-cue',String(i));
  for(var j=0;j<track.cues[i].words.length;j++){
   var sp=document.createElement('span');
   sp.className='lp-cap-w';
   sp.setAttribute('data-cw',i+'-'+j);
   sp.textContent=track.cues[i].words[j].display;
   line.appendChild(sp);
   if(j<track.cues[i].words.length-1)line.appendChild(document.createTextNode(' '));
  }
  inner.appendChild(line);
 }
 capBand.appendChild(inner);}
// Center the ACTIVE WORD's line in the band and paint the read/spoken state. Following the
// WORD rather than the line's midpoint matters on a sentence that wraps: the word being
// spoken stays in the opaque band instead of scrolling into the fade.
function paintCrawl(){
 if(!capBand||!capTrack)return;
 var inner=capBand.firstChild;if(!inner)return;
 var ci=Math.min(capTrack.cues.length-1,Math.max(0,held.cueIndex)),wi=held.wordIndex;
 var lines=inner.childNodes;
 for(var i=0;i<lines.length;i++){
  lines[i].className='lp-cap-line'+(i<ci?' lp-read':i>ci?' lp-up':' lp-now');
  var ws=lines[i].childNodes;
  for(var j=0;j<ws.length;j++){
   if(ws[j].nodeType!==1)continue;
   var spoken=i<ci||(i===ci&&j/2<=wi);
   ws[j].className='lp-cap-w'+(i===ci?(spoken?' lp-said':' lp-soon'):'');
  }
 }
 var target=inner.querySelector('[data-cw="'+ci+'-'+wi+'"]')||inner.querySelector('[data-cue="'+ci+'"]');
 if(target)inner.style.transform='translateY('+(capBand.clientHeight/2-(target.offsetTop+target.offsetHeight/2))+'px)';}
// The cursor reports null in every punctuation and sentence gap. HOLD the last real position
// across those, or the crawl lurches back to line one at each full stop.
function tickCrawl(ms){
 if(!cursor)return;
 var a=cursor.at(ms);
 if(a)held={cueIndex:a.cueIndex,wordIndex:a.wordIndex};
 paintCrawl();}
function clearCaption(){stopCrawlLoop();if(capBand)capBand.textContent='';capTrack=null;cursor=null;held={cueIndex:0,wordIndex:0};}
// THE CLOCK the cursor reads. Two sources, which is exactly the split cursor.ts documents
// ("WebAudio currentTime during TTS, a plain timer for a silent read-along"): a spoken cue
// reads the media element, a cue with no clip reads the wall clock from when it started. So
// the crawl advances through a sentence the author never prepared, and through a
// captions-only export, instead of sitting frozen on word one.
var rafId=0,silentFrom=0;
function crawlClock(){return silentFrom?cueOnset+(Date.now()-silentFrom):cueOnset+(au?au.currentTime*1000:0);}
// Driven by rAF, not the timeupdate event. That fires roughly four times a second, which is
// a visible stutter on a teleprompter: a word would light two or three at a time. rAF costs
// nothing here (one binary search + a transform per frame) and only runs while something is
// actually being spoken.
function crawlLoop(){
 if(!narPlaying||(!silentFrom&&(!au||au.paused))){rafId=0;return;}
 tickCrawl(crawlClock());
 rafId=requestAnimationFrame(crawlLoop);}
function startCrawlLoop(){if(capBand&&!rafId)rafId=requestAnimationFrame(crawlLoop);}
function stopCrawlLoop(){if(rafId){cancelAnimationFrame(rafId);rafId=0;}silentFrom=0;}
function setPlaying(on){narPlaying=on;
 if(playBtn){playBtn.setAttribute('aria-pressed',on?'true':'false');playBtn.innerHTML=on?PAUSE_ICON:PLAY_ICON;
  playBtn.setAttribute('aria-label',on?'Pause narration':'Play narration');playBtn.setAttribute('title',on?'Pause narration':'Play narration');}}
// A divider slide opens a new section, so its boundary earns the deeper chapter beat.
function isSection(i){var s=slides[i];return !!(s&&s.className&&/(^|\\s)divider(\\s|$)/.test(s.className));}
function loadCues(i){if(cueSlide===i&&cues)return cues;cueSlide=i;cues=[];
 var n=document.querySelector('script[data-lp-audio="'+i+'"]');
 if(n){try{var p=JSON.parse(n.textContent||'[]');if(p&&p.length)cues=p;}catch(e){cues=[];}}
 return cues;}
function speakSlide(i){
 stopAudio();spokeSlide=i;loadCues(i);
 // One cursor per slide, over the slide's own timeline. Re-anchored per clip below.
 // Guarded on the band: an AUDIO-ONLY export ships no #lp-caption and no word timings, so
 // there is nothing to crawl — and makeCursor is then not inlined at all (see playerJs), so
 // this must never be the line that references it.
 held={cueIndex:0,wordIndex:0};
 if(capBand){capTrack=expandTrack(cues||[]);cursor=makeCursor(capTrack);renderCrawl(capTrack);paintCrawl();}
 nextCue(0);}
function nextCue(k){
 if(!narPlaying)return;
 if(!cues||k>=cues.length){endSlide();return;}
 var c=cues[k];
 // The cue's onset on the (possibly already re-anchored) timeline. Reading it from the cursor
 // rather than accumulating our own is what makes the clock self-correcting: align() shifts
 // every later cue, so cue k+1's onset is already right by the time we get here.
 cueOnset=cursor?cursor.track().cues[k].startMs:0;
 held={cueIndex:k,wordIndex:0};paintCrawl();
 // The BREATH after this sentence, then the next one. Held even for the last cue, so the
 // slide boundary does not land on the final syllable.
 var after=function(){clearBeat();beatT=setTimeout(function(){nextCue(k+1);},Math.max(0,c.g||0));};
 if(!c.a){silentFrom=Date.now();startCrawlLoop();clearBeat();beatT=setTimeout(after,Math.max(300,c.d||900));return;}
 silentFrom=0;
 var a=audioEl();a.onended=after;
 // RE-ANCHOR to the clip's REAL decoded duration — the same call Present makes from Suono's
 // measured onset. This is why nothing has to be measured at bake time: the estimate ships,
 // and the truth arrives with the audio.
 // SEEK PAST THE ENCODER'S LEADING SILENCE. A clip we encoded carries ~46 ms of it (LAME's
 // ENCDELAY+DECDELAY), and lamejs writes no gapless header, so no decoder trims it by itself.
 // Left in, audio starts after its own caption on every sentence and the tuned breath between
 // sentences grows ~28% — the same defect, on the recipient's copy, that made compression move
 // off the live reading path. The value is 0 for a clip that arrived already compressed.
 var lead=c.l||0;
 a.onloadedmetadata=function(){
  if(lead>0){try{a.currentTime=lead/1000;}catch(e){}}
  // Re-anchor to the clip's REAL SPEECH duration — the decoded length MINUS the silence we
  // just skipped, or the crawl is stretched across time the voice never occupies.
  if(cursor&&isFinite(a.duration)&&a.duration>0){cursor.align(k,cueOnset,Math.max(1,a.duration*1000-lead));}
 };
 a.onplaying=function(){startCrawlLoop();};
 // A clip that will not decode is not a reason to strand the deck — take its estimated
 // time and move on, exactly as a missing clip does.
 a.onerror=function(){clearBeat();beatT=setTimeout(after,Math.max(300,c.d||900));};
 a.src=c.a;
 // play() settles ASYNCHRONOUSLY. Re-src'ing before the previous promise settles rejects it
 // with AbortError, and an identity-less handler would then tear down the state of the cue
 // that REPLACED it — leaving the button reading "Play" and the caption blank while the audio
 // kept running (a double-click on Play was enough). Stamp the generation and ignore a
 // rejection that belongs to a cue we have already moved past. A rejection that IS current
 // means autoplay was refused, so stop the audio too rather than only the bookkeeping.
 var g=++gen;
 var pr=a.play();
 if(pr&&pr.catch)pr.catch(function(){if(g!==gen)return;setPlaying(false);stopAudio();clearCaption();});
}
function endSlide(){
 clearCaption();
 if(t.index>=slides.length-1){setPlaying(false);return;}
 // Advance FIRST, then hold on the slide that arrived, then speak.
 autoNav=true;t.next();autoNav=false;
 var hold=isSection(t.index)?NAR_BEAT.section:NAR_BEAT.slide;
 clearBeat();beatT=setTimeout(function(){if(narPlaying)speakSlide(t.index);},hold);}
// Narration belongs to Present, and the guard has to run on the way IN as well as out: the
// play control lives in the bar, which is a SIBLING of the view container rather than a
// descendant, so no view-scoped CSS rule can reach it. Starting narration from Read-Article
// otherwise read the deck aloud with the caption band hidden while the invisible transport
// advanced the slides underneath.
function toggleNarration(){if(view!=='present')return;
 if(narPlaying){setPlaying(false);stopAudio();clearCaption();}
 else{setPlaying(true);speakSlide(t.index);}}
if(playBtn)playBtn.onclick=toggleNarration;
// Manual navigation mid-delivery re-anchors on the slide the viewer chose — they moved the
// deck, so the narration follows them. Two things must NOT re-anchor:
//   · our OWN advance (the autoNav guard), or the slide would start twice; and
//   · a navigation that did not actually move. createTransport fires onShow even for a
//     clamped edge no-op, deliberately, so chrome stays in sync — but pressing Right on the
//     last slide is the most natural "is it over?" gesture there is, and it restarted that
//     slide's narration from the top. Comparing against the slide we are anchored on tells a
//     real move from a no-op; nothing else can.
onSlideShown=function(i){if(narPlaying&&!autoNav){if(i!==spokeSlide)speakSlide(i);}else if(!narPlaying)clearCaption();};
// Leaving Present stops the audio rather than letting a disembodied voice read over the
// article view, and takes the play control with it so it cannot be started from there.
onViewChanged=function(v){if(playBtn)playBtn.style.display=v==='present'?'':'none';
 if(v!=='present'&&narPlaying){setPlaying(false);stopAudio();clearCaption();}};
`;
}

/**
 * The reader-view switcher, as source for the player's one hashed `<script>`.
 *
 * The whole state machine is "recompute `slides` and `frames` from an index list, then
 * re-render" — every other surface follows for free, because they all read those two
 * arrays: the transport's bounds (`count` is a live function when this is emitted), the
 * "3 / 9" counter, the prev/next disabled state, the notes panel, and Read·Slides' column.
 * Read·Article is the one surface that does not, so its prose and its table of contents
 * carry `data-lp-i` and are toggled here directly.
 *
 * `lp-active` IS CLEARED ON EVERY FRAME, not just the visible ones, and that is not
 * defensive tidying. Present shows `.lp-frame.lp-active{display:block}`, a far more
 * specific rule than the UA sheet's `[hidden]{display:none}` — so a frame that was active
 * when the reader switched away would keep showing THROUGH `hidden`, which is precisely a
 * slide from the view they just left.
 *
 * ES5 (`var`, no arrow functions, no template literals) to match the rest of this script:
 * it ships to whatever browser a recipient double-clicks the file in.
 */
function lensScript(views) {
	// Only id/label/indices reach the file — a view's approval hash and its `hidden`/`kind`
	// flags are authoring state, and one of them names views the reader was NOT given.
	// scriptJson, NOT JSON.stringify: a reader-view LABEL is author text and reaches this
	// element verbatim. See scriptJson's docblock for the export this broke.
	const data = scriptJson(views.map((v) => ({ id: v.id, label: v.label, i: v.indices })));
	return `var LENS_VIEWS=${data};
var lensId=LENS_VIEWS[0].id;
// ROOTED AT THE STAGE, and keyed on the frame's own STAMP rather than its position.
// Two reasons, both measured. (1) Several frames can share one authored index once
// auto-split has divided a slide, so position is not identity. (2) \`.lp-frame\` is a
// plain class and a slide can carry one in its own markup — DOMPurify keeps \`class\`
// and \`data-*\` — so a \`document\`-rooted query lets author content join the list the
// switcher walks, which shifted every later frame by one and put a non-member on screen.
// An unstamped frame has no authored index and is therefore never a member: it stays
// hidden in every view, which is the fail-CLOSED end of that.
var lensStage=lpEl('lp-stage');
var allFrames=lensStage?[].slice.call(lensStage.querySelectorAll(':scope > .lp-frame')):[];
var allSlides=allFrames.map(function(f){return f.querySelector('section[data-lattice-slide]');});
var lensBtns=lpBar?[].slice.call(lpBar.querySelectorAll('[data-lp-lens]')):[];
// ROOTED AT THE RESOLVED ELEMENTS, never at \`document\` — the rule the CHROME map above
// exists to enforce (#1462 item 3). Article and TOC content is DERIVED FROM THE DECK, so a
// slide can emit \`id="lp-article"\` of its own; a \`document.querySelector('#lp-article')\`
// would then hand this switcher a node the author of the deck controls, and a forged
// \`data-lp-i\` inside it would put a slide of the reader's view under someone else's
// control of what is shown.
var lensArtEl=lpEl('lp-article'),lensTocEl=lpEl('lp-toc');
var lensArt=lensArtEl?[].slice.call(lensArtEl.querySelectorAll('[data-lp-i]')):[];
var lensToc=lensTocEl?[].slice.call(lensTocEl.querySelectorAll('a[data-lp-i]')):[];
var lensSr=lpEl('lp-lens-sr');
function setLens(id){
 var v=null,k;for(k=0;k<LENS_VIEWS.length;k++)if(LENS_VIEWS[k].id===id)v=LENS_VIEWS[k];
 if(!v)return;lensId=id;
 var mem={};for(k=0;k<v.i.length;k++)mem[v.i[k]]=1;
 slides=[];frames=[];
 for(k=0;k<allFrames.length;k++){
  var at=allFrames[k].getAttribute('data-lp-i');
  var on=at!==null&&!!mem[at];
  allFrames[k].classList.remove('lp-active');
  allFrames[k].hidden=!on;
  if(on){slides.push(allSlides[k]);frames.push(allFrames[k]);}
 }
 for(k=0;k<lensArt.length;k++)lensArt[k].hidden=!mem[lensArt[k].getAttribute('data-lp-i')];
 for(k=0;k<lensToc.length;k++)lensToc[k].hidden=!mem[lensToc[k].getAttribute('data-lp-i')];
 for(k=0;k<lensBtns.length;k++)lensBtns[k].setAttribute('aria-pressed',lensBtns[k].getAttribute('data-lp-lens')===id);
 // Announce the switch: the slide count changed under the reader and the counter alone is
 // aria-hidden decoration, so a screen-reader user would otherwise get silence.
 if(lensSr)lensSr.textContent=v.label+' — '+slides.length+' slide'+(slides.length===1?'':'s');
 t.go(0);fitRead();
}
for(var lb=0;lb<lensBtns.length;lb++)lensBtns[lb].onclick=(function(b){return function(){setLens(b.getAttribute('data-lp-lens'));};})(lensBtns[lb]);
setLens(lensId);
`;
}

/** The single inline player script (hashed by the CSP). Pure DOM transport.
 *  @param {string} [animaJs] the pre-bundled Anima host+backends IIFE, appended (and the
 *   scenes hydrated) only when the deck carries a live scene — same <script>, so the sha256
 *   CSP hash covers it. Empty → a scene-less export stays byte-identical (the golden holds).
 *  @param {{slide:number, section:number}|null} [beats] the deck's resolved pace, when the
 *   deck ships baked narration. Null → not one byte of the narration transport (nor its two
 *   hook call sites) is emitted, so a deck without audio is byte-identical to before it
 *   existed — including every deck the CLI exports, which has no clip store to bake from.
 *  @param {{id:string,label:string,indices:number[]}[]|null} [lensViews] the READER VIEWS this
 *   file carries, when the author exported more than one. Null or a single view emits nothing —
 *   so every deck without a carrier keeps the script it has, to the byte. */
export async function playerJs(animaJs = '', beats = null, captions = !!beats, canvas = PLAYER_CANVAS, chart = null, lensViews = null) {
	// The reader-view switcher, emitted ONLY for a multi-view carrier.
	//
	// WHY THE PLAYER CARRIES A BAKED MAP AND NOT LENTE. Eligibility — approved, not hidden,
	// not empty, and a content hash that still matches — is settled at BAKE time, against the
	// deck as it was when the author exported it. The bytes in this file are frozen, so
	// nothing here can drift and there is nothing left to re-check; shipping the read path to
	// re-derive a membership that cannot change would be a few hundred bytes of index list
	// traded for a library. The refusal already happened, in the exporter, before the file
	// existed (lib/core/lens-export.mjs).
	//
	// IT HIDES, IT DOES NOT WITHHOLD — and the distinction is the same one the 2026-07-18
	// correction makes about the Studio. Every slide in this file is in this file: switching
	// views is `hidden` on frames and prose, so a reader who opens the source sees all of
	// them. What the EXPORT withheld is everything outside the union of the views it carries,
	// which is a real reduction and the one this artifact can honestly claim.
	const lensJs = Array.isArray(lensViews) && lensViews.length > 1 ? lensScript(lensViews) : '';
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
	// The caption cursor, shared VERBATIM with the Studio (docs/src/lib/cadenza/cursor.ts) —
	// the same `at()` / `align()` that drive Present's teleprompter. Inlined for the same
	// reason the transport is: this script is CSP-hashed and cannot import. `makeCursor` is
	// self-contained by contract, pinned by test/unit/export/inlinable-kernels.test.js, which
	// evaluates it in an empty scope exactly as this line does.
	// Loaded and inlined ONLY for a deck that ships narration. A silent export has no caption
	// crawl to drive, and must stay byte-identical to what it was before this feature existed —
	// which the frozen-artifact golden enforces, and which caught this line the first time it
	// was written unconditionally. Keyed on CAPTIONS rather than on narration: an audio-only
	// export has a delivery but no crawl, and the only code that reaches `makeCursor` is
	// itself guarded on the caption band existing (narrationJs › speakSlide).
	const capKernel = captions ? `var makeCursor=${(await import('@workwel/cadenza')).makeCursor.toString()};\n` : '';
	const kernel =
		capKernel +
		`var PRESENT_KEYMAP=${JSON.stringify(PRESENT_KEYMAP)};\n` +
		`var keyAction=${keyAction.toString()};\n` +
		`var fitScale=${fitScale.toString()};\n` +
		`var createTransport=${createTransport.toString()};\n` +
		`var swipeAction=${swipeAction.toString()};`;
	// The two seams the narration transport hangs off. Emitted (declaration AND call sites)
	// only for a deck that ships audio, so a silent deck's script is unchanged to the byte.
	const narDecl = beats ? 'var onSlideShown=null,onViewChanged=null;\n' : '';
	const narShown = beats ? '\n if(onSlideShown)onSlideShown(i);' : '';
	const narView = beats ? '\n if(onViewChanged)onViewChanged(v);' : '';
	let js = `(function(){
${kernel}
${narDecl}var root=document.documentElement,app=document.querySelector('body > #lp-app');
if(!app)return;
// ---- resolving the player's OWN chrome ---------------------------------------------
// THE DOCUMENT BODY IS DECK CONTENT. The engine renders authored HTML and \`id\` survives
// sanitization, so a slide can carry an element with any id it likes — including these. A
// bare getElementById then hands the transport whichever one comes first in tree order, and
// every chrome node below is emitted AFTER the slides, so the deck's element wins.
//
// Observed on a real exported artifact: a slide containing an element with id="lp-next" left
// the shipped player's Next button with no handler at all. Keyboard nav still worked, so the
// deck looked fine until someone clicked the control.
//
// SCOPING THE SELECTOR IS NOT ENOUGH — it must be ROOTED. The first version of this fix used
// document.querySelector('#lp-app > #lp-nav > #lp-next') and argued the child combinator was
// "a boundary a deck structurally cannot reach across". That was wrong, and the adversarial
// trio broke it before merge: a descendant selector matches ANY such chain, so a slide that
// builds its OWN <div id="lp-app"><div id="lp-nav"><button id="lp-next"> reproduces the whole
// path. Since every chrome node below #lp-stage is emitted AFTER the slides, the forged chain
// wins document order and the real Next button ends up with no handler — verbatim the bug
// being fixed. Eleven of the seventeen entries fell to it, and so did the transport bar's
// narration controls, which had been "scoped" this way since #1393.
//
// What actually holds is an ANCHOR: 'body > #lp-app' and 'body > #lp-bar' are unreachable from
// inside a slide, because a slide is a descendant of #lp-stage and can never be a direct child
// of body. So resolve those two roots once, then query RELATIVE to them with :scope. A deck
// can still emit any id it likes; it just can no longer be found by a lookup that starts from
// a node it does not control. (#1462 item 3.)
//
// Article and TOC content is DERIVED from the deck, so it can carry forged ids too — which is
// why #lp-article and #lp-toc are resolved through #lp-doc rather than by id, and why the
// two collection queries below are rooted at the resolved element, never at \`document\`.
var CHROME={'lp-stage':[0,':scope > #lp-stage'],'lp-nav':[0,':scope > #lp-nav'],'lp-prev':[0,':scope > #lp-nav > #lp-prev'],'lp-next':[0,':scope > #lp-nav > #lp-next'],'lp-read-nav':[0,':scope > #lp-read-nav'],'lp-top':[0,':scope > #lp-read-nav > #lp-top'],'lp-bottom':[0,':scope > #lp-read-nav > #lp-bottom'],'lp-notes':[0,':scope > #lp-notes'],'lp-notes-body':[0,':scope > #lp-notes > #lp-notes-body'],'lp-doc':[0,':scope > #lp-doc'],'lp-toc':[0,':scope > #lp-doc > #lp-toc'],'lp-article':[0,':scope > #lp-doc > #lp-article'],'lp-count':[1,':scope > #lp-count'],'lp-count-sr':[1,':scope > #lp-count-sr']${lensJs ? `,'lp-lens-sr':[1,':scope > #lp-lens-sr']` : ''},'lp-notes-btn':[1,':scope > #lp-notes-btn'],'lp-full':[1,':scope > #lp-full'],'lp-mode':[1,':scope > #lp-mode']};
var lpBar=document.querySelector('body > #lp-bar');
function lpEl(id){var e=CHROME[id];if(!e)return null;var r=e[0]?lpBar:app;return r?r.querySelector(e[1]):null;}
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
var count=lpEl('lp-count'),countSr=lpEl('lp-count-sr'),view='present';
var prevBtn=lpEl('lp-prev'),nextBtn=lpEl('lp-next');
var t=createTransport({count:${lensJs ? 'function(){return slides.length;}' : 'slides.length'},onShow:render});
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
 var st=lpEl('lp-stage');if(!st)return;
 root.style.setProperty('--lp-fit-present',fitScale({stageW:st.clientWidth,stageH:st.clientHeight,slideW:${canvas.w},slideH:${canvas.h},insetX:40,insetY:40}));}
// READ·SLIDES fit: size each slide to the SAME footprint Present uses — fitScale over the
// visible stage box with the same 40px inset — so the first slide is IDENTICAL between the
// two tabs (a seamless switch, no jump) and each slide fills the viewport with the next
// PEEKING below (the scroll hint). Was: fill-the-width (clientWidth-32)/1280, which ran the
// slide edge-to-edge and clipped its bottom on a wide/tall viewport. The CSS default (.28)
// still covers the first paint + the no-JS floor.
function fitRead(){var st=lpEl('lp-stage');if(!st)return;
 // Fit into ~86% of the visible stage HEIGHT (with a 40px side inset) — nearly Present-sized,
 // but the reserved ~14% guarantees the NEXT slide peeks below the fold on every viewport,
 // not just sits at the exact edge. Width stays the constraint on a narrow/portrait screen.
 root.style.setProperty('--lp-fit',fitScale({stageW:st.clientWidth,stageH:st.clientHeight*0.86,slideW:${canvas.w},slideH:${canvas.h},insetX:40,insetY:0}));}
function render(){var i=t.index;frames.forEach(function(f,n){f.classList.toggle('lp-active',n===i);});
 // The VISIBLE text stays the compact "2 / 7" the design wants; the accessible
 // name spells it out, because a screen reader announcing a bare "2 / 7" gives a
 // braille or eyes-free user no idea what the two numbers are (gap G3). aria-label
 // wins over text content for the name, so the two can differ deliberately.
 // The VISIBLE counter is decoration ("2 / 7") and is aria-hidden; a separate sr-only
 // live region carries the words. The previous shape put aria-label on a bare span,
 // whose implicit role is generic — where ARIA PROHIBITS aria-label (axe:
 // aria-prohibited-attr). Chromium honored it, but a live region announces its
 // changed TEXT, not its name, so a screen reader actually got "2 / 7" anyway.
 // This is the pattern the Studio's cinema view already uses.
 if(count)count.textContent=(i+1)+' / '+slides.length;
 if(countSr)countSr.textContent='Slide '+(i+1)+' of '+slides.length;
 if(prevBtn)prevBtn.disabled=i===0;
 if(nextBtn)nextBtn.disabled=i===slides.length-1;
 fit();syncNotes();${narShown}}
function setView(v){view=v;app.setAttribute('data-lp-view',v);
 [].forEach.call((lpBar?lpBar.querySelectorAll(':scope > .lp-seg > [data-lp-btn]'):[]),function(b){b.setAttribute('aria-pressed',b.getAttribute('data-lp-btn')===v);});
 // Both present and read-slides scale the section via a view-scoped CSS transform
 // (var(--lp-fit-present) / var(--lp-fit)), so switching views just re-applies the
 // right rule — no inline transform to clear.
 if(v==='read-slides'){fitRead();revealReadNav();}else hideReadNav();
 if(count)count.style.visibility=v==='present'?'visible':'hidden';if(v==='present')render();${narView}}
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
//
// COUNT THE FINGERS FIRST (#1558). swipeAction measures one start point against one end
// point and cannot know how many contacts the gesture held. Unguarded, a two-finger PINCH
// read as the strongest possible swipe — the second finger's pointerdown overwrote sx/sy, so
// the first finger's pointerup was measured against the OTHER finger's start: a dx of roughly
// the whole inter-finger span, well past the 45px threshold and perfectly horizontal. The
// rule is the kernel's (createZoomGesture, 2026-08-10-preview-pinch-zoom.md): a gesture that
// ever held 2+ pointers is a pinch and is never a swipe, until the LAST pointer lifts. Stated
// here rather than inlining that gesture machine: 5.9KB of source, 23% of this whole script,
// to read two of its nine methods in a player with no zoom to drive. Giving the player zoom is
// the sequel, and is what earns those bytes.
//
// COUNT THEM ON THE WINDOW, NOT THE STAGE. The first cut of this fix tracked only pointers
// whose pointerdown hit #lp-stage, mirroring the Studio's targetTouches. That rationale does
// NOT transfer: the Studio's preview is one pane among several, so pane-scoped counting keeps
// a thumb parked on the editor from killing navigation — but the player's stage is the whole
// screen minus its own 119px of chrome (#lp-bar above, #lp-nav below). A pinch with one finger
// on either strip counted ONE contact and turned the deck, verbatim the defect being fixed;
// measured on the real artifact at 390/820/1440, an ordinary bottom-of-screen pinch straddling
// the nav row moved slide 4 to 3. The window is the honest set here, and it makes the rule the
// kernel's without a region caveat. Its cost is real and deliberate: a second contact anywhere
// — a supporting thumb — declines the swipe for as long as it rests. That is STRICTER than
// Present, which reads targetTouches and so ignores a contact on its own rail or arrows; an
// earlier version of this note claimed the two matched, and they do not. The narrower rule was
// tried here and failed: with the stage as the set, a pinch straddling the nav row still turned
// the deck. Telling a resting thumb from a pinch needs relative motion between contacts, which
// belongs in the kernel for both surfaces rather than in a restatement here.
//
// The release is on the window too (a contact can end anywhere, and a leaked id would latch
// the flag and kill every later swipe), and pointercancel beside it because a palm rejection
// or a system gesture ends a contact with no pointerup at all. Neither is enough on its own:
// e.isPrimary is the UA telling us it has no other live contact of that type, so a primary
// press is the start of a fresh gesture and we adopt the browser's truth over our own list.
// That is what makes the guard self-healing against a release nobody enumerated — the property
// the kernel gets for free by being handed the live contact list on every event, and the one
// this local restatement would otherwise lack.
//
// The stage's own listeners run first (bubble phase, and it is on the path to the window), so
// the stage sees the flags as they were BEFORE this contact joined — which is what lets the
// second finger of a pinch still be recorded rather than measured.
//
// ONE guard, on the measuring line — deliberately, after an earlier shape had three overlapping
// ones. That version cleared sw from the counting listener AND read pinch in both stage
// handlers, so no single deletion changed any behavior: each was covered by the others, a
// mutation test could not kill any of them individually, and a comment describing them as
// redundant invited exactly the deletion that later turned out to be unsafe. Overlapping
// guards are not defense in depth when nothing can tell you which one is holding.
//
// So: the counting listener owns pinch and nothing else, the stage records where a press
// started, and the single read below decides. Delete it and the pinch tests fail. sw means only
// "a press began on the stage"; pinch means "this gesture is disqualified".
// A contact is keyed by TYPE AND ID, and the re-sync only drops its own type. isPrimary is
// per pointer type, not global — a mouse press is always primary, and a pen press is primary
// for pen while fingers are live — so a type-blind wipe emptied the list mid-pinch. Measured:
// a stationary mouse click with one finger resting turned the deck BACKWARD, and a live
// two-finger pinch plus a stray pen tap plus a third finger turned it with three contacts on
// the glass. Both were refused before the re-sync existed: a self-heal that resurrects the
// cross-contact arithmetic this whole change is about is not a heal.
//
// The re-sync also clears pinch, and the stage lets a PRIMARY press arm a swipe even while
// pinch is set. Without both, a gesture whose release the platform ate left pinch true with no
// contact able to clear it, and the stage — which runs first — refused the next swipe before
// the window listener could re-sync. The guard healed one gesture LATE: swipe one swallowed,
// swipe two fine. Silent, and the cell named for the property could not fail for it.
var stage=lpEl('lp-stage'),sx=0,sy=0,sw=false,pts=[],pinch=false;
if(stage){
 var ptKey=function(e){return e.pointerType+'#'+e.pointerId;};
 var ptSettle=function(){if(!pts.length){pinch=false;sw=false;}};
 var ptDrop=function(e){var i=pts.indexOf(ptKey(e));if(i>=0)pts.splice(i,1);ptSettle();};
 addEventListener('pointerdown',function(e){
  // Only pinch is cleared here, never sw: the stage's own handler has already run for THIS
  // press and may have legitimately armed a swipe, and clearing it would eat the gesture.
  if(e.isPrimary){var p=e.pointerType+'#';for(var j=pts.length-1;j>=0;j--)if(pts[j].indexOf(p)===0)pts.splice(j,1);if(!pts.length)pinch=false;}
  if(pts.indexOf(ptKey(e))<0)pts.push(ptKey(e));
  if(pts.length>1)pinch=true;},{passive:true});
 addEventListener('pointerup',ptDrop,{passive:true});addEventListener('pointercancel',ptDrop,{passive:true});
 stage.addEventListener('pointerdown',function(e){if(view!=='present')return;
  sx=e.clientX;sy=e.clientY;sw=true;},{passive:true});
 stage.addEventListener('pointerup',function(e){if(!sw||pinch||view!=='present')return;
  var a=swipeAction({dx:e.clientX-sx,dy:e.clientY-sy});if(a)t[a]();},{passive:true});}
// READ·SLIDES Home/End — an AUTO-REVEALING scroll control. Smooth-scroll to the first /
// last slide (instant under prefers-reduced-motion; older engines jump, still correct).
var topBtn=lpEl('lp-top'),bottomBtn=lpEl('lp-bottom');
var readNav=lpEl('lp-read-nav');
var reduceMotion=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
function scrollStage(to){var st=lpEl('lp-stage');if(!st)return;
 try{st.scrollTo({top:to,behavior:reduceMotion?'auto':'smooth'});}catch(e){st.scrollTop=to;}}
if(topBtn)topBtn.onclick=function(){scrollStage(0);};
if(bottomBtn)bottomBtn.onclick=function(){var st=lpEl('lp-stage');if(st)scrollStage(st.scrollHeight);};
// Directional: a button hides (the hidden attribute) when its edge is already reached.
// Returns whether ANYTHING is scrollable — a short deck that fits never shows the control.
var navIdle=null,navEngaged=false;
function readNavDir(){var st=lpEl('lp-stage');if(!st)return false;
 var max=st.scrollHeight-st.clientHeight;var atTop=st.scrollTop<=4,atBottom=st.scrollTop>=max-4;
 if(topBtn){if(atTop)topBtn.setAttribute('hidden','');else topBtn.removeAttribute('hidden');}
 if(bottomBtn){if(atBottom)bottomBtn.setAttribute('hidden','');else bottomBtn.removeAttribute('hidden');}
 return max>4;}
function hideReadNav(){if(readNav)readNav.classList.remove('lp-show');}
// Reveal on intent; idle-hide after 1.5s unless the pointer/focus is engaged with it.
function revealReadNav(){if(!readNav||view!=='read-slides')return;
 if(!readNavDir()){hideReadNav();return;}
 readNav.classList.add('lp-show');
 if(navIdle)clearTimeout(navIdle);if(!navEngaged)navIdle=setTimeout(hideReadNav,1500);}
if(readNav){
 var rStage=lpEl('lp-stage');
 if(rStage){
  rStage.addEventListener('scroll',revealReadNav,{passive:true});
  // iOS / in-app WebKit coalesces (and during momentum defers) the overflow container's
  // scroll event, so a touch-drag scrolls the deck without firing it — the reveal never
  // triggered on mobile (desktop masks this via the wheel + pointer paths). touchstart /
  // touchmove fire reliably throughout the gesture; touchstart also doubles as the universal
  // tap-to-summon-controls affordance, so a plain tap brings the buttons back.
  rStage.addEventListener('touchstart',revealReadNav,{passive:true});
  rStage.addEventListener('touchmove',revealReadNav,{passive:true});
 }
 // Keep it up while the pointer is over it / it holds focus, so it never vanishes mid-reach.
 readNav.addEventListener('pointerenter',function(){navEngaged=true;if(navIdle)clearTimeout(navIdle);if(view==='read-slides'&&readNavDir())readNav.classList.add('lp-show');});
 readNav.addEventListener('pointerleave',function(){navEngaged=false;if(navIdle)clearTimeout(navIdle);navIdle=setTimeout(hideReadNav,1500);});
 readNav.addEventListener('focusin',function(){navEngaged=true;if(navIdle)clearTimeout(navIdle);if(view==='read-slides'&&readNavDir())readNav.classList.add('lp-show');});
 readNav.addEventListener('focusout',function(){navEngaged=false;if(navIdle)clearTimeout(navIdle);navIdle=setTimeout(hideReadNav,1500);});
}
// PRESENT mouse wheel / trackpad — advance or reverse one slide on a decisive wheel notch,
// debounced so one gesture = one slide (a trackpad fires a burst). Present has no native
// scroll (the stage is a fixed centered box), so this is the desktop analog of swipe;
// keyboard ←/→ + the buttons already work. Read·Slides scrolls natively, so it's untouched.
// A TRACKPAD PINCH IS A PINCH (#1558). Chromium, WebKit and Gecko all deliver one as a
// wheel event with ctrlKey set — there is no touch involved and no second pointer to count,
// so the finger-counting guard above cannot see it. Unfiltered, this handler read that as a
// decisive notch and turned the slide, then called preventDefault so the browser's own zoom
// could not happen either: on every laptop, the same wrong-thing-instead-of-the-right-thing
// the touch half had. Measured on the real artifact at 1440 and 390 — pinch out on slide 3
// landed on slide 2. #1555 fixed exactly this arm for the Studio (preview-zoom.ts reads
// ctrlKey || metaKey); the player never got the line, and a doc sentence claiming it had no
// wheel at all is what kept anyone from looking.
//
// Returning WITHOUT preventDefault is the point: the gesture goes back to the browser, which
// zooms the page. So a desktop reader gets real zoom out of this, which is the one verb the
// player still owes on touch (#1578).
var wheelBusy=false;
addEventListener('wheel',function(e){if(view!=='present')return;
 if(e.ctrlKey||e.metaKey)return;
 if(wheelBusy)return;
 var d=Math.abs(e.deltaY)>=Math.abs(e.deltaX)?e.deltaY:e.deltaX;if(Math.abs(d)<8)return;
 wheelBusy=true;setTimeout(function(){wheelBusy=false;},350);
 t[d>0?'next':'prev']();e.preventDefault();},{passive:false});
// Fullscreen toggle — present from the file to a room. iOS/iPadOS Safari has
// historically shipped NO Fullscreen API for arbitrary elements (only native
// video), so a click there would silently no-op forever, reading as "broken."
// Feature-detect up front and hide the button entirely when neither the
// standard nor -webkit- entry point exists, rather than leaving a dead affordance.
var full=lpEl('lp-full');
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
var notesBtn=lpEl('lp-notes-btn'),notesPanel=lpEl('lp-notes'),notesBody=lpEl('lp-notes-body');
var hasNotes=!!document.querySelector('aside.lattice-notes');
// No notes ⇒ no notes AFFORDANCE: button, panel and the 'n' key go together. Hiding only
// the button left 'n' still sliding the sheet up to read "No notes for this slide." — which
// under --strip-notes advertises what the flag just removed (#1833).
if(!hasNotes){if(notesBtn)notesBtn.style.display='none';if(notesPanel)notesPanel.style.display='none';}
function syncNotes(){if(!notesBody||!notesPanel||!notesPanel.classList.contains('lp-open'))return;
 var s=slides[t.index],a=s&&s.querySelector('aside.lattice-notes');
 notesBody.textContent=a?a.textContent:'';notesPanel.setAttribute('data-empty',a?'false':'true');}
function toggleNotes(){if(!hasNotes||!notesPanel)return;var open=notesPanel.classList.toggle('lp-open');
 if(notesBtn)notesBtn.setAttribute('aria-pressed',open);syncNotes();}
if(notesBtn)notesBtn.onclick=toggleNotes;
addEventListener('keydown',function(e){if(view!=='present'||!hasNotes)return;if(e.key==='n'||e.key==='N'){toggleNotes();e.preventDefault();}});
[].forEach.call((lpBar?lpBar.querySelectorAll(':scope > .lp-seg > [data-lp-btn]'):[]),function(b){b.onclick=function(){setView(b.getAttribute('data-lp-btn'));};});${lensJs ? `\n${lensJs}` : ''}
// Dark/light toggle. Driven by a data-lp-scheme attribute the export's CSS keys on
// (themeDualMode resolves the theme's light-dark() pairs into a light base + an
// explicit dark override at export time), NOT by the CSS light-dark() function —
// which older in-app WebKit lacks, the whole reason the toggle used to do nothing
// there. The icon SWAPS (not a text glyph) so the button's box size never shifts —
// both icons share the same fixed width/height.
var MOON_ICON='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
var SUN_ICON='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
var mode=lpEl('lp-mode');
// Dark/light is driven by the data-lp-scheme ATTRIBUTE on <html>, which the export BAKES
// to the mode the deck was AUTHORED for (light / dark / system) and the CSS keys on with
// plain attribute selectors + literal values (themeDualMode; all pre-2016 WebKit). The
// DEFAULT is the sender's choice — never the receiver's OS, UNLESS the sender picked
// 'system', in which case the effective mode follows matchMedia. The toggle overrides for
// this viewer by flipping to a concrete light/dark. color-scheme is set alongside
// (cross-engine-safe setProperty) so native controls match. Icon swaps a fixed-size glyph.
var sysDark=function(){return !!(window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches);};
var baked=root.getAttribute('data-lp-scheme');
// A 'system' export LIVE-FOLLOWS the receiver's OS until the viewer toggles; a pinned
// light/dark export never follows. Effective dark = pinned dark, OR (following AND OS-dark).
var following=baked==='system';
var isDark=baked==='dark'||(following&&sysDark());
// The deck-wide color mode, as a CLASS the toggle owns. A deck-wide dark mode is not a
// token swap: the engine stamps the class dark on every section, and section.dark is what
// pins the slide's scheme AND paints its canvas. So re-theming a pinned deck is not a
// matter of re-resolving 500 tokens; it is adding and removing one class. Take it off and
// the deck renders exactly as if it had never been authored dark - bookends back to the
// inverse panel, content slides light, the spectrum ribbon back - a design that already
// exists. Leaving it on while the chrome went light is what produced the dark-slide-on-a-
// white-page state that reads as a broken download.
//
// Only a DECK-WIDE mode is managed here (stamped by the export from the deck's own front
// matter). A one-off per-slide dark accent inside a light deck is a design choice, not a
// color mode, and keeps its class in both schemes - the token pins in the dark block hold
// it.
var deckMode=root.getAttribute('data-lp-deck-mode')||'';
// A slide that PINS THE OPPOSITE scheme is never restamped. The deck-wide class is a
// default, and a per-slide pin outranks it by design - stamping the dark class onto a slide
// the author marked light contradicts the very thing the pin is for.
//
// The damage is not theoretical and does not need the toggle: the token rules restore the
// light VALUES on such a slide (canvas goes white, correctly), but every CLASS-keyed engine
// rule still fires, and section.dark ... {color:var(--on-dark-secondary)} paints an eyebrow
// with a constant that has no light/dark pair - so nothing in the dual-mode block can undo
// it. Measured on examples/mermaid-diagram-surface.md slide 4, whose own headline is "A
// slide that pins light still renders light": white on white, 1.0:1, in the file's DEFAULT
// state. That is the same white-on-white this whole change exists to remove, reintroduced
// through a class instead of a token.
function pinsOpposite(el){
 if(deckMode==='dark')return el.classList.contains('light')||el.classList.contains('color-light');
 return el.classList.contains('dark');}
function applyDeckMode(){if(!deckMode)return;
 var want=(deckMode==='dark')===isDark;
 for(var i=0;i<slides.length;i++){
  if(pinsOpposite(slides[i]))continue;
  slides[i].classList[want?'add':'remove'](deckMode);}}
function applyScheme(){root.setAttribute('data-lp-scheme',isDark?'dark':'light');
 root.style.setProperty('color-scheme',isDark?'dark':'light');
 applyDeckMode();
 if(mode)mode.innerHTML=isDark?SUN_ICON:MOON_ICON;}
// ALWAYS stamp a CONCRETE data-lp-scheme (dark|light) at load — even for 'system' — so the
// dark tokens ride the reliable ATTRIBUTE selector, never the CSS media query. This is the
// crux of the on-device fix: the user's older in-app WebKit APPLIED matchMedia (JS saw dark)
// but did NOT apply @media(prefers-color-scheme:dark), so a media-gated system-dark would
// paint the LIGHT base while JS showed the sun icon — a contradiction no tap could fix. By
// driving the attribute from matchMedia here, content follows the same signal as the icon.
// The @media rule (themeDualMode) then serves only its true role: the NO-JS fallback.
applyScheme();
// While following, re-stamp on an OS change (guarded — old WebKit lacks addEventListener).
if(following&&window.matchMedia){try{matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(e){if(following){isDark=e.matches;applyScheme();}});}catch(e){}}
// A tap commits a concrete choice for this viewer and STOPS live-following.
if(mode)mode.onclick=function(){following=false;isDark=!isDark;applyScheme();};
var tocEl=lpEl('lp-toc');var links=tocEl?[].slice.call(tocEl.querySelectorAll('a')):[];
if(links.length&&window.IntersectionObserver){
 var toc=lpEl('lp-toc');
 // Keep the ACTIVE toc link visible inside the independently-scrolling rail — called on spy
 // changes AND on resize, so a reflow (window / breakout figure) never strands the highlight
 // off-screen in a long deck's TOC. block:'nearest' scrolls the rail minimally, not the page.
 function keepActiveTocVisible(){if(!toc)return;var on=toc.querySelector('a.lp-on');if(!on)return;
  var r=on.getBoundingClientRect(),tr=toc.getBoundingClientRect();
  if(r.top<tr.top||r.bottom>tr.bottom)on.scrollIntoView({block:'nearest'});}
 var spy=new IntersectionObserver(function(es){es.forEach(function(e){
  if(e.isIntersecting)links.forEach(function(l){l.classList.toggle('lp-on',l.getAttribute('href')==='#'+e.target.id);});});
  keepActiveTocVisible();},
  {rootMargin:'-48px 0px -70% 0px'});var artEl=lpEl('lp-article');if(artEl)[].forEach.call(artEl.querySelectorAll('[id^=lp-sec-]'),function(h){spy.observe(h);});
 // RESIZE SITTER — a ResizeObserver on the article scroll box re-syncs the TOC as the window,
 // rail, or a breakout figure reflows the layout. (IntersectionObserver already re-fires the
 // active-section spy on reflow; this keeps the rail's highlight in view and is the hook for
 // any resize-driven re-fit.)
 var lpdoc=lpEl('lp-doc');
 if(lpdoc&&window.ResizeObserver){var ro=new ResizeObserver(function(){keepActiveTocVisible();});ro.observe(lpdoc);}
}
${beats ? `${narrationJs(beats)}\n` : ''}setView('present');
}catch(e){if(root){root.className=root.className.replace(/(^|\\s)lp-js\\b/,'');}}
})();`;
	// A live scene: append the pre-bundled Anima host + backends (exposes window.__latticeAnima)
	// and hydrate. Non-eager, so its IntersectionObserver mounts a scene when its slide is shown
	// and pauses it when hidden — native here (the player is its OWN top-level document, not a
	// scaled iframe). In its own <script>, so the sha256 CSP hash below covers it; failure is
	// swallowed so a bad scene never strips .lp-js and kills the whole player.
	if (animaJs) {
		js += `\n${animaJs}\ntry{window.__latticeAnima&&window.__latticeAnima.hydrateScenes(document);}catch(e){}`;
	}
	// A live CHART: a SEPARATE bundle from the scene player above, and separate on purpose —
	// charts emit only `reveal`/`slide`, so they paint on `backends/marks.ts` and must not ship
	// the scene backends they cannot reach (22 KB against ~81 KB). The deck's three front-matter
	// motion scalars are baked in as data because an exported file has no front matter left to
	// read; the bundled `parseDeckMotion` interprets them, so the live surfaces and a forwarded
	// file cannot disagree about what the deck asked for.
	if (chart?.js) {
		// `</script>` MUST NOT survive into an inline script body. These three values are
		// author-controlled front-matter scalars, so a deck writing
		// `motion-style: "</script><h1>…"` would otherwise (a) render attacker markup in the
		// exported document and (b) truncate the script text so its sha256 CSP hash no longer
		// matches — which blocks the WHOLE player and hands every recipient a dead deck. The
		// escape is the same one `narrationBlocks` above and `lib/core/data-block.js` use;
		// this line is the reason to reach for it, not an optional tidy.
		const deck = JSON.stringify(chart.deck ?? { motion: null, style: null, speed: null }).replace(/</g, '\\u003c');
		js += `\n${chart.js}\ntry{window.__latticeAnimaCharts&&window.__latticeAnimaCharts.hydrate(document,${deck});}catch(e){}`;
	}
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
export async function buildArticle(doc, authoredPerPage = null) {
	const { projectDeckToProse } = await import('../transformers/prose-projection.mjs');
	const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
	const { articleHtml, toc } = projectDeckToProse(sections);
	const tocHtml = toc
		.map((t) => {
			const i = /^lp-sec-(\d+)$/.exec(t.id);
			// `lp-sec-N` counts RENDERED sections; a reader view's membership is a list of
			// AUTHORED slides. Auto-split makes those different numbers — see stampArticleParts.
			const authored = i && authoredPerPage ? authoredPerPage[Number(i[1])] : undefined;
			const stamp = authored === undefined ? '' : ` data-lp-i="${authored}"`;
			return `<a href="#${t.id}"${t.level === 2 ? ' class="lp-lvl2"' : ''}${stamp}>${escapeText(t.text)}</a>`;
		})
		.join('\n');
	return { article: authoredPerPage ? stampArticleParts(doc, articleHtml, authoredPerPage) : articleHtml, toc: tocHtml };
}

/**
 * Tag every top-level article element with the slide it came from — `data-lp-i` —
 * so a reader view can hide the prose of a slide it does not show.
 *
 * AN ATTRIBUTE, NOT A WRAPPER, and that is the whole design. `#lp-article` is a named
 * GRID: `#lp-article>*` places prose in the narrow column and
 * `#lp-article>.lp-figure` spans the wide one. Wrapping each slide's parts in a `<div>`
 * makes the figures grandchildren, so the wide-figure rule stops matching and the
 * article's entire prose/figure rhythm collapses. `display:contents` on such a wrapper
 * does not rescue it either — the wrapper is still what `#lp-article>*` selects, so the
 * real elements become auto-placed grid items with no column of their own. An attribute
 * changes no box at all.
 *
 * THE KICKER RIDES WITH THE HEADING BELOW IT. `projectDeckToProse` emits an optional
 * `<p class="lp-kicker">` BEFORE the `<h*>` that carries the slide's `lp-sec-N` id, so a
 * "belongs to the last id I saw" scan would file each kicker under the PREVIOUS slide and
 * leave one stranded, visible, above a hidden section. Elements before the first heading
 * are therefore attributed by LOOK-AHEAD, to the heading they precede. Pinned in
 * test/unit/export/lens-stamp.test.js, so a change to the emission order fails there
 * rather than showing a stray kicker in a shipped file.
 *
 * ONLY EMITTED FOR A MULTI-VIEW EXPORT. Every other deck's player is untouched, to the
 * byte — which is what keeps the frozen-artifact golden meaningful.
 */
function stampArticleParts(doc, articleHtml, authoredPerPage) {
	const host = doc.createElement('div');
	host.innerHTML = articleHtml;
	const kids = [...host.children];
	// Which elements ARE a slide heading, and which slide each names.
	const heading = kids.map((el) => (/^lp-sec-(\d+)$/.exec(el.id || '') || [])[1] ?? null);
	const first = heading.find((h) => h != null) ?? null;
	// Forward fill: an element belongs to the last heading at or before it. A body follows
	// its own heading, so this is the direction that gets a body right — a backwards walk
	// reads "the nearest heading AFTER me", which files every slide's body under the NEXT
	// slide and was wrong for all but the last one.
	const owner = [];
	let cur = first; // anything before the first heading belongs to the first slide
	for (let k = 0; k < kids.length; k++) {
		if (heading[k] != null) cur = heading[k];
		owner[k] = cur;
	}
	// …with one element going the other way: the kicker is emitted BEFORE the heading it
	// introduces, so the forward fill files it under the slide above. Re-attribute it.
	for (let k = 0; k < kids.length - 1; k++) {
		if (kids[k].classList.contains('lp-kicker') && heading[k + 1] != null) owner[k] = heading[k + 1];
	}
	// Translate RENDERED section number → AUTHORED slide before stamping. `lp-sec-N` is a
	// position in the post-split DOM; a view's membership is a list of AUTHORED slides, and
	// auto-split divides one authored slide into several sections — so on any deck it
	// touches the two spaces diverge and a stamp in the wrong one hides the wrong prose.
	for (let k = 0; k < kids.length; k++) {
		const authored = owner[k] == null ? undefined : authoredPerPage[Number(owner[k])];
		if (authored !== undefined) kids[k].setAttribute('data-lp-i', authored);
	}
	return host.innerHTML;
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
	// The reader views this file CARRIES. One view (or none) is not a carrier — it is an
	// ordinary player of an already-projected deck — so the switcher, the `data-lp-i`
	// stamps and the live region are all emitted only past two.
	const lensViews = Array.isArray(data.lensViews) && data.lensViews.length > 1 ? data.lensViews : null;
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
		// Read·Article overflow guard, injected ONLY with the KaTeX stylesheet (so a math-less
		// deck stays katex-free): a long display equation scrolls horizontally inside its figure
		// instead of forcing the page to overflow.
		const mathArticleCss =
			'#lp-article .lp-figure .katex-display{overflow-x:auto;overflow-y:hidden;max-width:100%;margin-inline:auto}';
		return `<style>${sanitizeStyleText(`${minifyCss(raw)}${mathArticleCss}`)}</style>`;
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
	// INLINE `light-dark()` next, BEFORE any slide is serialized — the frames below and
	// Read·Article both take their markup from this DOM, so a hoist that ran after them would
	// rewrite nothing that ships. It collapses each attribute to its light arm and hands back
	// the dark arms as scoped rules, which join the dark block below — so a gradient stop a
	// chart writes inline ends up under the player's attribute-keyed toggle instead of the
	// engine's idea of `color-scheme`.
	const inlineSchemeCss = hoistInlineLightDark(doc);
	// Each slide is wrapped in a plain `.lp-frame` div — author markup, not sanitized
	// content, so it's added AFTER the sanitize pass above. The frame lets present/read
	// scale the fixed canvas with `transform` (immune to the WebKit cqi+zoom
	// bug; see playerCss) while still packing the read-slides column tight: the wrapper
	// carries the SCALED footprint so flex `gap` spaces real boxes, not the section's
	// untransformed layout size.
	// THE INDEX SPACE A READER VIEW IS EXPRESSED IN — authored slides, not rendered pages.
	//
	// `lensViews[].indices` come from the projection (lib/core/lens-export.mjs), which counts
	// slides in the deck SOURCE. What reaches here is the RENDERED DOM, and auto-split has
	// already divided any slide that overflowed into several `<section>`s — on every deck
	// whose family is not `wide`, i.e. every portrait, square, story, reel and mobile deck.
	// Enumerating the sections therefore produces a DIFFERENT number for the same slide.
	//
	// That is not a hypothetical: measured on a 4-slide portrait deck that rendered as 14
	// sections, a `brief` reader was shown page 2 of a slide `brief` excludes, and two
	// authored slides were unreachable in every view. Fail-open, silently, on the one
	// property the feature exists to provide.
	//
	// `authoredIndexPerPage` is the repo's general answer to exactly this — its own docblock
	// says "the next index-keyed channel does not have to invent a third one" (speaker notes
	// and front-matter captions were the first two). This channel invented a third; it now
	// uses the shared one. Pages of one authored slide share an index, so they show and hide
	// together, which is what a reader means by "that slide".
	const authoredPerPage = lensViews
		? autoSplit
				.authoredIndexPerPage(
					[...doc.querySelectorAll('section[data-lattice-slide]')].map((el) => ({
						openTag: el.outerHTML.slice(0, el.outerHTML.indexOf('>') + 1),
					})),
				)
				.map((oneBased) => oneBased - 1)
		: null;
	const slidesHtml = [...doc.querySelectorAll('section[data-lattice-slide]')]
		// The frame carries `data-lp-i` ONLY in a carrier, so a single-view export's markup
		// does not move a byte. Position in this list is the slide index the baked view map
		// addresses — it is the same DOM order `buildArticle` walked one line above.
		.map((s, i) => `<div class="lp-frame"${authoredPerPage ? ` data-lp-i="${authoredPerPage[i]}"` : ''}>${s.outerHTML}</div>`)
		.join('\n');
	// Body-level a11y texture defs are engine-injected + author-unreachable today, but
	// sanitize them too so the two-layer model never degrades to CSP-only for any region.
	const a11yDefs = [...doc.querySelectorAll('body > svg')].map((s) => caps.sanitize(s.outerHTML)).join('\n');
	const { article, toc } = await buildArticle(doc, authoredPerPage);
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
	let darkOverrides = inlineSchemeCss;
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
					return `${open}${sanitizeStyleText(minifyCss(base))}${close}`;
				});
			}
			return out;
		})
		.join('\n');
	// IDENTIFIED, like the embedded-font block. This carries the whole token body once per
	// scheme scope, so it is not necessarily smaller than the PRUNED deck stylesheet beside
	// it — anything reasoning about "which block is the deck CSS" has to select by id rather
	// than by size (the integration prune gate did the latter, and this block overtook it).
	const darkStyle = darkOverrides ? `<style id="lattice-dual-mode">${sanitizeStyleText(minifyCss(darkOverrides))}</style>` : '';
	const lang = doc.documentElement.getAttribute('lang') || 'en';
	const title = data.title || doc.querySelector('title')?.textContent || 'Lattice deck';
	// The color mode the deck was AUTHORED for — 'light' | 'dark' | 'system' | 'inherited'
	// — baked onto <html> as the default so the player opens the way the sender chose
	// (document fidelity), correct even before the script runs and with no script at all.
	// 'dark' / 'light' pin the mode; 'system' defers to the receiver's OS (the CSS @media
	// rule). 'inherited' means "adopt the host" — but a standalone player HAS no host, so it
	// bakes as 'system' (follow the OS): the two are identical here, differing only when the
	// deck is embedded (the docs preview). The in-player toggle overrides for one viewer.
	// Source: Studio's export choice or the CLI's color-scheme (data.theme.mode); unknown → light.
	const rawScheme = data.theme?.mode || data.mode;
	const exportedScheme = rawScheme === 'dark' ? 'dark' : rawScheme === 'system' || rawScheme === 'inherited' ? 'system' : 'light';

	// The deck's own DECK-WIDE color mode, as the class the engine stamps on every section
	// (`lib/core/resolve-color-mode.js`: `dark` → `dark`, `light` → `color-light`). The player
	// hands this to the toggle, which adds and removes it so a pinned deck actually re-themes
	// instead of leaving a dark slide marooned on a light page.
	//
	// ONLY the two PINNING modes are managed. `system` and `inherited` defer by design — they
	// resolve from `:root`, which the toggle already drives — and `print` is a paper band, not
	// a scheme, so re-theming it would be a category error. A deck that declares nothing gets
	// no attribute and no class management, which is also the right answer for a one-off
	// `<!-- _class: dark -->` accent slide: it keeps its class in both schemes.
	const deckToken = colorModeRegister.colorModeClassFromSource(data.source || '');
	const deckModeClass = deckToken === 'dark' || deckToken === 'color-light' ? deckToken : '';

	// 5–6. player chrome + single hashed script + CSP. Inject the Anima bundle ONLY when the
	// deck actually carries a live scene, so a scene-less export stays byte-identical (the
	// html-player golden holds) and never ships the ~58 KB backends it doesn't need.
	// Require the attribute on a <section> (what the host actually mounts), so a deck that
	// merely DOCUMENTS Anima — a code block printing the literal `data-scene-spec=` — doesn't
	// trip the gate and ship dead backends. A real scene always serializes as
	// `<section … data-scene-spec="<base64>">` (scene.transform.js), so it never false-negatives.
	const hasScene = /<section\b[^>]*\sdata-scene-spec=/.test(docHtml);

	// A live CHART. Same posture as `hasScene`, different marker: a chart's scene is built at
	// VIEW time from its rendered marks (`chartToScene`), so there is no baked spec to look
	// for — the marks themselves are the signal. Requiring the attribute on a real element TAG
	// (`<polygon data-anima-role=`) is what keeps a deck that merely DOCUMENTS the attribute in
	// a fenced code block from shipping a player it does not use: markdown escapes `<` to
	// `&lt;` inside a fence, so the raw `<` never appears there.
	//
	// Motion in a FORWARDED FILE is the author's call, and it is a different question from
	// motion on the live surfaces: it costs bytes and it changes what a recipient sees. The
	// deck's `motion:` register decides it, with `player-motion: off` as the opt-out — so
	// `motion: on` animates everywhere by default, and an author sending a board deck can ship
	// the still without giving up motion while they present.
	const chartMotion = deckMotionScalars(data.source || '');
	// Two ways to suppress, and the CLI wins: `--no-player-motion` is an explicit act at
	// export time, so it overrides whatever the deck's front matter says. `undefined` (the
	// default) inherits the author's own registers.
	const playerMotionOff = data.playerMotion === false || playerMotionSuppressed(data.source || '');
	const hasChartMarks = /<(?:polygon|rect|path|circle|ellipse|line|polyline|g|text)\b[^>]*\sdata-anima-role=/.test(docHtml);
	// `deckAnimatesCharts` is SHARED with the Studio panel and mirrors the runtime cascade,
	// because three readers of this question drifted three ways: `motion: On` animated live
	// and exported a still, a legacy `chart-anima` slide did the same, and a `motion-build`
	// slide (a STYLE parameter, not a switch) shipped 22 KB of player that never moved.
	// Play is the sole switch; style tokens do not opt in.
	const hasChart = hasChartMarks && deckAnimatesCharts(data.source || '', docHtml) && !playerMotionOff;

	// Baked narration (#1393). Emitted only when the author opted in to captions, audio, or
	// both — a deck that opted into neither stays byte-identical to before this existed: no
	// blocks, no `media-src`, no caption band, and a player script that never grows the
	// transport. (It is NOT gated on the device holding prepared audio: a captions-only export
	// ships blocks with no clips, and an audio export synthesizes what the device lacks.)
	const narration = narrationBlocks(data.narration);
	const hasNarration = narration.length > 0;
	// CAPTIONS ship iff a cue actually carries a word timeline — derived from the payload
	// rather than taken as a second input, so the band, its stylesheet, the inlined cursor and
	// the shipped words can never disagree with each other. The export panel expresses
	// "captions off" by simply not emitting the words (share-export.ts), which is also what a
	// deck with nothing to highlight looks like; both correctly land here as no band.
	const hasCaptions = hasNarration && (data.narration || []).some((cues) => (cues || []).some((c) => Array.isArray(c?.words) && c.words.length));
	// And AUDIO ships iff a cue actually carries a clip — the same derive-from-the-payload
	// rule, and what the CSP's `media-src` grant is keyed on. A captions-only export is a
	// read-along on the player's own wall clock: it has a transport and a band, and it must
	// not be handed permission to load media it does not contain.
	const hasAudio = hasNarration && (data.narration || []).some((cues) => (cues || []).some((c) => typeof c?.audio === 'string' && c.audio.startsWith('data:')));
	// The deck's own rhythm, resolved HERE and baked as a number. The player cannot resolve
	// it for itself: the parse pass above strips every `<script>` that is not the manifest
	// envelope, so the `application/lattice-front-matter` block does not survive into the
	// file — and a shared artifact has no workspace preset to consult anyway. `pace:` off the
	// verbatim source is therefore both the only reachable answer and the right one: it is
	// the author's directorial choice, and honoring it is what makes a deck that presents
	// itself play the way they made it rather than the way the recipient's browser happens to.
	const paceName = frontMatterPace(source);
	const beats = { slide: paceBeatMs('slide', paceName), section: paceBeatMs('section', paceName) };

	// The deck's REAL canvas: taken from the host, DERIVED from the document if the host did not
	// say, and only then defaulted.
	//
	// Threading alone was the first shape, and it left the original defect armed for anyone
	// outside this repo. `lib/*` is a published export, so a third-party embedder — or the Tauri
	// SlideWright wrapper, which calls this and is not in this tree — deep-imports assemblePlayer,
	// passes no geometry, and silently ships the unreadable artifact #1577 is about, with no error
	// and nothing in the manifest recording what happened. A silent wrong default is the worst
	// available failure for bytes nobody can patch after sending.
	//
	// So the document gets a vote. `--_sec-1cqi` is the engine's own per-canvas unit (width/100),
	// emitted by lib/engine/css.js from the same geometry that sized the document, underscore-
	// prefixed and engine-private — no author writes it, and it survives the CSS prune into the
	// shipped file. Deriving from it cannot disagree with the layout it describes, which is
	// exactly the property a regex over a host-written sizing rule would not have had.
	//
	// Throwing was rejected: the CLI deliberately treats player assembly as non-fatal, and a
	// fixture with no geometry anywhere is a legitimate caller. The default remains the last
	// resort, which is what keeps a default-size deck byte-identical.
	const canvas = resolveCanvas(data);
	const js = await playerJs(hasScene ? ANIMA_PLAYER_JS : '', hasNarration ? beats : null, hasCaptions, canvas, hasChart ? { js: ANIMA_CHART_JS, deck: chartMotion } : null, lensViews);
	const jsHash = await caps.sha256(js);
	const csp =
		`default-src 'none'; script-src 'sha256-${jsHash}'; style-src 'unsafe-inline'; ` +
		`img-src data:; font-src data:; ${hasAudio ? 'media-src data:; ' : ''}base-uri 'none'; form-action 'none'`;

	// 7. envelope (verbatim source; whole-envelope base64 → no breakout).
	//    `readAlong` records WHAT NARRATED the deck — a section version, whether the audio is
	//    carried or must be re-synthesized, and the voice — so a future player can migrate an
	//    old artifact instead of guessing at it. Shaped by `buildReadAlong` rather than written
	//    as a literal here, because the caller supplies a Studio-internal voice object and a
	//    document format must not carry the Studio's own ladder names (#1462 item 1). The AUDIO
	//    deliberately does NOT ride in here — see `narrationBlocks` for why.
	const envelope = buildEnvelope(
		{
			source,
			title,
			theme: data.theme,
			config: data.config,
			notes: data.notes,
			glossary: data.glossary,
			readAlong: buildReadAlong(data.readAlong?.voice, { hasAudio }),
			// Carried only when the exporter reduced the deck — see buildManifest.
			lensProjection: data.lensProjection,
		},
		{ now: data.now, build: data.build, playerVersion: data.playerVersion },
	);

	// The `<style>` blocks below: `styles` and `darkStyle` are guarded where they were
	// built (see the sanitizeStyleText import); `playerCss` is this file's own chrome,
	// interpolating nothing but the canvas numbers, so it carries no #22 channel.
	const out = `<!DOCTYPE html>
<html lang="${escapeAttr(lang)}" data-lp-scheme="${exportedScheme}"${deckModeClass ? ` data-lp-deck-mode="${deckModeClass}"` : ""}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">
<title>${escapeText(title)}</title>
${styles}
<style>${minifyCss(playerCss(hasNarration, hasCaptions, canvas, !!lensViews))}</style>
${darkStyle}
</head><body>
<header id="lp-bar">
 <span class="lp-brand">${escapeText(title)}</span>
 <div class="lp-seg">
  <button data-lp-btn="present" aria-pressed="true" aria-label="Present"><svg aria-hidden="true" focusable="false" class="lp-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg><span class="lp-tab-text">Present</span></button>
  <button data-lp-btn="read-slides" aria-pressed="false" aria-label="Read · Slides"><svg aria-hidden="true" focusable="false" class="lp-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="5" rx="1"/><rect x="3" y="10.5" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/></svg><span class="lp-tab-text">Read · Slides</span></button>
  <button data-lp-btn="read-article" aria-pressed="false" aria-label="Read · Article"><svg aria-hidden="true" focusable="false" class="lp-tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span class="lp-tab-text">Read · Article</span></button>
 </div>
 <span id="lp-count" aria-hidden="true"></span>${lensViews ? `\n <div class="lp-seg lp-lens-seg" role="group" aria-label="Reader view">\n${lensViews.map((v, i) => `  <button data-lp-lens="${escapeAttr(v.id)}" type="button" title="${escapeAttr(v.label)}" aria-pressed="${i === 0}"><span class="lp-tab-text">${escapeText(v.label)}</span></button>`).join('\n')}\n </div>` : ''}
 <span id="lp-count-sr" class="lp-sr" aria-live="polite"></span>${lensViews ? '\n <span id="lp-lens-sr" class="lp-sr" aria-live="polite"></span>' : ''}${hasNarration ? '\n <button id="lp-play" type="button" title="Play narration" aria-pressed="false" aria-label="Play narration"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>' : ''}
 <button id="lp-notes-btn" title="Speaker notes (n)" aria-pressed="false" aria-label="Speaker notes"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="17" y2="12"/><line x1="3" y1="18" x2="13" y2="18"/></svg></button>
 <button id="lp-full" title="Toggle fullscreen" aria-pressed="false" aria-label="Toggle fullscreen"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>
 <button id="lp-mode" title="Toggle dark / light" aria-label="Toggle dark / light theme"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>
</header>
<main id="lp-app" data-lp-view="present">
 <div id="lp-stage">
${a11yDefs}
${slidesHtml}
 </div>
${hasCaptions ? ' <div id="lp-caption" aria-hidden="true"></div>\n' : ''} <div id="lp-nav">
  <button id="lp-prev" type="button" aria-label="Previous slide" title="Previous slide (←)"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
  <button id="lp-next" type="button" aria-label="Next slide" title="Next slide (→)"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
 </div>
 <div id="lp-read-nav">
  <button id="lp-top" type="button" aria-label="Jump to first slide" title="First slide"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14"/><path d="M12 21V7"/><path d="m6 13 6-6 6 6"/></svg></button>
  <button id="lp-bottom" type="button" aria-label="Jump to last slide" title="Last slide"><svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21h14"/><path d="M12 3v14"/><path d="m6 11 6 6 6-6"/></svg></button>
 </div>
 <div id="lp-notes" data-empty="true"><div id="lp-notes-body"></div></div>
 <div id="lp-doc">
  <nav id="lp-toc" aria-label="Slides">
${toc}
  </nav>
  <article id="lp-article">
${article}
  </article>
 </div>
</main>
<script>${js}</script>
${narration ? `${narration}\n` : ''}${envelope}
</body></html>`;

	// Glyph-subset the embedded text fonts to just the characters this deck uses —
	// the single biggest size lever (~6×). Optional cap + graceful fallback.
	const subset = caps.subsetFonts ? await caps.subsetFonts(out) : { html: out, applied: false, saved: 0 };
	return { html: subset.html, report: { ...report, fontBytesSaved: subset.saved, subsetApplied: subset.applied } };
}
