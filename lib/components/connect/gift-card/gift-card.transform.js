/**
 * gift-card transform — a business card whose QR opens a Lattice gift link.
 *
 * Authoring (postfix-key list; tools/gift-cards.mjs writes these):
 *   <!-- _class: gift-card -->
 *   `A deck on us`
 *   ## Make your next deck with Lattice.
 *   - `https://lattice.style/gift#v1.…` `link`
 *   - 482 913 `pin`
 *   - Scan to start. Up to $1 of AI is on the house. `caption`
 *   - No. 7 `number`
 *
 * Fields (key + aliases): link|url (required) · pin · caption · number|no.
 *
 * THE LINK IS NEVER PRINTED AS TEXT. It carries a working, spendable key, and a 70-character
 * string on a card helps nobody: it goes into the QR only. Write it inside a code span, as the
 * CLI does, so Markdown cannot read an underscore in the token as emphasis. The PIN, when the
 * link is locked, is printed apart from the code (design §1).
 *
 * Design: engineering/decisions/2026-11-06-gift-link-cli.md §5. Idempotent: guarded on `.qr-card`.
 */

const { parseFields, pick, extractHeading, extractEyebrow, encode, walkSections, esc, decodeEntities, stripTags, num } = require('../_qr-card/qr-card');
const { peelCoda } = require('../../../core/coda');

/** The `<footer>…</footer>` the section ends with (trailing whitespace included), or ''. String
 * slicing, not a lazy regex, which runs super-linear on a long section with no footer. */
function trailingFooter(inner) {
  const t = inner.trimEnd();
  if (!t.endsWith('</footer>')) return '';
  const i = t.lastIndexOf('<footer');
  return i < 0 ? '' : inner.slice(i);
}

/** The body with its field list cut out: from the first `<ul` to the end of the last `</ul>`. */
function withoutList(body) {
  const start = body.indexOf('<ul');
  const end = body.lastIndexOf('</ul>');
  return start < 0 || end < start ? body : body.slice(0, start) + body.slice(end + 5);
}

function renderCard(inner) {
  if (inner.indexOf('class="qr-card') !== -1) return inner; // idempotent
  const header = (inner.match(/^\s*<header[\s\S]*?<\/header>/) || [''])[0];
  const footer = trailingFooter(inner);
  // The universal coda cell rides through the rebuild, as in wifi (lib/core/coda.js).
  const peeled = peelCoda(inner);
  let body = peeled.rest;
  if (header) body = body.slice(header.length);
  if (footer) body = body.slice(0, body.length - footer.length);

  const fields = parseFields(body);
  const link = pick(fields, 'link', 'url');
  if (!link) return inner; // nothing to encode — leave as authored

  const h2 = extractHeading(body);
  // The eyebrow is read OUTSIDE the field list. In a loose list (blank lines between bullets) each
  // field is its own `<p>`, and a code-only paragraph there is the link itself: read as an eyebrow,
  // it would print a working key as text.
  const eyebrow = extractEyebrow(withoutList(body));
  const pin = pick(fields, 'pin');
  const caption = pick(fields, 'caption');
  const number = pick(fields, 'number', 'no');

  const headChars = Math.max(1, decodeEntities(stripTags(h2)).trim().length);
  const eyebrowHtml = eyebrow ? `<p class="qr-eyebrow">${esc(eyebrow)}</p>` : '';
  const pinHtml = pin ? `<p class="gift-pin"><span class="gift-pin-label">PIN</span> <span class="gift-pin-value">${esc(pin)}</span></p>` : '';
  const captionHtml = caption ? `<p class="qr-cta" style="--cta-chars:${num(caption.length)}">${esc(caption)}</p>` : '';
  const numberHtml = number ? `<p class="gift-number">${esc(number)}</p>` : '';
  const svg = encode(link, 'QR code: scan to open your Lattice gift');
  return `${header}<div class="qr-card gift-card-card"><div class="qr-side"><div class="qr-tile">${svg}</div></div><div class="qr-head" style="--head-chars:${num(headChars)}">${eyebrowHtml}${h2}</div><div class="gift-foot">${pinHtml}${captionHtml}${numberHtml}</div></div>${peeled.coda}${footer}`;
}

function applyToRenderedHtml(html) {
  return walkSections(html, 'gift-card', (inner) => renderCard(inner));
}

module.exports = { renderCard, applyToRenderedHtml };
