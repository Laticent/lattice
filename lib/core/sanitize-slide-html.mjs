/**
 * lib/core/sanitize-slide-html.mjs
 *
 * The single-source slide-HTML sanitizer LOGIC, shared by two consumers
 * (HARD RULE #1):
 *   1. the docs-site preview builders (browser) — the original #616 guard, and
 *   2. the self-contained `.html` EXPORT assembler (Node) — 2026-07-07 §Security 1.
 *
 * ZERO external imports ON PURPOSE. DOMPurify (and, in Node, jsdom) are supplied by
 * the HOST, never imported here — because this file lives outside `docs/`, and if
 * it imported `dompurify` the docs Astro/rollup build would resolve that bare
 * specifier against the ROOT `node_modules` (not `docs/node_modules`) and fail in a
 * docs-only CI install. So this module holds only the allowlist + the sanitize
 * logic; each host injects its own DOMPurify from its own `node_modules`:
 *   - browser (docs shim): `createSlideSanitizer(DOMPurify, window)`
 *   - Node (export):       `createSlideSanitizer(DOMPurify, new JSDOM('').window)`
 * ESM (`.mjs`) so rollup (docs), esbuild (emulator), and `node --test` (dynamic
 * import) all accept it; the root package is CJS, hence the explicit `.mjs`.
 *
 * The XSS precondition behind #616 (threat model §5.1 T-CONTENT): the engine
 * renders markdown with `html: true` and NO downstream sanitizer, and untrusted
 * slide HTML then reaches a live surface — a same-origin `srcdoc` preview frame
 * (docs) OR a shared `.html` opened by a RECIPIENT at `file://` (export).
 *
 * REUSE, DON'T REINVENT (HARD RULE #15): wraps DOMPurify (the vetted standard),
 * not a hand-rolled allowlist. We keep DOMPurify's default profile (HTML + SVG +
 * MathML — the engine emits inline chart `<svg>` and KaTeX MathML) and additionally
 * FORBID the tags a slide never carries (`<script>`, `<style>`, `<iframe>`,
 * `<object>`, `<embed>`, `<form>`, `<input>`, `<base>`, `<link>`, `<meta>`). The
 * default already strips `on*`, `javascript:`/`vbscript:`/`data:html`, and
 * `<foreignObject>`. Inline `style` is KEPT (the engine emits `url()` for
 * backgrounds / logo masks — a resource load, not script); only the LEGACY
 * script-in-CSS vector (`expression()`, `-moz-binding`, `behavior:`,
 * `javascript:`/`vbscript:`) is stripped.
 */

// Tags a rendered slide never legitimately carries. CSS comes from the frame's /
// document's own `<style>`, so a `<style>`/`<link>` in CONTENT is only ever an
// exfil/override vector.
export const FORBID_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link', 'meta'];
export const FORBID_ATTR = ['srcdoc'];

// KaTeX's accessible half. DOMPurify's default MathML profile does NOT include
// `<semantics>` or `<annotation>`, so a sanitized slide lost BOTH — and losing them is
// worse than it sounds: the `<annotation>` holds the source TeX, so stripping the
// element while keeping its text left the raw LaTeX as a bare text node inside `<math>`,
// which an assistive technology reads out after the formula. The player is the primary
// shared HTML artifact and the route we designate as accessible, so it is exactly where
// the MathML has to survive.
//
// `annotation-xml` is deliberately NOT added: it is a known mXSS vector DOMPurify
// guards on purpose (it can smuggle HTML back through an XML content model). KaTeX
// emits `annotation`, never `annotation-xml`, so nothing is lost by keeping that shut.
export const ADD_TAGS = ['semantics', 'annotation'];

// Two SVG PRESENTATION attributes DOMPurify's default profile drops, both of which the
// engine emits and neither of which any CSS backstops. Enumerated-keyword values only —
// no URL grammar, no script grammar, nothing to smuggle — so allowing them costs the
// threat model nothing, the same reasoning ADD_TAGS uses for KaTeX above.
//
// BE PRECISE ABOUT WHY THAT IS SAFE, because the next person widening this list will reuse
// the reasoning: `ADD_ATTR` opts an attribute OUT of DOMPurify's URI validation entirely.
// `dominant-baseline="url(javascript:alert(1))"` survives this sanitizer verbatim. It is
// inert only because the CSS parser discards it as an invalid value for an enumerated
// property — nothing is checking it. So the guarantee rests ENTIRELY on the two properties'
// grammars, NOT on DOMPurify. Adding an attribute here whose grammar admits `url()`,
// `attr()`, or any function that fetches would be a live vector with no guard behind it.
//
// `vector-effect` is the load-bearing one. `journey.transform.js` draws its sentiment
// curve into a `preserveAspectRatio="none"` viewBox with a 2.5-unit stroke and relies on
// `non-scaling-stroke`; nothing sets `stroke-width` in CSS. Stripped, the non-uniform
// stretch scales that stroke by ~77x at gallery geometry and the whole chart area paints
// as one solid slab. That has been shipping in every Studio artifact and in the exported
// player, while the CLI PDF of the same deck is correct.
//
// `dominant-baseline` is emitted attribute-only by quadrant, radar, gantt and state-chart
// (funnel and word-cloud have CSS backstops and were unaffected). Stripped, a centered
// label sits ~35% of its font-size low — and worse, `quadrant`'s placement pass avoids
// collisions by MEASURING the box this attribute defines, so removing it reintroduces the
// phantom-box overlap `funnel.transform.js` names in its own comments.
//
// Measured across the 75 `*.gallery.md` decks through this very sanitizer: 543
// `dominant-baseline` and 66 `vector-effect` were being dropped.
export const ADD_ATTR = ['dominant-baseline', 'vector-effect'];

// Legacy script-in-inline-style vectors. url() is deliberately NOT here.
export const STYLE_SCRIPT_RE = /expression\s*\(|(?:javascript|vbscript)\s*:|-moz-binding|behavior\s*:/i;

/**
 * Build a configured sanitizer from a DOMPurify factory and a `window` (the
 * dependency-injection seam — the ONLY entry point). Returns `(html) => cleanHtml`.
 *
 *   const sanitize = createSlideSanitizer(DOMPurify, window);           // browser
 *   const sanitize = createSlideSanitizer(DOMPurify, new JSDOM('').window); // Node
 *
 * @param {(win: any) => any} DOMPurifyFactory  the `dompurify` default export
 * @param {any} win                             a DOM `window` (real or jsdom)
 * @returns {(html: string) => string}
 */
export function createSlideSanitizer(DOMPurifyFactory, win) {
	const dp = DOMPurifyFactory(win);
	dp.addHook('uponSanitizeAttribute', (_node, data) => {
		if (data.attrName === 'style' && STYLE_SCRIPT_RE.test(data.attrValue)) data.keepAttr = false;
	});
	return (html) => (!html ? html : dp.sanitize(String(html), { FORBID_TAGS, FORBID_ATTR, ADD_TAGS, ADD_ATTR }));
}
