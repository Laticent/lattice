'use strict';
/**
 * The media plugins' shared display layer (lib/core/media-display.js; engineering/decisions/2026-10-16-media-plugins.md §4.7,
 * §4.11): the one order of settings, a placing host's overrides, the register words, the caption rules, and the words reaching
 * narration from the stamped attributes only.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const md = require('../../../lib/core/media-display.js');

describe('the one order: register and slide class, then the record, then a placing host', () => {
  test('defaults by kind: md, and a clip shows its title while a photo shows nothing', () => {
    assert.deepEqual(md.resolveDisplay('video', {}, {}), { size: 'md', show: 'title' });
    assert.deepEqual(md.resolveDisplay('image', {}, {}), { size: 'md', show: 'none' });
  });

  test('a slide class from the register sets a word, and the record wins over it', () => {
    const classes = ['content', 'image-mat', 'image-nimbus-40', 'image-lg'];
    assert.deepEqual(md.resolveDisplay('image', {}, { classes }), { size: 'lg', show: 'none', frame: 'mat', finish: 'nimbus', finishStrength: '40' });
    const rec = md.readRecordDisplay({ frame: 'keyline', halo: '20' }).display;
    const d = md.resolveDisplay('image', rec, { classes });
    assert.equal(d.frame, 'keyline');
    assert.equal(d.finish, 'halo');
    assert.equal(d.finishStrength, '20');
  });

  test('another kind\'s register is not this kind\'s', () => {
    assert.deepEqual(md.resolveDisplay('video', {}, { classes: ['image-mat'] }), { size: 'md', show: 'title' });
  });

  test('a flow host\'s show default yields to the record; a placing host\'s wins, and drops what it ignores', () => {
    const flow = { places: 'flow', kinds: ['image'], show: 'title' };
    assert.equal(md.resolveDisplay('image', {}, { host: flow }).show, 'title');
    assert.equal(md.resolveDisplay('image', { show: 'none' }, { host: flow }).show, 'none');
    const placing = { places: 'tiles', kinds: ['image'], show: 'none', ignores: ['frame', 'size'] };
    const d = md.resolveDisplay('image', { show: 'all', frame: 'mat', size: 'lg', tone: 'grayscale' }, { host: placing });
    assert.equal(d.show, 'none');
    assert.equal(d.frame, undefined);
    assert.equal(d.size, 'md');
    assert.equal(d.tone, 'grayscale', 'a tone it does not ignore stays');
  });

  test('a finish or tone named alone takes its default strength', () => {
    assert.equal(md.resolveDisplay('image', { finish: 'nimbus' }).finishStrength, '80');
    assert.equal(md.resolveDisplay('image', { finish: 'halo' }).finishStrength, '60');
    assert.equal(md.resolveDisplay('image', { tone: 'duotone' }).toneStrength, 'full');
  });

  test('two finishes, or two tones, are a contradiction the record reports', () => {
    assert.match(md.readRecordDisplay({ finish: 'halo', nimbus: '40' }).problem, /one finish at a time/);
    assert.match(md.readRecordDisplay({ tone: 'grayscale', duotone: '60' }).problem, /one tone at a time/);
    assert.equal(md.readRecordDisplay({ finish: 'nimbus', nimbus: '40' }).problem, null, 'a finish and its own strength agree');
  });
});

describe('the register words', () => {
  test('one axis each, the default first, and no word on two axes', () => {
    const axes = md.registerAxes();
    const words = Object.values(axes).flat();
    assert.equal(new Set(words).size, words.length);
    assert.ok(axes.finish.includes('nimbus-40') && axes.tone.includes('duotone-full'));
  });

  test('each media plugin\'s manifest declares exactly these axes', () => {
    for (const kind of ['video', 'image']) {
      let manifest;
      try { manifest = require(`../../../lib/plugins/${kind}/${kind}.manifest.json`); } catch { continue; }
      assert.deepEqual(manifest.contributes.registers[kind].axes, md.registerAxes(), kind);
    }
  });

  test('the register reads a strength written the record\'s way (`nimbus=40`)', () => {
    const { makeRegister } = require('../../../lib/core/register-factory.js');
    const axes = md.registerAxes();
    const reg = makeRegister('image', Object.entries(axes).map(([axis, names]) => ({ axis, names })));
    assert.deepEqual(reg.classes('mat nimbus=40'), ['image-mat', 'image-nimbus-40']);
  });
});

describe('the words on the slide and on the figure', () => {
  test('attributes carry only the kernel\'s own words and the escaped record text', () => {
    const a = md.displayAttrs('image', { size: 'sm', show: 'all', frame: 'mat' }, { title: 'A "quoted" <title>', description: 'x & y' });
    assert.match(a, /data-lattice-title="A &quot;quoted&quot; &lt;title&gt;"/);
    assert.match(a, /data-lattice-description="x &amp; y"/);
  });

  test('a shown title reserves its line even when empty; a hidden one is not rendered', () => {
    assert.equal(md.captionHtml({ show: 'title' }, {}), '<figcaption class="lat-media-caption"><span class="lat-media-title"></span></figcaption>');
    assert.equal(md.captionHtml({ show: 'none' }, { title: 'T', description: 'D' }), '');
    assert.match(md.captionHtml({ show: 'title' }, { title: 'T' }, { titleIsName: true }), /aria-hidden="true">T</);
  });
});

describe('narration speaks the stamped words, never the visible caption or a forged figure', () => {
  test('title then description, two sentences, whatever show= made visible', async () => {
    const { projectDeckToScript } = await import('../../../lib/transformers/prose-projection.mjs');
    const engine = require('../../../lib/engine');
    const deck = (rec) => `---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n## Tour\n\n${rec}\n`;
    for (const show of ['none', 'title', 'all']) {
      const { html } = engine.render(deck(`\`>{"https://youtu.be/dQw4w9WgXcQ", title="Q3 offsite", description="The field team at Lake Louise", show=${show}}\``));
      const dom = new JSDOM(`<!doctype html><body>${html}</body>`);
      const script = projectDeckToScript([...dom.window.document.querySelectorAll('section')]);
      const text = JSON.stringify(script);
      assert.match(text, /Q3 offsite\. The field team at Lake Louise\./, show);
      assert.doesNotMatch(text, /Q3 offsite Q3 offsite|Watch on YouTube|youtu/, show);
    }
  });

  test('author HTML cannot stamp a figure\'s words', () => {
    const engine = require('../../../lib/engine');
    const { html } = engine.render('---\ntheme: indaco\n---\n\n<figure data-lattice-media="image" data-lattice-title="Forged"></figure>\n');
    assert.doesNotMatch(html, / data-lattice-title="Forged"/);
    assert.doesNotMatch(html, / data-lattice-media="image"/);
  });
});
