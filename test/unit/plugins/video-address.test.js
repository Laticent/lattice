/**
 * The video plugin's trust rule: the address comes ONLY from the author's own `@video{…}` span
 * (engineering/decisions/2026-10-16-media-plugins.md § 4.5). Each arm can fail: it names the path an
 * attacker would use and shows the render does not take it.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const dispatcher = require('../../../lib/core/inline-code-directives.js');
const engine = require('../../../lib/engine');
const { lintText, buildVocab } = require('../../../lib/authoring/lint.js');
const { applyAllFixes } = require('../../../lib/authoring/lint-core.js');
const { migrateVideoBullets } = require('../../../lib/core/video-migrate.js');

const render = (md) => engine.createEngine().render(md, 'indaco').html;
const SPAN = '@video{"https://www.youtube.com/watch?v=dQw4w9WgXcQ", title="Tour"}';
const deck = (body, cls = 'video') => `---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n## Slide\n\n${body}\n`;

describe('where the address is read', () => {
  test('the markdown-it pass draws a lone span as the figure, from the span\'s own text', () => {
    const html = render(deck(`\`${SPAN}\``));
    assert.match(html, /<figure class="video-embed" data-lattice-media="video" data-provider="youtube"/);
    assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
    assert.doesNotMatch(html, /<p>\s*<figure/, 'the figure left its paragraph');
  });

  test('a bullet is NOT an address any more: slide text builds nothing', () => {
    const html = render(deck('- https://www.youtube.com/watch?v=dQw4w9WgXcQ\n- https://evil.example/p.png `poster`'));
    assert.doesNotMatch(html, /video-embed|video-poster|data-lattice-media/);
  });

  test('a span in running text stays code', () => {
    const html = render(deck(`See \`${SPAN}\` for the clip.`));
    assert.doesNotMatch(html, /data-lattice-media/);
    assert.match(html, /<code>@video\{/);
  });

  test('an address that is not a provider host draws nothing', () => {
    const html = render(deck('`@video{"https://attacker.example/?d=secret"}`'));
    assert.doesNotMatch(html, /data-lattice-media|video-poster/);
    assert.match(html, /<code>@video\{/);
  });

  test('a provider name hidden in the query or fragment does not pass for the host', () => {
    for (const u of ['https://evil.example/?next=https://youtu.be/dQw4w9WgXcQ', 'https://evil.example/#vimeo.com/1084537']) {
      assert.doesNotMatch(render(deck(`\`@video{"${u}"}\``)), /data-lattice-media/, u);
    }
  });
});

describe('the DOM path never dispatches an address kind', () => {
  test('renderElement answers null for a span the engine would draw', () => {
    const doc = new JSDOM('<!doctype html><body></body>').window.document;
    assert.equal(dispatcher.renderElement(doc, SPAN), null);
    assert.equal(dispatcher.renderHtml(SPAN), null, 'and it is not inline HTML either: a video is a block');
    assert.ok(dispatcher.renderBlockHtml(SPAN), 'only the block path draws it');
  });

  test('the kind is declared address, named-only, and block', () => {
    const row = require('../../../lib/plugins/inline.generated.js').INLINE.find((k) => k.name === 'video');
    assert.equal(row.address, true);
    assert.equal(row.namedOnly, true);
    assert.equal(row.block, true);
    assert.equal(row.sigil, null);
  });

  test('the bare record is still a pill: a named-only kind is reached only through its name', () => {
    assert.doesNotMatch(dispatcher.renderHtml('{"https://youtu.be/dQw4w9WgXcQ"}') || '', /video-embed/, 'the bare record is a pill, never a video');
    assert.equal(dispatcher.canonicalText(SPAN), SPAN, 'a reader that knows sigils must not rewrite it to a pill');
  });
});

describe('lint', () => {
  test('a bullet clip is an error with an autofix that writes the record', () => {
    const src = deck('- https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const f = lintText(src).filter((x) => x.rule === 'video-bullet');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'error');
    const fixed = applyAllFixes(src, buildVocab());
    const out = typeof fixed === 'string' ? fixed : fixed.source;
    assert.match(out, /`@video\{"https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"\}`/);
    assert.equal(lintText(out).filter((x) => x.rule === 'video-bullet').length, 0);
    assert.match(render(out), /data-lattice-media="video"/, 'the fixed deck draws the clip');
  });

  test('a span in a sentence warns; a lone span, even in a list item, does not', () => {
    assert.equal(lintText(deck(`See \`${SPAN}\`.`)).filter((x) => x.rule === 'video-not-alone').length, 1);
    assert.equal(lintText(deck(`\`${SPAN}\``)).filter((x) => x.rule === 'video-not-alone').length, 0);
    assert.equal(lintText(deck(`- \`${SPAN}\``)).filter((x) => x.rule === 'video-not-alone').length, 0);
  });

  test('a record whose address Segno cannot read says why (video-literal)', () => {
    const f = lintText(deck('`@video{https://youtu.be/dQw4w9WgXcQ?t=90}`')).filter((x) => x.rule === 'video-literal');
    assert.equal(f.length, 1);
    assert.match(f[0].message, /quote/);
  });

  test('a qr slide counts the record as its one payload', () => {
    assert.equal(lintText(deck(`\`${SPAN}\``, 'video qr')).filter((x) => /^qr-/.test(x.rule)).length, 0);
    assert.equal(lintText(deck('Nothing here.', 'video qr')).filter((x) => x.rule === 'qr-missing-payload').length, 1);
  });
});

describe('what the inversion found', () => {
  test('every bullet shape that drew a clip before migrates with the URL token, and keeps the author\'s words as the title', () => {
    const cases = [['<https://youtu.be/dQw4w9WgXcQ>', ''], ['**https://youtu.be/dQw4w9WgXcQ**', ''], ['Watch the [clip](https://youtu.be/dQw4w9WgXcQ) here', 'Watch the clip here'], ['https://youtu.be/dQw4w9WgXcQ (two minutes)', '(two minutes)'], ['Our keynote: https://youtu.be/dQw4w9WgXcQ.', 'Our keynote:']];
    for (const [b, title] of cases) {
      const r = migrateVideoBullets(`<!-- _class: video -->\n\n- ${b}\n`);
      assert.equal(r.changed, 1, b);
      assert.ok(r.source.includes(`\`@video{"https://youtu.be/dQw4w9WgXcQ"${title ? `, title="${title}"` : ''}}\``), `${b} -> ${r.source}`);
    }
  });

  test('a video slide that names no clip at all is an error, whatever bullet it tried', () => {
    const f = lintText(deck('- Watch it at the link in the notes.')).filter((x) => x.rule === 'video-bullet');
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'error');
  });

  test('a list-item span leaves no empty list behind, and the poster carries no aria-label that hides its visible words', () => {
    const html = render(deck(`- \`${SPAN}\``));
    assert.doesNotMatch(html, /<ul>\s*<\/ul>|<li>\s*<\/li>/);
    assert.doesNotMatch(html, /class="video-poster[^>]*aria-label/);
  });
});

describe('what the red team found', () => {
  test('a zip plugin cannot take the `video` kind: it is in the shipped list', () => {
    assert.ok(require('../../../lib/packages/fence-door.generated.json').shippedKinds.includes('video'));
  });

  test('the autofix keeps the record in a paragraph of its own, so a bullet above cannot swallow it', () => {
    const src = deck('- Built for the Q3 review\n- https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    const fixed = applyAllFixes(src, buildVocab());
    assert.match(render(typeof fixed === 'string' ? fixed : fixed.source), /data-lattice-media="video"/);
    const r = migrateVideoBullets(src);
    assert.match(render(r.source), /data-lattice-media="video"/, 'and so does the sweep');
  });

  test('a clip with caption and poster bullets is not offered as a one-line autofix; a backtick in a title is refused', () => {
    const f = lintText(deck('- https://youtu.be/dQw4w9WgXcQ\n- Tour `caption`')).find((x) => x.rule === 'video-bullet');
    assert.equal(f.autofixable, undefined);
    assert.equal(migrateVideoBullets('<!-- _class: video -->\n\n- https://youtu.be/dQw4w9WgXcQ\n- The `best` clip `caption`\n').skipped, 1);
  });

  test('video-not-alone: a record under a paragraph line warns; a quote or numbered record does not', () => {
    const r = (b) => lintText(deck(b)).filter((x) => x.rule === 'video-not-alone').length;
    assert.equal(r(`A short intro line.\n\`${SPAN}\``), 1);
    assert.equal(r(`> \`${SPAN}\``), 0);
    assert.equal(r(`1. \`${SPAN}\``), 0);
  });
});

describe('what the checker found', () => {
  test('Export-to-Marp rewrites a lone record to a plain link, and leaves a fenced or unreadable one alone', () => {
    const { withVideoLinks } = require('../../../lib/plugins/video/shared/video-marp-export.js');
    const out = withVideoLinks(`a\n\n\`@video{"https://youtu.be/dQw4w9WgXcQ", title="Tour"}\`\n\n- \`@video{"https://attacker.example/x"}\`\n\n\`\`\`\n\`${SPAN}\`\n\`\`\`\n`);
    assert.match(out, /^\[Tour\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\)$/m);
    assert.match(out, /`@video\{"https:\/\/attacker\.example\/x"\}`/);
    assert.match(out, /```\n`@video\{"https:\/\/www\.youtube/);
  });

  test('a bullet inside a fenced example is not migrated; the real one below it is', () => {
    const src = '<!-- _class: video -->\n\n```md\n- https://vimeo.com/1\n```\n\n- https://vimeo.com/1084537\n';
    const r = migrateVideoBullets(src);
    assert.match(r.source, /```md\n- https:\/\/vimeo\.com\/1\n```/);
    assert.match(r.source, /`@video\{"https:\/\/vimeo\.com\/1084537"\}`/);
  });
});

describe('what the second checker found', () => {
  const { withVideoLinks } = require('../../../lib/plugins/video/shared/video-marp-export.js');
  const REC = (u, extra = '') => `\`@video{"${u}"${extra}}\``;

  test('Marp: a link destination cannot end early, so one record never adds a second link', () => {
    const out = withVideoLinks(REC('https://www.tiktok.com/@u/video/1234567?x=)[Open](https://evil.example/'));
    assert.doesNotMatch(out, /\)\[Open\]/);
    assert.equal((out.match(/\]\(/g) || []).length, 1, out);
  });

  test('Marp: a title that is text in the engine stays text in the bundle', () => {
    const out = withVideoLinks(REC('https://youtu.be/dQw4w9WgXcQ', ', title="<img src=x> *b* `c` <https://evil.example/>"'));
    assert.doesNotMatch(out, /(?<!\\)</);
    assert.match(out, /\\\*b\\\*/);
    assert.match(out, /\\`c\\`/);
  });

  test('Marp: a named HTML entity in the address cannot move the link to another host', () => {
    for (const u of ['https://evil.example&sol;.instagram.com/p/X/', 'https://evil.example&quest;.tiktok.com/@u/video/1234567', 'https://www.instagram.com/p/X/?a=\\']) {
      const out = withVideoLinks(REC(u));
      if (!out.startsWith('[')) continue; // refused: left as code, which is also fine
      const html = require('markdown-it')({ html: true }).render(out);
      const href = /href="([^"]*)"/.exec(html)?.[1] || '';
      assert.doesNotMatch(href, /^https:\/\/evil\.example[/?]/, `${u} -> ${href}`);
      assert.equal((html.match(/<a /g) || []).length, 1, html);
    }
  });

  test('Marp: rewrites only a record that is its own paragraph at the margin; everything else stays code (the safe failure)', () => {
    const r = REC('https://youtu.be/dQw4w9WgXcQ');
    assert.match(withVideoLinks(`${r}`), /^\[Watch on YouTube\]/, 'alone');
    assert.match(withVideoLinks(`## Title\n\n${r}\n\ntext`), /\n\[Watch on YouTube\]\(/, 'blank lines either side');
    for (const bad of [`para\n${r}`, `${r}\nmore text`, `${r}\n===`, `## Slide\n${r}`, `- ${r}`, `> ${r}`, `    ${r}`, `1. ${r}`]) {
      assert.equal(withVideoLinks(bad), bad, JSON.stringify(bad));
    }
    assert.equal(withVideoLinks(r, { off: true }), r, 'plugin off: code, as the engine prints it');
  });

  test('Marp: fences — a record in one stays code; a fence-looking run in a quote, list or indent switches the rewrite off for the rest', () => {
    const r = REC('https://youtu.be/dQw4w9WgXcQ');
    assert.equal(withVideoLinks(`\`\`\`\n\n${r}\n\n\`\`\``), `\`\`\`\n\n${r}\n\n\`\`\``);
    assert.equal(withVideoLinks(`\`\`\`\n\`\`\`inner\n\n${r}\n\n\`\`\``), `\`\`\`\n\`\`\`inner\n\n${r}\n\n\`\`\``, 'an info string does not close');
    for (const opener of ['> ```', '- ```', '    ```']) {
      const doc = `${opener}\n\nx\n\n${r}\n`;
      assert.equal(withVideoLinks(doc), doc, opener);
    }
    assert.match(withVideoLinks(`~~~\n\`\`\`\n~~~\n\n${r}`), /\[Watch on YouTube\]/, 'a tilde fence ends on a tilde fence, then the record is a paragraph of its own');
  });

  test('video-not-alone: a record touching a line of text above or below warns; one set off by block boundaries does not', () => {
    const R = REC('https://youtu.be/dQw4w9WgXcQ');
    const n = (b) => lintText(deck(b)).filter((x) => x.rule === 'video-not-alone').length;
    for (const above of ['- An item', '> Quoted text', '1. Step', '*Note* intro', '1.5 million views', '  indented text', '| a |']) assert.equal(n(`${above}\n${R}`), 1, above);
    for (const below of ['more text']) assert.equal(n(`${R}\n${below}`), 1, below);
    for (const above of ['## A heading', '<!-- a comment -->', '<!--\nnote\n-->', '---', '***', '___']) assert.equal(n(`${above}\n${R}`), 0, above);
    assert.equal(n(`${R}\n\n\`\`\`js\nx\n\`\`\``), 0, 'a blank line, then a fence');
  });

  test('the migration reads fences by character, and an address is never shortened', () => {
    const r = migrateVideoBullets('<!-- _class: video -->\n\n~~~\n```js\n~~~\n\n- https://youtu.be/dQw4w9WgXcQ\n');
    assert.equal(r.changed, 1);
    const id = migrateVideoBullets('<!-- _class: video -->\n\n- https://youtu.be/abcdefghij_\n');
    assert.match(id.source, /"https:\/\/youtu\.be\/abcdefghij_"/, 'an id may end in an underscore');
  });
});

describe('migrateVideoBullets', () => {
  test('rewrites caption and poster bullets into one record, and only on a video slide', () => {
    const src = '<!-- _class: video -->\n\n## T\n\n- https://vimeo.com/1084537\n- A caption `caption`\n- sample:video-poster.svg `poster`\n\n---\n\n<!-- _class: content -->\n\n- https://vimeo.com/1084537\n';
    const r = migrateVideoBullets(src);
    assert.equal(r.changed, 1);
    assert.match(r.source, /`@video\{"https:\/\/vimeo\.com\/1084537", title="A caption", poster="sample:video-poster\.svg"\}`/);
    assert.match(r.source, /<!-- _class: content -->\n\n- https:\/\/vimeo\.com\/1084537\n/, 'a content slide is left alone');
  });

  test('a value the record cannot carry leaves the slide as written and counts it skipped', () => {
    const src = '<!-- _class: video -->\n\n- https://vimeo.com/1084537\n- say "hi" `caption`\n';
    const r = migrateVideoBullets(src);
    assert.equal(r.changed, 0);
    assert.equal(r.skipped, 1);
    assert.equal(r.source, src);
  });
});

describe('video-slide-class', () => {
  const lint = (md) => lintText(md, buildVocab()).findings || lintText(md, buildVocab());
  const rules = (md) => lint(md).map((f) => f.rule);
  const REC = '`@video{"https://youtu.be/dQw4w9WgXcQ", title="Tour"}`';

  test('a lone record on a slide that is not a video slide is a warning that names the class to write', () => {
    const f = lint(`---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n## Tour\n\n${REC}\n`).find((x) => x.rule === 'video-slide-class');
    assert.ok(f, 'the finding is there');
    assert.equal(f.severity, 'warning');
    assert.match(f.fix, /_class: video/);
  });

  test('a slide with no class directive at all gets the same warning', () => {
    assert.ok(rules(`---\ntheme: indaco\n---\n\n## Tour\n\n${REC}\n`).includes('video-slide-class'));
  });

  test('a video slide and a record inside a code fence are quiet', () => {
    assert.ok(!rules(`---\ntheme: indaco\n---\n\n<!-- _class: video companion -->\n\n## Tour\n\n${REC}\n`).includes('video-slide-class'));
    assert.ok(!rules('---\ntheme: indaco\n---\n\n## Docs\n\n```markdown\n' + REC + '\n```\n').includes('video-slide-class'));
  });

  test('a record the engine would not draw as a video is the literal warning\'s business, not this one\'s', () => {
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: content -->\n\n## Tour\n\n`@video{"https://evil.example/x"}`\n';
    assert.ok(!rules(md).includes('video-slide-class'));
  });
});

describe('video-extra-record', () => {
  const lint = (md) => lintText(md, buildVocab()).findings || lintText(md, buildVocab());
  const REC = (n) => `\`@video{"https://youtu.be/dQw4w9WgXcQ", title="Clip ${n}"}\``;

  test('a second record on a video slide is a warning, and only the second', () => {
    const f = lint(`---\ntheme: indaco\n---\n\n<!-- _class: video companion -->\n\n## Two\n\n${REC(1)}\n\n${REC(2)}\n`).filter((x) => x.rule === 'video-extra-record');
    assert.equal(f.length, 1);
    assert.match(f[0].line, /Clip 2/);
    assert.match(f[0].fix, /slide of its own/);
  });

  test('one record per slide, across slides, and a record shown in a fence are quiet', () => {
    const two = `---\ntheme: indaco\n---\n\n<!-- _class: video -->\n\n## A\n\n${REC(1)}\n\n---\n\n<!-- _class: video -->\n\n## B\n\n${REC(2)}\n`;
    assert.ok(!lint(two).some((x) => x.rule === 'video-extra-record'));
    const fenced = `---\ntheme: indaco\n---\n\n<!-- _class: video -->\n\n## A\n\n${REC(1)}\n\n\`\`\`markdown\n${REC(2)}\n\`\`\`\n`;
    assert.ok(!lint(fenced).some((x) => x.rule === 'video-extra-record'));
  });
});

describe('the video placement rules say what the engine does', () => {
  const REC = '`@video{"https://youtu.be/dQw4w9WgXcQ", title="Clip"}`';
  const lint = (md) => lintText(md, buildVocab()).findings || lintText(md, buildVocab());
  const figures = (md) => (render(md).match(/<figure class="video-embed"/g) || []).length;
  const wrap = (cls, body) => `---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n## T\n\n${body}\n`;

  // Each case: where the record sits, and whether the engine draws a figure from it. The wrong-slide rule must fire exactly when it does.
  const CASES = [
    ['a record in a tight list item', `- ${REC}`, 1],
    ['a record in a blockquote', `> ${REC}`, 1],
    ['a record that is a lazy continuation of the text above', `Some text\n${REC}`, 0],
    ['a record indented four spaces (an indented code block)', `    ${REC}`, 0],
    ['a record inside a multi-line HTML comment', `<!--\n${REC}\n-->`, 0],
    ['a record after mixed fence markers that have all closed', '```\nx\n```\n~~~\ny\n~~~\n\n' + REC, 1],
    ['a record inside a four-backtick fence holding a three-backtick line', '````markdown\n```\n' + REC + '\n````', 0],
    ['a record directly over `---` (a setext heading)', `${REC}\n---`, 0],
    ['a record directly over `===` (a setext heading)', `${REC}\n===`, 0],
    ['a record, a blank line, then `---` (a thematic break)', `${REC}\n\n---`, 1],
    ['a `<!--` inside an inline code span is text, not a comment', '`<!--` is how a comment opens\n\n' + REC, 1],
  ];
  for (const [name, body, drawn] of CASES) {
    test(`video-slide-class on ${name}: fires only when the engine draws a figure`, () => {
      const md = wrap('content', body);
      assert.equal(figures(md), drawn, 'the engine side of the case');
      assert.equal(lint(md).some((f) => f.rule === 'video-slide-class'), drawn === 1);
    });
  }

  test('video-extra-record counts a second record the engine draws, in a list item or a quote, and not one it leaves as code', () => {
    const fires = (md) => lint(md).some((f) => f.rule === 'video-extra-record');
    assert.equal(fires(wrap('video', `${REC}\n\n- ${REC}`)), true);
    assert.equal(fires(wrap('video', `${REC}\n\n> ${REC}`)), true);
    assert.equal(fires(wrap('video', `${REC}\n\nSome text\n${REC}`)), false, 'a lazy continuation is code');
    assert.equal(fires(wrap('video', `${REC}\n\n    ${REC}`)), false, 'an indented code block is code');
    assert.equal(fires(wrap('video', `${REC}\n\n<!--\n${REC}\n-->`)), false, 'a comment is not drawn');
  });
});
