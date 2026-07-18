/**
 * Unit tests for the `scene` component transform
 * (lib/components/imagery/scene/scene.transform.js).
 *
 * Contract: `scene` is a faithful mirror of the adaptive `image` layout. A
 * `section.scene`'s COMPOSITION is RESOLVED from its inline poster `<svg>`'s aspect
 * (via the SHARED brain lib/core/image-aspect.js) × the deck orientation and
 * stamped as `data-img-composition` — an explicit author class wins, and an
 * absent/unreadable poster falls to the `clean` floor. The poster svg is wrapped
 * in `.scene-figure` (CONTAINED, recoloring — never a background), the heading +
 * caption in `.scene-text`. Idempotent, never an iframe.
 * See engineering/decisions/2026-07-18-anima-motion-faculty-modes.md §5.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const scene = require('../../../lib/components/imagery/scene/scene.transform');

// Posters of known aspect → known bucket: wide (1.6), tall (0.68), pano (2.4), square (1).
const POSTER = {
  wide:   '<svg viewBox="0 0 240 150"><rect x="10" y="10" width="20" height="20"/></svg>',
  tall:   '<svg viewBox="0 0 150 220"><rect x="10" y="10" width="20" height="20"/></svg>',
  pano:   '<svg viewBox="0 0 360 150"><rect x="10" y="10" width="20" height="20"/></svg>',
  square: '<svg viewBox="0 0 200 200"><rect x="10" y="10" width="20" height="20"/></svg>',
};
const section = (poster, cls = 'scene', attrs = '') =>
  `<section class="${cls}"${attrs}><h2>Title</h2>${poster}<p>Body</p></section>`;

describe('scene composition resolution (mirrors image)', () => {
  test('resolves bucket × orientation from the poster aspect (landscape)', () => {
    // wide → clean, tall → split, pano → spotlight (RESOLVE_LANDSCAPE).
    assert.match(scene.applyToRenderedHtml(section(POSTER.wide)), /data-img-composition="clean"/);
    assert.match(scene.applyToRenderedHtml(section(POSTER.tall)), /data-img-composition="split"/);
    assert.match(scene.applyToRenderedHtml(section(POSTER.pano)), /data-img-composition="spotlight"/);
  });

  test('stamps the aspect bucket it read', () => {
    assert.match(scene.applyToRenderedHtml(section(POSTER.tall)), /data-img-bucket="tall"/);
    assert.match(scene.applyToRenderedHtml(section(POSTER.pano)), /data-img-bucket="pano"/);
  });

  test('orientation selects the portrait table', () => {
    // pano + portrait → split (RESOLVE_PORTRAIT), not spotlight.
    const out = scene.applyToRenderedHtml(section(POSTER.pano, 'scene', ' data-orientation="portrait"'));
    assert.match(out, /data-img-composition="split"/);
  });

  test('an explicit author class wins over the resolver', () => {
    // a wide poster auto-resolves to clean; `gallery` forces the matte frame.
    const out = scene.applyToRenderedHtml(section(POSTER.wide, 'scene gallery'));
    assert.match(out, /data-img-composition="gallery"/);
  });

  test('no poster → the clean floor, no bucket', () => {
    const out = scene.applyToRenderedHtml('<section class="scene"><h2>Title</h2><p>Body</p></section>');
    assert.match(out, /data-img-composition="clean"/);
    assert.doesNotMatch(out, /data-img-bucket/);
  });

  test('non-scene sections are untouched', () => {
    const html = `<section class="image"><h2>x</h2>${POSTER.wide}</section>`;
    assert.equal(scene.applyToRenderedHtml(html), html);
  });
});

describe('scene wrap', () => {
  test('wraps the poster in .scene-figure and the prose in .scene-text; keeps the svg inline', () => {
    const out = scene.applyToRenderedHtml(section(POSTER.wide));
    assert.match(out, /<div class="scene-figure"><svg/);
    assert.match(out, /<div class="scene-text"><h2>Title<\/h2><p>Body<\/p><\/div>/);
    assert.doesNotMatch(out, /background-image/); // inline svg, never a bg
  });

  test('idempotent — a second pass is a no-op', () => {
    const once = scene.applyToRenderedHtml(section(POSTER.square));
    assert.equal(scene.applyToRenderedHtml(once), once);
  });

  test('figure precedes text in the DOM (placard-below for gallery/statement)', () => {
    const out = scene.applyToRenderedHtml(section(POSTER.wide));
    assert.ok(out.indexOf('scene-figure') < out.indexOf('scene-text'), 'figure must come before text');
  });

  test('preserves header/footer chrome outside the wrappers; wraps only content', () => {
    const s = '<section class="scene"><header>H</header><h2>T</h2>' + POSTER.wide + '<p>B</p><footer>F</footer></section>';
    const out = scene.applyToRenderedHtml(s);
    assert.match(out, /<header>H<\/header>/);
    assert.match(out, /<footer>F<\/footer>/);
    assert.doesNotMatch(out, /scene-text[^>]*>[\s\S]*<header>/); // header not folded into text
  });

  test('optional slots: heading-only and caption-only still wrap', () => {
    assert.match(scene.applyToRenderedHtml('<section class="scene"><h2>T</h2>' + POSTER.wide + '</section>'), /<div class="scene-figure">/);
    assert.match(scene.applyToRenderedHtml('<section class="scene">' + POSTER.wide + '<p>B</p></section>'), /<div class="scene-text"><p>B<\/p><\/div>/);
  });
});

describe('scene aspect parser hardening (H1 / L2)', () => {
  test('percentage width/height falls through to the viewBox (not square)', () => {
    // The single most common inline form: width="100%" height="100%" — must NOT
    // bucket as square; the authoritative viewBox (360x150 → pano) wins.
    const poster = '<svg width="100%" height="100%" viewBox="0 0 360 150"><rect/></svg>';
    const out = scene.applyToRenderedHtml(section(poster));
    assert.match(out, /data-img-bucket="pano"/);
    assert.match(out, /data-img-composition="spotlight"/);
  });

  test('unitless / px width+height are still honored', () => {
    const out = scene.applyToRenderedHtml(section('<svg width="150" height="220"><rect/></svg>'));
    assert.match(out, /data-img-bucket="tall"/);
  });

  test('comma-separated viewBox is parsed (SVG comma-wsp)', () => {
    const out = scene.applyToRenderedHtml(section('<svg viewBox="0,0,360,150"><rect/></svg>'));
    assert.match(out, /data-img-bucket="pano"/);
  });
});

describe('scene spec transport (Stage 6 — lift data-scene-spec)', () => {
  const specDiv = (b64) => `<div class="anima-spec" data-scene-spec="${b64}" hidden></div>`;
  const B64 = 'eyJzb3VyY2UiOiJidWlsdCJ9'; // base64 of {"source":"built"}

  test('lifts the ```anima placeholder onto the section and strips the div', () => {
    const s = `<section class="scene"><h2>T</h2>${POSTER.wide}${specDiv(B64)}<p>B</p></section>`;
    const out = scene.applyToRenderedHtml(s);
    assert.match(out, new RegExp(`<section[^>]*\\bdata-scene-spec="${B64}"`));
    assert.doesNotMatch(out, /anima-spec/); // div stripped
    assert.doesNotMatch(out, /scene-text[^>]*>[\s\S]*anima-spec/); // not folded into text
    assert.match(out, /<div class="scene-figure"><svg/); // still wraps normally
  });

  test('no ```anima block → no data-scene-spec (static poster, Stage-5 behavior)', () => {
    const out = scene.applyToRenderedHtml(section(POSTER.wide));
    assert.doesNotMatch(out, /data-scene-spec/);
  });

  test('idempotent — a second pass keeps the single lifted attr', () => {
    const s = `<section class="scene"><h2>T</h2>${POSTER.wide}${specDiv(B64)}</section>`;
    const once = scene.applyToRenderedHtml(s);
    const twice = scene.applyToRenderedHtml(once);
    assert.equal(twice, once);
    assert.equal((twice.match(/data-scene-spec=/g) || []).length, 1);
  });

  test('a malformed anima-spec-error placeholder is stripped, no data-scene-spec (poster stands)', () => {
    const s = `<section class="scene"><h2>T</h2>${POSTER.wide}<div class="anima-spec anima-spec-error" hidden></div><p>B</p></section>`;
    const out = scene.applyToRenderedHtml(s);
    assert.doesNotMatch(out, /anima-spec/); // stripped, not folded into .scene-text
    assert.doesNotMatch(out, /data-scene-spec/); // nothing lifted
  });
});

describe('scene section-regex robustness (M1)', () => {
  test('a ">" inside a quoted section attribute does not corrupt the tag', () => {
    const s = '<section class="scene" data-x="a>b"><h2>T</h2>' + POSTER.wide + '<p>B</p></section>';
    const out = scene.applyToRenderedHtml(s);
    assert.match(out, /data-x="a>b"/); // attribute intact
    assert.match(out, /<div class="scene-figure"><svg/); // wrapped correctly
    assert.doesNotMatch(out, /scene-text[^>]*>b"/); // no attribute leakage into text
  });
});

// ── Runtime DOM path (applyToDom) — a minimal fake DOM (no jsdom needed) ──────
function makeScene(inner, className = 'scene', orientation) {
  const attrs = {};
  if (orientation) attrs['data-orientation'] = orientation;
  const sec = {
    className,
    innerHTML: inner,
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    setAttribute: (k, v) => { attrs[k] = v; },
    querySelector: (sel) => {
      if (sel === 'svg') { const m = sec.innerHTML.match(/<svg\b[\s\S]*?<\/svg>/i); return m ? { outerHTML: m[0] } : null; }
      if (sel.includes('anima-spec')) {
        const m = sec.innerHTML.match(/<div class="anima-spec[^"]*"[^>]*\sdata-scene-spec="([^"]*)"[^>]*><\/div>/i);
        return m ? { getAttribute: () => m[1], remove: () => { sec.innerHTML = sec.innerHTML.replace(m[0], ''); } } : null;
      }
      return sec.innerHTML.includes('scene-figure') ? {} : null; // ':scope .scene-figure'
    },
    querySelectorAll: (sel) => {
      if (sel?.includes('anima-spec')) {
        const out = [];
        for (const m of sec.innerHTML.matchAll(/<div class="anima-spec[^"]*"[^>]*><\/div>/gi)) {
          const html = m[0];
          out.push({ remove: () => { sec.innerHTML = sec.innerHTML.replace(html, ''); } });
        }
        return out;
      }
      return [];
    },
    _attrs: attrs,
  };
  return sec;
}
const rootOf = (sections) => ({ querySelectorAll: (sel) => (sel === 'section.scene' ? sections : []) });

describe('scene applyToDom (runtime path)', () => {
  test('resolves + stamps + wraps like the string path', () => {
    for (const [k, expBucket, expComp] of [['wide', 'wide', 'clean'], ['tall', 'tall', 'split'], ['pano', 'pano', 'spotlight']]) {
      const sec = makeScene('<h2>T</h2>' + POSTER[k] + '<p>B</p>');
      scene.applyToDom(rootOf([sec]));
      assert.equal(sec._attrs['data-img-bucket'], expBucket, `${k} bucket`);
      assert.equal(sec._attrs['data-img-composition'], expComp, `${k} composition`);
      assert.match(sec.innerHTML, /<div class="scene-figure"><svg/, `${k} wrapped figure`);
      assert.ok(sec.innerHTML.indexOf('scene-figure') < sec.innerHTML.indexOf('scene-text'), `${k} figure before text`);
    }
  });

  test('exactly one .scene-figure and one .scene-text after wrapping (structural children)', () => {
    const sec = makeScene('<h2>T</h2>' + POSTER.wide + '<p>B</p>');
    scene.applyToDom(rootOf([sec]));
    assert.equal((sec.innerHTML.match(/class="scene-figure"/g) || []).length, 1);
    assert.equal((sec.innerHTML.match(/class="scene-text"/g) || []).length, 1);
  });

  test('lifts the anima-spec placeholder onto the section and strips it (DOM path)', () => {
    const b64 = 'eyJzb3VyY2UiOiJidWlsdCJ9';
    const sec = makeScene(`<h2>T</h2>${POSTER.wide}<div class="anima-spec" data-scene-spec="${b64}" hidden></div><p>B</p>`);
    scene.applyToDom(rootOf([sec]));
    assert.equal(sec._attrs['data-scene-spec'], b64); // lifted onto the section
    assert.doesNotMatch(sec.innerHTML, /anima-spec/); // placeholder stripped (not folded into .scene-text)
    assert.match(sec.innerHTML, /<div class="scene-figure"><svg/); // wraps normally
  });

  test('strips a malformed anima-spec-error placeholder too (DOM path)', () => {
    const sec = makeScene(`<h2>T</h2>${POSTER.wide}<div class="anima-spec anima-spec-error" hidden></div><p>B</p>`);
    scene.applyToDom(rootOf([sec]));
    assert.equal(sec._attrs['data-scene-spec'], undefined); // nothing to lift
    assert.doesNotMatch(sec.innerHTML, /anima-spec/); // error placeholder removed
  });

  test('author class overrides; portrait orientation uses the portrait table', () => {
    const forced = makeScene('<h2>T</h2>' + POSTER.wide + '<p>B</p>', 'scene gallery');
    scene.applyToDom(rootOf([forced]));
    assert.equal(forced._attrs['data-img-composition'], 'gallery');
    // pano + portrait → split (RESOLVE_PORTRAIT), not spotlight
    const portrait = makeScene('<h2>T</h2>' + POSTER.pano + '<p>B</p>', 'scene', 'portrait');
    scene.applyToDom(rootOf([portrait]));
    assert.equal(portrait._attrs['data-img-composition'], 'split');
  });

  test('mirror is a modifier, not a composition; legacy aliases resolve', () => {
    const mir = makeScene('<h2>T</h2>' + POSTER.wide + '<p>B</p>', 'scene mirror');
    scene.applyToDom(rootOf([mir]));
    assert.equal(mir._attrs['data-img-composition'], 'clean'); // resolved from aspect, mirror ignored as a composition
    const legacy = makeScene('<h2>T</h2>' + POSTER.wide + '<p>B</p>', 'scene full');
    scene.applyToDom(rootOf([legacy]));
    assert.equal(legacy._attrs['data-img-composition'], 'spotlight'); // full → spotlight
  });

  test('idempotent — an already-stamped section is skipped', () => {
    const sec = makeScene('<div class="scene-figure"><svg viewBox="0 0 1 1"></svg></div><div class="scene-text"></div>');
    sec._attrs['data-img-composition'] = 'gallery';
    const before = sec.innerHTML;
    scene.applyToDom(rootOf([sec]));
    assert.equal(sec._attrs['data-img-composition'], 'gallery'); // untouched
    assert.equal(sec.innerHTML, before); // not re-wrapped
  });

  test('null-safe — no throw on null / undefined / empty root', () => {
    assert.doesNotThrow(() => scene.applyToDom(null));
    assert.doesNotThrow(() => scene.applyToDom(undefined));
    assert.doesNotThrow(() => scene.applyToDom({}));
  });
});
