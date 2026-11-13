/**
 * Segno R4, the export: lib/export/inline-url-media.mjs stopped reading markup with its own regex walker
 * (a tag pattern, an attribute pattern, a `<style>` pattern and a `url(` pattern) and reads it with
 * remote-ref.js `scanHtml` and `cssRefSpans`, the reading the placeholder pass and the gallery gate share
 * (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md, "R4: the export"). The old walker
 * is frozen in tools/segno-legacy/inline-url-media.mjs. Three promises are held here:
 *   1. On every rendered deck and gallery in the repo the two return the same bytes, the same count and
 *      the same `missing` list, under a transport that embeds some pictures, fails others and returns
 *      both encodings (base64, and a percent-encoded SVG that needs quoting).
 *   2. On seeded markup the reader is not unsure of, it fetches exactly the pictures a spec parser (parse5)
 *      finds, read through the same CSS reader, so the only thing compared is how the markup is read.
 *   3. After it runs with a transport that embeds everything, the spec parser finds no picture left to fetch,
 *      and the document it builds is the same apart from the pictures (`shape`).
 * The arms that must fail: the frozen regex walker itself, the new reader blind to `<style>` elements, and an
 * edit that eats the `<` of a `</style>` (caught only by the shape check).
 */
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const parse5 = require('parse5');
const { scanHtml } = require('../../../lib/core/remote-ref.js');
const { rng, gen, genForeign } = require('../../fixtures/html-ref-soups.js');
const { charReads } = require('../../helpers/work-count');

const ROOT = path.resolve(__dirname, '../../..');
const BASE = 'https://studio.test/lattice/studio/';
const OPTS = { baseUrl: BASE, origins: ['https://studio.test'] };
const show = (html) => JSON.stringify(html.length > 200 ? `${html.slice(0, 200)}…` : html);
const encodeAttr = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let now;
let old;
before(async () => {
  now = (await import('../../../lib/export/inline-url-media.mjs')).inlineUrlMedia;
  old = (await import('../../../tools/segno-legacy/inline-url-media.mjs')).inlineUrlMedia;
});

/** A transport that fails one URL in five, and returns a quoted-SVG or a base64 picture for the rest. */
const mixedFetch = async (url) => {
  let h = 0;
  for (const c of url) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  if (h % 5 === 0) return { reason: 'the server answered 404' };
  if (h % 5 === 1) return { dataUri: `data:image/svg+xml;charset=utf-8,%3Csvg%20id%3D%27${h}%27%3E%3C%2Fsvg%3E` };
  return { dataUri: `data:image/png;base64,${h.toString(36)}AAAA` };
};
const embedAll = async () => ({ dataUri: 'data:image/png;base64,AAAA' });
const failAll = async () => ({ reason: 'no' });

/** The URLs `inline` would fetch from `html`: with every fetch failing, `missing` lists each one. */
async function fetched(inline, html, anyWebOrigin = true) {
  const r = await inline(html, { ...OPTS, anyWebOrigin, fetchDataUri: failAll, maxPictures: 1e6 });
  return r.missing.map((m) => m.url).sort();
}

/**
 * The spec parser's reading, rebuilt as markup only the CSS and URL rules can disagree on: each picture
 * attribute the tree holds as a lone `<img src>`, each `style` attribute and `<style>` element's text as a
 * lone `<div style>`. The same CSS reader then reads both sides, so a difference is a difference in how the
 * MARKUP was read.
 */
function parserReading(html) {
  const PREFIX = '<!doctype html><body>';
  const doc = parse5.parse(`${PREFIX}${html}`, { sourceCodeLocationInfo: true });
  const out = [];
  const visit = (node) => {
    for (const c of node.childNodes || []) visit(c);
    if (node.content) visit(node.content);
    if (!node.tagName) return;
    const attrs = new Map();
    for (const a of node.attrs) {
      const name = a.prefix ? `${a.prefix}:${a.name}` : a.name;
      if (!attrs.has(name)) attrs.set(name, a.value);
    }
    // The reader builds no tree, so it cannot tell an SVG `<image>` from an HTML one, which the tree builder
    // renames `<img>` (its `href` loads nothing; an SVG one's `src` loads nothing either). It embeds every
    // picture attribute of an element spelled `<image>`: an extra embed is an own-origin fetch the author
    // allowed, written into an attribute that loads nothing. The spec side reads such an element the same way.
    const loc = node.sourceCodeLocation?.startTag;
    const spelledImage = loc ? /^<image(?:[\t\n\f\r />]|$)/i.test(`${PREFIX}${html}`.slice(loc.startOffset, loc.startOffset + 7)) : false;
    const tag = node.tagName;
    const pictures = spelledImage ? ['href', 'xlink:href', 'src'] : tag === 'img' ? ['src'] : tag === 'video' ? ['poster'] : [];
    for (const n of pictures) if (attrs.has(n)) out.push(`<img src="${encodeAttr(attrs.get(n))}">`);
    if (attrs.has('style')) out.push(`<div style="${encodeAttr(attrs.get('style'))}"></div>`);
    if (tag === 'style') out.push(`<div style="${encodeAttr((node.childNodes || []).map((c) => c.value || '').join(''))}"></div>`);
  };
  visit(doc);
  return out.join('');
}

// Pictures as a render and an author write them, mixed into the token soups.
const PICTURE_PIECES = ['<img src=/a.png>', '<img src="/b.png" srcset="/b2.png 2x">', '<IMG SRC=&#x2f;c.png>', '<video poster=/p.png>', '<svg><image href="/i.png"/></svg>', '<image src=/j.png>', '<div style="background:url(/d.png)">', "<p style='background-image:url(&quot;/e.png&quot;)'>", '<style>', '</style>', '.a{background:url(/f.png)}', '@font-face{src:url(/font.woff)}', '--x:url(/g.png);', '--logo-mask:url(/h.png);', 'u\\72l(/k.png)', '<!--', '-->', '<textarea>', '</textarea>', '<script>', '</script>', '<template>', '</template>', '<img src=/a.png src=/dup.png>', 'a[href="url(/sel.png)"]{}', '"', "'"];
const genPictures = (r) => {
  let out = '';
  const n = 2 + Math.floor(r() * 16);
  for (let k = 0; k < n; k++) out += r() < 0.55 ? PICTURE_PIECES[Math.floor(r() * PICTURE_PIECES.length)] : gen(r).slice(0, 16);
  return out;
};

/**
 * The document as the spec parser builds it, minus what the export is meant to change: each element's name and
 * attributes (a picture attribute's and a `style` attribute's VALUE left out, a dropped `srcset` left out), and
 * every text node outside a `<style>`. A rewrite that swallows markup (an edit that eats a `</style>`) changes it.
 */
function shape(html) {
  const PREFIX = '<!doctype html><body>';
  const doc = `${PREFIX}${html}`;
  const out = [];
  const visit = (node, inStyle) => {
    if (node.nodeName === '#text') {
      if (!inStyle) out.push(`#${node.value}`);
      return;
    }
    if (node.tagName) {
      // An element spelled `<image>` is read as the export reads it (see `parserReading`).
      const loc = node.sourceCodeLocation?.startTag;
      const spelledImage = loc ? /^<image(?:[\t\n\f\r />]|$)/i.test(doc.slice(loc.startOffset, loc.startOffset + 7)) : false;
      const picture = spelledImage ? ['href', 'xlink:href', 'src'] : node.tagName === 'img' ? ['src'] : node.tagName === 'video' ? ['poster'] : [];
      const attrs = node.attrs
        .map((a) => [a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value])
        .filter(([n]) => n !== 'srcset')
        .map(([n, v]) => (n === 'style' || picture.includes(n) ? n : `${n}=${v}`));
      out.push(`<${node.tagName} ${attrs.join(' ')}>`);
    }
    for (const c of node.childNodes || []) visit(c, inStyle || node.tagName === 'style');
    if (node.content) visit(node.content, inStyle);
  };
  visit(parse5.parse(doc, { sourceCodeLocationInfo: true }), false);
  return out.join('\n');
}

// Style blocks around a soup: the repo's decks hold none with a url(), so this stream is what exercises the
// <style> rewrite (the inversion review measured 0 in the corpus).
const STYLE_CSS = ['.a{background:url(/s.png)}', "b{background-image:url('/t.png'),url(\"/u.png\")}", '@font-face{src:url(/f.woff)}', ':root{--hero:url(/v.png)}', 'p{background:u\\72l(/w.png)}', 'q{background:url(/bad(x.png)}', '/* url(/c.png) */', 'a[x="url(/sel.png)"]{}', '@media print{.m{background:url(/m.png)}}'];
const genStyle = (r) => {
  let css = '';
  for (let k = 1 + Math.floor(r() * 4); k > 0; k--) css += STYLE_CSS[Math.floor(r() * STYLE_CSS.length)];
  return `${genPictures(r)}<style>${css}</style>${r() < 0.5 ? genPictures(r) : '<p>after</p>'}`;
};

// INLINE_MEDIA_FUZZ=N runs N inputs per stream (the note's exploration run used 30000).
const SCALE = Number(process.env.INLINE_MEDIA_FUZZ) || 0;

/** Null when `inline` fetches what the spec parser reads from `html`, or the first difference. Unsure input is skipped. */
async function disagrees(inline, html) {
  if (scanHtml(html).risky) return null;
  const [mine, spec] = [await fetched(inline, html), await fetched(now, parserReading(html))];
  return JSON.stringify(mine) === JSON.stringify(spec) ? null : `${show(html)}\n  reader ${JSON.stringify(mine)}\n  parser ${JSON.stringify(spec)}`;
}

describe('the export embeds pictures read by scanHtml and cssRefSpans (Segno R4)', () => {
  test('every rendered deck and gallery in the repo: the same bytes, count and missing list as the regex walker', async (t) => {
    const engine = require('../../../lib/engine/index.js').createEngine();
    const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.gallery\.md$|(?:^|\/)gallery\.md$|^examples\/|^test\/integration\/baseline-decks\//.test(f));
    assert.ok(files.length > 400, `only ${files.length} files`);
    const bad = [];
    let pictures = 0;
    const decks = new Set();
    for (const f of files) {
      // As the Studio renders an export: `sample:` art resolves to the site's own staged copy.
      const { html } = engine.render(fs.readFileSync(path.join(ROOT, f), 'utf8'), undefined, { samplesUrl: 'https://studio.test/lattice/samples/' });
      for (const anyWebOrigin of [false, true]) {
        const opts = { ...OPTS, anyWebOrigin, fetchDataUri: mixedFetch };
        const [a, b] = [await old(html, opts), await now(html, opts)];
        pictures += b.count + b.missing.length;
        if (b.count + b.missing.length) decks.add(f);
        if (a.html !== b.html || a.count !== b.count || JSON.stringify(a.missing) !== JSON.stringify(b.missing)) {
          let at = 0;
          while (a.html[at] === b.html[at]) at++;
          bad.push(`${f} (anyWebOrigin ${anyWebOrigin}) at ${at}\n  regex ${JSON.stringify(a.html.slice(at - 60, at + 80))}\n  scan  ${JSON.stringify(b.html.slice(at - 60, at + 80))}`);
        }
      }
    }
    assert.deepEqual(bad, []);
    t.diagnostic(`${files.length} decks, ${decks.size} with a picture by URL, ${pictures} picture references over the two runs`);
    // The corpus must exercise the path: a deck set with no picture by URL would compare nothing.
    assert.ok(pictures > 300, `only ${pictures} pictures in the corpus`);
  });

  for (const [name, make, seed, count] of [
    ['picture soups', genPictures, 31, SCALE || 6_000],
    ['style soups', genStyle, 34, SCALE || 3_000],
    ['token soups', gen, 32, SCALE || 4_000],
    ['foreign-content structures', genForeign, 33, SCALE || 2_000],
  ]) {
    test(`${count} seeded ${name}: fetches exactly what the spec parser reads, leaves nothing to fetch, changes nothing else`, async (t) => {
      const r = rng(seed);
      let compared = 0;
      let withPictures = 0;
      let oldDisagrees = 0;
      for (let k = 0; k < count; k++) {
        const html = make(r);
        const why = await disagrees(now, html);
        if (why) assert.fail(why);
        if (scanHtml(html).risky) continue;
        compared++;
        if ((await fetched(now, html)).length) withPictures++;
        if (SCALE && (await disagrees(old, html))) oldDisagrees++;
        const { html: out } = await now(html, { ...OPTS, anyWebOrigin: true, fetchDataUri: embedAll, maxPictures: 1e6 });
        const left = await fetched(now, parserReading(out));
        if (left.length) assert.fail(`${show(html)}: ${JSON.stringify(left)} left to fetch after embedding`);
        if (shape(out) !== shape(html)) assert.fail(`${show(html)}: embedding changed the document\n  before ${shape(html).slice(0, 300)}\n  after  ${shape(out).slice(0, 300)}`);
      }
      t.diagnostic(`${compared} compared (the rest unsure), ${withPictures} with a picture${SCALE ? `, the frozen walker disagrees on ${oldDisagrees}` : ''}`);
    });
  }

  test('picked cases: what the regex walker misread', async () => {
    const one = async (html) => (await now(html, { ...OPTS, fetchDataUri: embedAll })).html;
    // A tag inside a comment is not a tag; the walker fetched and rewrote it.
    assert.equal(await one('<!-- <img src=/a.png> -->'), '<!-- <img src=/a.png> -->');
    // An escaped `url(` is a url() to the CSS parser.
    assert.equal(await one('<style>a{background:u\\72l(/k.png)}</style>'), '<style>a{background:url(data:image/png;base64,AAAA)}</style>');
    // Raw text is not decoded: `&#x2f;` in a <style> is those characters, not a slash.
    assert.equal(await one('<style>a{background:url(&#x2f;x.png)}</style>'), '<style>a{background:url(data:image/png;base64,AAAA)}</style>');
    // In HTML `<image>` is `<img>`: its src fetches.
    assert.equal(await one('<image src=/j.png>'), '<image src="data:image/png;base64,AAAA">');
    // The browser reads the first of two attributes of one name.
    assert.equal(await one('<img src=/a.png src=/b.png>'), '<img src="data:image/png;base64,AAAA" src=/b.png>');
    // A font source and an attribute selector stay; so does a custom property other than --logo-mask.
    // A font source and an attribute selector stay; a bad-url token is not a fetch.
    for (const css of ['@font-face{src:url(/f.woff)}', 'a[x="url(/s.png)"]{}']) assert.equal(await one(`<style>${css}</style>`), `<style>${css}</style>`);
    // A custom property's url() is a picture a var() reads: embedded, `--logo-mask` and every other.
    // The engine's string copy of a background is a string, not a url(), and stays.
    for (const name of ['logo-mask', 'hero']) assert.equal(await one(`<style>a{--${name}:url(/h.png)}</style>`), `<style>a{--${name}:url(data:image/png;base64,AAAA)}</style>`);
    assert.equal(await one('<p style="--background-image:&quot;url(\\&quot;/h.png\\&quot;)&quot;">'), '<p style="--background-image:&quot;url(\\&quot;/h.png\\&quot;)&quot;">');
    // A comment or string holding `--x:` hid the url() after it from the walker.
    assert.equal(await one('<style>a{/* --x: */ background:url(/c.png)}</style>'), '<style>a{/* --x: */ background:url(data:image/png;base64,AAAA)}</style>');
    // The srcset beside an embedded src goes, with its separators.
    assert.equal(await one('<img src=/a.png  srcset="/a2.png 2x" alt=x>'), '<img src="data:image/png;base64,AAAA" alt=x>');
  });

  test('picked cases: what the red team found on this PR', async () => {
    const one = async (html) => (await now(html, { ...OPTS, fetchDataUri: embedAll })).html;
    // An attribute right after a quoted srcset keeps a separator when the srcset goes.
    assert.equal(await one('<img srcset="/a.png"src="/b.png">'), '<img src="data:image/png;base64,AAAA">');
    assert.equal(await one('<img alt=x srcset="/a.png"src="/b.png">'), '<img alt=x src="data:image/png;base64,AAAA">');
    // An inline SVG's <style> holding only text is embedded, as it was before; one holding markup is left to the placeholder pass.
    assert.equal(await one('<svg><style>p{background:url(/a.png)}</style></svg>'), '<svg><style>p{background:url(data:image/png;base64,AAAA)}</style></svg>');
    // Its text is what the tree holds: a CDATA section as written, references decoded, comments and tags between runs.
    assert.equal(await one('<svg><style><![CDATA[.a{fill:url(/f.png)}]]></style></svg>'), '<svg><style><![CDATA[.a{fill:url(data:image/png;base64,AAAA)}]]></style></svg>');
    assert.equal(await one('<svg><style>p{background:url(&#x2f;a.png)}<!-- x -->q{background:url(/b.png)}</style></svg>'), '<svg><style>p{background:url(data:image/png;base64,AAAA)}<!-- x -->q{background:url(data:image/png;base64,AAAA)}</style></svg>');
    assert.equal(await one('<svg><foreignObject><style>a::after{content:"&"}.a{background:url(/f.png)}</style></foreignObject></svg>'), '<svg><foreignObject><style>a::after{content:"&"}.a{background:url(data:image/png;base64,AAAA)}</style></foreignObject></svg>');
    // A tag inside it is the attribute pass's; its end tag is markup, never rewritten. A nested <style> is read once.
    assert.equal(await one('<svg><style>a<b style="background:url(/i.png)">.c{fill:url(/h.png)}</b></style></svg>'), '<svg><style>a<b style="background:url(data:image/png;base64,AAAA)">.c{fill:url(data:image/png;base64,AAAA)}</b></style></svg>');
    assert.equal(await one('<svg><style>x<style>.a{fill:url(/n.png)}</style></svg>'), '<svg><style>x<style>.a{fill:url(data:image/png;base64,AAAA)}</style></svg>');
    // An address written back there is text in markup: its `&` stays escaped.
    assert.equal((await now('<svg><style>.a{fill:url(/a?x=1&amp;y=2)}</style></svg>', { ...OPTS, fetchDataUri: failAll })).html, "<svg><style>.a{fill:url('https://studio.test/a?x=1&amp;y=2')}</style></svg>");
    // A bad-url token is never fetched by the browser, so it is not embedded.
    for (const css of ['p{background:url(/a(b.png)}', 'p{background:url(/a.png x)}']) assert.equal(await one(`<style>${css}</style>`), `<style>${css}</style>`);
  });

  test('floods stay linear: a long custom-property run before many url()s', async () => {
    // Work, not milliseconds (HARD RULE #32). The quadratic check this replaced took 64 s on the first input. Counted:
    // the characters the reader touches before its first fetch, which is the scan and pass 1's walk of every
    // reference (pass 3 repeats that walk over the same tags once the fetches are back). About 6 to 7 per character.
    for (const html of [
      `<p style="${'--a:'.repeat(16_000)}} ${Array(30).fill('url(/a.png)').join(' ')}">x</p>`,
      `<p style="${Array(8000).fill('background:url(/a.png)').join(' ')}">x</p>`,
    ]) {
      const { result, reads, scanned } = charReads(() => now(html, { ...OPTS, fetchDataUri: embedAll }));
      assert.ok((await result).count >= 1);
      assert.ok(reads + scanned <= 32 * html.length, `${JSON.stringify(html.slice(0, 16))}…: read ${reads + scanned} characters for ${html.length}`);
    }
  });

  test('the failing arm: the frozen regex walker disagrees with the spec parser', async (t) => {
    const r = rng(31);
    let caught = 0;
    for (let k = 0; k < 2000; k++) if (await disagrees(old, genPictures(r))) caught++;
    t.diagnostic(`the arm caught ${caught} of 2,000`);
    assert.ok(caught > 500, `the arm caught ${caught} of 2,000`);
  });

  test('the failing arm: an embed that eats the `<` of `</style>` changes the document', async (t) => {
    const eat = async (html, opts) => {
      const r = await now(html, opts);
      // The off-by-one the inversion review wrote (`[b0, b1 + 1, next]`): each embedded <style> body eats the `<` after it.
      let html2 = r.html;
      const ends = scanHtml(html2).tags.filter((t) => t.name === 'style' && t.body && html2.slice(...t.body).includes('url(data:')).map((t) => t.body[1]);
      for (const at of ends.reverse()) html2 = html2.slice(0, at) + html2.slice(at + 1);
      return { ...r, html: html2 };
    };
    const r = rng(34);
    let caught = 0;
    for (let k = 0; k < 2000; k++) {
      const html = genStyle(r);
      if (scanHtml(html).risky) continue;
      const { html: out } = await eat(html, { ...OPTS, anyWebOrigin: true, fetchDataUri: embedAll, maxPictures: 1e6 });
      if (shape(out) !== shape(html)) caught++;
    }
    t.diagnostic(`the arm caught ${caught} of 2,000`);
    assert.ok(caught > 300, `the arm caught ${caught} of 2,000`);
  });

  test('the failing arm: a reader blind to <style> elements disagrees with the spec parser', async (t) => {
    const blind = (html, opts) => now(html.replace(/<(\/?)style/gi, '<$1xstyle'), opts);
    const r = rng(31);
    let caught = 0;
    for (let k = 0; k < 2000; k++) if (await disagrees(blind, genPictures(r))) caught++;
    t.diagnostic(`the arm caught ${caught} of 2,000`);
    assert.ok(caught > 50, `the arm caught ${caught} of 2,000`);
  });
});
