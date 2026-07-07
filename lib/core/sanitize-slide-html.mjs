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
	return (html) => (!html ? html : dp.sanitize(String(html), { FORBID_TAGS, FORBID_ATTR }));
}
