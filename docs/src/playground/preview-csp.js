// preview-csp.js — the remote-subresource policy every preview-frame document carries.
//
// A standalone module because three builders share it and it depends on nothing — not, as an
// earlier version of this docblock claimed, to keep `deck-preview.js` out of the Studio
// bundle. That justification was measured wrong and is worth recording as wrong: the Studio
// route ALREADY imports `deck-preview.js` eagerly (`studio-stage.ts`, `PrintOptionsPanel.tsx`),
// the split moved the route by 0.0KB (637.0KB before and after, `docs/scripts/check-route-budget.mjs`),
// and rollup merges this file into the deck-preview chunk anyway. The number quoted as the
// reason had been read off a stale build.
//
// It stays split because it is genuinely independent and the three consumers sit in three
// different trees — which is a fine reason, just not the one first given.
//
// `deck-preview.js` re-exports it, so the name stays reachable where callers already look.

// ── The preview frame's remote-subresource policy (#1753) ──────────────────────
// A deck can make a preview frame fetch an arbitrary external URL on OPEN, with no
// interaction — a tracking beacon that leaks the viewer's IP and User-Agent and confirms
// they opened it. Measured on the real Playground through FULLY-SANITIZED slide HTML: a
// plain markdown `![](https://…)`, an inline `style="background-image:url(…)"`, a raw
// `<img>` and a Mermaid node label all fire the identical request. So it is not a
// sanitizer hole and not a Mermaid bug — `sanitize-slide-html.mjs` keeps inline `style`
// deliberately, because the engine emits `url()` for backgrounds and logo masks, and a
// resource load is not script execution. HARD RULE #22's threat model is about script →
// key theft; this is a different harm and needed its own decision.
//
// WHY A CSP RATHER THAN A SCRUB: it closes the vector uniformly, pre- AND post-render,
// including the one shape no post-render scrub can reach — Mermaid's `A@{ img: "https://…" }`
// fetches during Mermaid's OWN layout, before our injection point exists.
//
// THE POLICY IS DELIBERATELY NARROW, and the omissions are the design. There is NO
// `default-src`, so script, style and worker loading are exactly as unrestricted as they
// were — this change cannot break Mermaid, KaTeX or the runtime by starving a directive
// nobody enumerated. What is listed is only what a DECK can aim at a remote host:
//   · img-src    — the beacon proper: markdown images, raw <img>, and `url()` in an inline
//                  style attribute all land here.
//   · media-src  — <video>/<audio> survive sanitization (only script/iframe/object/embed
//                  are forbidden), so they are the same vector with a different tag.
//   · font-src   — a deck's front-matter `style:` can carry `@font-face { src: url(…) }`.
//                  The KaTeX CSS pulls its own faces from the SAME origin it was served
//                  from, so that origin is allowed back in rather than hard-coded.
//   · connect-src, object-src, base-uri, form-action — closed; nothing in a preview needs
//     them, and each is an exfiltration route on its own.
// `blob:` and `data:` stay open throughout: both are same-document payloads that reach no
// network, and the Studio's own image handling depends on them.
//
// COST, measured rather than assumed: ZERO shipped deck — `examples/**`, `exemplars/**`,
// the baseline decks, the component galleries — references a remote image or media file.
// And a remote image ALREADY fails in the exported player, whose CSP has carried
// `img-src data:` all along: preview was rendering something the export would not.
// Containing preview makes the two agree.
// See engineering/decisions/2026-09-01-preview-remote-subresource-posture.md.
// THE POLICY ITSELF LIVES IN `lib/core/subresource-csp.mjs` (HARD RULE #1). It is not a
// preview concern any more: the CLI's live HTML exports — the `.html` deliverable, the
// `--fluid` viewer, the sidecar beside a pdf/pptx/png — carry the same policy, and a document
// an author previews must not disagree with the file their reader opens. This module stays as
// the name the three preview builders already call, and as the home of the reasoning about
// preview specifically; the directive list is shared.
import { subresourceCspMeta } from '../../../lib/core/subresource-csp.mjs';

/**
 * The `<meta http-equiv="Content-Security-Policy">` tag every preview-frame document
 * carries. Emitted FIRST in `<head>`, before any content, so it governs the whole document.
 *
 * @param {object} [opts]
 * @param {string} [opts.katexUrl] the KaTeX stylesheet URL, if this frame loads one — its
 *   ORIGIN is allowed for fonts, since KaTeX's faces are relative to its own stylesheet.
 *   Derived rather than hard-coded: these URLs are call-site parameters, so a surface
 *   pointing at a different mirror must not silently lose its math glyphs.
 * @returns {string}
 */
export function previewCspMeta({ katexUrl = '' } = {}) {
	return subresourceCspMeta({ katexUrl });
}
