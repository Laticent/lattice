/**
 * Shared kernel for the `connect` bucket's QR-card components (wifi, contact).
 *
 * Both parse the same authoring shape — a postfix-key list where each bullet is
 * `value `key`` (value first, trailing inline-code names the field) — assemble a
 * payload string, encode it to a palette-blind SVG via lib/engine/qr, and emit a
 * two-zone card (readable fields + QR). Only the payload builder and the card's
 * field layout differ per component; everything mechanical lives here.
 *
 * Underscore-prefixed folder so the component loader and the bucket CSS walker
 * skip it (mirrors chart/_chart-family) — it is bucket-scoped infrastructure,
 * not a component.
 *
 * Values are pulled from the RENDERED `<li>` but reduced to their raw text
 * (tags stripped, entities decoded) so an autolinked URL or emphasized password
 * still encodes to the exact string the author typed.
 */

const { qrSvg } = require('../../../engine/qr');
const { mapSections } = require('../../../core/section-walk');

// ── field parsing ──────────────────────────────────────────────────────────
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&#8209;/g, '‑')
    .replace(/&amp;/g, '&'); // decode &amp; LAST so &amp;lt; → &lt;, not <
}
const stripTags = (s) => s.replace(/<[^>]+>/g, '');

// Parse `<li> value <code>key</code></li>` items into { value, key }. The last
// <code> in the item is the key; everything before it is the value.
function parseFields(innerHtml) {
  const fields = [];
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(innerHtml))) {
    const li = m[1];
    const codeRe = /<code\b[^>]*>([\s\S]*?)<\/code>/gi;
    let last = null, c;
    while ((c = codeRe.exec(li))) last = c;
    if (!last) continue; // no postfix key → not a field bullet
    const key = decodeEntities(stripTags(last[1])).trim().toLowerCase();
    // Collapse any newline/tab (a Marpit soft line-break can survive into the
    // value) to a single space so it can't inject a raw \n into a WIFI:/vCard
    // property line and break the payload.
    const value = decodeEntities(stripTags(li.slice(0, last.index))).replace(/[\r\n\t]+/g, ' ').trim();
    fields.push({ value, key });
  }
  return fields;
}

// First value whose key matches any of the given aliases.
function pick(fields, ...keys) {
  const f = fields.find((x) => keys.includes(x.key));
  return f ? f.value : '';
}

// ── heading extraction (kept verbatim in the card) ──────────────────────────
function extractHeading(body) {
  const m = body.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/i);
  return m ? m[0] : '';
}

// ── eyebrow — the optional inline-code-only first paragraph (Lattice convention,
// e.g. `Room Wi-Fi`). Returns its raw text, or '' if the author didn't write one.
// A paragraph that also carries prose is NOT an eyebrow (must be code-only).
function extractEyebrow(body) {
  const m = body.match(/<p\b[^>]*>\s*<code\b[^>]*>([\s\S]*?)<\/code>\s*<\/p>/i);
  return m ? decodeEntities(stripTags(m[1])).trim() : '';
}

// ── QR encode (fixed error-correction, generous quiet zone) ─────────────────
// `label` is the accessible name for the SVG (screen readers / PDF a11y).
const encode = (payload, label) => qrSvg(payload, { ecLevel: 'M', margin: 3, label });

// ── depth-aware <section class="NAME"> walk (mirrors compare-code) ───────────
// Calls renderSection(innerHtml, cls) for each matching section; leaves the rest
// untouched. Idempotency is the renderSection's responsibility.
// The walk is the shared `mapSections` (lib/core/section-walk.js), which reads
// the document through the `scanTags` tokenizer. This used to be its own
// `indexOf('<section')` scan, so a `<section` quoted in a comment or in
// `<style>` text stopped it, and every wifi / contact / video slide after that
// point was left unbuilt (HARD RULE #1).
function walkSections(html, name, renderSection) {
  if (typeof html !== 'string' || html.indexOf(name) === -1) return html;
  // Exact class-token match — `\bwifi\b` would also fire on `wifi-card`, so a
  // future `wifi-*`/`contact-*` section class can't be misclassified.
  const has = (c) => c.trim().split(/\s+/).includes(name);
  return mapSections(html, (_openTag, cls, inner) => (has(cls) ? renderSection(inner, cls) : null));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = { parseFields, pick, extractHeading, extractEyebrow, encode, walkSections, esc, decodeEntities, stripTags };
