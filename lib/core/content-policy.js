/**
 * lib/core/content-policy.js
 *
 * THE SECURITY SPINE'S POLICY TABLE (engineering/decisions/2026-11-03-security-findings-spine.md §1).
 * The facts the renderer blocks on, in one place, where the linter's rules can read them too:
 *
 *   - which attributes name an address, which fetch when the markup renders, and which fetch on a click;
 *   - which tags and attributes the slide sanitizer strips, and which attribute names are event handlers;
 *   - which style text is script, and where a `</style>` would end the element early.
 *
 * Two consumers, and neither reads the other:
 *   - the RENDERER blocks: `remote-ref.js` (the web-reference scanner), `sanitize-slide-html.mjs` and
 *     `sanitize-style-text.mjs` import their lists from here and keep their own logic;
 *   - the LINTER warns: lint-core's HTML and CSS rules (spine S2, not built yet) read these lists. Its one security
 *     rule today, `web-image` (S1), needs only the address facts, which live in `media-sources.js` (below).
 * Sharing a list keeps the two from drifting on that list only. What source construct leads to a fetch is a reader's
 * question, and the spine's S2 differential (lint against render, each run alone) is what checks that.
 *
 * NOT THE WHOLE POLICY. What the slide sanitizer finally keeps is DOMPurify's default profile, minus `FORBID_TAGS`,
 * plus `ADD_TAGS` / `ADD_ATTR` (which stay in sanitize-slide-html.mjs, beside the reasoning for each). remote-ref.js
 * keeps the element sets its own logic needs (`NESTED_DOC`, `WEB_MEDIA`, `URL_PAINT_ATTRS` …).
 *
 * The other half of the spine's address question, "is this address another site?", lives in
 * `media-sources.js` (`isRemoteRef`), which is already the one table for it (2026-10-16-media-plugins.md §3
 * D2). It is not re-exported here, because this file must require nothing (below).
 *
 * DATA AND PURE PREDICATES ONLY. Nothing here reads markup: the readers stay where they are (`scanHtml`,
 * `cssRefSpans`, the Markdown reading). And nothing here REQUIRES anything, on purpose: the docs dev server
 * (docs/src/plugins/vite-cjs-lib-dev.mjs), the code door's sanitizer page (lib/packages/code-door-worker.js)
 * and the function-plot capture page (lib/export/locked-figures.js) each load a CommonJS leaf by inlining
 * its body, which works only for a file of this shape. An ESM consumer default-imports it (`import
 * contentPolicy from './content-policy.js'`), the shape `lib/core/policy-page-script.js` knows how to inline.
 *
 * ADDING A FACT. A new list of fetch attributes, stripped tags or handlers goes HERE, never as a private
 * copy in a consumer: a second copy is how the linter and the renderer would drift apart.
 */

// ── Attributes that reach the network ─────────────────────────────────────────────────────────────

/**
 * Attributes whose value the browser FETCHES, on render or on a click. An `<a href>` is a link, not a
 * fetch, so `attrIsRemote` (remote-ref.js) skips `href` on `a` and `area`; on every other element
 * (`<image>`, `<use>`, `<feImage>`, `<link>`) it loads. `ping` stays: it posts on every click.
 */
const FETCH_ATTRS = new Set([
  'src', 'srcset', 'imagesrcset', 'href', 'xlink:href', 'poster', 'background', 'data', 'action',
  'formaction', 'ping', 'lowsrc', 'dynsrc', 'longdesc', 'codebase', 'archive', 'manifest', 'icon', 'profile',
]);

/**
 * The attributes, besides a media element's own, whose address loads when the markup RENDERS.
 * FETCH_ATTRS less the ones that act only on a click or a submit (`action`, `ping`, `longdesc`).
 * `action` and `ping` are refused by `CLICK_FETCH_ATTRS` below (with `formaction` and `attributionsrc`),
 * where no policy stands behind the host; `longdesc` is not.
 */
const RENDER_FETCH_ATTRS = new Set(['src', 'srcset', 'imagesrcset', 'href', 'xlink:href', 'poster', 'background', 'data', 'lowsrc', 'dynsrc', 'codebase', 'archive', 'manifest', 'icon', 'profile']);

/** The elements on which `href` (and `xlink:href`) LOADS what it names; on `<a>`, `<area>` and a MathML element it is a link, followed on a click. */
const HREF_FETCH_TAGS = new Set(['use', 'feimage', 'link', 'script']);

/**
 * Attributes that fetch when the reader acts, or on render (`attributionsrc`, a list of reporting
 * addresses): `ping` posts to each address it lists on a click, `action` and `formaction` send a form on
 * a submit. A deck can carry a web one as quietly as an image, and a host that runs no content-security
 * policy (`connect-src` and `form-action` are closed in subresource-csp.mjs) has nothing else standing
 * between the click and the stranger's server. Read by name on any element: refusing too much costs an
 * attribute no deck should carry, and listing the elements a browser honors them on is a list that goes
 * stale. An origin the user approved still passes, which is the door a plugin uses.
 */
const CLICK_FETCH_ATTRS = new Set(['ping', 'action', 'formaction', 'attributionsrc']);

// ── What the slide sanitizer strips ───────────────────────────────────────────────────────────────

/**
 * Tags a rendered slide never legitimately carries, which `sanitize-slide-html.mjs` hands DOMPurify as
 * `FORBID_TAGS`. CSS comes from the frame's or the document's own `<style>`, so a `<style>` or `<link>` in
 * CONTENT is only ever an exfiltration or override vector. An array, because that is the shape DOMPurify's
 * config takes.
 */
const FORBID_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'base', 'link', 'meta'];
/** Attributes the sanitizer strips on top of DOMPurify's default profile (`FORBID_ATTR`). */
const FORBID_ATTR = ['srcdoc'];

/**
 * Is this attribute an event handler (`onclick`, `onerror`, …)? DOMPurify's default profile strips every
 * one; the table names the rule so the linter can ask the same question of the source.
 * @param {string} name  the attribute's name, any case
 */
const isEventHandlerAttr = (name) => /^on/i.test(String(name));

// ── Style text ────────────────────────────────────────────────────────────────────────────────────

/**
 * Legacy script-in-inline-style vectors (`expression()`, `-moz-binding`, `behavior:`, a `javascript:` or
 * `vbscript:` address). A `style` that matches is dropped whole by the slide sanitizer. `url()` is
 * deliberately NOT here: a resource load is a fetch, which the web-reference scanner owns, not script.
 */
const STYLE_SCRIPT_RE = /expression\s*\(|(?:javascript|vbscript)\s*:|-moz-binding|behavior\s*:/i;

/** `style`, lower-cased char codes — compared without allocating a substring. */
const STYLE_CODES = [0x73, 0x74, 0x79, 0x6c, 0x65]; // s t y l e

/**
 * Is there a `</style` at `i`, where `text[i]` is `<` and `text[i + 1]` is `/`? That is the sequence that
 * ends a `<style>` element in the HTML tokenizer's RAWTEXT state, whatever CSS comment or string it sits
 * in, so every byte after it parses as markup (2026-08-17-theme-css-is-a-preview-sink.md §2).
 *
 * DELIBERATELY WIDER THAN THE SPEC. HTML closes the element only when `</style` is followed by whitespace,
 * `/` or `>`, so `</styles>` is strictly text. Matching the prefix outright cannot be wrong in the unsafe
 * direction, and keeps a second tokenizer rule out of a security guard. Case-insensitive.
 *
 * A char test rather than a regex because `sanitize-style-text.mjs` runs it at every `</` of a ~1.5 MB
 * sheet on every srcdoc write; see that file for the measurement.
 * @param {string} text
 * @param {number} i
 */
function styleEndAt(text, i) {
  for (let k = 0; k < 5; k++) {
    // `| 0x20` lower-cases an ASCII letter and leaves the comparison false for anything
    // that is not one, so this is the case-insensitive match with no `toLowerCase` copy.
    if ((text.charCodeAt(i + 2 + k) | 0x20) !== STYLE_CODES[k]) return false;
  }
  return true;
}

/**
 * Would this text end a `<style>` element early? True when it holds a `</style` anywhere (`styleEndAt`).
 * @param {string} css
 */
function endsStyleEarly(css) {
  const text = String(css ?? '');
  for (let i = text.indexOf('</'); i >= 0; i = text.indexOf('</', i + 2)) if (styleEndAt(text, i)) return true;
  return false;
}

module.exports = { FETCH_ATTRS, RENDER_FETCH_ATTRS, HREF_FETCH_TAGS, CLICK_FETCH_ATTRS, FORBID_TAGS, FORBID_ATTR, isEventHandlerAttr, STYLE_SCRIPT_RE, styleEndAt, endsStyleEarly };
