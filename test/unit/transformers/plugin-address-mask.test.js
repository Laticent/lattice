/**
 * No built-in pass reads a plugin's output as an address (spec/LPM.md §10;
 * engineering/decisions/2026-10-16-media-plugins.md §4.5).
 *
 * The fence door draws a plugin's output inside `<div data-lattice-plugin>` / `<span data-lattice-plugin>`. A pass that
 * turns slide text into something the viewer loads or scans (a QR, a poster, a mask) reads through
 * `maskPluginSubtrees` (HTML) or skips `closest('[data-lattice-plugin]')` (DOM), so a plugin that writes
 * `https://attacker…` as a bullet is never mistaken for the author. The DOM halves matter most: the runtime runs them
 * over the finished page, plugin output included, whenever the engine's HTML half found nothing to build.
 * `checkSlideTextAddressReaders` (tools/check-ownership.js) holds every such reader to its guard.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { maskPluginSubtrees } = require('@laticent/markup');

const EVIL = 'https://attacker.test/leak?d=SECRET';
const pluginLi = (text, key = '') => `<div data-lattice-plugin="gp"><ul><li>${text}${key ? ` <code>${key}</code>` : ''}</li></ul></div>`;
const domOf = (cls, inner) => new JSDOM(`<body><section class="${cls}">${inner}</section></body>`).window.document;

describe('maskPluginSubtrees', () => {
  test('blanks each plugin subtree, keeps the length, and leaves the author alone', () => {
    const src = `<ul><li>a</li></ul>${pluginLi(EVIL)}<p>b<span data-lattice-plugin="k" data-kind="k">x<span>y</span></span>c</p>`;
    const out = maskPluginSubtrees(src);
    assert.equal(out.length, src.length);
    assert.doesNotMatch(out, /attacker|data-lattice-plugin|>x</);
    assert.match(out, /^<ul><li>a<\/li><\/ul>/);
    assert.match(out, /<p>b\s+c<\/p>$/);
  });

  test('the door\'s own neighbors are not plugin roots: -off placeholders and -data scripts stay', () => {
    const src = '<div data-lattice-plugin-off="gp">p</div><script data-lattice-plugin-data="x"></script>';
    assert.equal(maskPluginSubtrees(src), src);
  });

  test('fails closed: an unclosed root blanks to the end, case and a quoted `>` do not hide one, a comment is not one', () => {
    assert.equal(maskPluginSubtrees('<li>a</li><div title="a > b" data-lattice-plugin="g"><li>evil').trim(), '<li>a</li>');
    assert.equal(maskPluginSubtrees('<DIV DATA-LATTICE-PLUGIN="g">e<div></div></DIV>z').trim(), 'z');
    const comment = '<!-- <div data-lattice-plugin> --><li>ok</li>';
    assert.equal(maskPluginSubtrees(comment), comment);
  });
});

describe('the QR passes read no field out of plugin output', () => {
  test('contact: the HTML kernel builds its card from the author\'s fields only', () => {
    const { applyToRenderedHtml } = require('../../../lib/components/connect/contact/contact.transform.js');
    const html = `<section class="contact"><h2>Ada</h2><ul><li>Ada Lovelace <code>name</code></li></ul>${pluginLi(EVIL, 'url')}</section>`;
    const out = applyToRenderedHtml(html);
    assert.match(out, /qr-card/, 'the author\'s card is built');
    assert.doesNotMatch(out.replace(/<div data-lattice-plugin[\s\S]*$/, ''), /attacker/, 'no field came from the plugin');
  });

  test('contact and wifi: a DOM pass over a slide whose only fields are the plugin\'s builds nothing', () => {
    for (const [cls, key] of [['contact', 'url'], ['wifi', 'ssid']]) {
      const doc = domOf(cls, `<h2>T</h2>${pluginLi(EVIL, key)}`);
      require(`../../../lib/transformers/${cls}.js`).applyToDom(doc.body);
      assert.equal(doc.querySelector('.qr-card'), null, `${cls}: no card from plugin text`);
      assert.equal(doc.querySelectorAll('[data-lattice-plugin] li').length, 1, `${cls}: the plugin's drawing is untouched`);
    }
  });

  test('qr-general: the plugin\'s link is never the payload, on either path, and the author\'s still is', () => {
    const kernel = require('../../../lib/components/connect/_qr-card/qr-general.transform.js');
    const onlyPlugin = `<h2>Clip</h2>${pluginLi(`<a href="${EVIL}">${EVIL}</a>`)}`;
    assert.equal(kernel.renderSection(onlyPlugin, 'closing qr'), onlyPlugin, 'HTML: nothing to encode');
    const doc = domOf('closing qr', onlyPlugin);
    require('../../../lib/transformers/qr-general.js').applyToDom(doc.body);
    assert.equal(doc.querySelector('.qr-figure'), null, 'DOM: nothing to encode');
    const both = `<h2>Clip</h2>${pluginLi(EVIL)}<ul><li>https://example.com/author</li></ul>`;
    const out = kernel.renderSection(both, 'closing qr');
    assert.match(out, /class="qr-figure"/);
    assert.match(out, /<div data-lattice-plugin="gp"><ul><li>https:\/\/attacker\.test/, 'the plugin\'s bullet is not removed as a payload');
    assert.doesNotMatch(out, /<li>https:\/\/example\.com\/author<\/li>/, 'the author\'s bullet became the code');
  });
});

describe('the passes that move an address skip plugin output', () => {
  test('video: a figure inside plugin output is never the slide\'s figure', () => {
    const { takeFigure } = require('../../../lib/components/imagery/video/video.transform.js');
    const fig = '<figure class="video-embed" data-lattice-media="video" data-lattice-media-url="https://youtu.be/AAAAAAAAAAA"></figure>';
    assert.equal(takeFigure(`<div data-lattice-plugin="gp">${fig}</div>`), null);
    const own = takeFigure(`<div data-lattice-plugin="gp">${fig}</div>${fig.replace('AAAAAAAAAAA', 'BBBBBBBBBBB')}`);
    assert.match(own.html, /BBBBBBBBBBB/);
  });

  test('logo-marks: a plugin\'s <img> is not turned into a mask', () => {
    const doc = domOf('logo-wall', '<ul><li><img src="a.svg" alt="A"></li></ul><div data-lattice-plugin="gp"><img src="b.svg" alt="B"></div>');
    require('../../../lib/transformers/logo-marks.js').applyToDom(doc.body);
    assert.equal(doc.querySelectorAll('.logo-mark').length, 1);
    assert.ok(doc.querySelector('[data-lattice-plugin] img'), 'the plugin\'s picture is as it drew it');
  });
});

describe('what the design rests on', () => {
  test('the fence door is the registry\'s LAST pass: no shipped HTML pass sees a plugin\'s output', () => {
    // logo-marks, team-profile and collage leave their HTML halves unmasked because of this order alone
    // (SANCTIONED_SLIDE_TEXT_ADDRESS_READERS says so per entry). Moving the door earlier must fail here first.
    const { TRANSFORMERS } = require('../../../lib/transformers/registry.js');
    assert.equal(TRANSFORMERS.at(-1).name, 'code-fences');
  });
});
