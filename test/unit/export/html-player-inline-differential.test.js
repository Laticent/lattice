/**
 * Segno R4, the CLI export: lib/export/html-player.js `inlineDocAssets` stopped reading CSS with its own tokenizer
 * (`mapCssUrls` with `cssString`, `cssUnescape`, `escapeEnd` and `matchingParen`) and reads every `url()` and
 * `image-set()` string with `cssRefSpans`, the reader the gallery gate, the Studio's export and the narrator share
 * (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md, "R4: the CLI export"). The old reader is
 * frozen in tools/segno-legacy/html-player-inline.js. Held here:
 *   1. On every rendered deck and gallery in the repo the two bake the same bytes, the same count and the same
 *      `missing` list, with the deck's folder as the base (the CLI path).
 *   2. Picked spellings where the two differ ON PURPOSE, each the way Chromium reads it. The Chromium oracle for the
 *      seeded CSS soups is test/integration/export/inliner-browser-oracle.test.js, which the frozen reader fails.
 *   3. A long input reads in linear time.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');
const now = require('../../../lib/export/html-player.js');
const old = require('../../../tools/segno-legacy/html-player-inline.js');

const ROOT = path.resolve(__dirname, '../../..');
const photo = pathToFileURL(path.join(ROOT, 'lib/samples/photo-wide.jpg')).href;

function bake(inline, html, opts) {
  const dom = new JSDOM(html);
  const r = inline(dom.window.document, opts);
  const out = { ...r, html: dom.serialize() };
  dom.window.close(); // 900 open windows run the heap out
  return out;
}

describe('the CLI export reads CSS with cssRefSpans (Segno R4)', () => {
  test('every rendered deck and gallery in the repo: the same bytes, count and missing list as the frozen reader', (t) => {
    const engine = require('../../../lib/engine/index.js').createEngine();
    // As the CLI renders (lattice.js): `sample:` art resolves into the package's sample folder as `file://`, and a
    // deck-relative picture stays relative, for `inlineDocAssets` to resolve against the deck's folder.
    const samplesUrl = pathToFileURL(path.join(ROOT, 'lib', 'samples') + path.sep).href;
    const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.gallery\.md$|(?:^|\/)gallery\.md$|^examples\/|^test\/integration\/baseline-decks\//.test(f));
    assert.ok(files.length > 400, `only ${files.length} files`);
    const bad = [];
    let baked = 0;
    let missing = 0;
    const decks = new Set();
    for (const f of files) {
      const { html } = engine.render(fs.readFileSync(path.join(ROOT, f), 'utf8'), undefined, { samplesUrl });
      const opts = { baseUrl: pathToFileURL(path.dirname(path.join(ROOT, f)) + path.sep).href };
      const [a, b] = [bake(old.inlineDocAssets, html, opts), bake(now.inlineDocAssets, html, opts)];
      baked += b.count;
      missing += b.missing.length;
      if (b.count + b.missing.length) decks.add(f);
      if (a.html !== b.html || a.count !== b.count || JSON.stringify(a.missing) !== JSON.stringify(b.missing)) {
        let at = 0;
        while (a.html[at] === b.html[at]) at++;
        bad.push(`${f} at ${at}\n  old ${JSON.stringify(a.html.slice(at - 60, at + 80))}\n  new ${JSON.stringify(b.html.slice(at - 60, at + 80))}\n  missing ${JSON.stringify(a.missing)} vs ${JSON.stringify(b.missing)}`);
      }
    }
    assert.deepEqual(bad.slice(0, 3), []);
    t.diagnostic(`${files.length} decks, ${decks.size} with a local picture, ${baked} distinct pictures baked, ${missing} reported missing`);
    // The corpus must exercise the path: a deck set with no local picture would compare nothing.
    assert.ok(baked > 20, `only ${baked} pictures baked in the corpus`);
  });

  // Each: the CSS, how many times Chromium loads the photo from it, and whether the frozen reader agrees.
  const PICKED = [
    // The same as before.
    [`background-image:url(${photo})`, 1, true],
    [`background-image:url( "${photo}" )`, 1, true],
    [`background-image:image-set("${photo}" 1x)`, 1, true],
    [`content:"url(${photo})"`, 0, true],
    [`/* background-image:url(${photo}) */`, 0, true],
    [`background-image:url(x/url(${photo}))`, 0, true],
    [`background-image:myimage-set("${photo}" 1x)`, 0, true],
    [`background-image:image-set(var(--u, "${photo}") 1x)`, 1, true], // a var() fallback inside image-set() is substituted and fetched
    // Read differently, on purpose: each is where the frozen reader disagreed with the browser.
    [`background-image:u\\72l(${photo})`, 1, false], // an escaped url( name is a url() token
    [`background-image:image-s\\65t("${photo}" 1x)`, 1, false], // an escaped image-set( name is the function
    [`background-image:url(${photo}`, 1, false], // a url() the end of the text closes is still fetched
    [`background-image:image-set("${photo}`, 1, false], // so is an image-set() string the end of the text closes
  ];
  for (const [css, loads, oldAgrees] of PICKED) {
    test(`${JSON.stringify(css.replace(photo, 'PHOTO'))}: ${loads ? 'baked' : 'left as written'}`, () => {
      const html = `<!doctype html><html><head></head><body><div style="${css.replace(/"/g, '&quot;')}"></div><style>.x{${css}</style></body></html>`;
      const b = bake(now.inlineDocAssets, html);
      assert.equal(b.count, loads, 'the new reader');
      assert.equal(b.html.includes('file://'), !loads, loads ? 'the local path is gone' : 'the text is untouched');
      const a = bake(old.inlineDocAssets, html);
      assert.equal(a.count === loads, oldAgrees, 'the frozen reader (the failing arm)');
    });
  }

  test('every stylesheet in the repo, as a <style> body: the same bytes and missing list as the frozen reader', (t) => {
    // The corpus above reaches the attribute path only: no rendered deck carries a <style> with a url(), an image-set()
    // or a CSS escape. The CLI hands the inliner the assembled document, theme CSS included, so the shipped sheets are
    // compared here as the bodies they arrive as.
    const files = execFileSync('git', ['ls-files', '*.css'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
    // The built bundle too, when the install built it: the 2.8 MB sheet a deck actually ships.
    if (fs.existsSync(path.join(ROOT, 'dist/lattice.css'))) files.push('dist/lattice.css');
    assert.ok(files.length > 150, `only ${files.length} stylesheets`);
    const bad = [];
    let urls = 0;
    for (const f of files) {
      const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/url\(/i.test(css)) urls++;
      const html = `<!doctype html><html><head><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body></body></html>`;
      const opts = { baseUrl: pathToFileURL(path.dirname(path.join(ROOT, f)) + path.sep).href };
      const [a, b] = [bake(old.inlineDocAssets, html, opts), bake(now.inlineDocAssets, html, opts)];
      if (a.html !== b.html || JSON.stringify(a.missing) !== JSON.stringify(b.missing)) bad.push(f);
    }
    assert.deepEqual(bad, []);
    t.diagnostic(`${files.length} stylesheets, ${urls} with a url()`);
  });

  test("a deck folder whose name holds a paren or a quote: the relative picture is baked, and the folder path does not ship", () => {
    const os = require('node:os');
    for (const name of ['Deck (1) ', "Bob's decks "]) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
      try {
        fs.copyFileSync(path.join(ROOT, 'lib/samples/photo-wide.jpg'), path.join(dir, 'a.jpg'));
        for (const css of ['background-image:url(a.jpg)', "background-image:url('a.jpg')", 'background-image:url("a.jpg")', `background-image:image-set('a.jpg' 1x)`]) {
          const b = bake(now.inlineDocAssets, `<div style="${css.replace(/"/g, '&quot;')}"></div>`, { baseUrl: `${pathToFileURL(dir).href}/` });
          assert.equal(b.count, 1, `${name}: ${css}`);
          assert.ok(!b.html.includes('file://'), `${name}: ${css}: the folder path is gone`);
        }
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('a type() string inside image-set() is not an address', () => {
    const b = bake(now.inlineDocAssets, `<div style='background-image:image-set("${photo}" type("x/no.png"))'></div>`, { baseUrl: pathToFileURL(`${ROOT}/`).href });
    assert.equal(b.count, 1);
    assert.deepEqual(b.missing, []);
  });

  test('an attribute selector names no picture', () => {
    const b = bake(now.inlineDocAssets, `<style>a[href="url(${photo})"]{color:red}</style>`);
    assert.equal(b.count, 0);
  });

  test('a long style reads in linear time', () => {
    const big = `${`background-image:image-set("a.png" 1x),url(b.png);/*c*/`.repeat(4000)}`;
    const t0 = performance.now();
    bake(now.inlineDocAssets, `<div style='${big}'></div><style>.x{${big}}</style>`, { baseUrl: pathToFileURL(`${ROOT}/`).href });
    assert.ok(performance.now() - t0 < 3000, `took ${Math.round(performance.now() - t0)} ms`);
  });
});
