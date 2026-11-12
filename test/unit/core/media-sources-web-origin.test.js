// `webOrigin` (lib/core/media-sources.js) decides a long address from its head when the head already rules out
// the web, instead of lowercasing megabytes of `data:` photo (2026-11-11-deferred-asset-bytes.md §4). The answer
// must be exactly the full-string answer. The oracle is the function body before the shortcut, verbatim; the
// cases put every shape the start can take (case, tabs and newlines inside the scheme, leading C0 and spaces,
// backslashes, protocol-relative) in front of a payload long enough to take the shortcut. Seeded (HARD RULE #32).
const test = require('node:test');
const assert = require('node:assert/strict');
const { webOrigin, urlAsParsed } = require('../../../lib/core/media-sources.js');

function oracle(raw) {
  let s = urlAsParsed(raw).replace(/\\/g, '/');
  if (s.startsWith('//')) s = `https:${s}`;
  s = s.replace(/^(https?:)\/*/i, '$1//');
  if (!/^https?:\/\//i.test(s)) return null;
  try {
    const { origin } = new URL(s);
    return origin && origin !== 'null' ? origin : null;
  } catch {
    return null;
  }
}

test('a long address gets the same origin, or null, as the whole-string reading', () => {
  const heads = ['data:image/png;base64,', 'DATA:image/png;base64,', 'da\tta:', 'blob:https://x.example/', 'https://cdn.example.com/a.png?', 'HTTPS://CDN.example.com/', 'ht\ntps://h.example/', 'http:h.example/', 'http:/h.example/', '//h.example/x', '\\\\h.example/x', '/\\h.example/', 'sample:photo', 'asset:hero', 'file:///x', 'h', 'ht', 'http', 'https', 'https:', '  \u0001https://lead.example/', '\t\n\r', ''];
  const pads = ['', ' '.repeat(1100), '\t'.repeat(1030), '\u0000'.repeat(1500)];
  const seed = 7;
  let x = seed;
  const rand = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  for (const pad of pads) {
    for (const head of heads) {
      const body = Array.from({ length: 1200 + Math.floor(rand() * 400) }, () => 'AbZz09+/=\t'[Math.floor(rand() * 10)]).join('');
      const raw = pad + head + body;
      assert.equal(webOrigin(raw), oracle(raw), `seed ${seed}: ${JSON.stringify((pad + head).slice(0, 40))}`);
    }
  }
});

test('a short address takes the full reading, as before', () => {
  for (const raw of ['https://a.example/x.png', 'data:image/png;base64,AAAA', '//b.example/y', 'relative.png', '']) assert.equal(webOrigin(raw), oracle(raw));
});
