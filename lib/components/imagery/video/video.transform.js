/**
 * `video` component kernel — turns an authored video URL into a static, PDF-safe
 * embed: a poster tile (clickable → the video) with a ▶ play badge + provider
 * label, an optional caption, and — when the slide opts into the `qr` variant —
 * a scannable QR to the same URL. NEVER an iframe (the engine bars iframes — DSL
 * allow-list §6.1 + sanitizeSlideHtml #22). Reuses the shared QR-card kernel +
 * encoder (HARD RULE #1). See engineering/decisions/2026-07-02-video-component.md.
 *
 * Compositions (variant class on the section):
 *   · (base) / card  — poster beside a meta column
 *   · companion       — claim/lead LEFT, poster RIGHT (this kernel splits them)
 *   · gallery         — contained-on-matte exhibit (CSS override)
 * `qr` is an opt-in modifier: the QR is emitted ONLY when the section carries it,
 * so a plain `video` slide is a poster + link, never a wasted code.
 *
 * THE FIGURE IS THE VIDEO PLUGIN'S, NOT THIS KERNEL'S (lib/plugins/video/video.inline.js). The author writes
 * `@video{"https://…", title="…", poster=…}` on a line of its own and the markdown-it pass draws the poster figure from
 * THAT SPAN while it parses. This kernel only LAYS OUT the figure the engine stamped: it finds it by its own marker
 * (`data-lattice-media="video"`), adds the `qr` tile, and arranges the head, the lead and the coda. It reads no slide
 * text and no bullet, and it builds no address from anything but the figure's own `data-lattice-media-url`, which it
 * re-validates through the provider table first (engineering/decisions/2026-10-16-media-plugins.md § 4.5).
 */

const { encode, esc, decodeEntities, walkSections } = require('../../connect/_qr-card/qr-card');
const { detectProvider } = require('../../../core/video-providers.mjs');
const { peelCoda } = require('../../../core/coda');
const { findTopLevelH2 } = require('../../../core/top-level-h2');
const { resolveAssetUrl } = require('../../../core/bg-image');

const hasClass = (cls, name) => cls.trim().split(/\s+/).includes(name);

// A background-image url() safe to drop into an inline style — mirror bg-image.js.
const safeUrl = (s) => String(s).replace(/["'()\\\s]/g, (m) => (m.trim() ? '' : '%20'));

function qrTile(provider, extraClass = '') {
  const svg = encode(provider.url, `QR code — watch on ${provider.label}`);
  if (!svg) return '';
  return `<div class="qr-tile${extraClass}">${svg}</div>`;
}

const FIGURE_OPEN = /<figure class="video-embed" data-lattice-media="video"[^>]*>/;
const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? decodeEntities(m[1]) : '';
};

// The engine's own figure: found by its marker, taken whole. `</figure>` cannot nest in what the plugin draws.
function takeFigure(inner) {
  const m = FIGURE_OPEN.exec(inner);
  if (!m) return null;
  const close = inner.indexOf('</figure>', m.index);
  if (close < 0) return null;
  return { start: m.index, end: close + 9, html: inner.slice(m.index, close + 9), open: m[0] };
}

// The layout's additions to the plugin's figure: a deck-relative poster resolved like every other picture, and — on a `qr`
// slide — a code of the watch address. The address is re-validated through the provider table, never trusted as written.
function dressFigure(fig, wantQr, ctx) {
  let html = fig.html;
  const rawPoster = attr(fig.open, 'data-lattice-poster');
  if (rawPoster) {
    const url = resolveAssetUrl(rawPoster, ctx?.baseUrl);
    html = html.replace(/ style="background-image:url\('[^']*'\)"/, ` style="background-image:url('${esc(safeUrl(url)).replace(/"/g, '&quot;')}')"`);
  }
  if (wantQr) {
    const provider = detectProvider(attr(fig.open, 'data-lattice-media-url'));
    const tile = provider ? qrTile(provider) : '';
    if (tile) html = html.replace('<div class="video-aside">', `<div class="video-aside"><div class="video-qr">${tile}<span class="video-qr-hint">Scan to watch</span></div>`);
  }
  return html;
}

// Nest the title in `.video-head` and inject the figure after the last intro
// paragraph that follows it (else right after the title, else append) — the clip
// sits below its own framing.
//
// The title stays IN the card, never in the masthead band. `video` is a
// `conformance:"strict"` canvas and runs BEFORE mastheadLift, so the lift wraps
// this card in the frame's `.cell-stage` cell. For a strict component the lift is
// depth-aware (findTopLevelH2, lib/core/top-level-h2.js): it leaves an `<h2>`
// nested inside the card where it is, the mechanism wifi relies on with
// `.qr-head > h2`. A top-level `<h2>` would be lifted into the band and split from
// the lead it belongs beside — the `companion` collapse recorded in
// engineering/decisions/2026-09-20-form-is-not-configurable.md.
// An EYEBROW — the code-only paragraph authored directly above the title
// (lib/base/base.docs.md) — rides into the head with it. The masthead used to
// lift it into the band beside the title; with the title in the card it would
// otherwise sit loose above the head, or, on `companion`, be dropped outright.
const EYEBROW_TAIL = /<p\b[^>]*>\s*<code\b[^>]*>[^<]*<\/code>\s*<\/p>\s*$/;
// A SUBTITLE label — a code-only paragraph directly BELOW the title — rides in
// too, for the same reason: `section h2 + p:has(> code:only-child)` styles it as
// the italic subtitle only while it is the title's next sibling (the masthead's
// `extractSubtitleP` kept that pair together in the band).
const SUBTITLE_HEAD = /^\s*<p\b[^>]*>\s*<code\b[^>]*>[^<]*<\/code>\s*<\/p>/;

function splitSubtitle(after) {
  const m = SUBTITLE_HEAD.exec(after);
  return m ? { subtitle: m[0].trim(), rest: after.slice(m[0].length) } : { subtitle: '', rest: after };
}

function splitEyebrow(before) {
  const m = EYEBROW_TAIL.exec(before);
  return m ? { rest: before.slice(0, m.index), eyebrow: m[0].trim() } : { rest: before, eyebrow: '' };
}

function composeBody(body, fig) {
  const top = findTopLevelH2(body);
  if (!top) return body + fig;
  const { rest, eyebrow } = splitEyebrow(body.slice(0, top.start));
  const { subtitle, rest: after } = splitSubtitle(body.slice(top.start + top.text.length));
  const lastP = after.lastIndexOf('</p>');
  const at = lastP !== -1 ? lastP + 4 : 0;
  return `${rest}<div class="video-head">${eyebrow}${top.text}${subtitle}</div>${after.slice(0, at)}${fig}${after.slice(at)}`;
}

// `ctx.baseUrl` resolves a deck-relative poster the way every other picture resolves (a code
// package is handed the same base). A `sample:` poster is resolved by the engine after this
// transform runs (lib/core/bg-image.js resolveInlineImageSrcs), so it passes through here.
function renderSection(inner, cls = '', ctx) {
  if (inner.indexOf('class="video-card"') !== -1) return inner; // idempotent
  const wantQr = hasClass(cls, 'qr');

  const found = takeFigure(inner);
  if (!found) return inner;
  const fig = dressFigure(found, wantQr, ctx);
  // The deck's running header/footer ride through the rebuild. `companion` returns
  // an entirely new body, and it used to drop both, so a deck-level `header:` or a
  // slide's `_footer:` silently vanished from every companion slide.
  // Lift the figure out FIRST: its offsets are offsets into `inner`, so slicing the header off before this would move them.
  const stripped = (inner.slice(0, found.start) + inner.slice(found.end)).replace(/<li\b[^>]*>\s*<\/li>/gi, '').replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, '');
  const header = (stripped.match(/^\s*<header[\s\S]*?<\/header>/) || [''])[0];
  const footer = (stripped.match(/<footer[\s\S]*?<\/footer>\s*$/) || [''])[0];
  // The universal coda cell rides through the rebuild — `companion` returns an
  // entirely new body, so a trailing beat the author wrote was dropped outright
  // (lib/core/coda.js). Peel it here, re-append it below whichever shape is built.
  const peeled = peelCoda(stripped.slice(header.length, stripped.length - footer.length));
  const body = peeled.rest;

  // companion — split the heading + lead paragraph (left) from the poster (right).
  if (hasClass(cls, 'companion')) {
    const h2 = (body.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/i) || [''])[0];
    const at = h2 ? body.indexOf(h2) : -1;
    const { eyebrow } = splitEyebrow(at > 0 ? body.slice(0, at) : '');
    const { subtitle, rest: afterH2 } = splitSubtitle(h2 ? body.slice(at + h2.length) : body);
    const leadP = (afterH2.match(/<p\b[^>]*>[\s\S]*?<\/p>/i) || [''])[0];
    return `${header}<div class="video-card"><div class="video-lead">${eyebrow}${h2}${subtitle}${leadP}</div>${fig}</div>${peeled.coda}${footer}`;
  }

  return `${header}<div class="video-card">${composeBody(body, fig)}</div>${peeled.coda}${footer}`;
}

function applyToRenderedHtml(html, ctx) {
  return walkSections(html, 'video', (inner, cls) => renderSection(inner, cls, ctx));
}

module.exports = { applyToRenderedHtml, renderSection, takeFigure };
