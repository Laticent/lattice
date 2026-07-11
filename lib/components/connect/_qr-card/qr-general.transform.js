/**
 * General `qr` VARIANT — adds a scannable code to an existing host component
 * (`closing qr`, `divider qr`, `split-panel qr`). Unlike wifi/contact (whole-card
 * components), this injects a `<figure class="qr-figure">` into the host's own
 * layout and otherwise leaves it alone.
 *
 * Runs AFTER split-panels (so a `split-panel` section is already restructured
 * into `.panel-left` + `.panel-right`). Reuses the shared rendered-HTML parse
 * kernel + encoder — never a second raw-source parser (HARD RULE #1;
 * engineering/decisions/2026-07-01-qr-authoring-grammar.md).
 *
 * Payload resolution (per the grammar doc):
 *   1. a bullet keyed `qr`         — `- <value> `qr``
 *   2. else a bare-payload bullet  — `- https://…` / `- WIFI:…` (no key)
 *   3. a value rendered as `<a>`   — the href is encoded, not the link text
 * The optional caption is a flat `- <text> `caption`` bullet. The payload (and
 * caption) `<li>` are REMOVED — by recorded position, so a duplicate bullet
 * elsewhere is never the one deleted — so an anchor host renders no list.
 */

const { encode, esc, decodeEntities, stripTags, walkSections } = require('./qr-card');
const { PAYLOAD_URL_RE } = require('./qr-payload');

// Walk only TOP-LEVEL <li> (direct list children), tracking each one's exact
// [start,end) span and its DIRECT content (before any nested <ul>/<ol>). A
// nested bullet is never mistaken for a payload, and removal targets an exact
// span rather than a value-based string match.
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
    const direct = inner.split(/<[uo]l\b/i)[0]; // content before a nested list
    let key = '', valuePart = direct, last = null, c;
    const codeRe = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
    while ((c = codeRe.exec(direct))) last = c;
    if (last) { key = decodeEntities(stripTags(last[1])).trim().toLowerCase(); valuePart = direct.slice(0, last.index); }
    const href = (valuePart.match(/<a\b[^>]*\bhref="([^"]*)"/i) || [])[1] || '';
    lis.push({ start: open, end: close, key, href, text: decodeEntities(stripTags(valuePart)).trim() });
    i = close;
  }
  return lis;
}

// Resolve the single payload + optional caption. null → no payload (lint flags
// it at authoring time; the transform is a no-op).
function resolvePayload(lis) {
  const isUrl = (l) => (l.href && PAYLOAD_URL_RE.test(l.href)) || PAYLOAD_URL_RE.test(l.text);
  let payload = lis.find((l) => l.key === 'qr');
  if (!payload) payload = lis.find((l) => !l.key && isUrl(l));
  if (!payload) return null;
  const value = payload.href && PAYLOAD_URL_RE.test(payload.href) ? payload.href : payload.text;
  if (!value) return null;
  return { value, caption: lis.find((l) => l.key === 'caption')?.text || '', payload, captionLi: lis.find((l) => l.key === 'caption') || null };
}

function figureHtml(value, caption) {
  const svg = encode(value, 'QR code');
  if (!svg) return '';
  return `<figure class="qr-figure"><div class="qr-tile">${svg}</div>${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
}

function renderSection(inner, cls) {
  if (inner.indexOf('class="qr-figure"') !== -1) return inner; // idempotent
  const p = resolvePayload(topLevelLis(inner));
  if (!p) return inner;
  const fig = figureHtml(p.value, p.caption);
  if (!fig) return inner;
  // Remove the payload + caption <li> by span, largest start first so earlier
  // spans stay valid; then collapse a now-empty list.
  let body = inner;
  const spans = [p.payload, p.captionLi].filter(Boolean).map((l) => [l.start, l.end]).sort((a, b) => b[0] - a[0]);
  for (const [s, e] of spans) body = body.slice(0, s) + body.slice(e);
  body = body.replace(/<(ul|ol)\b[^>]*>\s*<\/\1>/gi, '');

  if (/(?:^|\s)split-panel(?:\s|$)/.test(cls) && /class="panel-right"/.test(body)) {
    // Into the supporting (right) zone, before its own (first) closing div.
    return body.replace(/(<div class="panel-right"[^>]*>)([\s\S]*?)(<\/div>)/, `$1$2${fig}$3`);
  }
  // Anchors (closing/divider): after the last paragraph that FOLLOWS the heading
  // (the intro/subtitle), so the code sits below its own explanation — else right
  // after the h2 when there is no intro.
  const h2 = body.indexOf('</h2>');
  if (h2 !== -1) {
    const rest = body.slice(h2 + 5);
    const lastP = rest.lastIndexOf('</p>');
    const at = lastP !== -1 ? h2 + 5 + lastP + 4 : h2 + 5;
    return body.slice(0, at) + fig + body.slice(at);
  }
  return body + fig;
}

// Exact class-token test — `\bqr\b` would also fire on a future `qr-*` class
// (and diverge from the DOM adapter's `.qr` selector).
const hasQr = (cls) => cls.trim().split(/\s+/).includes('qr');

function applyToRenderedHtml(html) {
  let out = html;
  for (const name of ['closing', 'divider', 'split-panel']) {
    out = walkSections(out, name, (inner, cls) => (hasQr(cls) ? renderSection(inner, cls) : inner));
  }
  return out;
}

module.exports = { applyToRenderedHtml, renderSection, topLevelLis, resolvePayload };
