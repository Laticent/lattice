/**
 * contact transform — a business/identity card that encodes a vCard.
 *
 * Authoring (postfix-key list):
 *   <!-- _class: contact -->
 *   ## Add me.
 *   - Sharmarke Aden `name`
 *   - Founder & CEO `title`
 *   - Laticent `org`
 *   - sharmarke@laticent.io `email`
 *   - +1-555-0142 `phone`
 *   - laticent.io `url`
 *
 * Fields (key + aliases): name (req) · title|role · org|company · email ·
 * phone|tel|voice · mobile|cell · office|work · url|web|site · qr · caption.
 * `name` is the hero; title/org form the lockup; email, every phone line and url
 * are the ledger, in the order the author wrote them. Each phone key becomes its
 * own TEL line in the vCard (TYPE=VOICE|CELL|WORK). All non-empty fields encode
 * into the vCard; the card shows the human-facing subset.
 *
 * `qr` picks what the code carries: `vcard` (default, the whole card), `tel`
 * (the first phone line, a code that DIALS) or `url`. The lean modes exist
 * because code density is what limits scanning distance: a full vCard is 55-67
 * modules wide, `tel:` is 27, so at the same printed width its modules are about
 * 2.5x larger. A mode whose field is missing falls back to `vcard`.
 *
 * Idempotent: guarded on the `.qr-card` marker.
 */

const { parseFields, pick, encode, walkSections, esc, num } = require('../_qr-card/qr-card');

// Phone keys → the vCard TYPE each one stamps. Authored order is kept: the ledger
// and the vCard list them the way the author wrote them.
const PHONE_TYPES = { phone: 'VOICE', tel: 'VOICE', voice: 'VOICE', mobile: 'CELL', cell: 'CELL', office: 'WORK', work: 'WORK' };
const isPhone = (key) => Object.hasOwn(PHONE_TYPES, key);
const phoneLines = (fields) => fields.filter((f) => f.value && isPhone(f.key));

// `tel:` wants digits with an optional leading + (RFC 3966 global number); the card
// still SHOWS the number as authored.
const telUri = (v) => { const d = String(v).replace(/\s*(?:ext\.?|x|#)\s*\d+\s*$/i, '').replace(/(?!^\+)[^\d]/g, ''); return /\d/.test(d) ? `tel:${d}` : ''; };
const webUri = (v) => (/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
const { peelCoda } = require('../../../core/coda');

// vCard 3.0 (RFC 2426 §5): backslash-escape \ ; , in a value, and fold any
// newline to a literal \n — an unescaped ; splits a structural property (ORG,
// N) and a raw newline terminates the line, either of which yields a vCard a
// phone rejects. (Newlines are already collapsed at parse; this is the spec
// belt-and-braces so a value like "Acme, Inc.; APAC" round-trips intact.)
const escVcard = (s) => String(s).replace(/([\\;,])/g, '\\$1').replace(/\r?\n/g, '\\n');

function vcardPayload(f) {
  const L = ['BEGIN:VCARD', 'VERSION:3.0'];
  L.push(`FN:${escVcard(pick(f, 'name'))}`);
  const title = pick(f, 'title', 'role'), org = pick(f, 'org', 'company');
  const email = pick(f, 'email'), url = pick(f, 'url', 'web', 'site');
  if (title) L.push(`TITLE:${escVcard(title)}`);
  if (org) L.push(`ORG:${escVcard(org)}`);
  if (email) L.push(`EMAIL:${escVcard(email)}`);
  for (const p of phoneLines(f)) L.push(`TEL;TYPE=${PHONE_TYPES[p.key]}:${escVcard(p.value)}`);
  if (url) L.push(`URL:${escVcard(url)}`);
  L.push('END:VCARD');
  return L.join('\n');
}

/** What the QR carries: the whole vCard, or a lean `tel:` / URL code (see the header). */
function qrPayload(f) {
  const mode = pick(f, 'qr').toLowerCase();
  if (mode === 'tel') { const first = phoneLines(f)[0]; const uri = first && telUri(first.value); if (uri) return uri; }
  if (mode === 'url') { const url = pick(f, 'url', 'web', 'site'); if (url) return webUri(url); }
  return vcardPayload(f);
}

// Break a name before its last word so a two-part name stacks (Sharmarke / Aden). The length
// of its longest line rides along as a hint: a display name must shrink to its column, and
// only the text knows how long it is.
function nameParts(name) {
  const m = name.match(/^(.*\S)\s+(\S+)$/);
  const longest = m ? Math.max(m[1].length, m[2].length) : name.length;
  return { html: m ? `${esc(m[1])}<br>${esc(m[2])}` : esc(name), chars: Math.max(1, longest) };
}

function renderCard(inner) {
  if (inner.indexOf('class="qr-card"') !== -1) return inner; // idempotent
  const header = (inner.match(/^\s*<header[\s\S]*?<\/header>/) || [''])[0];
  const footer = (inner.match(/<footer[\s\S]*?<\/footer>\s*$/) || [''])[0];
  // The universal coda cell rides through the rebuild. This transform replaces the
  // section's whole inner HTML from the parsed fields, so a trailing beat the author
  // wrote was simply DROPPED — the manifest advertised a Key Insight and the export
  // silently contained none (lib/core/coda.js). Peeled beside the chrome, re-appended
  // as the frame's full-width band below the card.
  const peeled = peelCoda(inner);
  inner = peeled.rest;
  let body = inner;
  if (header) body = body.slice(header.length);
  if (footer) body = body.slice(0, body.length - footer.length);

  const fields = parseFields(body);
  if (fields.length === 0) return inner;

  const name = pick(fields, 'name');
  const title = pick(fields, 'title', 'role'), org = pick(fields, 'org', 'company');
  const lockup = [title, org].filter(Boolean).map((v) => `<span>${esc(v)}</span>`).join('');
  // The ledger follows the author's order, and a phone line carries its kind (a mobile
  // and an office line are different numbers) as `data-kind`.
  const kindOf = (key) => (isPhone(key) ? 'tel' : key === 'email' ? 'email' : ['url', 'web', 'site'].includes(key) ? 'url' : '');
  const ledger = fields.filter((f) => f.value && kindOf(f.key))
    .map((f) => `<span data-kind="${kindOf(f.key)}">${esc(f.value)}</span>`).join('');
  const longest = (list) => Math.max(1, ...list.map((v) => String(v).length));
  const ledgerChars = longest(fields.filter((f) => f.value && kindOf(f.key)).map((f) => f.value));

  const lockupHtml = lockup
    ? `<div class="qr-lockup" style="--lockup-chars:${num([title, org].filter(Boolean).join(' · ').length)}">${lockup}</div>` : '';
  const caption = pick(fields, 'caption'); // optional, authored
  const captionHtml = caption ? `<p class="qr-cta" style="--cta-chars:${num(caption.length)}">${esc(caption)}</p>` : '';
  const svg = encode(qrPayload(fields), 'Contact QR code');
  const nm = nameParts(name);

  return `${header}<div class="qr-card contact-card"><div class="qr-identity"><p class="qr-name" style="--name-chars:${num(nm.chars)}">${nm.html}</p>${lockupHtml}${ledger ? `<div class="qr-ledger" style="--ledger-chars:${num(ledgerChars)}">${ledger}</div>` : ''}</div><div class="qr-side"><div class="qr-tile">${svg}</div>${captionHtml}</div></div>${peeled.coda}${footer}`;
}

function applyToRenderedHtml(html) {
  return walkSections(html, 'contact', (inner) => renderCard(inner));
}

module.exports = { vcardPayload, qrPayload, renderCard, applyToRenderedHtml };
