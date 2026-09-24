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
 * Authoring (mirrors the QR postfix-key grammar):
 *   - <video-url>              ← bare bullet, provider auto-detected
 *   - <caption text> `caption` ← optional
 *   - <poster path>  `poster`  ← optional; overrides the auto/placeholder poster
 */

const { encode, esc, decodeEntities, stripTags, walkSections } = require('../../connect/_qr-card/qr-card');
const { detectProvider } = require('../../../core/video-providers.mjs');
const { peelCoda } = require('../../../core/coda');
const { findTopLevelH2 } = require('../../../core/top-level-h2');

const hasClass = (cls, name) => cls.trim().split(/\s+/).includes(name);

// Walk only TOP-LEVEL <li>, tracking each one's [start,end) span, its direct
// text (before any nested list), its last postfix `code` key, and any <a href>.
function topLevelLis(html) {
  const lis = [];
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf('<li', i);
    if (open < 0) break;
    const tagEnd = html.indexOf('>', open);
    if (tagEnd < 0) break;
    let depth = 1, pos = tagEnd + 1, close = -1;
    while (pos < html.length) {
      const nextOpen = html.indexOf('<li', pos);
      const nextClose = html.indexOf('</li>', pos);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) { depth++; pos = nextOpen + 3; }
      else { depth--; if (depth === 0) { close = nextClose + 5; break; } pos = nextClose + 5; }
    }
    if (close < 0) break;
    const inner = html.slice(tagEnd + 1, close - 5);
    const direct = inner.split(/<[uo]l\b/i)[0];
    let key = '', valuePart = direct, last = null, c;
    const codeRe = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
    while ((c = codeRe.exec(direct))) last = c;
    if (last) { key = decodeEntities(stripTags(last[1])).trim().toLowerCase(); valuePart = direct.slice(0, last.index); }
    const href = (valuePart.match(/<a\b[^>]*\bhref="([^"]*)"/i) || [])[1] || '';
    const text = decodeEntities(stripTags(valuePart)).replace(/[\r\n\t]+/g, ' ').trim();
    lis.push({ start: open, end: close, key, href, text });
    i = close;
  }
  return lis;
}

// Resolve the single-clip payload: the video bullet (bare, provider-detected) +
// optional poster/caption keyed bullets. null → no video (no-op).
function resolvePayload(lis) {
  let videoLi = null, provider = null;
  for (const l of lis) {
    if (l.key === 'poster' || l.key === 'caption') continue;
    const p = detectProvider(l.href) || detectProvider(l.text);
    if (p) { videoLi = l; provider = p; break; }
  }
  if (!videoLi) return null;
  const posterLi = lis.find((l) => l.key === 'poster') || null;
  const captionLi = lis.find((l) => l.key === 'caption') || null;
  return {
    provider,
    poster: posterLi ? posterLi.text : '',
    caption: captionLi ? captionLi.text : '',
    consumed: [videoLi, posterLi, captionLi].filter(Boolean),
  };
}

// A background-image url() safe to drop into an inline style — mirror bg-image.js.
const safeUrl = (s) => String(s).replace(/["'()\\\s]/g, (m) => (m.trim() ? '' : '%20'));

function posterHtml(provider, poster) {
  const posterStyle = poster ? ` style="background-image:url('${safeUrl(poster)}')"` : '';
  const posterClass = poster ? 'video-poster' : 'video-poster is-placeholder';
  return (
    `<a class="${posterClass}" href="${esc(provider.url)}" target="_blank" rel="noreferrer noopener"${posterStyle} data-provider="${provider.key}">` +
    `<span class="video-play" aria-hidden="true"></span>` +
    `<span class="video-provider">Watch on ${esc(provider.label)}</span>` +
    `</a>`
  );
}

function qrTile(provider, extraClass = '') {
  const svg = encode(provider.url, `QR code — watch on ${provider.label}`);
  if (!svg) return '';
  return `<div class="qr-tile${extraClass}">${svg}</div>`;
}

function figureHtml(p, wantQr) {
  const qr = wantQr ? qrTile(p.provider) : '';
  const aside =
    `<div class="video-aside">` +
    (qr ? `<div class="video-qr">${qr}<span class="video-qr-hint">Scan to watch</span></div>` : '') +
    (p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : '') +
    `</div>`;
  return `<figure class="video-embed" data-provider="${p.provider.key}">${posterHtml(p.provider, p.poster)}${aside}</figure>`;
}

function stripConsumed(inner, consumed) {
  let body = inner;
  const spans = consumed.map((l) => [l.start, l.end]).sort((a, b) => b[0] - a[0]);
  for (const [s, e] of spans) body = body.slice(0, s) + body.slice(e);
  return body.replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, '');
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

function renderSection(inner, cls = '') {
  if (inner.indexOf('class="video-embed"') !== -1) return inner; // idempotent
  const wantQr = hasClass(cls, 'qr');

  const p = resolvePayload(topLevelLis(inner));
  if (!p) return inner;
  const fig = figureHtml(p, wantQr);
  // The deck's running header/footer ride through the rebuild. `companion` returns
  // an entirely new body, and it used to drop both, so a deck-level `header:` or a
  // slide's `_footer:` silently vanished from every companion slide.
  // Strip the consumed bullets FIRST: their offsets are offsets into `inner`, so
  // slicing the header off before this would move every span it removes.
  const stripped = stripConsumed(inner, p.consumed);
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

function applyToRenderedHtml(html) {
  return walkSections(html, 'video', (inner, cls) => renderSection(inner, cls));
}

module.exports = { applyToRenderedHtml, renderSection, topLevelLis, resolvePayload };
