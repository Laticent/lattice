/**
 * lib/core/subresource-csp.mjs
 *
 * THE ONE remote-subresource policy, shared by every Lattice document that renders a deck it
 * did not write (HARD RULE #1). Two callers today, in two trees:
 *
 *   · `docs/src/playground/preview-csp.js` — the docs-site preview frames (#1753).
 *   · `lattice-emulator.js` — the CLI's LIVE HTML exports: the `.html` deliverable, the
 *     `--fluid` viewer, and the `.html` sidecar written beside a pdf/pptx/png.
 *
 * They were one hand-kept copy away from disagreeing, and a policy that differs between the
 * surface an author previews on and the file their reader opens is the exact divergence the
 * preview record exists to remove.
 *
 * ── What it is for ────────────────────────────────────────────────────────────
 * A deck can make its host document fetch an arbitrary external URL on OPEN, with no
 * interaction — a tracking beacon leaking the viewer's IP and User-Agent and confirming they
 * opened it. Measured through FULLY-SANITIZED slide HTML: a markdown `![](https://…)`, an
 * inline `style="background-image:url(…)"`, a raw `<img>` and a Mermaid node label all fire
 * the identical request. Not a sanitizer hole — `sanitize-slide-html.mjs` keeps inline `style`
 * deliberately, because the engine emits `url()` for backgrounds and logo masks, and a
 * resource load is not script execution. HARD RULE #22's threat model is script → key theft;
 * this is a different harm with its own record.
 *
 * ── The policy is deliberately narrow, and the omissions are the design ───────
 * There is NO `default-src`, so script, style and worker loading are exactly as unrestricted
 * as they were — this cannot break Mermaid, KaTeX or the runtime by starving a directive
 * nobody enumerated. What is listed is only what a DECK can aim at a remote host:
 *   · img-src    — the beacon proper: markdown images, raw <img>, `url()` in an inline style.
 *   · media-src  — <video>/<audio> survive sanitization (only script/iframe/object/embed are
 *                  forbidden), so they are the same vector with a different tag.
 *   · font-src   — a deck's front-matter `style:` can carry `@font-face { src: url(…) }`.
 *   · connect-src, object-src, base-uri, form-action — closed; nothing in a rendered deck
 *     needs them, and each is an exfiltration route on its own.
 * `data:` and `blob:` stay open throughout: both are same-document payloads that reach no
 * network, and the Studio's image handling depends on them.
 *
 * ── It works on `file://`, which is the part worth measuring rather than assuming ──
 * A CLI export is opened from disk, where `'self'` is an opaque origin and the obvious fear is
 * that it blocks the deck's own local assets. Measured in Chromium on a real export carrying
 * one local image, one remote image and KaTeX math:
 *
 *   | policy                        | remote img | local ./x.png | KaTeX faces |
 *   |-------------------------------|-----------:|--------------:|------------:|
 *   | none                          |          1 |         loads |          20 |
 *   | this one                      |      **0** |     **loads** |      **20** |
 *
 * KaTeX matters because its stylesheet is loaded from a DIFFERENT directory than the deck and
 * pulls its own faces relative to itself; both still resolve, and `.katex` renders at an
 * identical width. No `file:` source token is needed.
 *
 * UNVERIFIED on Firefox and Safari (HARD RULE #23): `file://` origin rules are engine-specific
 * and this measurement is Chromium's.
 *
 * See engineering/decisions/2026-09-01-preview-remote-subresource-posture.md and
 * 2026-09-01-export-remote-subresource-posture.md.
 */

// Same-document sources only. Neither reaches the network.
const SELF_SOURCES = "'self' data: blob:";

/**
 * The policy string, without the `<meta>` wrapper.
 *
 * @param {object} [opts]
 * @param {string} [opts.katexUrl] the KaTeX stylesheet URL, if this document loads one from a
 *   remote origin — that ORIGIN is allowed for fonts, since KaTeX's faces are relative to its
 *   own stylesheet. Derived rather than hard-coded: these URLs are call-site parameters, so a
 *   surface pointing at a different mirror must not silently lose its math glyphs. A relative
 *   or `file://` path needs nothing here — `'self'` already covers it, measured above.
 * @returns {string}
 */
export function subresourceCspPolicy({ katexUrl = '' } = {}) {
	let fontOrigin = '';
	try {
		// Only an http(s) URL contributes an origin. A relative/same-origin path is already
		// covered by 'self', and a malformed value must not throw a document away.
		const u = new URL(String(katexUrl), 'https://placeholder.invalid');
		if (/^https?:$/.test(u.protocol) && u.hostname !== 'placeholder.invalid') fontOrigin = ` ${u.origin}`;
	} catch { /* not a URL — 'self' still covers a relative path */ }
	return [
		`img-src ${SELF_SOURCES}`,
		`media-src ${SELF_SOURCES}`,
		`font-src 'self' data:${fontOrigin}`,
		"connect-src 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
	].join('; ');
}

/**
 * The `<meta http-equiv="Content-Security-Policy">` tag. Emit it FIRST in `<head>`, before any
 * content: a CSP meta governs only what the parser has not already reached, so a link above it
 * is already in flight.
 *
 * @param {object} [opts] see `subresourceCspPolicy`
 * @returns {string}
 */
export function subresourceCspMeta(opts) {
	return `<meta http-equiv="Content-Security-Policy" content="${subresourceCspPolicy(opts)}">`;
}

export default subresourceCspMeta;
