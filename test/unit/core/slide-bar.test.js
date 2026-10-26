/**
 * Unit: the spectrum bar as an overlay on the full-bleed frames (lib/core/slide-bar.js).
 *
 * Three things have to stay true together. The JS list of bleed frames names the slides that get
 * the `.slide-bar` layer. The CSS list on the placement rules (base.variants.css) names the slides
 * that get NO bar border. If those two drift, a frame draws two bars or none, and check:edge-shift
 * cannot tell: a frame with no border and no overlay is perfectly stable. So the lists are pinned.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { applySlideBarToHtml } = require('../../../lib/core/slide-bar');
const { sectionIsBleed, BLEED_FRAMES, CLAIM_BLEED_MEDIA } = require('../../../lib/core/bleed-frames');

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const BAR = '<i class="slide-bar" aria-hidden="true"></i>';

describe('sectionIsBleed', () => {
  test('the always-bleed frames', () => {
    for (const frame of BLEED_FRAMES) assert.equal(sectionIsBleed([frame]), true, frame);
  });
  test('a bleed collage, not a plain one', () => {
    assert.equal(sectionIsBleed(['collage', 'bleed']), true);
    assert.equal(sectionIsBleed(['collage']), false);
    assert.equal(sectionIsBleed(['bleed']), false);
  });
  test('claim-bleed bleeds only a media frame on a form', () => {
    for (const media of CLAIM_BLEED_MEDIA) assert.equal(sectionIsBleed(['form', 'claim-bleed', media]), true, media);
    assert.equal(sectionIsBleed(['claim-bleed', 'chart-frame']), false, 'no `form`: the border rule still applies');
    assert.equal(sectionIsBleed(['form', 'claim-bleed', 'content']), false, 'not a media frame');
  });
  test('ordinary frames keep their border bar', () => {
    for (const cls of [['content'], ['cards-grid'], ['title'], ['closing'], ['divider'], ['topic'], ['premise']]) {
      assert.equal(sectionIsBleed(cls), false, cls.join(' '));
    }
  });
});

describe('applySlideBarToHtml', () => {
  test('appends the layer as the LAST child of a bleed slide only', () => {
    const out = applySlideBarToHtml('<section class="image"><h2>a</h2></section><section class="content"><p>x</p></section>');
    assert.equal(out, `<section class="image"><h2>a</h2>${BAR}</section><section class="content"><p>x</p></section>`);
  });
  test('is idempotent: re-processing rendered HTML changes nothing', () => {
    const once = applySlideBarToHtml('<section class="scene">s</section><section class="collage bleed">c</section>');
    assert.equal(applySlideBarToHtml(once), once);
    assert.equal(once.split('slide-bar').length - 1, 2);
  });
  test('a <section> nested inside a slide is not a slide', () => {
    const html = '<section class="content"><section class="image">inner</section></section>';
    assert.equal(applySlideBarToHtml(html), html);
  });
  test('a section that quotes a bleed class in a comment is left alone', () => {
    const html = '<!-- <section class="image"> --><section class="content">x</section>';
    assert.equal(applySlideBarToHtml(html), html);
  });
  test('empty and non-string input pass through', () => {
    assert.equal(applySlideBarToHtml(''), '');
    assert.equal(applySlideBarToHtml(undefined), '');
  });
});

describe('the CSS and the JS agree on which frames are bleed', () => {
  const variants = read('lib/base/base.variants.css');

  test('every placement rule that draws a bar border exempts exactly the divider and the bleed frames', () => {
    const wanted = ['.divider', ...BLEED_FRAMES.map((f) => `.${f}`)].sort();
    for (const side of ['left', 'right', 'bottom']) {
      const m = variants.match(new RegExp(`section\\.spectrum-edge-${side}:not\\(([^)]*)\\)\\s*\\{`));
      assert.ok(m, `section.spectrum-edge-${side}:not(…) rule is missing`);
      const got = m[1].split(',').map((x) => x.trim()).sort();
      assert.deepEqual(got, wanted, `spectrum-edge-${side} exempts the wrong frames`);
    }
  });

  test('the overlay has a rule for each placement and for the top-bar gates', () => {
    for (const side of ['left', 'right', 'bottom']) {
      assert.match(variants, new RegExp(`section\\.spectrum-edge-${side} > \\.slide-bar\\s*\\{[^}]*var\\(--_bar-w\\)`), side);
    }
    assert.match(variants, /section\.accent:not\(\.split-panel, \.split-compare\) > \.slide-bar/);
    assert.match(variants, /\.tone-edge:not\(\.split-panel, \.split-compare\) > \.slide-bar/);
  });

  test('the overlay is a strip: absolute, zero-size until asked, clickless, above the content', () => {
    const rule = variants.match(/section > \.slide-bar\s*\{([^}]*)\}/)[1];
    assert.match(rule, /position:\s*absolute/);
    assert.match(rule, /width:\s*0/);
    assert.match(rule, /height:\s*0/);
    assert.match(rule, /pointer-events:\s*none/);
    assert.match(rule, /z-index:\s*var\(--z-chrome\)/);
    assert.doesNotMatch(rule, /\bmargin\b/, 'no margin (HARD RULE #20)');
    assert.doesNotMatch(rule, /inset:\s*0\s*;/, 'not a slide-sized box: an editable export would lift it as a slide-sized picture');
  });
});

describe('the runtime twin, booted for real', () => {
  const bundle = path.join(ROOT, 'dist', 'lattice-runtime.js');
  const built = fs.existsSync(bundle);
  const skip = !built && 'dist/lattice-runtime.js is not built (npm run build)';

  // The runtime bundle is an IIFE that leaves timers running, so it is booted in a child process that
  // prints a result and exits, as the marp-fidelity render probes' harness does, without the test
  // runner seeing the timers (a closed window trips its "asynchronous activity" check, an open one
  // holds the process).
  const SCRIPT = `
    const { JSDOM } = require('jsdom');
    const fs = require('node:fs');
    (async () => {
      const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + process.argv[2] + '</body></html>', {
        url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
      });
      dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
      const el = dom.window.document.createElement('script');
      el.textContent = fs.readFileSync(process.argv[1], 'utf8');
      dom.window.document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 400));
      const doc = dom.window.document;
      const secs = [...doc.querySelectorAll('section')];
      process.stdout.write('\\nRESULT:' + JSON.stringify({
        bars: secs.map((s) => s.querySelectorAll(':scope > .slide-bar').length),
        folded: doc.querySelectorAll('.image-text .slide-bar').length,
        hidden: secs.map((s) => s.querySelector(':scope > .slide-bar')?.getAttribute('aria-hidden') ?? null),
      }));
      process.exit(0);
    })();
  `;
  const boot = (markup) => {
    const out = require('node:child_process').execFileSync(process.execPath, ['-e', SCRIPT, bundle, markup], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    return JSON.parse(out.split('\n').find((l) => l.startsWith('RESULT:')).slice('RESULT:'.length)); // the runtime logs too
  };

  test('adds one bar to a bleed slide, none to another, and never folds it into the image text panel', { skip }, () => {
    const got = boot(
      '<section class="image"><h2>The site today</h2><p>Two thirds of the floor is unused.</p></section>'
      + '<section class="content"><h2>Plain</h2><p>x</p></section>'
      + '<section class="collage bleed"><h2>Bleed collage</h2></section>',
    );
    assert.deepEqual(got.bars, [1, 0, 1], 'one bar on each bleed slide, none on the ordinary one');
    assert.equal(got.folded, 0, 'folded into the prose panel');
    assert.equal(got.hidden[0], 'true');
  });

  test('a section that already carries the bar does not grow a second one', { skip }, () => {
    const got = boot('<section class="scene"><h2>S</h2><i class="slide-bar" aria-hidden="true"></i></section>');
    assert.deepEqual(got.bars, [1]);
  });
});

describe('the runtime carries the DOM twin wherever it injects backdrops', () => {
  const runtime = read('lib/runtime/index.js');
  test('injectSlideBars runs beside every injectBackdrops call', () => {
    const backdrops = runtime.split('    injectBackdrops();\n').length - 1;
    const bars = runtime.split('    injectSlideBars();\n').length - 1;
    assert.ok(backdrops >= 3, 'the backdrop call sites moved; update this pin');
    assert.equal(bars, backdrops);
  });
  test('it uses the shared predicate, not a copy', () => {
    assert.match(runtime, /require\('\.\.\/\.\.\/lib\/core\/bleed-frames'\)/);
    assert.match(runtime, /sectionIsBleed\(\[\.\.\.section\.classList\]\)/);
  });
});
