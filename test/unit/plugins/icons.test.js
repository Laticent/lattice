/**
 * The icons plugin (lib/plugins/icons/, engineering/decisions/2026-09-29-inline-icons.md): its
 * kernel reads `^{…}` and a pill's `icon=` the same way on both render paths, never lets author
 * text become markup, coaches a vendor name to its role icon, and ships only plain geometry.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const icons = require('../../../lib/plugins/icons/icons.inline.js');
const pills = require('../../../lib/core/inline-pills.js');
const VOCAB = require('../../../lib/plugins/icons/icons.vocab.generated.js');
const DATA = require('../../../lib/plugins/icons/icons.data.generated.js');
const { provideData } = require('../../../lib/plugins/plugin-data.js');

// The engine registers the loader; a unit test that never builds an engine does it itself.
provideData('icons', () => DATA);
const doc = new JSDOM('<!doctype html><body></body>').window.document;

/** An element's attributes as sorted pairs, and the same read off an HTML string. */
const attrsOfEl = (el) => [...el.attributes].map((a) => [a.name, a.value]).sort();
const attrsOfHtml = (html) => {
  const host = doc.createElement('div');
  host.innerHTML = html; // test-only parse of the engine's own output, to compare like with like
  return attrsOfEl(host.firstElementChild);
};

describe('icons — reading `^{…}`', () => {
  test('the name first, then option words in any order; an alias reads as its icon', () => {
    assert.deepEqual(icons.read('^{database, lg, c3, bare, etching, rounded}'), {
      name: 'database', c: 'c3', size: 'lg', frame: 'bare', look: 'etching', corners: 'rounded', label: 'database',
    });
    assert.equal(icons.read('^{db}').name, 'database');
    assert.equal(icons.read('^{load-balancer}').label, 'load balancer');
    assert.equal(icons.read('^{server, label="Primary DB host"}').label, 'Primary DB host');
  });
  test('anything else is not an icon, and an attempt says why', () => {
    for (const t of ['^foo', '^{', '^{}', '^{ database}', '{database}', '~{1 2}', 'x^{database}']) assert.equal(icons.read(t), null, t);
    assert.equal(icons.diagnose('^{ database}'), null, 'a space after the brace is code, not an attempt');
    assert.match(icons.diagnose('^{s3}'), /"s3" is a service, not an icon — use the role icon `bucket`/);
    assert.match(icons.diagnose('^{databse}'), /did you mean `database`/);
    assert.match(icons.diagnose('^{bucket, c13}'), /past the limit/);
    assert.match(icons.diagnose('^{bucket, bare, framed}'), /given twice/);
  });
  test('every name and alias in the vocabulary reads', () => {
    for (const n of VOCAB.NAMES) assert.equal(icons.read(`^{${n}}`)?.name, n, n);
    for (const [n, alts] of Object.entries(VOCAB.ALIASES)) for (const a of alts) assert.equal(icons.read(`^{${a}}`)?.name, n, a);
  });
  test('a vendor service name is never an icon or alias (§ 9)', () => {
    const names = new Set([...VOCAB.NAMES, ...Object.values(VOCAB.ALIASES).flat()]);
    for (const svc of Object.keys(VOCAB.SERVICES)) assert.ok(!names.has(svc), svc);
  });
});

describe('icons — both render paths', () => {
  const spans = ['^{database}', '^{bucket, c4, lg}', '^{shield, etching, rounded, c12}', '^{db, bare}', '^{server, label="A <b>&\\"x\\""}'];
  test('the HTML string and the DOM element carry the same attributes and drawing', () => {
    for (const s of spans) {
      const html = icons.iconHtml(s);
      const el = icons.iconElement(doc, s);
      assert.ok(html && el, s);
      assert.deepEqual(attrsOfHtml(html), attrsOfEl(el), s);
      const parsed = doc.createElement('div');
      parsed.innerHTML = html;
      assert.equal(el.querySelector('svg').innerHTML, parsed.querySelector('svg').innerHTML, s);
    }
  });
  test('author text never becomes markup', () => {
    const html = icons.iconHtml('^{server, label="<img src=x onerror=1>"}');
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /aria-label="&lt;img src=x onerror=1&gt;"/);
  });
  test('an inline icon names itself; inside a pill it is decorative', () => {
    assert.match(icons.iconHtml('^{bucket}'), /role="img" aria-label="bucket"/);
    const pill = pills.pillHtml('{S3, icon=bucket, c4}');
    assert.match(pill, /<svg class="lat-pill-icon"[^>]*aria-hidden="true"/);
    assert.match(pill, /<\/svg>S3<\/span>$/);
    assert.match(pills.pillHtml('{icon=database}'), /role="img" aria-label="database"/);
  });
  test('the pill\'s two paths agree with an icon', () => {
    for (const s of ['{S3, icon=bucket, c4}', '{icon=db}', '{Primary, icon=database, tag, lg}']) {
      const html = pills.pillHtml(s);
      const el = pills.pillElement(doc, s);
      assert.deepEqual(attrsOfHtml(html), attrsOfEl(el), s);
      assert.equal(el.textContent, attrsOfHtml(html) && doc.createRange().createContextualFragment(html).textContent, s);
    }
  });
  test('a pill whose icon is not in the set stays literal and is coached', () => {
    assert.equal(pills.pillHtml('{Lambda, icon=lambda}'), null);
    assert.match(pills.diagnose('{Lambda, icon=lambda}'), /use the role icon `function`/);
  });
  test('with the plugin off, a pill shows its label alone; an icon-only pill stays literal', () => {
    const off = new Set(['icons']);
    assert.equal(pills.pillHtml('{S3, icon=bucket}', off), '<span class="lat-pill" data-shape="pill">S3</span>');
    assert.equal(pills.pillHtml('{icon=bucket}', off), null);
  });
});

describe('icons — what the adversarial review found', () => {
  test('TeX accents and superscripts are not icon attempts', () => {
    for (const t of ['^{o}', '^{e}', '^{2}', '^{1,2}', '^{\\alpha}', '^{a\\b}']) assert.equal(icons.diagnose(t), null, t);
    assert.match(icons.diagnose('^{databse}'), /not an icon/);
  });
  test('an icon-only pill takes its option words as options, not as a label', () => {
    assert.match(pills.pillHtml('{icon=gateway, c2}'), /^<span class="lat-pill" data-shape="pill" data-c="c2" role="img" aria-label="gateway"><svg/);
    assert.match(pills.pillHtml('{c2, icon=gateway, lg, tag}'), /data-shape="tag" data-c="c2" data-size="lg" role="img"/);
    assert.match(pills.pillHtml('{"lg", icon=db}'), /<\/svg>lg<\/span>$/, 'a quoted label is a label');
  });
  test('an empty pill is still not an attempt', () => {
    assert.equal(pills.diagnose('{""}'), null);
    assert.equal(pills.pillHtml('{""}'), null);
  });
  test('a blank label= falls back to the icon\'s own name', () => {
    assert.match(icons.iconHtml('^{database, label="  "}'), /aria-label="database"/);
  });
  test('with no drawings on the surface, an icon and an icon pill stay literal; nothing is dropped', () => {
    // A fresh process that never builds an engine, so no loader is registered: the surface a
    // browser bundle is before lattice-plugin-icons.js arrives.
    const { execFileSync } = require('node:child_process');
    const out = execFileSync(process.execPath, ['-e', `
      const pills = require('./lib/core/inline-pills.js');
      const icons = require('./lib/plugins/icons/icons.inline.js');
      process.stdout.write(JSON.stringify([pills.pillHtml('{S3, icon=bucket}'), icons.iconHtml('^{bucket}'), !!icons.read('^{bucket}'), pills.pillHtml('{S3}')]));
    `], { cwd: require('node:path').join(__dirname, '../../..') }).toString();
    assert.deepEqual(JSON.parse(out), [null, null, true, '<span class="lat-pill" data-shape="pill">S3</span>']);
  });
});

describe('icons — the shipped drawings are plain geometry', () => {
  const SHAPES = { path: ['d'], circle: ['cx', 'cy', 'r'], ellipse: ['cx', 'cy', 'rx', 'ry'], rect: ['x', 'y', 'width', 'height', 'rx', 'ry'], line: ['x1', 'y1', 'x2', 'y2'], polyline: ['points'] };
  test('every node is a shape element with only its geometry, for every name', () => {
    assert.deepEqual(Object.keys(DATA.icons).sort(), [...VOCAB.NAMES].sort());
    for (const [name, nodes] of Object.entries(DATA.icons)) {
      assert.ok(nodes.length, name);
      for (const [tag, attrs] of nodes) {
        assert.ok(SHAPES[tag], `${name}: <${tag}>`);
        for (const [k, v] of Object.entries(attrs)) {
          assert.ok(SHAPES[tag].includes(k), `${name}: <${tag} ${k}>`);
          assert.match(v, /^[-0-9.,\sa-zA-Z]*$/, `${name}: ${k}`);
        }
      }
    }
  });
  test('about 250 icons, the set the note settled', () => {
    assert.ok(VOCAB.NAMES.length >= 240 && VOCAB.NAMES.length <= 280, String(VOCAB.NAMES.length));
  });
});

describe('icons — a pill whose icon= names no icon (lint, beside #2537\'s pill-literal)', () => {
  const lintCore = require('../../../lib/authoring/lint-core.js');
  const deck = (body) => `---\nmarp: true\n---\n\n## A\n\n${body}\n`;
  test('warns with the icon coaching, never the quoting advice', () => {
    const found = lintCore.findLiteralPills(deck('- `{X, icon=lambda}` `{S3, icon=nope}` `{icon=lambda}` `{S3, icon=bucket}`'));
    assert.deepEqual(found.map((f) => f.span), ['`{X, icon=lambda}`', '`{S3, icon=nope}`', '`{icon=lambda}`']);
    assert.match(found[0].message, /"lambda" is a service, not an icon — use the role icon `function`/);
    assert.match(found[1].message, /"nope" is not an icon/);
    for (const f of found) assert.doesNotMatch(f.fix, /in quotes/);
  });
  test('the reserved-character case still gets the quoting advice', () => {
    const [f] = lintCore.findLiteralPills(deck('- `{A|B, tag}`'));
    assert.match(f.fix, /in quotes/);
  });
});

describe('icons — admission reaches the runtime (spec/LPM.md § 3.2.1)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { createEngine } = require('../../../lib/engine/index.js');
  const RUNTIME = path.join(__dirname, '../../../dist/lattice-runtime.js');
  // `^{…}` is the plugin's own row; `{icon=bucket}` is the pill row calling the plugin's service,
  // and with icons off it has nothing to show (the checker's finding on the first cut).
  const SRC = '---\nmarp: true\n---\n\nA `^{database}` here, and `{icon=bucket, c3}` there.\n';

  /** Boot the real runtime bundle over `body`, with the icons' drawings already on the page. */
  function boot(body) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.__latticePluginData = { icons: DATA };
    dom.window.fetch = () => Promise.reject(new Error('no fetch'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(RUNTIME, 'utf8');
    dom.window.document.body.appendChild(el);
    return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
  }
  const sections = (html) => html.match(/<section[\s\S]*<\/section>/)[0];

  test('the engine marks a span it leaves literal because icons are not loaded, and only then', () => {
    const engine = createEngine();
    const off = String(engine.render(SRC, undefined, { pluginDefaults: [] }).html);
    assert.match(off, /<code data-lattice-off="icons">\^\{database\}<\/code>/);
    assert.match(off, /<code data-lattice-off="icons">\{icon=bucket, c3\}<\/code>/);
    const on = String(engine.render(SRC).html);
    assert.doesNotMatch(on, /data-lattice-off/, 'a render with icons loaded carries no marker');
    // A span that is not an icon is not the plugin's, loaded or not.
    const plain = String(engine.render('---\nmarp: true\n---\n\nA `^{ x }`, `getUserId()`, `{LIVE}` and `{S3, icon=bucket}`\n', undefined, { pluginDefaults: [] }).html);
    assert.doesNotMatch(plain, /data-lattice-off/);
  });

  test('the runtime leaves a marked span as code, even with the drawings on the page', async () => {
    const html = sections(String(createEngine().render(SRC, undefined, { pluginDefaults: [] }).html));
    const kept = await boot(html);
    assert.equal(kept.querySelector('.lat-icon'), null);
    assert.equal(kept.querySelector('.lat-pill-icon'), null);
    assert.deepEqual([...kept.querySelectorAll('code[data-lattice-off="icons"]')].map((c) => c.textContent), ['^{database}', '{icon=bucket, c3}']);
    // Control: the same markup without the marker is drawn, so the arms above can fail.
    const drawn = await boot(html.replaceAll(' data-lattice-off="icons"', ''));
    assert.ok(drawn.querySelector('.lat-icon[data-icon="database"] svg'), 'control: the runtime draws an unmarked span');
    assert.ok(drawn.querySelector('.lat-pill .lat-pill-icon'), 'control: and an unmarked icon-only pill');
  });
});
