/**
 * contact — the card's payload and ledger (lib/components/connect/contact/contact.transform.js).
 *
 * Telephone is a first-class field: each phone key is its own vCard TEL line with a TYPE, the
 * ledger lists lines in the order the author wrote them, and `qr:` picks what the code carries
 * (the whole vCard, a `tel:` link that dials, or a URL). The geometry is pinned by
 * tools/check-venue-conformance.js, which renders the card at every venue and canvas family.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { vcardPayload, qrPayload, renderCard } = require('../../../lib/components/connect/contact/contact.transform');

const f = (...pairs) => pairs.map(([key, value]) => ({ key, value }));
const slide = (...pairs) => `<ul>${pairs.map(([k, v]) => `<li>${v} <code>${k}</code></li>`).join('')}</ul>`;

describe('vcardPayload — telephone', () => {
  test('each phone key is its own TEL line, typed by the key', () => {
    const v = vcardPayload(f(['name', 'Ada'], ['mobile', '+1 555 0100'], ['office', '+1 555 0199'], ['phone', '+1 555 0111']));
    assert.match(v, /^TEL;TYPE=CELL:\+1 555 0100$/m);
    assert.match(v, /^TEL;TYPE=WORK:\+1 555 0199$/m);
    assert.match(v, /^TEL;TYPE=VOICE:\+1 555 0111$/m);
  });

  test('aliases fold onto the same type', () => {
    const v = vcardPayload(f(['name', 'Ada'], ['cell', '1'], ['work', '2'], ['tel', '3'], ['voice', '4']));
    assert.deepEqual(v.match(/^TEL;TYPE=\w+/gm), ['TEL;TYPE=CELL', 'TEL;TYPE=WORK', 'TEL;TYPE=VOICE', 'TEL;TYPE=VOICE']);
  });

  test('an empty phone value writes no TEL line', () => {
    assert.doesNotMatch(vcardPayload(f(['name', 'Ada'], ['phone', ''])), /TEL/);
  });
});

describe('qrPayload — what the code carries', () => {
  const base = f(['name', 'Ada'], ['mobile', '+1 (555) 014-2200'], ['url', 'laticent.io']);

  test('the default is the whole vCard', () => {
    assert.equal(qrPayload(base), vcardPayload(base));
  });

  test('`tel` dials the first phone line, as digits with a leading +', () => {
    assert.equal(qrPayload([...base, ...f(['qr', 'tel'])]), 'tel:+15550142200');
  });

  test('`url` carries the link, adding https:// when the author omitted the scheme', () => {
    assert.equal(qrPayload([...base, ...f(['qr', 'url'])]), 'https://laticent.io');
    assert.equal(qrPayload([...f(['name', 'A'], ['url', 'http://x.io/a'], ['qr', 'url'])]), 'http://x.io/a');
  });

  test('a mode whose field is missing falls back to the vCard rather than an empty code', () => {
    const noPhone = f(['name', 'Ada'], ['qr', 'tel']);
    assert.equal(qrPayload(noPhone), vcardPayload(noPhone));
    const noUrl = f(['name', 'Ada'], ['qr', 'url']);
    assert.equal(qrPayload(noUrl), vcardPayload(noUrl));
  });

  test('an unknown mode is the vCard', () => {
    const fields = [...base, ...f(['qr', 'bluetooth'])];
    assert.equal(qrPayload(fields), vcardPayload(fields));
  });

  test('a phone value with no digits does not make a dead tel: code', () => {
    const fields = f(['name', 'Ada'], ['phone', 'call me'], ['qr', 'tel']);
    assert.equal(qrPayload(fields), vcardPayload(fields));
  });

  test('a phone extension is left out of the tel: code, never dialed as digits', () => {
    const fields = f(['name', 'Ada'], ['phone', '+1 (555) 010-0100 ext. 23'], ['qr', 'tel']);
    assert.equal(qrPayload(fields), 'tel:+15550100100');
  });
});

describe('renderCard — ledger', () => {
  const html = renderCard(slide(['name', 'Ada Slide'], ['url', 'laticent.io'], ['mobile', '+1 555 0100'], ['email', 'a@b.io'], ['office', '+1 555 0199']));
  const ledger = html.match(/<div class="qr-ledger"[^>]*>([\s\S]*?)<\/div>/)[1];

  test('lists every line in the order the author wrote them, phones included', () => {
    assert.deepEqual([...ledger.matchAll(/data-kind="(\w+)">([^<]*)/g)].map((m) => `${m[1]}:${m[2]}`), ['url:laticent.io', 'tel:+1 555 0100', 'email:a@b.io', 'tel:+1 555 0199']);
  });

  test('carries the length hints the CSS fits the type to', () => {
    assert.match(html, /--name-chars:5/);
    assert.match(html, /--ledger-chars:11/);
  });

  test('a two-word name stacks on its last word; a one-word name does not', () => {
    assert.match(html, /Ada<br>Slide/);
    assert.doesNotMatch(renderCard(slide(['name', 'Cher'])), /<br>/);
  });

  test('is idempotent', () => {
    assert.equal(renderCard(html), html);
  });
});
