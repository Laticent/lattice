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
const { detectProvider } = require('../../../engine/video-providers');

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

// Inject after the intro paragraph following the heading (else after the h2,
// else append) — the code sits below its own framing.
function injectAfterIntro(body, fig) {
  const h2 = body.indexOf('</h2>');
  if (h2 !== -1) {
    const rest = body.slice(h2 + 5);
    const lastP = rest.lastIndexOf('</p>');
    const at = lastP !== -1 ? h2 + 5 + lastP + 4 : h2 + 5;
    return body.slice(0, at) + fig + body.slice(at);
  }
  return body + fig;
}

function renderSection(inner, cls = '') {
  if (inner.indexOf('class="video-embed"') !== -1) return inner; // idempotent
  const wantQr = hasClass(cls, 'qr');

  const p = resolvePayload(topLevelLis(inner));
  if (!p) return inner;
  const fig = figureHtml(p, wantQr);
  const body = stripConsumed(inner, p.consumed);

  // companion — split the heading + lead paragraph (left) from the poster (right).
  if (hasClass(cls, 'companion')) {
    const h2 = (body.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/i) || [''])[0];
    const afterH2 = h2 ? body.slice(body.indexOf(h2) + h2.length) : body;
    const leadP = (afterH2.match(/<p\b[^>]*>[\s\S]*?<\/p>/i) || [''])[0];
    return `<div class="video-lead">${h2}${leadP}</div>${fig}`;
  }

  return injectAfterIntro(body, fig);
}

function applyToRenderedHtml(html) {
  return walkSections(html, 'video', (inner, cls) => renderSection(inner, cls));
}

module.exports = { applyToRenderedHtml, renderSection, topLevelLis, resolvePayload };
