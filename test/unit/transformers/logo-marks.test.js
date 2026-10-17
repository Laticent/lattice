// logo-marks transformer — `logo-wall` `<img>` marks become token-colored
// `.logo-mark` mask spans. The web/preview paths emit the mask span; the
// emulator later swaps it for inline SVG (tested via the emulator, not here).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const t = require('../../../lib/transformers/logo-marks');

const wrap = (cls, inner) => `<section id="1" class="${cls}">${inner}</section>`;

describe('logo-marks — applyToHtml', () => {
  test('rewrites a logo-wall <img> to a .logo-mark mask span, alt → aria-label', () => {
    const out = t.applyToHtml(wrap('logo-wall form', '<ul><li><img src="acme.svg" alt="Acme"></li></ul>'));
    assert.match(out, /<span class="logo-mark" role="img" aria-label="Acme" style="--logo-mask:url\('acme\.svg'\)"><\/span>/);
    assert.doesNotMatch(out, /<img/);
  });

  test('resolves a relative mark src against ctx.baseUrl (web preview)', () => {
    const out = t.applyToHtml(wrap('logo-wall', '<ul><li><img src="acme.svg" alt="Acme"></li></ul>'),
      { baseUrl: 'https://o/v/h/samples/' });
    assert.match(out, /--logo-mask:url\('https:\/\/o\/v\/h\/samples\/acme\.svg'\)/);
  });

  test('leaves a remote src untouched', () => {
    const out = t.applyToHtml(wrap('logo-wall', '<ul><li><img src="https://x/y.svg" alt="Y"></li></ul>'),
      { baseUrl: 'https://o/v/h/samples/' });
    assert.match(out, /--logo-mask:url\('https:\/\/x\/y\.svg'\)/);
  });

  test('ignores <img> outside a logo-wall section', () => {
    const html = wrap('image', '<img src="photo.svg" alt="bg">');
    assert.equal(t.applyToHtml(html), html);
  });

  test('leaves chrome imgs in a logo-wall section alone (deck-logo, emoji, srcless)', () => {
    // The deck-logo (aria-hidden + class) and a title emoji (class) are NOT marks —
    // masking them would recolour them and strip their role. A srcless img is skipped.
    const deckLogo = '<img class="deck-logo" src="logo.svg" alt="" aria-hidden="true">';
    const emoji = '<img class="emoji" src="1f600.svg" alt="grinning">';
    const out = t.applyToHtml(wrap('logo-wall',
      `<header>${deckLogo}</header><h2>Trusted <img src="" alt=""> by</h2><ul><li><img src="acme.svg" alt="Acme"></li></ul>${emoji}`));
    assert.match(out, /class="logo-mark"[^>]*aria-label="Acme"/); // the real mark converts
    assert.ok(out.includes(deckLogo), 'deck-logo left untouched');
    assert.ok(out.includes(emoji), 'emoji left untouched');
    assert.equal((out.match(/class="logo-mark"/g) || []).length, 1, 'only the one real mark is masked');
  });

  test('is idempotent — a second pass finds no <img> and is a no-op', () => {
    const once = t.applyToHtml(wrap('logo-wall', '<ul><li><img src="a.svg" alt="A"></li></ul>'));
    assert.equal(t.applyToHtml(once), once);
  });

  test('a mark with no alt emits no aria-label', () => {
    const out = t.applyToHtml(wrap('logo-wall', '<ul><li><img src="a.svg"></li></ul>'));
    assert.match(out, /<span class="logo-mark" role="img" style=/);
  });
});

describe('logo-marks — the live stamp packs the same lists the CLI stamp does', () => {
  const { JSDOM } = require('jsdom');
  const { stampWall } = require('../../../lib/core/logo-wall-pack');
  // A mark as a data: SVG mask, which both paths read without a fetch.
  const mark = (w, h) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"/>`;
    return `<li><span class="logo-mark" role="img" style="--logo-mask:url('data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}')"></span></li>`;
  };
  const list = `<ul>${mark(240, 80)}${mark(80, 80)}${mark(80, 160)}${mark(320, 80)}</ul>`;
  const section = (lede) => `<section class="logo-wall"><h2>Trusted by</h2><div class="cell-stage">${lede}${list}</div></section>`;
  const live = async (html) => {
    const { document } = new JSDOM(`<body>${html}</body>`).window;
    t.applyToDom(document);
    await new Promise((r) => setTimeout(r, 50));
    return document.querySelector('.cell-stage > ul').getAttribute('data-logo-wall');
  };
  const cli = (html) => /<ul[^>]*data-logo-wall="([^"]*)"/.exec(stampWall(html))?.[1] ?? null;

  test('a list that opens the stage is packed on both paths', async () => {
    assert.equal(cli(section('')), 'packed');
    assert.equal(await live(section('')), 'packed');
  });

  test('a list after a lede paragraph keeps the old grid on both paths', async () => {
    const html = section('<p>Forty partners trust the platform.</p>');
    assert.equal(cli(html), null);
    assert.equal(await live(html), null);
  });
});
