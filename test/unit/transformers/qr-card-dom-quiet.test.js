/**
 * Unit: a QR-card adapter (wifi, contact, gift-card) writes to the live section only when the card changes.
 *
 * An `innerHTML` assignment is a childList mutation even when the string is the same, and the runtime's observer
 * answers every mutation with another content pass. A slide with no card fields yet, which `renderCard` leaves as
 * written, was rewritten on every pass, so the runtime re-ran every ~150 ms for as long as the slide was open
 * (Chromium, 2026-11-11: 21 passes in 3 s on one `wifi` slide, 2 on a `content` slide). Found when
 * test/integration/parity/runtime-cards-align.test.js moved to a virtual clock and its boot never went idle.
 * The fix is `rebuildCardsInDom` in lib/transformers/qr-card-dom.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const ADAPTERS = {
  wifi: { mod: require('../../../lib/transformers/wifi'), fields: '<li>Guest <code>ssid</code></li><li>hunter2 <code>password</code></li>' },
  contact: { mod: require('../../../lib/transformers/contact'), fields: '<li>Ada Lovelace <code>name</code></li><li>ada@example.test <code>email</code></li>' },
  'gift-card': { mod: require('../../../lib/transformers/gift-card'), fields: '<li><code>https://example.test/gift#v1.FAKE</code> <code>link</code></li>' },
};

/** Run one adapter over `inner` and report how many mutation records its write produced. */
async function writesFrom(name, inner) {
  const dom = new JSDOM(`<!DOCTYPE html><body><section class="${name}">${inner}</section></body>`);
  const { document, MutationObserver } = dom.window;
  const records = [];
  const observer = new MutationObserver((r) => records.push(...r));
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
  ADAPTERS[name].mod.applyToDom(document.body);
  records.push(...observer.takeRecords());
  observer.disconnect();
  const html = document.querySelector('section').innerHTML;
  dom.window.close();
  return { records: records.length, html };
}

for (const name of Object.keys(ADAPTERS)) {
  test(`${name}: a slide with no card fields yet is not rewritten`, async () => {
    const { records } = await writesFrom(name, '<h2>T</h2><ul><li>A<ul><li>a</li></ul></li></ul>');
    assert.equal(records, 0, 'an unchanged card must not touch the DOM, or the runtime re-runs forever');
  });

  test(`${name}: a built card is not rewritten, and a card with fields is built (the control)`, async () => {
    const built = await writesFrom(name, `<h2>T</h2><ul>${ADAPTERS[name].fields}</ul>`);
    assert.ok(built.records > 0, 'the control: a slide with fields IS rebuilt, so a zero above means something');
    assert.match(built.html, /class="qr-card/);
    const again = await writesFrom(name, built.html);
    assert.equal(again.records, 0, 'the second pass over a built card writes nothing');
  });
}

// A slide with no fields but a closing beat: `renderCard` peeled the coda and then returned the rest, so the author's
// Key Insight vanished from the slide (found by this PR's checker; gift-card already returned the slide as written).
for (const [name, kernel] of [
  ['wifi', require('../../../lib/components/connect/wifi/wifi.transform')],
  ['contact', require('../../../lib/components/connect/contact/contact.transform')],
  ['gift-card', require('../../../lib/components/connect/gift-card/gift-card.transform')],
]) {
  test(`${name}: a slide with no fields keeps its coda`, () => {
    const inner = '<h2>T</h2><p>Body.</p><div class="cell-coda" data-dock="row"><p>The beat.</p></div>';
    assert.equal(kernel.renderCard(inner), inner, 'left exactly as authored, coda included');
  });
}
