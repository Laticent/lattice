/**
 * wifi transform — a network join card.
 *
 * Authoring (postfix-key list):
 *   <!-- _class: wifi -->
 *   ## Join the room.
 *   - Offsite-Guest `ssid`
 *   - boardroom2026 `password`
 *   - WPA2 `security`
 *
 * Fields (key + aliases): ssid|network (req) · password|pass · security|auth|
 * encryption. Omitting the password yields an OPEN network. The payload is the
 * standard `WIFI:T:…;S:…;P:…;;` string a phone camera consumes; the readable
 * credentials are shown alongside for anyone typing manually.
 *
 * Idempotent: guarded on the `.qr-card` marker.
 */

const { parseFields, pick, extractHeading, extractEyebrow, encode, walkSections, esc } = require('../_qr-card/qr-card');
const { peelCoda } = require('../../../core/coda');

// WIFI security token: WPA/WPA2/WPA3 → WPA, WEP → WEP, open/nopass/none → nopass.
const SEC = { wpa: 'WPA', wpa2: 'WPA', wpa3: 'WPA', 'wpa/wpa2': 'WPA', wep: 'WEP', open: 'nopass', nopass: 'nopass', none: 'nopass', '': '' };
const escWifi = (s) => s.replace(/([\\;,:"])/g, '\\$1');

// One decision drives BOTH the encoded payload and the readable card, so they
// can never contradict (e.g. `security: open` alongside a password → the card
// must not show a password the QR omits). `T` is the resolved auth token;
// `open` is derived from it, not independently from the password's presence.
function resolveWifi(f) {
  const ssid = pick(f, 'ssid', 'network');
  const pass = pick(f, 'password', 'pass');
  const sec = pick(f, 'security', 'auth', 'encryption');
  const explicit = SEC[sec.toLowerCase().replace(/\s/g, '')];
  const T = explicit !== undefined && explicit !== '' ? explicit : (pass ? 'WPA' : 'nopass');
  return { ssid, pass, sec, T, open: T === 'nopass' };
}

function wifiPayload(f) {
  const { ssid, pass, T } = resolveWifi(f);
  return `WIFI:T:${T};S:${escWifi(ssid)};${T === 'nopass' ? '' : `P:${escWifi(pass)};`};`;
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

  const h2 = extractHeading(body);
  const eyebrow = extractEyebrow(body); // optional, authored
  const fields = parseFields(body);
  if (fields.length === 0) return inner; // nothing to build — leave as-authored

  const { ssid, pass, sec, open } = resolveWifi(fields);
  const caption = pick(fields, 'caption'); // optional, authored

  // Each row shows only what the author wrote — no appended hints, no defaults.
  const rows = [
    ssid && ['Network', esc(ssid), ''],
    !open && pass && ['Password', esc(pass), ' qr-mono'],
    sec && ['Security', esc(sec), ''],
  ].filter(Boolean);
  const dl = rows.map(([k, v, mono]) =>
    `<div class="qr-row"><dt>${k}</dt><dd class="${mono.trim()}">${v}</dd></div>`).join('');

  const eyebrowHtml = eyebrow ? `<p class="qr-eyebrow">${esc(eyebrow)}</p>` : '';
  const captionHtml = caption ? `<p class="qr-cta">${esc(caption)}</p>` : '';
  const svg = encode(wifiPayload(fields), 'Wi‑Fi join QR code');
  return `${header}<div class="qr-card wifi-card"><div class="qr-head">${eyebrowHtml}${h2}</div><div class="qr-body"><div class="qr-side"><div class="qr-tile">${svg}</div>${captionHtml}</div><dl class="qr-fields">${dl}</dl></div></div>${peeled.coda}${footer}`;
}

function applyToRenderedHtml(html) {
  return walkSections(html, 'wifi', (inner) => renderCard(inner));
}

module.exports = { wifiPayload, renderCard, applyToRenderedHtml };
